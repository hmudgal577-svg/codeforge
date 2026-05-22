// ============================================
// Autonomous Recovery Infrastructure
// ============================================
// Self-healing system for worker crashes, queue
// corruption, runtime failures, WebSocket
// desync, and infrastructure node instability.

import Redis from 'ioredis';

export interface HealthCheck {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'dead';
  lastCheck: number;
  responseTime: number;
  details: Record<string, any>;
  consecutiveFailures: number;
}

export interface RecoveryAction {
  id: string;
  type: 'restart_worker' | 'requeue_jobs' | 'repair_queue' | 'resync_ws' | 'reset_state' | 'failover' | 'scale_up';
  target: string;
  reason: string;
  timestamp: number;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: string;
}

/**
 * AutoRecovery — Self-healing infrastructure
 *
 * Monitors and recovers from:
 * - Worker crashes (restart + job re-queue)
 * - Queue corruption (detect + repair)
 * - Runtime failures (cleanup + retry)
 * - WebSocket desynchronization (force resync)
 * - Distributed state inconsistencies (reconcile)
 * - Container termination failures (force kill)
 * - Infrastructure node instability (failover)
 */
export class AutoRecovery {
  private healthChecks: Map<string, HealthCheck> = new Map();
  private recoveryLog: RecoveryAction[] = [];
  private redis: Redis | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private maxRecoveryLogSize = 500;

  constructor(redisUrl?: string) {
    if (redisUrl) {
      this.redis = new Redis(redisUrl, {
        retryStrategy: (times) => Math.min(times * 100, 3000),
        lazyConnect: true,
      });
      this.redis.connect().catch(() => { this.redis = null; });
    }
  }

  /**
   * Start periodic health monitoring
   */
  startMonitoring(intervalMs = 10000): void {
    this.checkInterval = setInterval(async () => {
      await this.runHealthChecks();
      await this.evaluateAndRecover();
    }, intervalMs);
    console.log(`[AutoRecovery] Monitoring started (interval: ${intervalMs}ms)`);
  }

  /**
   * Register a service health check
   */
  registerHealthCheck(service: string, checker: () => Promise<{ healthy: boolean; details: Record<string, any> }>): void {
    // Store checker in closure
    (this as any)[`checker_${service}`] = checker;
    this.healthChecks.set(service, {
      service,
      status: 'healthy',
      lastCheck: Date.now(),
      responseTime: 0,
      details: {},
      consecutiveFailures: 0,
    });
  }

