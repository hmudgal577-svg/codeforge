// ============================================
// Event Bus — Distributed Event Infrastructure
// ============================================
// Immutable event sourcing using Redis Streams.
// Provides replayable events, cross-service
// propagation, and distributed state reconstruction.

import Redis from 'ioredis';

// ── Event Types ─────────────────────────────────
export type EventCategory = 'execution' | 'collaboration' | 'ai' | 'auth' | 'workspace' | 'system';

export interface DomainEvent {
  id?: string;
  stream: string;
  type: string;
  payload: Record<string, any>;
  userId?: string;
  timestamp?: number;
  correlationId?: string;
  metadata?: Record<string, any>;
}

export interface EventFilter {
  stream?: string;
  type?: string;
  since?: string; // Redis stream ID (timestamp-based)
  count?: number;
}

export type EventHandler = (event: DomainEvent) => Promise<void> | void;

// ── Event Streams ───────────────────────────────
export const EventStreams = {
  EXECUTION: 'events:execution',
  COLLABORATION: 'events:collaboration',
  AI: 'events:ai',
  AUTH: 'events:auth',
  WORKSPACE: 'events:workspace',
  SYSTEM: 'events:system',
  AUDIT: 'events:audit',
} as const;

// ── Event Types ─────────────────────────────────
export const EventTypes = {
  // Execution events
  EXEC_SUBMITTED: 'execution.submitted',
  EXEC_STARTED: 'execution.started',
  EXEC_COMPLETED: 'execution.completed',
  EXEC_FAILED: 'execution.failed',
  EXEC_TIMEOUT: 'execution.timeout',
  // Collaboration events
  COLLAB_USER_JOINED: 'collaboration.user_joined',
  COLLAB_USER_LEFT: 'collaboration.user_left',
  COLLAB_DOC_UPDATED: 'collaboration.doc_updated',
  COLLAB_CURSOR_MOVED: 'collaboration.cursor_moved',
  COLLAB_ROOM_CREATED: 'collaboration.room_created',
  COLLAB_ROOM_DESTROYED: 'collaboration.room_destroyed',
  // AI events
  AI_ANALYSIS_SUBMITTED: 'ai.analysis_submitted',
  AI_ANALYSIS_COMPLETED: 'ai.analysis_completed',
  AI_ANALYSIS_FAILED: 'ai.analysis_failed',
  // Auth events
  AUTH_USER_REGISTERED: 'auth.user_registered',
  AUTH_USER_LOGGED_IN: 'auth.user_logged_in',
  AUTH_USER_LOGGED_OUT: 'auth.user_logged_out',
  AUTH_TOKEN_REFRESHED: 'auth.token_refreshed',
  // Workspace events
  WS_CREATED: 'workspace.created',
  WS_UPDATED: 'workspace.updated',
  WS_DELETED: 'workspace.deleted',
  WS_FILE_CREATED: 'workspace.file_created',
  WS_FILE_UPDATED: 'workspace.file_updated',
  WS_FILE_DELETED: 'workspace.file_deleted',
  WS_MEMBER_ADDED: 'workspace.member_added',
  WS_MEMBER_REMOVED: 'workspace.member_removed',
  // System events
  SYS_WORKER_REGISTERED: 'system.worker_registered',
  SYS_WORKER_HEARTBEAT: 'system.worker_heartbeat',
  SYS_WORKER_FAILED: 'system.worker_failed',
  SYS_HEALTH_CHECK: 'system.health_check',
} as const;

/**
 * EventBus — Distributed event infrastructure
 *
 * Features:
 * - Immutable event sourcing via Redis Streams
 * - Cross-service event propagation
 * - Replayable execution events
 * - Event-driven service decoupling
 * - Distributed state reconstruction
 * - Infrastructure audit timeline
 */
