// ============================================
// Hardened Runtime Isolation
// ============================================
// Enhanced Docker isolation with seccomp profiles,
// syscall filtering, resource abuse prevention,
// and runtime behavioral monitoring.

import { exec, spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// ── Seccomp Profiles ────────────────────────────

const SECCOMP_BASE = {
  defaultAction: 'SCMP_ACT_ERRNO',
  architectures: ['SCMP_ARCH_X86_64', 'SCMP_ARCH_X86', 'SCMP_ARCH_AARCH64'],
  syscalls: [
    // Essential syscalls
    { names: ['read', 'write', 'close', 'fstat', 'lseek', 'mmap', 'mprotect', 'munmap', 'brk', 'rt_sigaction', 'rt_sigprocmask', 'ioctl'], action: 'SCMP_ACT_ALLOW' },
    // File operations (limited)
    { names: ['access', 'openat', 'stat', 'lstat', 'newfstatat', 'readlink', 'getcwd', 'getdents64'], action: 'SCMP_ACT_ALLOW' },
    // Process lifecycle
    { names: ['exit', 'exit_group', 'arch_prctl', 'set_tid_address', 'set_robust_list', 'futex', 'clock_gettime', 'clock_nanosleep', 'nanosleep'], action: 'SCMP_ACT_ALLOW' },
    // Memory management
    { names: ['getrandom', 'pread64', 'pwrite64', 'writev', 'readv', 'prlimit64'], action: 'SCMP_ACT_ALLOW' },
    // Threading (limited)
    { names: ['clone', 'clone3', 'wait4', 'gettid', 'getpid', 'getppid', 'getuid', 'getgid', 'geteuid', 'getegid'], action: 'SCMP_ACT_ALLOW' },
    // Pipe/epoll
    { names: ['pipe', 'pipe2', 'dup', 'dup2', 'dup3', 'epoll_create1', 'epoll_ctl', 'epoll_wait', 'epoll_pwait', 'poll', 'select'], action: 'SCMP_ACT_ALLOW' },
    // Explicitly deny dangerous syscalls
    { names: ['execve', 'execveat'], action: 'SCMP_ACT_ALLOW' }, // Needed to start the runtime
    // BLOCKED by default: fork, vfork, ptrace, mount, umount, pivot_root, chroot, socket (network)
  ],
};

const SECCOMP_PROFILES: Record<string, any> = {
  python: {
    ...SECCOMP_BASE,
    syscalls: [
      ...SECCOMP_BASE.syscalls,
      // Python-specific
      { names: ['sigaltstack', 'sysinfo', 'uname', 'fcntl', 'flock'], action: 'SCMP_ACT_ALLOW' },
    ],
  },
  javascript: {
    ...SECCOMP_BASE,
    syscalls: [
      ...SECCOMP_BASE.syscalls,
      // Node.js specific
      { names: ['eventfd2', 'signalfd4', 'inotify_init1', 'inotify_add_watch'], action: 'SCMP_ACT_ALLOW' },
    ],
  },
  cpp: SECCOMP_BASE,
  java: {
    ...SECCOMP_BASE,
    syscalls: [
      ...SECCOMP_BASE.syscalls,
      // JVM specific
      { names: ['prctl', 'sched_getaffinity', 'sched_yield', 'madvise', 'mincore'], action: 'SCMP_ACT_ALLOW' },
    ],
  },
};

// ── Resource Limits ─────────────────────────────

export interface ResourceLimits {
  memoryMB: number;
  cpuShares: number;       // Docker CPU shares (1024 = 1 core)
  timeoutMs: number;
  maxPids: number;
  maxFileSize: string;     // e.g., '10m'
  networkEnabled: boolean;
  readOnlyFs: boolean;
}

const DEFAULT_LIMITS: ResourceLimits = {
  memoryMB: 128,
  cpuShares: 512,        // 0.5 CPU
  timeoutMs: 30000,
  maxPids: 50,
  maxFileSize: '10m',
  networkEnabled: false,
  readOnlyFs: true,
};

// ── Runtime Monitor ─────────────────────────────

export interface RuntimeMetrics {
  cpuUsage: number;
  memoryUsage: number;
  memoryLimit: number;
  pidCount: number;
  ioRead: number;
  ioWrite: number;
  networkRx: number;
  networkTx: number;
  anomalies: string[];
}

/**
 * HardenedRuntime — Secure execution environment
 *
 * Features:
 * - Seccomp syscall filtering per language
 * - Read-only filesystem
 * - Network namespace isolation
 * - Resource abuse prevention
 * - Runtime behavioral monitoring
 * - Infinite recursion detection
 * - Container anomaly detection
 */
export class HardenedRuntime {
  private tmpDir: string;

  constructor(tmpDir: string = '/tmp/codeforge-runtime') {
    this.tmpDir = tmpDir;
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  }

  /**
   * Build Docker run command with full security hardening
   */
  buildSecureDockerCommand(
    jobId: string,
    language: string,
    codePath: string,
    limits: Partial<ResourceLimits> = {},
  ): string[] {
    const l = { ...DEFAULT_LIMITS, ...limits };

    // Write seccomp profile
    const seccompPath = path.join(this.tmpDir, `${jobId}-seccomp.json`);
    const profile = SECCOMP_PROFILES[language] || SECCOMP_BASE;
    fs.writeFileSync(seccompPath, JSON.stringify(profile));

    const args: string[] = [
      'docker', 'run',
      '--rm',
      // Resource limits
      `--memory=${l.memoryMB}m`,
      `--memory-swap=${l.memoryMB}m`,     // No swap
      `--cpu-shares=${l.cpuShares}`,
      `--pids-limit=${l.maxPids}`,
      `--ulimit`, `fsize=${this.parseSize(l.maxFileSize)}`,
      `--ulimit`, `nproc=${l.maxPids}`,
      `--ulimit`, `nofile=64:64`,         // Limit file descriptors
      // Security
      `--security-opt=no-new-privileges`,
      `--security-opt=seccomp=${seccompPath}`,
      `--cap-drop=ALL`,                   // Drop all capabilities
      '--user=65534:65534',               // nobody user
    ];

    // Network isolation
    if (!l.networkEnabled) {
      args.push('--network=none');
    }

    // Read-only filesystem
    if (l.readOnlyFs) {
      args.push('--read-only');
      args.push('--tmpfs=/tmp:rw,noexec,nosuid,size=10m');
    }

    // Mount code as read-only
    args.push('-v', `${codePath}:/code:ro`);

    // Set timeout via environment
    args.push('-e', `TIMEOUT=${l.timeoutMs}`);

    // Select runtime image
    const image = this.getRuntimeImage(language);
    args.push(image);

    // Execution command
    args.push(...this.getRunCommand(language));

    return args;
  }

  /**
   * Monitor running container for anomalies
   */
  async monitorContainer(containerId: string): Promise<RuntimeMetrics> {
    return new Promise((resolve) => {
      exec(`docker stats ${containerId} --no-stream --format "{{json .}}"`, (err, stdout) => {
        if (err) {
          resolve({
            cpuUsage: 0, memoryUsage: 0, memoryLimit: 0,
            pidCount: 0, ioRead: 0, ioWrite: 0,
            networkRx: 0, networkTx: 0, anomalies: [],
          });
          return;
        }

        try {
          const stats = JSON.parse(stdout.trim());
          const anomalies: string[] = [];

          // Check for anomalies
          const cpuPct = parseFloat(stats.CPUPerc) || 0;
          const memPct = parseFloat(stats.MemPerc) || 0;

          if (cpuPct > 95) anomalies.push('CPU_SPIKE');
          if (memPct > 90) anomalies.push('MEMORY_EXHAUSTION');

          resolve({
            cpuUsage: cpuPct,
            memoryUsage: this.parseDockerMem(stats.MemUsage),
            memoryLimit: this.parseDockerMem(stats.MemUsage.split('/')[1]),
            pidCount: parseInt(stats.PIDs) || 0,
            ioRead: 0,
            ioWrite: 0,
            networkRx: 0,
            networkTx: 0,
            anomalies,
          });
        } catch {
          resolve({
            cpuUsage: 0, memoryUsage: 0, memoryLimit: 0,
            pidCount: 0, ioRead: 0, ioWrite: 0,
            networkRx: 0, networkTx: 0, anomalies: [],
          });
        }
      });
    });
  }

  /**
   * Code-level instrumentation to detect issues before execution
   */
  instrumentCode(code: string, language: string): { instrumentedCode: string; warnings: string[] } {
    const warnings: string[] = [];
    let instrumentedCode = code;

    if (language === 'python') {
      // Add recursion limit
      instrumentedCode = `import sys\nsys.setrecursionlimit(500)\n${code}`;

      // Add memory tracking
      instrumentedCode = `import resource\nresource.setrlimit(resource.RLIMIT_AS, (134217728, 134217728))\n${instrumentedCode}`;
    }

    if (language === 'javascript') {
      // Wrap in try-catch for stack overflow detection
      instrumentedCode = `
try {
  ${code}
} catch(e) {
  if (e instanceof RangeError) {
    console.error('Stack overflow: Maximum recursion depth exceeded');
    process.exit(1);
  }
  throw e;
}`;
    }

    return { instrumentedCode, warnings };
  }

  private getRuntimeImage(language: string): string {
    const images: Record<string, string> = {
      python: 'codeforge-runtime-python:latest',
      javascript: 'codeforge-runtime-node:latest',
      cpp: 'codeforge-runtime-cpp:latest',
      java: 'codeforge-runtime-java:latest',
    };
    return images[language] || 'alpine:latest';
  }

  private getRunCommand(language: string): string[] {
    const commands: Record<string, string[]> = {
      python: ['python3', '/code/main.py'],
      javascript: ['node', '/code/main.js'],
      cpp: ['sh', '-c', 'g++ -o /tmp/a.out /code/main.cpp && /tmp/a.out'],
      java: ['sh', '-c', 'javac -d /tmp /code/Main.java && java -cp /tmp Main'],
    };
    return commands[language] || ['cat', '/code/main.*'];
  }

  private parseSize(size: string): number {
    const match = size.match(/^(\d+)([kmg]?)$/i);
    if (!match) return 10485760; // 10MB default
    const num = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    switch (unit) {
      case 'k': return num * 1024;
      case 'm': return num * 1048576;
      case 'g': return num * 1073741824;
      default: return num;
    }
  }

  private parseDockerMem(mem: string): number {
    if (!mem) return 0;
    const clean = mem.trim().split('/')[0].trim();
    const match = clean.match(/([\d.]+)\s*([KMGT]?i?B)/i);
    if (!match) return 0;
    const num = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    if (unit.startsWith('G')) return num * 1073741824;
    if (unit.startsWith('M')) return num * 1048576;
    if (unit.startsWith('K')) return num * 1024;
    return num;
  }

  /**
   * Get seccomp profile for a language
   */
  getSeccompProfile(language: string): any {
    return SECCOMP_PROFILES[language] || SECCOMP_BASE;
  }
}
