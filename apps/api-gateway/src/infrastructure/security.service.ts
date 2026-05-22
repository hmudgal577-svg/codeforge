// ============================================
// Security Intelligence NestJS Service
// ============================================
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const SUSPICIOUS_PATTERNS: Record<string, RegExp[]> = {
  CRYPTO_MINING: [/crypto|mining|stratum|xmr|monero|coinhive/i, /hashrate|nonce|block_header/i],
  REVERSE_SHELL: [/\/bin\/sh|\/bin\/bash|cmd\.exe/i, /reverse.*shell|bind.*shell/i, /nc\s+-e|bash\s+-i/i],
  FORK_BOMB: [/fork\(\)|os\.fork/i, /while.*true.*fork/i],
  FILE_SYSTEM_ABUSE: [/\/etc\/passwd|\/etc\/shadow/i, /rm\s+-rf|format\s+c:/i],
  DATA_EXFILTRATION: [/curl.*\|.*bash/i, /wget.*-O.*-/i],
  NETWORK_SCAN: [/nmap|masscan|port.*scan/i],
};

export interface ThreatDetail {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  pattern: string;
  description: string;
  lineNumber?: number;
}

export interface ThreatAnalysis {
  isSuspicious: boolean;
  threats: ThreatDetail[];
  riskScore: number;
  recommendation: 'allow' | 'warn' | 'block';
}

@Injectable()
export class SecurityIntelligence {
  private readonly logger = new Logger(SecurityIntelligence.name);
  private redis: Redis | null = null;

  constructor(private readonly config: ConfigService) {
    const redisUrl = this.config.get<string>('REDIS_URL', '');
    if (redisUrl) {
      try {
        this.redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 3 });
        this.redis.connect().catch(() => { this.redis = null; });
      } catch { this.redis = null; }
    }
  }

  analyzeCode(code: string, language: string): ThreatAnalysis {
    const threats: ThreatDetail[] = [];
    const lines = code.split('\n');
    const severityMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
      CRYPTO_MINING: 'critical', REVERSE_SHELL: 'critical', FORK_BOMB: 'critical',
      FILE_SYSTEM_ABUSE: 'high', DATA_EXFILTRATION: 'critical', NETWORK_SCAN: 'high',
    };

    for (const [threatType, patterns] of Object.entries(SUSPICIOUS_PATTERNS)) {
      for (const pattern of patterns) {
        lines.forEach((line, idx) => {
          if (pattern.test(line)) {
            threats.push({
              type: threatType, severity: severityMap[threatType] || 'medium',
              pattern: pattern.source,
              description: `Suspicious: ${threatType.replace(/_/g, ' ').toLowerCase()}`,
              lineNumber: idx + 1,
            });
          }
        });
      }
    }

    // Language-specific security checks
    if (['javascript', 'typescript'].includes(language)) {
      lines.forEach((line, idx) => {
        if (/\beval\s*\(/.test(line)) {
          threats.push({ type: 'CODE_INJECTION', severity: 'high', pattern: 'eval()', description: 'eval() usage — potential code injection', lineNumber: idx + 1 });
        }
      });
    }
    if (language === 'python') {
      lines.forEach((line, idx) => {
        if (/\b(exec|eval)\s*\(/.test(line) && /\binput\b|\bos\b|\bsubprocess\b/.test(line)) {
          threats.push({ type: 'CODE_INJECTION', severity: 'high', pattern: 'exec/eval with user input', description: 'Dynamic code execution with potential user input', lineNumber: idx + 1 });
        }
        if (/os\.system\s*\(|subprocess\.call\s*\(.*shell\s*=\s*True/.test(line)) {
          threats.push({ type: 'SHELL_INJECTION', severity: 'high', pattern: 'os.system/subprocess shell', description: 'Shell command execution — potential injection', lineNumber: idx + 1 });
        }
      });
    }
    if (language === 'php') {
      lines.forEach((line, idx) => {
        if (/\b(system|exec|shell_exec|passthru|popen)\s*\(/.test(line)) {
          threats.push({ type: 'SHELL_INJECTION', severity: 'high', pattern: 'PHP shell functions', description: 'Shell command execution in PHP', lineNumber: idx + 1 });
        }
      });
    }
    if (language === 'ruby') {
      lines.forEach((line, idx) => {
        if (/\b(system|exec|`.*`)\s*/.test(line) && /\$\{|#\{/.test(line)) {
          threats.push({ type: 'SHELL_INJECTION', severity: 'high', pattern: 'Ruby shell interpolation', description: 'Shell execution with interpolation', lineNumber: idx + 1 });
        }
      });
    }
    if (language === 'go') {
      lines.forEach((line, idx) => {
        if (/exec\.Command\s*\(/.test(line)) {
          threats.push({ type: 'SHELL_INJECTION', severity: 'medium', pattern: 'os/exec.Command', description: 'External command execution in Go', lineNumber: idx + 1 });
        }
      });
    }

    const riskScore = Math.min(100, threats.reduce((s, t) => s + (t.severity === 'critical' ? 40 : t.severity === 'high' ? 25 : 10), 0));

    return {
      isSuspicious: threats.length > 0, threats, riskScore,
      recommendation: riskScore > 70 ? 'block' : riskScore > 30 ? 'warn' : 'allow',
    };
  }

  async checkRateLimit(key: string, maxRequests: number, windowMs: number): Promise<{ allowed: boolean; remaining: number }> {
    if (!this.redis) return { allowed: true, remaining: maxRequests };
    const redisKey = `rl:${key}`;
    const now = Date.now();
    const pipeline = this.redis.pipeline();
    pipeline.zremrangebyscore(redisKey, 0, now - windowMs);
    pipeline.zcard(redisKey);
    pipeline.zadd(redisKey, now, `${now}-${Math.random()}`);
    pipeline.pexpire(redisKey, windowMs);
    const results = await pipeline.exec();
    const count = (results?.[1]?.[1] as number) || 0;
    return { allowed: count < maxRequests, remaining: Math.max(0, maxRequests - count - 1) };
  }

  async logThreat(event: { type: string; severity: string; userId?: string; details: Record<string, any> }): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.xadd('security-events', 'MAXLEN', '~', '10000', '*',
        'type', event.type, 'severity', event.severity,
        'userId', event.userId || '', 'details', JSON.stringify(event.details),
        'timestamp', String(Date.now()));
    } catch {}
  }
}
