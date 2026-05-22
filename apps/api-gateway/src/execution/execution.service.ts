// ============================================
// Execution Service — Code Execution Logic
// ============================================
// In production, this dispatches to BullMQ workers that
// spawn isolated Docker containers. For development,
// it includes a direct execution fallback.

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionLanguage, ExecutionStatus } from '@prisma/client';
import { exec } from 'child_process';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { EventBus, EventStreams, EventTypes } from '../infrastructure/event-bus.service';
import { SecurityIntelligence } from '../infrastructure/security.service';
import { MetricsService } from '../infrastructure/metrics.service';

// Maximum code size (100KB) to prevent abuse
const MAX_CODE_SIZE = 100 * 1024;

// ── Language Configuration ──────────────────────────
// Each language has: file extension, Docker image, Docker command,
// local dev command, and the runtime binary needed to check availability.

interface LangConfig {
  ext: string;
  image: string;
  cmd: (f: string) => string;
  localCmd: (filePath: string) => string;
  runtimeBin: string;     // Binary to check with `where` / `which`
  displayName: string;
}

const LANGUAGE_CONFIG: Record<string, LangConfig> = {
  // ── Interpreted Languages ─────────────────────────
  python: {
    ext: '.py', image: 'codeforge-runtime-python', displayName: 'Python',
    cmd: (f) => `python3 ${f}`,
    localCmd: (f) => `python "${f}"`,
    runtimeBin: 'python',
  },
  javascript: {
    ext: '.js', image: 'codeforge-runtime-node', displayName: 'JavaScript',
    cmd: (f) => `node ${f}`,
    localCmd: (f) => `node "${f}"`,
    runtimeBin: 'node',
  },
  typescript: {
    ext: '.ts', image: 'codeforge-runtime-node', displayName: 'TypeScript',
    cmd: (f) => `npx tsx ${f}`,
    localCmd: (f) => `npx tsx "${f}"`,
    runtimeBin: 'node',
  },
  dart: {
    ext: '.dart', image: 'codeforge-runtime-dart', displayName: 'Dart',
    cmd: (f) => `dart run ${f}`,
    localCmd: (f) => `dart run "${f}"`,
    runtimeBin: 'dart',
  },
  ruby: {
    ext: '.rb', image: 'codeforge-runtime-ruby', displayName: 'Ruby',
    cmd: (f) => `ruby ${f}`,
    localCmd: (f) => `ruby "${f}"`,
    runtimeBin: 'ruby',
  },
  php: {
    ext: '.php', image: 'codeforge-runtime-php', displayName: 'PHP',
    cmd: (f) => `php ${f}`,
    localCmd: (f) => `php "${f}"`,
    runtimeBin: 'php',
  },
  perl: {
    ext: '.pl', image: 'codeforge-runtime-perl', displayName: 'Perl',
    cmd: (f) => `perl ${f}`,
    localCmd: (f) => `perl "${f}"`,
    runtimeBin: 'perl',
  },
  r: {
    ext: '.r', image: 'codeforge-runtime-r', displayName: 'R',
    cmd: (f) => `Rscript ${f}`,
    localCmd: (f) => `Rscript "${f}"`,
    runtimeBin: 'Rscript',
  },
  lua: {
    ext: '.lua', image: 'codeforge-runtime-lua', displayName: 'Lua',
    cmd: (f) => `lua ${f}`,
    localCmd: (f) => `lua "${f}"`,
    runtimeBin: 'lua',
  },

  // ── Compiled Languages ────────────────────────────
  cpp: {
    ext: '.cpp', image: 'codeforge-runtime-cpp', displayName: 'C++',
    cmd: (f) => `g++ -o /build/a.out ${f} && /build/a.out`,
    localCmd: (f) => {
      const out = f.replace(/\.cpp$/, '.exe');
      return `g++ -o "${out}" "${f}" && "${out}"`;
    },
    runtimeBin: 'g++',
  },
  c: {
    ext: '.c', image: 'codeforge-runtime-cpp', displayName: 'C',
    cmd: (f) => `gcc -o /build/a.out ${f} && /build/a.out`,
    localCmd: (f) => {
      const out = f.replace(/\.c$/, '.exe');
      return `gcc -o "${out}" "${f}" && "${out}"`;
    },
    runtimeBin: 'gcc',
  },
  java: {
    ext: '.java', image: 'codeforge-runtime-java', displayName: 'Java',
    cmd: (f) => `javac -d /build ${f} && java -cp /build Main`,
    localCmd: (f) => {
      const dir = f.substring(0, f.lastIndexOf('\\') || f.lastIndexOf('/'));
      return `javac "${f}" && java -cp "${dir}" Main`;
    },
    runtimeBin: 'javac',
  },
  go: {
    ext: '.go', image: 'codeforge-runtime-go', displayName: 'Go',
    cmd: (f) => `go run ${f}`,
    localCmd: (f) => `go run "${f}"`,
    runtimeBin: 'go',
  },
  rust: {
    ext: '.rs', image: 'codeforge-runtime-rust', displayName: 'Rust',
    cmd: (f) => `rustc -o /build/a.out ${f} && /build/a.out`,
    localCmd: (f) => {
      const out = f.replace(/\.rs$/, '.exe');
      return `rustc -o "${out}" "${f}" && "${out}"`;
    },
    runtimeBin: 'rustc',
  },
  kotlin: {
    ext: '.kt', image: 'codeforge-runtime-kotlin', displayName: 'Kotlin',
    cmd: (f) => `kotlinc ${f} -include-runtime -d /build/app.jar && java -jar /build/app.jar`,
    localCmd: (f) => {
      const jar = f.replace(/\.kt$/, '.jar');
      return `kotlinc "${f}" -include-runtime -d "${jar}" && java -jar "${jar}"`;
    },
    runtimeBin: 'kotlinc',
  },
  scala: {
    ext: '.scala', image: 'codeforge-runtime-scala', displayName: 'Scala',
    cmd: (f) => `scala ${f}`,
    localCmd: (f) => `scala "${f}"`,
    runtimeBin: 'scala',
  },
  swift: {
    ext: '.swift', image: 'codeforge-runtime-swift', displayName: 'Swift',
    cmd: (f) => `swift ${f}`,
    localCmd: (f) => `swift "${f}"`,
    runtimeBin: 'swift',
  },
  csharp: {
    ext: '.cs', image: 'codeforge-runtime-dotnet', displayName: 'C#',
    cmd: (f) => `dotnet-script ${f}`,
    localCmd: (f) => `dotnet-script "${f}"`,
    runtimeBin: 'dotnet-script',
  },

  // ── Shell / Scripting ─────────────────────────────
  powershell: {
    ext: '.ps1', image: 'codeforge-runtime-pwsh', displayName: 'PowerShell',
    cmd: (f) => `pwsh ${f}`,
    localCmd: (f) => `powershell -ExecutionPolicy Bypass -File "${f}"`,
    runtimeBin: 'powershell',
  },
  bash: {
    ext: '.sh', image: 'codeforge-runtime-bash', displayName: 'Bash',
    cmd: (f) => `bash ${f}`,
    localCmd: (f) => `bash "${f}"`,
    runtimeBin: 'bash',
  },
};

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);
  private readonly timeout: number;
  private readonly memoryLimit: string;
  private readonly cpuLimit: string;
  private readonly isDev: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly eventBus: EventBus,
    private readonly security: SecurityIntelligence,
    private readonly metrics: MetricsService,
  ) {
    this.timeout = parseInt(String(this.config.get('EXECUTION_TIMEOUT', '30000')), 10);
    this.memoryLimit = this.config.get<string>('EXECUTION_MEMORY_LIMIT', '128m');
    this.cpuLimit = this.config.get<string>('EXECUTION_CPU_LIMIT', '0.5');
    this.isDev = this.config.get<string>('NODE_ENV', 'development') === 'development';
  }

  // Submit code for execution
  async submitExecution(userId: string, workspaceId: string, language: string, code: string, stdin?: string) {
    // Validate input
    if (!LANGUAGE_CONFIG[language]) {
      throw new BadRequestException(`Unsupported language: ${language}`);
    }
    if (code.length > MAX_CODE_SIZE) {
      throw new BadRequestException('Code exceeds maximum size limit (100KB)');
    }

    // 🔒 Security pre-scan
    const threat = this.security.analyzeCode(code, language);
    if (threat.recommendation === 'block') {
      this.metrics.securityEvents.inc({ type: 'execution_blocked', severity: 'critical' });
      await this.security.logThreat({ type: 'execution_blocked', severity: 'critical', userId, details: { language, threats: threat.threats } });
      throw new BadRequestException(`Execution blocked: Suspicious code detected (risk score: ${threat.riskScore}). Threats: ${threat.threats.map(t => t.type).join(', ')}`);
    }
    if (threat.recommendation === 'warn') {
      this.logger.warn(`[Security] Code flagged for user ${userId}: risk=${threat.riskScore}, threats=${threat.threats.map(t => t.type).join(',')}`);
      this.metrics.securityEvents.inc({ type: 'execution_warned', severity: 'medium' });
    }

    // Create job record
    const job = await this.prisma.executionJob.create({
      data: {
        userId,
        workspaceId,
        language: language.toUpperCase() as ExecutionLanguage,
        code,
        stdin,
        status: 'PENDING',
      },
    });

    this.logger.log(`Execution job created: ${job.id} [${language}] (mode: ${this.isDev ? 'local' : 'docker'}, risk: ${threat.riskScore})`);
    this.metrics.executionCounter.inc({ language, status: 'submitted' });
    this.metrics.activeExecutions.inc();

    // 📢 Emit event
    await this.eventBus.publish({
      stream: EventStreams.EXECUTION,
      type: EventTypes.EXEC_SUBMITTED,
      userId,
      payload: { jobId: job.id, language, workspaceId, riskScore: threat.riskScore },
    });

    // Execute — smart routing: try local first, Docker fallback if runtime missing
    let execFn: Promise<void>;
    if (this.isDev) {
      const runtimeAvailable = await this.checkRuntime(LANGUAGE_CONFIG[language].runtimeBin);
      if (runtimeAvailable) {
        execFn = this.executeLocal(job.id, language, code, stdin);
      } else {
        // Check if Docker is available for fallback
        const dockerAvailable = await this.checkRuntime('docker');
        if (dockerAvailable) {
          this.logger.log(`[DEV] ${LANGUAGE_CONFIG[language].displayName} not installed locally, using Docker fallback`);
          execFn = this.executeInDocker(job.id, language, code, stdin);
        } else {
          execFn = this.executeLocal(job.id, language, code, stdin); // Will show helpful error
        }
      }
    } else {
      execFn = this.executeInDocker(job.id, language, code, stdin);
    }

    execFn.catch((err) => {
      this.logger.error(`Execution failed for job ${job.id}: ${err.message}`);
    });

    return { jobId: job.id, status: 'PENDING', riskScore: threat.riskScore };
  }

  // Get execution result
  async getResult(jobId: string) {
    const job = await this.prisma.executionJob.findUnique({ where: { id: jobId } });
    if (!job) throw new BadRequestException('Job not found');
    return job;
  }

  // List executions for a workspace
  async listExecutions(workspaceId: string, limit = 20) {
    return this.prisma.executionJob.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, language: true, status: true, output: true,
        error: true, executionMs: true, createdAt: true, completedAt: true,
      },
    });
  }

  // ── Local direct execution (dev mode) ──────────────────────
  private async executeLocal(jobId: string, language: string, code: string, stdin?: string): Promise<void> {
    const langConfig = LANGUAGE_CONFIG[language];
    const tmpDir = join(process.cwd(), 'tmp', jobId);
    const fileName = language === 'java' ? 'Main' + langConfig.ext : 'code' + langConfig.ext;
    const filePath = join(tmpDir, fileName);

    try {
      await this.prisma.executionJob.update({
        where: { id: jobId },
        data: { status: 'RUNNING' },
      });

      // 🔍 Check if runtime is available before executing
      const runtimeAvailable = await this.checkRuntime(langConfig.runtimeBin);
      if (!runtimeAvailable) {
        throw new Error(
          `${langConfig.displayName} runtime ('${langConfig.runtimeBin}') is not installed on this system. ` +
          `Please install ${langConfig.displayName} and ensure '${langConfig.runtimeBin}' is in your system PATH.`
        );
      }

      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(filePath, code);

      const localCmd = langConfig.localCmd(filePath);
      this.logger.log(`[DEV] Running ${langConfig.displayName} locally: ${localCmd}`);

      const result = await this.execWithTimeout(localCmd, this.timeout, stdin);

      await this.prisma.executionJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          output: result.stdout.substring(0, 50000),
          error: result.stderr?.substring(0, 10000) || null,
          exitCode: result.exitCode,
          executionMs: result.duration,
          completedAt: new Date(),
        },
      });

      this.metrics.executionCounter.inc({ language, status: 'completed' });
      this.metrics.executionDuration.observe({ language }, result.duration);
      this.metrics.activeExecutions.dec();
      await this.eventBus.publish({ stream: EventStreams.EXECUTION, type: EventTypes.EXEC_COMPLETED, payload: { jobId, language, duration: result.duration } });

      this.logger.log(`[DEV] Execution completed: ${jobId} (${result.duration}ms)`);
    } catch (error: any) {
      const isTimeout = error.message?.includes('TIMEOUT');
      await this.prisma.executionJob.update({
        where: { id: jobId },
        data: {
          status: isTimeout ? 'TIMEOUT' : 'FAILED',
          error: error.message?.substring(0, 10000),
          completedAt: new Date(),
        },
      });
      this.metrics.executionCounter.inc({ language, status: isTimeout ? 'timeout' : 'failed' });
      this.metrics.activeExecutions.dec();
      await this.eventBus.publish({ stream: EventStreams.EXECUTION, type: isTimeout ? EventTypes.EXEC_TIMEOUT : EventTypes.EXEC_FAILED, payload: { jobId, language, error: error.message } });
      this.logger.error(`[DEV] Execution error: ${jobId} — ${error.message}`);
    } finally {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }

  // ── Docker-based execution (production) ────────────────────
  private async executeInDocker(jobId: string, language: string, code: string, stdin?: string): Promise<void> {
    const langConfig = LANGUAGE_CONFIG[language];
    const tmpDir = join(process.cwd(), 'tmp', jobId);
    const fileName = language === 'java' ? 'Main' + langConfig.ext : 'code' + langConfig.ext;
    const filePath = join(tmpDir, fileName);

    try {
      // Update status to RUNNING
      await this.prisma.executionJob.update({
        where: { id: jobId },
        data: { status: 'RUNNING' },
      });

      // Write code to temp file
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(filePath, code);

      // Build Docker command with security constraints
      const dockerCmd = [
        'docker run --rm -i',
        `--name exec-${jobId.substring(0, 8)}`,
        `--memory=${this.memoryLimit}`,          // Memory limit
        `--memory-swap=${this.memoryLimit}`,      // No swap
        `--cpus=${this.cpuLimit}`,                // CPU limit
        '--pids-limit=50',                        // Prevent fork bombs
        '--network=none',                         // No network access
        '--read-only',                            // Read-only filesystem
        '--tmpfs /tmp:rw,noexec,size=64m',        // Writable /tmp (no exec)
        '--tmpfs /build:rw,exec,size=64m,uid=1000,gid=1000', // Writable /build (exec for compiled langs)
        '-e GOCACHE=/build/.cache -e GOTMPDIR=/build -e HOME=/build', // Go/Rust cache dirs
        '--security-opt=no-new-privileges',       // No privilege escalation
        '--user=1000:1000',                       // Non-root user
        `-v ${tmpDir}:/workspace:ro`,             // Mount code read-only
        `-w /workspace`,
        langConfig.image,
        `sh -c "${langConfig.cmd(fileName)}"`,
      ].join(' ');

      // Execute with timeout
      const result = await this.execWithTimeout(dockerCmd, this.timeout, stdin);

      // Update job with results
      await this.prisma.executionJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          output: result.stdout.substring(0, 50000), // Cap output at 50KB
          error: result.stderr?.substring(0, 10000) || null,
          exitCode: result.exitCode,
          executionMs: result.duration,
          completedAt: new Date(),
        },
      });

      this.logger.log(`Execution completed: ${jobId} (${result.duration}ms)`);
    } catch (error: any) {
      const isTimeout = error.message?.includes('TIMEOUT');
      await this.prisma.executionJob.update({
        where: { id: jobId },
        data: {
          status: isTimeout ? 'TIMEOUT' : 'FAILED',
          error: error.message?.substring(0, 10000),
          completedAt: new Date(),
        },
      });
      this.logger.error(`Execution error: ${jobId} — ${error.message}`);
    } finally {
      // Cleanup temp files
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      // Force kill container if still running
      try { exec(`docker rm -f exec-${jobId.substring(0, 8)}`); } catch {}
    }
  }

  // Execute command with timeout enforcement
  private execWithTimeout(cmd: string, timeout: number, stdin?: string): Promise<{
    stdout: string; stderr: string; exitCode: number; duration: number;
  }> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const child = exec(cmd, { timeout, maxBuffer: 5 * 1024 * 1024 }, (error, stdout, stderr) => {
        const duration = Date.now() - start;
        if (error && error.killed) {
          reject(new Error(`TIMEOUT: Execution exceeded ${timeout}ms limit`));
        } else {
          resolve({
            stdout: stdout || '',
            stderr: stderr || '',
            exitCode: error?.code || 0,
            duration,
          });
        }
      });

      if (stdin && child.stdin) {
        child.stdin.write(stdin);
        child.stdin.end();
      }
    });
  }

  // ── Runtime Availability Check ─────────────────────
  // Uses `where` (Windows) to check if a binary exists in PATH
  private checkRuntime(bin: string): Promise<boolean> {
    return new Promise((resolve) => {
      const checkCmd = process.platform === 'win32' ? `where ${bin}` : `which ${bin}`;
      exec(checkCmd, { timeout: 5000 }, (error) => {
        resolve(!error);
      });
    });
  }

  // ── Get Supported Languages (for frontend) ────────
  async getSupportedLanguages(): Promise<Array<{
    id: string;
    name: string;
    ext: string;
    available: boolean;
  }>> {
    const languages = Object.entries(LANGUAGE_CONFIG).map(async ([id, config]) => {
      const available = this.isDev
        ? await this.checkRuntime(config.runtimeBin)
        : true; // In Docker mode, all languages are available via containers
      return {
        id,
        name: config.displayName,
        ext: config.ext,
        available,
      };
    });
    return Promise.all(languages);
  }
}