export class EventBus {
  private redis: Redis | null = null;
  private subscriber: Redis | null = null;
  private handlers: Map<string, EventHandler[]> = new Map();
  private consumerGroup: string;
  private consumerId: string;
  private running = false;
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(redisUrl?: string, consumerGroup = 'codeforge', consumerId?: string) {
    this.consumerGroup = consumerGroup;
    this.consumerId = consumerId || `worker-${Math.random().toString(36).substring(7)}`;

    if (redisUrl) {
      this.redis = new Redis(redisUrl, {
        retryStrategy: (times) => Math.min(times * 100, 3000),
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
      this.redis.connect().catch(() => {
        console.warn('[EventBus] Redis not available, events will be in-memory only');
        this.redis = null;
      });
    }
  }

  /**
   * Publish an event to a Redis Stream
   */
  async publish(event: DomainEvent): Promise<string> {
    const enrichedEvent = {
      ...event,
      timestamp: event.timestamp || Date.now(),
      correlationId: event.correlationId || this.generateCorrelationId(),
    };

    // Persist to Redis Stream
    if (this.redis) {
      try {
        const fields: string[] = [
          'type', enrichedEvent.type,
          'payload', JSON.stringify(enrichedEvent.payload),
          'timestamp', String(enrichedEvent.timestamp),
          'correlationId', enrichedEvent.correlationId!,
        ];
        if (enrichedEvent.userId) fields.push('userId', enrichedEvent.userId);
        if (enrichedEvent.metadata) fields.push('metadata', JSON.stringify(enrichedEvent.metadata));

        const id = await this.redis.xadd(
          enrichedEvent.stream,
          'MAXLEN', '~', '10000', // Keep max ~10K events per stream
          '*',
          ...fields,
        );

        enrichedEvent.id = id ?? undefined;

        // Also publish to audit stream for all events
        await this.redis.xadd(
          EventStreams.AUDIT,
          'MAXLEN', '~', '50000',
          '*',
          'stream', enrichedEvent.stream,
          'type', enrichedEvent.type,
          'payload', JSON.stringify(enrichedEvent.payload),
          'userId', enrichedEvent.userId || '',
          'timestamp', String(enrichedEvent.timestamp),
          'correlationId', enrichedEvent.correlationId!,
        );
      } catch (err) {
        console.error('[EventBus] Publish failed:', err);
      }
    }

    // Dispatch to local handlers
    await this.dispatch(enrichedEvent);

    return enrichedEvent.id || '';
  }

  /**
   * Subscribe to events on a stream
   */
  on(streamOrType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(streamOrType) || [];
    handlers.push(handler);
    this.handlers.set(streamOrType, handlers);
  }

  /**
   * Dispatch event to matching handlers
   */
  private async dispatch(event: DomainEvent): Promise<void> {
    // Match by stream
    const streamHandlers = this.handlers.get(event.stream) || [];
    // Match by type
    const typeHandlers = this.handlers.get(event.type) || [];
    // Match by wildcard
    const wildcardHandlers = this.handlers.get('*') || [];

    const allHandlers = [...streamHandlers, ...typeHandlers, ...wildcardHandlers];

    for (const handler of allHandlers) {
      try {
        await handler(event);
      } catch (err) {
        console.error(`[EventBus] Handler error for ${event.type}:`, err);
      }
    }
  }

  /**
   * Replay events from a stream since a given ID/timestamp
   */
  async replay(stream: string, since = '0', count = 100): Promise<DomainEvent[]> {
    if (!this.redis) return [];

    try {
      const results = await this.redis.xrange(stream, since, '+', 'COUNT', count);
      return results.map(([id, fields]) => this.parseStreamEntry(stream, id, fields));
    } catch {
      return [];
    }
  }

  /**
   * Get events for audit timeline
   */
  async getAuditTimeline(since = '0', count = 100): Promise<DomainEvent[]> {
    return this.replay(EventStreams.AUDIT, since, count);
  }

  /**
   * Get event count per stream
   */
  async getStreamStats(): Promise<Record<string, number>> {
    if (!this.redis) return {};

    const stats: Record<string, number> = {};
    for (const stream of Object.values(EventStreams)) {
      try {
        stats[stream] = await this.redis.xlen(stream);
      } catch {
        stats[stream] = 0;
      }
    }
    return stats;
  }

  /**
   * Parse Redis stream entry to DomainEvent
   */
  private parseStreamEntry(stream: string, id: string, fields: string[]): DomainEvent {
    const data: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      data[fields[i]] = fields[i + 1];
    }

    return {
      id,
      stream,
      type: data.type || '',
      payload: JSON.parse(data.payload || '{}'),
      userId: data.userId || undefined,
      timestamp: parseInt(data.timestamp || '0'),
      correlationId: data.correlationId || undefined,
      metadata: data.metadata ? JSON.parse(data.metadata) : undefined,
    };
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Shutdown gracefully
   */
  async shutdown(): Promise<void> {
    this.running = false;
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.redis) await this.redis.quit();
    if (this.subscriber) await this.subscriber.quit();
  }
}
