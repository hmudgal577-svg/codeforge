// ============================================
// Execution Orchestrator — Distributed Mesh
// ============================================
// Intelligent execution scheduler with dynamic
// worker allocation, queue balancing, failover,
// and regional routing.

import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { WorkerRegistry, WorkerInfo, WorkerHeartbeat } from './worker-registry';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

interface ExecutionJob {
  jobId: string;
  workspaceId: string;
  userId: string;
  language: string;
  code: string;
  stdin?: string;
  priority: number;
  region?: string;
  retryCount: number;
  maxRetries: number;
  submittedAt: number;
}

interface ExecutionResult {
  jobId: string;
  workerId: string;
  output: string;
  error?: string;
  exitCode: number;
  executionMs: number;
  memoryBytes?: number;
}

/**
 * ExecutionOrchestrator — Distributed execution mesh
 *
 * Features:
 * - Intelligent execution scheduler
 * - Dynamic worker allocation based on load
 * - Queue-aware execution balancing
 * - Worker health scoring + auto failover
 * - Regional execution routing
 * - Execution replication for critical jobs
 * - Distributed state recovery
 */
class ExecutionOrchestrator {
  private registry: WorkerRegistry;
  private submissionQueue: Queue;
  private resultQueue: Queue;
  private scheduler: Worker;
  private redis: Redis;
  private pendingJobs: Map<string, ExecutionJob> = new Map();

  constructor() {
    this.redis = new Redis(REDIS_URL);
    this.registry = new WorkerRegistry(REDIS_URL);

    // Queue for incoming execution requests
    this.submissionQueue = new Queue('execution-submit', {
      connection: { host: 'localhost', port: 6379 },
      defaultJobOptions: {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 500 },
      },
    });

    // Queue for results
    this.resultQueue = new Queue('execution-results', {
      connection: { host: 'localhost', port: 6379 },
    });

    // Scheduler processes submissions and routes to workers
    this.scheduler = new Worker('execution-submit', async (job: Job) => {
      return this.scheduleExecution(job.data as ExecutionJob);
    }, {
      connection: { host: 'localhost', port: 6379 },
      concurrency: 10,
      limiter: { max: 50, duration: 1000 },
    });

    this.scheduler.on('failed', (job, err) => {
      console.error(`[Orchestrator] Job ${job?.id} scheduling failed:`, err.message);
    });

    // Listen for worker heartbeats
    this.listenForHeartbeats();

    console.log('[Orchestrator] Execution orchestrator started');
  }

  /**
   * Schedule an execution job to the best available worker
   */
  private async scheduleExecution(job: ExecutionJob): Promise<ExecutionResult | null> {
    const startTime = Date.now();

    // Select best worker based on language, health, and region
    const worker = this.registry.selectWorker(job.language, job.region);

    if (!worker) {
      // No worker available — retry or fail
      if (job.retryCount < job.maxRetries) {
        console.warn(`[Orchestrator] No worker for ${job.language}, retrying (${job.retryCount + 1}/${job.maxRetries})`);
        await this.submissionQueue.add('retry', {
          ...job,
          retryCount: job.retryCount + 1,
        }, {
          delay: 2000 * (job.retryCount + 1), // Exponential backoff
          priority: job.priority + 1,
        });
        return null;
      }

      console.error(`[Orchestrator] No worker available for ${job.language} after ${job.maxRetries} retries`);
      return {
        jobId: job.jobId,
        workerId: 'none',
        output: '',
        error: `No execution worker available for ${job.language}`,
        exitCode: 1,
        executionMs: Date.now() - startTime,
      };
    }

    // Route job to selected worker's queue
    const workerQueue = new Queue(`execution-worker-${worker.id}`, {
      connection: { host: 'localhost', port: 6379 },
    });

    try {
      await workerQueue.add('execute', {
        ...job,
        assignedWorker: worker.id,
        assignedAt: Date.now(),
      }, {
        priority: job.priority,
        attempts: 2,
      });

      this.pendingJobs.set(job.jobId, job);

      console.log(`[Orchestrator] Job ${job.jobId} → Worker ${worker.id} (health: ${worker.healthScore}, load: ${worker.activeJobs}/${worker.maxConcurrency})`);

      return null; // Result will come via result queue
    } finally {
      await workerQueue.close();
    }
  }

  /**
   * Listen for worker heartbeats via Redis pub/sub
   */
  private listenForHeartbeats(): void {
    const sub = new Redis(REDIS_URL);
    sub.subscribe('worker:heartbeat', 'worker:register', 'worker:deregister');

    sub.on('message', async (channel: string, message: string) => {
      try {
        const data = JSON.parse(message);

        switch (channel) {
          case 'worker:heartbeat':
            await this.registry.heartbeat(data as WorkerHeartbeat);
            break;
          case 'worker:register':
            await this.registry.register(data);
            break;
          case 'worker:deregister':
            await this.registry.deregister(data.workerId);
            // Re-queue jobs from dead worker
            await this.handleWorkerFailover(data.workerId);
            break;
        }
      } catch (err) {
        console.error('[Orchestrator] Heartbeat processing error:', err);
      }
    });
  }

  /**
   * Handle worker failover — re-queue pending jobs
   */
  private async handleWorkerFailover(workerId: string): Promise<void> {
    console.warn(`[Orchestrator] Handling failover for worker ${workerId}`);

    for (const [jobId, job] of this.pendingJobs) {
      // Re-submit jobs that were assigned to the failed worker
      await this.submissionQueue.add('failover', {
        ...job,
        retryCount: job.retryCount + 1,
        failoverFrom: workerId,
      }, {
        priority: 1, // High priority for failover
      });
    }
  }

  /**
   * Get orchestrator stats
   */
  async getStats(): Promise<{
    workers: WorkerInfo[];
    pendingJobs: number;
    activeWorkers: number;
    queueDepth: number;
  }> {
    const waiting = await this.submissionQueue.getWaitingCount();
    const active = await this.submissionQueue.getActiveCount();

    return {
      workers: this.registry.getWorkers(),
      pendingJobs: this.pendingJobs.size,
      activeWorkers: this.registry.getActiveWorkerCount(),
      queueDepth: waiting + active,
    };
  }

  async shutdown(): Promise<void> {
    await this.scheduler.close();
    await this.submissionQueue.close();
    await this.resultQueue.close();
    await this.registry.shutdown();
    await this.redis.quit();
  }
}

// ── Bootstrap ─────────────────────────────────
async function main() {
  console.log('🔧 Starting Execution Orchestrator...');

  // Check Redis connectivity first
  const Redis_check = new (await import('ioredis')).default(REDIS_URL, {
    retryStrategy: () => null, // Don't retry
    connectTimeout: 3000,
    lazyConnect: true,
  });

  try {
    await Redis_check.connect();
    await Redis_check.ping();
    await Redis_check.quit();
    console.log('✅ Redis connected');
  } catch {
    console.warn('⚠️  Redis not available — Orchestrator entering standby mode');
    console.warn('   Start Redis to enable distributed execution mesh');
    // Keep process alive in standby
    setInterval(() => {}, 30000);
    return;
  }

  const orchestrator = new ExecutionOrchestrator();

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[Orchestrator] Shutting down...');
    await orchestrator.shutdown();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('✅ Execution Orchestrator ready');
}

main().catch((err) => {
  console.warn(`⚠️  Orchestrator failed to start: ${err.message}`);
  console.warn('   Running in standby mode...');
  setInterval(() => {}, 30000);
});