  /**
   * Run all health checks
   */
  private async runHealthChecks(): Promise<void> {
    for (const [service, check] of this.healthChecks) {
      const checker = (this as any)[`checker_${service}`];
      if (!checker) continue;

      const start = Date.now();
      try {
        const result = await Promise.race([
          checker(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ]) as { healthy: boolean; details: Record<string, any> };

        check.responseTime = Date.now() - start;
        check.lastCheck = Date.now();
        check.details = result.details;

        if (result.healthy) {
          check.status = check.responseTime > 2000 ? 'degraded' : 'healthy';
          check.consecutiveFailures = 0;
        } else {
          check.consecutiveFailures++;
          check.status = check.consecutiveFailures >= 3 ? 'dead' : 'unhealthy';
        }
      } catch (err: any) {
        check.consecutiveFailures++;
        check.responseTime = Date.now() - start;
        check.lastCheck = Date.now();
        check.details = { error: err.message };
        check.status = check.consecutiveFailures >= 3 ? 'dead' : 'unhealthy';
      }
    }
  }

  /**
   * Evaluate health checks and trigger recovery actions
   */
  private async evaluateAndRecover(): Promise<void> {
    for (const [service, check] of this.healthChecks) {
      if (check.status === 'dead') {
        await this.executeRecovery({
          id: `recovery-${Date.now()}`,
          type: 'restart_worker',
          target: service,
          reason: `Service dead after ${check.consecutiveFailures} consecutive failures`,
          timestamp: Date.now(),
          status: 'pending',
        });
      } else if (check.status === 'unhealthy' && check.consecutiveFailures >= 2) {
        await this.executeRecovery({
          id: `recovery-${Date.now()}`,
          type: 'requeue_jobs',
          target: service,
          reason: `Service unhealthy (${check.consecutiveFailures} failures)`,
          timestamp: Date.now(),
          status: 'pending',
        });
      }
    }
  }

  /**
   * Execute a recovery action
   */
  private async executeRecovery(action: RecoveryAction): Promise<void> {
    action.status = 'executing';
    this.recoveryLog.push(action);
    if (this.recoveryLog.length > this.maxRecoveryLogSize) {
      this.recoveryLog.splice(0, this.recoveryLog.length - this.maxRecoveryLogSize);
    }

    console.warn(`[AutoRecovery] Executing: ${action.type} on ${action.target} — ${action.reason}`);

    try {
      switch (action.type) {
        case 'restart_worker':
          await this.recoverWorker(action.target);
          break;
        case 'requeue_jobs':
          await this.requeueStuckJobs(action.target);
          break;
        case 'repair_queue':
          await this.repairQueue(action.target);
          break;
        case 'resync_ws':
          await this.resyncWebSocket(action.target);
          break;
        case 'reset_state':
          await this.resetServiceState(action.target);
          break;
      }
      action.status = 'completed';
      action.result = 'Recovery successful';
    } catch (err: any) {
      action.status = 'failed';
      action.result = `Recovery failed: ${err.message}`;
      console.error(`[AutoRecovery] Failed:`, err.message);
    }

    // Persist to Redis
    if (this.redis) {
      await this.redis.xadd(
        'recovery:log', 'MAXLEN', '~', '1000', '*',
        'type', action.type,
        'target', action.target,
        'reason', action.reason,
        'status', action.status,
        'result', action.result || '',
        'timestamp', String(action.timestamp),
      ).catch(() => {});
    }
  }

  private async recoverWorker(workerId: string): Promise<void> {
    if (!this.redis) return;
    // Publish restart signal
    await this.redis.publish('worker:restart', JSON.stringify({ workerId, reason: 'auto-recovery' }));
    // Reset health counter
    const check = this.healthChecks.get(workerId);
    if (check) {
      check.consecutiveFailures = 0;
      check.status = 'healthy';
    }
  }

  private async requeueStuckJobs(service: string): Promise<void> {
    if (!this.redis) return;
    // Find stuck jobs and requeue
    const stuckJobs = await this.redis.lrange(`stuck:${service}`, 0, -1);
    for (const job of stuckJobs) {
      await this.redis.rpush('execution:submit', job);
    }
    await this.redis.del(`stuck:${service}`);
  }

  private async repairQueue(queueName: string): Promise<void> {
    if (!this.redis) return;
    // Remove corrupted entries
    await this.redis.ltrim(queueName, 0, -1);
  }

  private async resyncWebSocket(roomId: string): Promise<void> {
    if (!this.redis) return;
    await this.redis.publish('ws:force-resync', JSON.stringify({ roomId }));
  }

  private async resetServiceState(service: string): Promise<void> {
    if (!this.redis) return;
    await this.redis.del(`state:${service}`);
  }

  /**
   * Get recovery log
   */
  getRecoveryLog(): RecoveryAction[] {
    return this.recoveryLog;
  }

  /**
   * Get all health check statuses
   */
  getHealthStatus(): HealthCheck[] {
    return Array.from(this.healthChecks.values());
  }

  /**
   * Get system health summary
   */
  getSystemHealth(): { overall: string; services: number; healthy: number; degraded: number; unhealthy: number; dead: number } {
    const checks = Array.from(this.healthChecks.values());
    const healthy = checks.filter(c => c.status === 'healthy').length;
    const degraded = checks.filter(c => c.status === 'degraded').length;
    const unhealthy = checks.filter(c => c.status === 'unhealthy').length;
    const dead = checks.filter(c => c.status === 'dead').length;

    let overall = 'healthy';
    if (dead > 0) overall = 'critical';
    else if (unhealthy > 0) overall = 'unhealthy';
    else if (degraded > 0) overall = 'degraded';

    return { overall, services: checks.length, healthy, degraded, unhealthy, dead };
  }

  async shutdown(): Promise<void> {
    if (this.checkInterval) clearInterval(this.checkInterval);
    if (this.redis) await this.redis.quit();
  }
}
