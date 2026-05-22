// ============================================
// Observability — Prometheus Metrics + Tracing
// ============================================
// Distributed tracing, runtime metrics, and
// infrastructure monitoring for CodeForge.

import * as client from 'prom-client';

// Initialize default metrics (CPU, memory, event loop)
client.collectDefaultMetrics({ prefix: 'codeforge_' });

// ── Execution Metrics ───────────────────────────

export const executionCounter = new client.Counter({
  name: 'codeforge_executions_total',
  help: 'Total code executions',
  labelNames: ['language', 'status', 'mode'] as const,
});

export const executionDuration = new client.Histogram({
  name: 'codeforge_execution_duration_ms',
  help: 'Code execution duration in milliseconds',
  labelNames: ['language', 'status'] as const,
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000],
});

export const executionQueueDepth = new client.Gauge({
  name: 'codeforge_execution_queue_depth',
  help: 'Current execution queue depth',
  labelNames: ['priority'] as const,
});

export const activeExecutions = new client.Gauge({
  name: 'codeforge_active_executions',
  help: 'Currently running executions',
  labelNames: ['language', 'worker'] as const,
});

// ── Worker Metrics ──────────────────────────────

export const workerHealthScore = new client.Gauge({
  name: 'codeforge_worker_health_score',
  help: 'Worker health score (0-100)',
  labelNames: ['worker_id', 'region'] as const,
});

export const workerCpuUsage = new client.Gauge({
  name: 'codeforge_worker_cpu_percent',
  help: 'Worker CPU usage percentage',
  labelNames: ['worker_id'] as const,
});

export const workerMemoryUsage = new client.Gauge({
  name: 'codeforge_worker_memory_bytes',
  help: 'Worker memory usage in bytes',
  labelNames: ['worker_id'] as const,
});

export const workerActiveJobs = new client.Gauge({
  name: 'codeforge_worker_active_jobs',
  help: 'Number of active jobs per worker',
  labelNames: ['worker_id'] as const,
});

// ── WebSocket / Collaboration Metrics ───────────

export const wsConnections = new client.Gauge({
  name: 'codeforge_ws_connections',
  help: 'Active WebSocket connections',
});

export const wsRooms = new client.Gauge({
  name: 'codeforge_ws_rooms',
  help: 'Active collaboration rooms',
});

export const wsSyncLatency = new client.Histogram({
  name: 'codeforge_ws_sync_latency_ms',
  help: 'CRDT sync message processing latency',
  buckets: [1, 5, 10, 25, 50, 100, 250],
});

export const wsSyncBytes = new client.Counter({
  name: 'codeforge_ws_sync_bytes_total',
  help: 'Total bytes synced via WebSocket',
  labelNames: ['direction'] as const, // 'in' or 'out'
});

// ── AI Metrics ──────────────────────────────────

export const aiAnalysisCounter = new client.Counter({
  name: 'codeforge_ai_analyses_total',
  help: 'Total AI analyses',
  labelNames: ['type', 'status', 'model'] as const,
});

export const aiAnalysisDuration = new client.Histogram({
  name: 'codeforge_ai_analysis_duration_ms',
  help: 'AI analysis duration in milliseconds',
  labelNames: ['type', 'model'] as const,
  buckets: [100, 500, 1000, 2500, 5000, 10000, 30000],
});

export const aiTokensUsed = new client.Counter({
  name: 'codeforge_ai_tokens_total',
  help: 'Total AI tokens consumed',
  labelNames: ['model'] as const,
});

// ── Security Metrics ────────────────────────────

export const securityEvents = new client.Counter({
  name: 'codeforge_security_events_total',
  help: 'Security events detected',
  labelNames: ['type', 'severity'] as const,
});

export const rateLimitHits = new client.Counter({
  name: 'codeforge_rate_limit_hits_total',
  help: 'Rate limit violations',
  labelNames: ['endpoint', 'user_type'] as const,
});

// ── Infrastructure Metrics ──────────────────────

export const dbQueryDuration = new client.Histogram({
  name: 'codeforge_db_query_duration_ms',
  help: 'Database query duration',
  labelNames: ['operation', 'model'] as const,
  buckets: [1, 5, 10, 25, 50, 100, 250, 500],
});

export const redisOperationDuration = new client.Histogram({
  name: 'codeforge_redis_operation_duration_ms',
  help: 'Redis operation duration',
  labelNames: ['operation'] as const,
  buckets: [0.5, 1, 2, 5, 10, 25],
});

export const eventBusEvents = new client.Counter({
  name: 'codeforge_events_total',
  help: 'Total events published to event bus',
  labelNames: ['stream', 'type'] as const,
});

// ── Tracing ─────────────────────────────────────

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'ok' | 'error';
  tags: Record<string, string>;
  logs: Array<{ timestamp: number; message: string }>;
}

let traceIdCounter = 0;

export function createTrace(operationName: string, serviceName: string, parentSpanId?: string): TraceSpan {
  return {
    traceId: `trace-${Date.now()}-${++traceIdCounter}`,
    spanId: `span-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    parentSpanId,
    operationName,
    serviceName,
    startTime: Date.now(),
    status: 'ok',
    tags: {},
    logs: [],
  };
}

export function finishTrace(span: TraceSpan, status: 'ok' | 'error' = 'ok'): TraceSpan {
  span.endTime = Date.now();
  span.duration = span.endTime - span.startTime;
  span.status = status;
  return span;
}

// ── Metrics Endpoint ────────────────────────────

export async function getMetrics(): Promise<string> {
  return client.register.metrics();
}

export function getMetricsContentType(): string {
  return client.register.contentType;
}

export { client as promClient };
