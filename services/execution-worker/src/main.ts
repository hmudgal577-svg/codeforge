// ============================================
// Execution Worker — BullMQ Consumer
// ============================================
// Standalone worker process that picks execution
// jobs from the queue and runs them in Docker containers.

import { Worker, Job } from 'bullmq';
import { exec } from 'child_process';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const LANG_CONFIG: Record<string, { ext: string; image: string; cmd: (f: string) => string }> = {
  python:     { ext: '.py',   image: 'codeforge-runtime-python',  cmd: (f) => `python3 ${f}` },
  javascript: { ext: '.js',   image: 'codeforge-runtime-node',    cmd: (f) => `node ${f}` },
  cpp:        { ext: '.cpp',  image: 'codeforge-runtime-cpp',     cmd: (f) => `g++ -o /tmp/a.out ${f} && /tmp/a.out` },
  java:       { ext: '.java', image: 'codeforge-runtime-java',    cmd: (f) => `javac ${f} && java -cp /tmp Main` },
};

const TIMEOUT = parseInt(process.env.EXECUTION_TIMEOUT || '30000');
const MEMORY = process.env.EXECUTION_MEMORY_LIMIT || '128m';
const CPU = process.env.EXECUTION_CPU_LIMIT || '0.5';

// Create the BullMQ worker
const worker = new Worker('execution', async (job: Job) => {
  const { jobId, language, code, stdin } = job.data;
  const config = LANG_CONFIG[language];
  if (!config) throw new Error(`Unsupported language: ${language}`);

  const tmpDir = join(process.cwd(), 'tmp', jobId);
  const fileName = language === 'java' ? 'Main' + config.ext : 'code' + config.ext;

  try {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, fileName), code);

    const dockerCmd = [
      'docker run --rm',
      `--name exec-${jobId.substring(0, 8)}`,
      `--memory=${MEMORY} --memory-swap=${MEMORY}`,
      `--cpus=${CPU}`,
      '--pids-limit=50',
      '--network=none',
      '--read-only',
      '--tmpfs /tmp:rw,noexec,size=64m',
      '--security-opt=no-new-privileges',
      '--user=1000:1000',
      `-v ${tmpDir}:/workspace:ro`,
      '-w /workspace',
      config.image,
      `sh -c "${config.cmd(fileName)}"`,
    ].join(' ');

    const result = await execPromise(dockerCmd, TIMEOUT, stdin);

    return {
      status: 'COMPLETED',
      output: result.stdout.substring(0, 50000),
      error: result.stderr?.substring(0, 10000) || null,
      exitCode: result.exitCode,
      executionMs: result.duration,
    };
  } catch (error: any) {
    return {
      status: error.message?.includes('TIMEOUT') ? 'TIMEOUT' : 'FAILED',
      error: error.message?.substring(0, 10000),
      executionMs: 0,
    };
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    try { exec(`docker rm -f exec-${jobId.substring(0, 8)}`); } catch {}
  }
}, {
  connection: { url: REDIS_URL },
  concurrency: 5,
  limiter: { max: 10, duration: 60000 },
});

function execPromise(cmd: string, timeout: number, stdin?: string): Promise<{ stdout: string; stderr: string; exitCode: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const child = exec(cmd, { timeout, maxBuffer: 5 * 1024 * 1024 }, (error, stdout, stderr) => {
      const duration = Date.now() - start;
      if (error?.killed) reject(new Error(`TIMEOUT: Exceeded ${timeout}ms`));
      else resolve({ stdout: stdout || '', stderr: stderr || '', exitCode: error?.code || 0, duration });
    });
    if (stdin && child.stdin) { child.stdin.write(stdin); child.stdin.end(); }
  });
}

worker.on('completed', (job) => console.log(`✓ Job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`✗ Job ${job?.id} failed: ${err.message}`));
worker.on('ready', () => console.log('🔧 Execution worker ready'));

console.log('⚙️ CodeForge Execution Worker started');
