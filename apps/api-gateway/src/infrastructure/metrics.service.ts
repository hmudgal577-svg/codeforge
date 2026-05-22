// ============================================
// Metrics Service — Prometheus Observability
// ============================================
import { Injectable, Logger } from '@nestjs/common';
import * as client from 'prom-client';

client.collectDefaultMetrics({ prefix: 'codeforge_' });

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  // Execution
  readonly executionCounter = new client.Counter({ name: 'codeforge_executions_total', help: 'Total executions', labelNames: ['language', 'status'] as const });
  readonly executionDuration = new client.Histogram({ name: 'codeforge_execution_duration_ms', help: 'Execution duration', labelNames: ['language'] as const, buckets: [50, 100, 250, 500, 1000, 5000, 10000, 30000] });
  readonly activeExecutions = new client.Gauge({ name: 'codeforge_active_executions', help: 'Active executions' });

  // WebSocket
  readonly wsConnections = new client.Gauge({ name: 'codeforge_ws_connections', help: 'WebSocket connections' });
  readonly wsRooms = new client.Gauge({ name: 'codeforge_ws_rooms', help: 'Active rooms' });
  readonly wsSyncBytes = new client.Counter({ name: 'codeforge_ws_sync_bytes', help: 'Sync bytes', labelNames: ['direction'] as const });

  // AI
  readonly aiCounter = new client.Counter({ name: 'codeforge_ai_analyses_total', help: 'AI analyses', labelNames: ['type', 'status'] as const });
  readonly aiDuration = new client.Histogram({ name: 'codeforge_ai_duration_ms', help: 'AI duration', labelNames: ['type'] as const, buckets: [100, 500, 1000, 5000, 10000, 30000] });

  // Auth
  readonly authEvents = new client.Counter({ name: 'codeforge_auth_events_total', help: 'Auth events', labelNames: ['type'] as const });

  // Security
  readonly securityEvents = new client.Counter({ name: 'codeforge_security_events_total', help: 'Security events', labelNames: ['type', 'severity'] as const });

  // HTTP
  readonly httpRequests = new client.Counter({ name: 'codeforge_http_requests_total', help: 'HTTP requests', labelNames: ['method', 'path', 'status'] as const });
  readonly httpDuration = new client.Histogram({ name: 'codeforge_http_duration_ms', help: 'HTTP duration', labelNames: ['method', 'path'] as const, buckets: [5, 10, 25, 50, 100, 250, 500, 1000] });

  // Events
  readonly eventsPublished = new client.Counter({ name: 'codeforge_events_published_total', help: 'Events published', labelNames: ['stream'] as const });

  async getMetrics(): Promise<string> {
    return client.register.metrics();
  }

  getContentType(): string {
    return client.register.contentType;
  }
}
