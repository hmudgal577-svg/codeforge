// ============================================
// Room Manager — Distributed Room State
// ============================================
// Manages collaborative room lifecycle with Redis
// persistence, state recovery, and multi-region
// replication support.

import Redis from 'ioredis';
import { CRDTSyncEngine, RoomState } from './index';

const ROOM_TTL = 86400; // 24 hours
const STATE_SAVE_INTERVAL = 5000; // Save state every 5s

export interface RoomInfo {
  roomId: string;
  users: Set<string>;
  lastActivity: number;
  saveTimer?: NodeJS.Timeout;
}

/**
 * RoomManager — Distributed room state persistence
 *
 * Provides:
 * - Redis-backed room state persistence
 * - Automatic state snapshotting
 * - Room lifecycle management
 * - Offline recovery data
 * - Multi-region replication support
 */
export class RoomManager {
  private rooms: Map<string, RoomInfo> = new Map();
  private redis: Redis | null = null;
  private syncEngine: CRDTSyncEngine;

  constructor(syncEngine: CRDTSyncEngine, redisUrl?: string) {
    this.syncEngine = syncEngine;
    if (redisUrl) {
      this.redis = new Redis(redisUrl, {
        retryStrategy: (times) => Math.min(times * 100, 3000),
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
      this.redis.connect().catch(() => {
        console.warn('[RoomManager] Redis not available, using in-memory only');
        this.redis = null;
      });
    }
  }

  /**
   * Join a room — creates if not exists, loads state from Redis
   */
  async joinRoom(roomId: string, userId: string): Promise<Uint8Array | null> {
    let room = this.rooms.get(roomId);

    if (!room) {
      room = {
        roomId,
        users: new Set(),
        lastActivity: Date.now(),
      };
      this.rooms.set(roomId, room);

      // Try to load persisted state from Redis
      const savedState = await this.loadState(roomId);
      if (savedState) {
        this.syncEngine.loadState(roomId, savedState);
      }

      // Start periodic state saving
      room.saveTimer = setInterval(() => {
        this.persistState(roomId).catch(() => {});
      }, STATE_SAVE_INTERVAL);
    }

    room.users.add(userId);
    room.lastActivity = Date.now();

    // Return full document state for initial sync
    return this.syncEngine.getFullState(roomId);
  }

  /**
   * Leave a room — cleanup if empty
   */
  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.users.delete(userId);

    if (room.users.size === 0) {
      // Persist state before cleanup
      await this.persistState(roomId);

      // Clear save timer
      if (room.saveTimer) clearInterval(room.saveTimer);

      // Keep document in memory for a while for quick rejoin
      setTimeout(() => {
        const currentRoom = this.rooms.get(roomId);
        if (currentRoom && currentRoom.users.size === 0) {
          this.syncEngine.destroyRoom(roomId);
          this.rooms.delete(roomId);
        }
      }, 60000); // Keep for 1 minute after last user
    }
  }

  /**
   * Persist room state to Redis
   */
  async persistState(roomId: string): Promise<void> {
    if (!this.redis) return;

    try {
      const state = this.syncEngine.getFullState(roomId);
      const stateVector = this.syncEngine.getStateVector(roomId);

      await this.redis.pipeline()
        .set(`room:state:${roomId}`, Buffer.from(state), 'EX', ROOM_TTL)
        .set(`room:sv:${roomId}`, Buffer.from(stateVector), 'EX', ROOM_TTL)
        .set(`room:meta:${roomId}`, JSON.stringify({
          users: Array.from(this.rooms.get(roomId)?.users || []),
          lastUpdated: Date.now(),
          stats: this.syncEngine.getStats(),
        }), 'EX', ROOM_TTL)
        .exec();
    } catch (err) {
      console.error(`[RoomManager] Failed to persist state for ${roomId}:`, err);
    }
  }

  /**
   * Load room state from Redis
   */
  private async loadState(roomId: string): Promise<Uint8Array | null> {
    if (!this.redis) return null;

    try {
      const state = await this.redis.getBuffer(`room:state:${roomId}`);
      if (state) {
        return new Uint8Array(state);
      }
    } catch {
      // Redis not available, continue without state
    }
    return null;
  }

  /**
   * Get recovery data for a client reconnecting
   * Client sends their state vector, we compute missing updates
   */
  async getRecoveryData(roomId: string, clientStateVector: Uint8Array): Promise<Uint8Array> {
    return this.syncEngine.computeMissingUpdates(roomId, clientStateVector);
  }

  /**
   * Get room info for monitoring
   */
  getRoomInfo(roomId: string): RoomInfo | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Get all active rooms
   */
  getActiveRooms(): Map<string, RoomInfo> {
    return this.rooms;
  }

  /**
   * Cleanup stale rooms
   */
  async cleanup(maxAge: number = 3600000): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    for (const [roomId, room] of this.rooms) {
      if (room.users.size === 0 && now - room.lastActivity > maxAge) {
        await this.persistState(roomId);
        if (room.saveTimer) clearInterval(room.saveTimer);
        this.syncEngine.destroyRoom(roomId);
        this.rooms.delete(roomId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Shutdown — persist all states
   */
  async shutdown(): Promise<void> {
    for (const [roomId, room] of this.rooms) {
      await this.persistState(roomId);
      if (room.saveTimer) clearInterval(room.saveTimer);
    }
    if (this.redis) {
      await this.redis.quit();
    }
  }
}
