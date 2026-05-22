// ============================================
// Worker Registry — Distributed Worker Management
// ============================================
// Tracks worker health, load, and capabilities.
// Enables intelligent job routing and failover.

import Redis from 'ioredis';

export interface WorkerInfo {
  id: string;
  region: string;
  host: string;
  port: number;
  capabilities: string[];    // ['python', 'javascript', 'cpp', 'java']
  maxConcurrency: number;
  activeJobs: number;
  cpuUsage: number;          // 0-100
  memoryUsage: number;       // bytes
  memoryTotal: number;       // bytes
  healthScore: number;       // 0-100
  lastHeartbeat: number;
  registeredAt: number;
  status: 'active' | 'draining' | 'unhealthy' | 'dead';
  totalExecutions: number;
  failedExecutions: number;
  avgExecutionMs: number;
}

export interface WorkerHeartbeat {
  workerId: string;
  cpuUsage: number;
  memoryUsage: number;
  activeJobs: number;
  queueDepth: number;
  avgExecutionMs: number;
}

const HEARTBEAT_INTERVAL = 5000;     // 5 seconds
const WORKER_TTL = 30000;            // 30s before marking dead
const UNHEALTHY_THRESHOLD = 15000;   // 15s without heartbeat

/**
 * WorkerRegistry — Manages distributed worker cluster
 *
 * Features:
 * - Worker registration and heartbeat
 * - Health score computation
 * - Intelligent routing based on load/capability
 * - Automatic failover on worker death
 * - Regional routing support
 */
export class WorkerRegistry {
  private workers: Map<string, WorkerInfo> = new Map();
  private redis: Redis | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(redisUrl?: string) {
    if (redisUrl) {
      this.redis = new Redis(redisUrl, {
        retryStrategy: (times) => Math.min(times * 100, 3000),
        lazyConnect: true,
      });
      this.redis.connect().catch(() => {
        this.redis = null;
      });
    }

    // Periodic cleanup of dead workers
    this.cleanupTimer = setInterval(() => this.cleanupDeadWorkers(), 10000);
  }

  /**
   * Register a new worker
   */
  async register(worker: Omit<WorkerInfo, 'healthScore' | 'status' | 'registeredAt' | 'totalExecutions' | 'failedExecutions' | 'avgExecutionMs'>): Promise<void> {
    const info: WorkerInfo = {
      ...worker,
      healthScore: 100,
      status: 'active',
      registeredAt: Date.now(),
      totalExecutions: 0,
      failedExecutions: 0,
      avgExecutionMs: 0,
    };

    this.workers.set(worker.id, info);
    await this.persistWorker(info);
    console.log(`[WorkerRegistry] Worker registered: ${worker.id} (region: ${worker.region}, capabilities: ${worker.capabilities.join(', ')})`);
  }

  /**
   * Process heartbeat from a worker
   */
  async heartbeat(hb: WorkerHeartbeat): Promise<void> {
    const worker = this.workers.get(hb.workerId);
    if (!worker) return;

    worker.cpuUsage = hb.cpuUsage;
    worker.memoryUsage = hb.memoryUsage;
    worker.activeJobs = hb.activeJobs;
    worker.avgExecutionMs = hb.avgExecutionMs;
    worker.lastHeartbeat = Date.now();
    worker.healthScore = this.computeHealthScore(worker);
    worker.status = 'active';

    await this.persistWorker(worker);
  }

  /**
   * Compute health score for a worker (0-100)
   *
   * Factors:
   * - CPU usage (lower is better)
   * - Memory usage (lower is better)
   * - Active job ratio (lower is better)
   * - Failure rate (lower is better)
   * - Response latency (lower is better)
   */
  private computeHealthScore(worker: WorkerInfo): number {
    let score = 100;

    // CPU penalty: -1 point per 2% CPU over 50%
    if (worker.cpuUsage > 50) {
      score -= Math.floor((worker.cpuUsage - 50) / 2);
    }

    // Memory penalty: -1 point per 5% memory over 60%
    const memPercent = (worker.memoryUsage / worker.memoryTotal) * 100;
    if (memPercent > 60) {
      score -= Math.floor((memPercent - 60) / 5);
    }

    // Job saturation penalty
    const jobRatio = worker.activeJobs / worker.maxConcurrency;
    if (jobRatio > 0.8) {
      score -= Math.floor((jobRatio - 0.8) * 50);
    }

    // Failure rate penalty
    if (worker.totalExecutions > 10) {
      const failRate = worker.failedExecutions / worker.totalExecutions;
      score -= Math.floor(failRate * 30);
    }

    // Latency penalty (>5s average = bad)
    if (worker.avgExecutionMs > 5000) {
      score -= Math.floor((worker.avgExecutionMs - 5000) / 1000);
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Select the best worker for a job based on language, load, health
   */
  selectWorker(language: string, preferredRegion?: string): WorkerInfo | null {
    const candidates = Array.from(this.workers.values())
      .filter(w => w.status === 'active')
      .filter(w => w.capabilities.includes(language))
      .filter(w => w.activeJobs < w.maxConcurrency)
      .sort((a, b) => {
        // Prefer same region
        if (preferredRegion) {
          if (a.region === preferredRegion && b.region !== preferredRegion) return -1;
          if (b.region === preferredRegion && a.region !== preferredRegion) return 1;
        }
        // Then sort by health score (higher is better)
        return b.healthScore - a.healthScore;
      });

    return candidates[0] || null;
  }

  /**
   * Get all workers
   */
  getWorkers(): WorkerInfo[] {
    return Array.from(this.workers.values());
  }

  /**
   * Get active worker count
   */
  getActiveWorkerCount(): number {
    return Array.from(this.workers.values()).filter(w => w.status === 'active').length;
  }

  /**
   * Mark worker as draining (no new jobs, finish current)
   */
  async drainWorker(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.status = 'draining';
      await this.persistWorker(worker);
    }
  }

  /**
   * Deregister a worker
   */
  async deregister(workerId: string): Promise<void> {
    this.workers.delete(workerId);
    if (this.redis) {
      await this.redis.del(`worker:${workerId}`);
    }
    console.log(`[WorkerRegistry] Worker deregistered: ${workerId}`);
  }

  /**
   * Record execution result for a worker
   */
  recordExecution(workerId: string, durationMs: number, success: boolean): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    worker.totalExecutions++;
    if (!success) worker.failedExecutions++;

    // Running average
    worker.avgExecutionMs = (worker.avgExecutionMs * (worker.totalExecutions - 1) + durationMs) / worker.totalExecutions;
    worker.healthScore = this.computeHealthScore(worker);
  }

  /**
   * Cleanup dead workers
   */
  private cleanupDeadWorkers(): void {
    const now = Date.now();
    for (const [id, worker] of this.workers) {
      const timeSinceHeartbeat = now - worker.lastHeartbeat;
      if (timeSinceHeartbeat > WORKER_TTL) {
        worker.status = 'dead';
        console.warn(`[WorkerRegistry] Worker dead: ${id} (no heartbeat for ${Math.floor(timeSinceHeartbeat / 1000)}s)`);
        // Don't remove immediately — give time for failover
      } else if (timeSinceHeartbeat > UNHEALTHY_THRESHOLD) {
        worker.status = 'unhealthy';
        worker.healthScore = Math.min(worker.healthScore, 20);
      }
    }
  }

  private async persistWorker(worker: WorkerInfo): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(`worker:${worker.id}`, JSON.stringify(worker), 'EX', 60);
    } catch {}
  }

  async shutdown(): Promise<void> {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    if (this.redis) await this.redis.quit();
  }
}
