// ============================================
// Event Bus NestJS Service Wrapper
// ============================================
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const EventStreams = {
  EXECUTION: 'events-execution',
  COLLABORATION: 'events-collaboration',
  AI: 'events-ai',
  AUTH: 'events-auth',
  WORKSPACE: 'events-workspace',
  SYSTEM: 'events-system',
  AUDIT: 'events-audit',
} as const;

export const EventTypes = {
  EXEC_SUBMITTED: 'execution.submitted',
  EXEC_STARTED: 'execution.started',
  EXEC_COMPLETED: 'execution.completed',
  EXEC_FAILED: 'execution.failed',
  EXEC_TIMEOUT: 'execution.timeout',
  COLLAB_USER_JOINED: 'collaboration.user_joined',
  COLLAB_USER_LEFT: 'collaboration.user_left',
  COLLAB_DOC_UPDATED: 'collaboration.doc_updated',
  AI_ANALYSIS_SUBMITTED: 'ai.analysis_submitted',
  AI_ANALYSIS_COMPLETED: 'ai.analysis_completed',
  AI_ANALYSIS_FAILED: 'ai.analysis_failed',
  AUTH_USER_REGISTERED: 'auth.user_registered',
  AUTH_USER_LOGGED_IN: 'auth.user_logged_in',
  WS_CREATED: 'workspace.created',
  WS_FILE_CREATED: 'workspace.file_created',
  SYS_HEALTH_CHECK: 'system.health_check',
  SYS_WORKER_FAILED: 'system.worker_failed',
  SECURITY_THREAT: 'security.threat_detected',
} as const;

export interface DomainEvent {
  id?: string;
  stream: string;
  type: string;
  payload: Record<string, any>;
  userId?: string;
  timestamp?: number;
  correlationId?: string;
}

type EventHandler = (event: DomainEvent) => Promise<void> | void;

@Injectable()
export class EventBus implements OnModuleDestroy {
  private readonly logger = new Logger(EventBus.name);
  private redis: Redis | null = null;
  private handlers: Map<string, EventHandler[]> = new Map();
  private eventCount = 0;

  constructor(private readonly config: ConfigService) {
    const redisUrl = this.config.get<string>('REDIS_URL', '');
    if (redisUrl) {
      try {
        this.redis = new Redis(redisUrl, {
          retryStrategy: (times) => Math.min(times * 200, 3000),
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        });
        this.redis.connect().catch(() => {
          this.logger.warn('Redis not available — events are in-memory only');
          this.redis = null;
        });
      } catch {
        this.redis = null;
      }
    }
  }

  async publish(event: DomainEvent): Promise<string> {
    const enriched = {
      ...event,
      timestamp: event.timestamp || Date.now(),
      correlationId: event.correlationId || `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    };

    this.eventCount++;

    // Persist to Redis Stream
    if (this.redis) {
      try {
        const fields: string[] = [
          'type', enriched.type,
          'payload', JSON.stringify(enriched.payload),
          'timestamp', String(enriched.timestamp),
        ];
        if (enriched.userId) fields.push('userId', enriched.userId);

        const id = await this.redis.xadd(
          enriched.stream, 'MAXLEN', '~', '10000', '*', ...fields,
        );
        enriched.id = id ?? undefined;

        // Audit stream
        await this.redis.xadd(
          EventStreams.AUDIT, 'MAXLEN', '~', '50000', '*',
          'stream', enriched.stream,
          'type', enriched.type,
          'payload', JSON.stringify(enriched.payload),
          'userId', enriched.userId || '',
          'timestamp', String(enriched.timestamp),
        );
      } catch (err) {
        this.logger.debug(`Event publish to Redis failed: ${(err as Error).message}`);
      }
    }

    // Dispatch to local handlers
    const streamHandlers = this.handlers.get(enriched.stream) || [];
    const typeHandlers = this.handlers.get(enriched.type) || [];
    const allHandlers = this.handlers.get('*') || [];
    for (const handler of [...streamHandlers, ...typeHandlers, ...allHandlers]) {
      try { await handler(enriched); } catch {}
    }

    return enriched.id || '';
  }

  on(streamOrType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(streamOrType) || [];
    handlers.push(handler);
    this.handlers.set(streamOrType, handlers);
  }

  async replay(stream: string, since = '0', count = 100): Promise<DomainEvent[]> {
    if (!this.redis) return [];
    try {
      const results = await this.redis.xrange(stream, since, '+', 'COUNT', count);
      return results.map(([id, fields]) => {
        const data: Record<string, string> = {};
        for (let i = 0; i < fields.length; i += 2) data[fields[i]] = fields[i + 1];
        return {
          id, stream, type: data.type || '',
          payload: JSON.parse(data.payload || '{}'),
          userId: data.userId || undefined,
          timestamp: parseInt(data.timestamp || '0'),
        };
      });
    } catch { return []; }
  }

  async getAuditTimeline(since = '0', count = 100): Promise<DomainEvent[]> {
    return this.replay(EventStreams.AUDIT, since, count);
  }

  getEventCount(): number { return this.eventCount; }

  async shutdown(): Promise<void> {
    if (this.redis) await this.redis.quit().catch(() => {});
  }

  async onModuleDestroy() { await this.shutdown(); }
}
