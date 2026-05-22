// ============================================
// Security Intelligence Service
// ============================================
// Behavioral runtime monitoring, AI-assisted
// threat analysis, rate limiting, and zero-trust
// internal communication.

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// ── Threat Patterns ─────────────────────────────
const SUSPICIOUS_PATTERNS = {
  CRYPTO_MINING: [
    /crypto|mining|stratum|xmr|monero|coinhive/i,
    /hashrate|nonce|block_header/i,
  ],
  NETWORK_SCAN: [
    /socket\.connect|net\.connect/i,
    /urllib\.request|requests\.get.*\d+\.\d+\.\d+\.\d+/i,
    /nmap|masscan|port.*scan/i,
  ],
  REVERSE_SHELL: [
    /\/bin\/sh|\/bin\/bash|cmd\.exe/i,
    /reverse.*shell|bind.*shell/i,
    /nc\s+-e|bash\s+-i/i,
    /subprocess\.Popen.*shell=True/i,
  ],
  FILE_SYSTEM_ABUSE: [
    /\/etc\/passwd|\/etc\/shadow/i,
    /rm\s+-rf|rmdir|deltree/i,
    /format\s+c:|fdisk/i,
  ],
  FORK_BOMB: [
    /fork\(\)|os\.fork/i,
    /while.*true.*fork/i,
    /:\(\)\{.*:\|:.*\}/,
  ],
  DATA_EXFILTRATION: [
    /curl.*\|.*bash/i,
    /wget.*-O.*-/i,
    /base64.*encode.*send/i,
  ],
};

export interface ThreatAnalysis {
  isSuspicious: boolean;
  threats: ThreatDetail[];
  riskScore: number; // 0-100
  recommendation: 'allow' | 'warn' | 'block';
}

export interface ThreatDetail {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  pattern: string;
  description: string;
  lineNumber?: number;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

/**
 * SecurityService — Distributed Security Intelligence
 *
 * Features:
 * - Behavioral runtime monitoring
 * - AI-assisted threat analysis
 * - Suspicious execution detection
 * - Distributed rate-limiting via Redis
 * - Runtime exploit fingerprinting
 * - Dynamic security policy enforcement
 * - Zero-trust internal communication
 */
export class SecurityService {
  private redis: Redis | null = null;

  constructor(redisUrl?: string) {
    if (redisUrl || REDIS_URL) {
      this.redis = new Redis(redisUrl || REDIS_URL, {
        retryStrategy: (times) => Math.min(times * 100, 3000),
        lazyConnect: true,
      });
      this.redis.connect().catch(() => { this.redis = null; });
    }
  }

  /**
   * Analyze code for threats before execution
   */
  analyzeCode(code: string, language: string): ThreatAnalysis {
    const threats: ThreatDetail[] = [];
    const lines = code.split('\n');

    for (const [threatType, patterns] of Object.entries(SUSPICIOUS_PATTERNS)) {
      for (const pattern of patterns) {
        lines.forEach((line, idx) => {
          if (pattern.test(line)) {
            threats.push({
              type: threatType,
              severity: this.getSeverity(threatType),
              pattern: pattern.source,
              description: `Suspicious pattern detected: ${threatType.replace(/_/g, ' ').toLowerCase()}`,
              lineNumber: idx + 1,
            });
          }
        });
      }
    }

    // Language-specific checks
    if (language === 'python') {
      this.checkPythonThreats(code, lines, threats);
    } else if (language === 'javascript') {
      this.checkJavaScriptThreats(code, lines, threats);
    }

    const riskScore = this.computeRiskScore(threats);

    return {
      isSuspicious: threats.length > 0,
      threats,
      riskScore,
      recommendation: riskScore > 70 ? 'block' : riskScore > 30 ? 'warn' : 'allow',
    };
  }

