// ============================================
// Recovery Service — Self-Healing
// ============================================
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface HealthCheck {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'dead';
  lastCheck: number;
  responseTime: number;
  consecutiveFailures: number;
}

export interface RecoveryAction {
  type: string; target: string; reason: string;
  timestamp: number; status: 'completed' | 'failed'; result?: string;
}

@Injectable()
export class RecoveryService implements OnModuleDestroy {
  private readonly logger = new Logger(RecoveryService.name);
  private redis: Redis | null = null;
  private healthChecks: Map<string, HealthCheck> = new Map();
  private recoveryLog: RecoveryAction[] = [];
  private interval: NodeJS.Timeout | null = null;
  private checkers: Map<string, () => Promise<boolean>> = new Map();

  constructor(private readonly config: ConfigService) {
    const redisUrl = this.config.get<string>('REDIS_URL', '');
    if (redisUrl) {
      try {
        this.redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 3 });
        this.redis.connect().catch(() => { this.redis = null; });
      } catch { this.redis = null; }
    }
  }

  registerCheck(service: string, checker: () => Promise<boolean>): void {
    this.checkers.set(service, checker);
    this.healthChecks.set(service, {
      service, status: 'healthy', lastCheck: Date.now(),
      responseTime: 0, consecutiveFailures: 0,
    });
  }

  startMonitoring(intervalMs = 15000): void {
    // Register default checks
    this.registerCheck('redis', async () => {
      if (!this.redis) return false;
      try { await this.redis.ping(); return true; } catch { return false; }
    });

    this.interval = setInterval(() => this.runChecks(), intervalMs);
    this.logger.log(`Recovery monitoring started (${intervalMs}ms interval)`);
  }

  private async runChecks(): Promise<void> {
    for (const [service, checker] of this.checkers) {
      const check = this.healthChecks.get(service)!;
      const start = Date.now();
      try {
        const healthy = await Promise.race([
          checker(),
          new Promise<boolean>((_, reject) => setTimeout(() => reject(false), 5000)),
        ]);
        check.responseTime = Date.now() - start;
        check.lastCheck = Date.now();
        if (healthy) {
          check.status = check.responseTime > 2000 ? 'degraded' : 'healthy';
          check.consecutiveFailures = 0;
        } else {
          check.consecutiveFailures++;
          check.status = check.consecutiveFailures >= 3 ? 'dead' : 'unhealthy';
        }
      } catch {
        check.consecutiveFailures++;
        check.responseTime = Date.now() - start;
        check.lastCheck = Date.now();
        check.status = check.consecutiveFailures >= 3 ? 'dead' : 'unhealthy';
      }

      if (check.status === 'dead') {
        this.logger.warn(`Service ${service} is DEAD (${check.consecutiveFailures} failures)`);
        this.recoveryLog.push({
          type: 'alert', target: service,
          reason: `Dead after ${check.consecutiveFailures} failures`,
          timestamp: Date.now(), status: 'completed',
        });
        if (this.recoveryLog.length > 200) this.recoveryLog.splice(0, this.recoveryLog.length - 200);
      }
    }
  }

  getHealthStatus(): HealthCheck[] {
    return Array.from(this.healthChecks.values());
  }

  getSystemHealth(): { overall: string; services: number; healthy: number; degraded: number; unhealthy: number; dead: number } {
    const checks = Array.from(this.healthChecks.values());
    const h = checks.filter(c => c.status === 'healthy').length;
    const d = checks.filter(c => c.status === 'degraded').length;
    const u = checks.filter(c => c.status === 'unhealthy').length;
    const dead = checks.filter(c => c.status === 'dead').length;
    return {
      overall: dead > 0 ? 'critical' : u > 0 ? 'unhealthy' : d > 0 ? 'degraded' : 'healthy',
      services: checks.length, healthy: h, degraded: d, unhealthy: u, dead,
    };
  }

  getRecoveryLog(): RecoveryAction[] { return this.recoveryLog; }

  async shutdown(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    if (this.redis) await this.redis.quit().catch(() => {});
  }

  async onModuleDestroy() { await this.shutdown(); }
}