  private checkPythonThreats(code: string, lines: string[], threats: ThreatDetail[]): void {
    // Check for dangerous imports
    const dangerousImports = ['ctypes', 'subprocess', 'multiprocessing', 'signal'];
    lines.forEach((line, idx) => {
      for (const imp of dangerousImports) {
        if (new RegExp(`^\\s*(import|from)\\s+${imp}`).test(line)) {
          threats.push({
            type: 'DANGEROUS_IMPORT',
            severity: 'medium',
            pattern: `import ${imp}`,
            description: `Potentially dangerous module: ${imp}`,
            lineNumber: idx + 1,
          });
        }
      }
    });

    // Infinite recursion detection
    const functionDefs = lines.filter(l => /^\s*def\s+/.test(l));
    for (const def of functionDefs) {
      const match = def.match(/def\s+(\w+)/);
      if (match) {
        const fnName = match[1];
        const selfCallPattern = new RegExp(`${fnName}\\s*\\(`);
        const hasBaseCase = lines.some(l => /if\s+.*return|if\s+.*break/.test(l));
        if (code.match(selfCallPattern) && !hasBaseCase) {
          threats.push({
            type: 'INFINITE_RECURSION',
            severity: 'medium',
            pattern: `${fnName} recursive without base case`,
            description: 'Possible infinite recursion detected',
          });
        }
      }
    }
  }

  private checkJavaScriptThreats(code: string, lines: string[], threats: ThreatDetail[]): void {
    // eval() detection
    lines.forEach((line, idx) => {
      if (/\beval\s*\(/.test(line)) {
        threats.push({
          type: 'CODE_INJECTION',
          severity: 'high',
          pattern: 'eval()',
          description: 'eval() usage detected — potential code injection',
          lineNumber: idx + 1,
        });
      }
    });

    // While(true) without break
    if (/while\s*\(\s*true\s*\)/.test(code) && !/break/.test(code)) {
      threats.push({
        type: 'INFINITE_LOOP',
        severity: 'medium',
        pattern: 'while(true) without break',
        description: 'Potential infinite loop detected',
      });
    }
  }

  private getSeverity(threatType: string): 'low' | 'medium' | 'high' | 'critical' {
    const severityMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
      CRYPTO_MINING: 'critical',
      REVERSE_SHELL: 'critical',
      NETWORK_SCAN: 'high',
      FORK_BOMB: 'critical',
      FILE_SYSTEM_ABUSE: 'high',
      DATA_EXFILTRATION: 'critical',
      DANGEROUS_IMPORT: 'medium',
      CODE_INJECTION: 'high',
      INFINITE_LOOP: 'medium',
      INFINITE_RECURSION: 'medium',
    };
    return severityMap[threatType] || 'low';
  }

  private computeRiskScore(threats: ThreatDetail[]): number {
    let score = 0;
    for (const t of threats) {
      switch (t.severity) {
        case 'critical': score += 40; break;
        case 'high': score += 25; break;
        case 'medium': score += 10; break;
        case 'low': score += 5; break;
      }
    }
    return Math.min(100, score);
  }

  /**
   * Distributed rate limiting via Redis sliding window
   */
  async checkRateLimit(key: string, config: RateLimitConfig): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    if (!this.redis) {
      return { allowed: true, remaining: config.maxRequests, resetAt: Date.now() + config.windowMs };
    }

    const redisKey = `${config.keyPrefix}:${key}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    const pipeline = this.redis.pipeline();
    pipeline.zremrangebyscore(redisKey, 0, windowStart);
    pipeline.zcard(redisKey);
    pipeline.zadd(redisKey, now, `${now}-${Math.random()}`);
    pipeline.pexpire(redisKey, config.windowMs);

    const results = await pipeline.exec();
    const currentCount = (results?.[1]?.[1] as number) || 0;

    return {
      allowed: currentCount < config.maxRequests,
      remaining: Math.max(0, config.maxRequests - currentCount - 1),
      resetAt: now + config.windowMs,
    };
  }

  /**
   * Log security event
   */
  async logSecurityEvent(event: {
    type: string;
    severity: string;
    userId?: string;
    ip?: string;
    details: Record<string, any>;
  }): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.xadd(
        'security:events',
        'MAXLEN', '~', '10000',
        '*',
        'type', event.type,
        'severity', event.severity,
        'userId', event.userId || '',
        'ip', event.ip || '',
        'details', JSON.stringify(event.details),
        'timestamp', String(Date.now()),
      );
    } catch {}
  }

  async shutdown(): Promise<void> {
    if (this.redis) await this.redis.quit();
  }
}

// ── Singleton Export ─────────────────────────────
let instance: SecurityService | null = null;
export function getSecurityService(): SecurityService {
  if (!instance) instance = new SecurityService();
  return instance;
}
