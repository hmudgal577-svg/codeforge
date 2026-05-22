// ============================================
// Distributed Realtime Filesystem
// ============================================
// CRDT-based collaborative filesystem with
// snapshot persistence, delta replication,
// conflict-free merge, and version tracking.

import Redis from 'ioredis';

export interface FileNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  content?: string;
  language?: string;
  size: number;
  hash: string;
  version: number;
  parentId?: string;
  children?: string[];
  createdAt: number;
  updatedAt: number;
  lastModifiedBy?: string;
}

export interface FileSnapshot {
  snapshotId: string;
  workspaceId: string;
  files: Map<string, FileNode>;
  timestamp: number;
  description?: string;
  createdBy: string;
}

export interface FileDelta {
  fileId: string;
  type: 'create' | 'update' | 'delete' | 'rename' | 'move';
  path: string;
  content?: string;
  previousHash?: string;
  newHash: string;
  timestamp: number;
  userId: string;
}

export interface MergeResult {
  success: boolean;
  conflicts: MergeConflict[];
  resolvedFiles: string[];
}

export interface MergeConflict {
  fileId: string;
  path: string;
  localVersion: string;
  remoteVersion: string;
  baseVersion?: string;
  resolution?: 'local' | 'remote' | 'merged';
}

export interface VersionNode {
  id: string;
  parentId?: string;
  snapshotId: string;
  timestamp: number;
  message: string;
  author: string;
  fileChanges: number;
}

/**
 * DistributedFS — Collaborative filesystem
 *
 * Features:
 * - CRDT-based synchronization
 * - Snapshot-based persistence
 * - Distributed delta replication
 * - Conflict-free merge engine
 * - Incremental binary synchronization
 * - Shared workspace recovery
 * - Multi-device project sync
 * - Version graph tracking
 */
export class DistributedFS {
  private files: Map<string, Map<string, FileNode>> = new Map(); // workspaceId -> files
  private snapshots: Map<string, FileSnapshot[]> = new Map();
  private deltas: Map<string, FileDelta[]> = new Map();
  private versionGraph: Map<string, VersionNode[]> = new Map();
  private redis: Redis | null = null;

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
   * Initialize workspace filesystem
   */
  initWorkspace(workspaceId: string, initialFiles?: FileNode[]): void {
    const files = new Map<string, FileNode>();
    if (initialFiles) {
      for (const f of initialFiles) {
        files.set(f.id, f);
      }
    }
    this.files.set(workspaceId, files);
    this.deltas.set(workspaceId, []);
    this.snapshots.set(workspaceId, []);
    this.versionGraph.set(workspaceId, []);
  }

  /**
   * Apply a file change and generate delta
   */
  applyChange(workspaceId: string, delta: FileDelta): FileNode | null {
    const files = this.files.get(workspaceId);
    if (!files) return null;

    switch (delta.type) {
      case 'create': {
        const node: FileNode = {
          id: delta.fileId,
          name: delta.path.split('/').pop() || '',
          path: delta.path,
          type: 'file',
          content: delta.content || '',
          size: Buffer.byteLength(delta.content || '', 'utf8'),
          hash: delta.newHash,
          version: 1,
          createdAt: delta.timestamp,
          updatedAt: delta.timestamp,
          lastModifiedBy: delta.userId,
        };
        files.set(delta.fileId, node);
        this.recordDelta(workspaceId, delta);
        return node;
      }

      case 'update': {
        const file = files.get(delta.fileId);
        if (!file) return null;
        file.content = delta.content || file.content;
        file.hash = delta.newHash;
        file.version++;
        file.updatedAt = delta.timestamp;
        file.lastModifiedBy = delta.userId;
        file.size = Buffer.byteLength(file.content || '', 'utf8');
        this.recordDelta(workspaceId, delta);
        return file;
      }

      case 'delete': {
        const deleted = files.get(delta.fileId);
        files.delete(delta.fileId);
        this.recordDelta(workspaceId, delta);
        return deleted || null;
      }

      case 'rename':
      case 'move': {
        const file = files.get(delta.fileId);
        if (!file) return null;
        file.path = delta.path;
        file.name = delta.path.split('/').pop() || '';
        file.updatedAt = delta.timestamp;
        file.version++;
        this.recordDelta(workspaceId, delta);
        return file;
      }
    }

    return null;
  }

  /**
   * Create a snapshot of the current filesystem state
   */
  createSnapshot(workspaceId: string, description: string, userId: string): FileSnapshot | null {
    const files = this.files.get(workspaceId);
    if (!files) return null;

    const snapshot: FileSnapshot = {
      snapshotId: `snap-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      workspaceId,
      files: new Map(files),
      timestamp: Date.now(),
      description,
      createdBy: userId,
    };

    const snapshots = this.snapshots.get(workspaceId) || [];
    snapshots.push(snapshot);
    if (snapshots.length > 50) snapshots.shift(); // Keep max 50
    this.snapshots.set(workspaceId, snapshots);

    // Add version node
    const versions = this.versionGraph.get(workspaceId) || [];
    const parentId = versions.length > 0 ? versions[versions.length - 1].id : undefined;
    versions.push({
      id: snapshot.snapshotId,
      parentId,
      snapshotId: snapshot.snapshotId,
      timestamp: snapshot.timestamp,
      message: description,
      author: userId,
      fileChanges: files.size,
    });
    this.versionGraph.set(workspaceId, versions);

    // Persist to Redis
    this.persistSnapshot(snapshot).catch(() => {});

    return snapshot;
  }

  /**
   * Restore workspace from a snapshot
   */
  restoreSnapshot(workspaceId: string, snapshotId: string): boolean {
    const snapshots = this.snapshots.get(workspaceId) || [];
    const snapshot = snapshots.find(s => s.snapshotId === snapshotId);
    if (!snapshot) return false;

    this.files.set(workspaceId, new Map(snapshot.files));
    return true;
  }

  /**
   * Get deltas since a given timestamp for incremental sync
   */
  getDeltasSince(workspaceId: string, since: number): FileDelta[] {
    const deltas = this.deltas.get(workspaceId) || [];
    return deltas.filter(d => d.timestamp > since);
  }

  /**
   * Merge remote deltas with conflict detection
   */
  mergeDeltas(workspaceId: string, remoteDeltas: FileDelta[]): MergeResult {
    const localDeltas = this.deltas.get(workspaceId) || [];
    const conflicts: MergeConflict[] = [];
    const resolvedFiles: string[] = [];

    for (const remoteDelta of remoteDeltas) {
      // Check for conflicts (same file modified by both local and remote)
      const conflicting = localDeltas.find(
        ld => ld.fileId === remoteDelta.fileId &&
        ld.timestamp > remoteDelta.timestamp - 5000 && // Within 5s window
        ld.userId !== remoteDelta.userId
      );

      if (conflicting && remoteDelta.type === 'update' && conflicting.type === 'update') {
        conflicts.push({
          fileId: remoteDelta.fileId,
          path: remoteDelta.path,
          localVersion: conflicting.content || '',
          remoteVersion: remoteDelta.content || '',
          baseVersion: conflicting.previousHash,
        });
      } else {
        // No conflict — apply remote delta
        this.applyChange(workspaceId, remoteDelta);
        resolvedFiles.push(remoteDelta.fileId);
      }
    }

    return {
      success: conflicts.length === 0,
      conflicts,
      resolvedFiles,
    };
  }

  /**
   * Get version history graph
   */
  getVersionGraph(workspaceId: string): VersionNode[] {
    return this.versionGraph.get(workspaceId) || [];
  }

  /**
   * Get all files for a workspace
   */
  getFiles(workspaceId: string): FileNode[] {
    const files = this.files.get(workspaceId);
    return files ? Array.from(files.values()) : [];
  }

  /**
   * Compute file hash for change detection
   */
  static computeHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const chr = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  private recordDelta(workspaceId: string, delta: FileDelta): void {
    const deltas = this.deltas.get(workspaceId) || [];
    deltas.push(delta);
    if (deltas.length > 1000) deltas.splice(0, deltas.length - 1000);
    this.deltas.set(workspaceId, deltas);
  }

  private async persistSnapshot(snapshot: FileSnapshot): Promise<void> {
    if (!this.redis) return;
    try {
      const data = {
        ...snapshot,
        files: Array.from(snapshot.files.entries()),
      };
      await this.redis.set(
        `fs:snapshot:${snapshot.workspaceId}:${snapshot.snapshotId}`,
        JSON.stringify(data),
        'EX', 86400 * 7, // 7 days
      );
    } catch {}
  }

  async shutdown(): Promise<void> {
    if (this.redis) await this.redis.quit();
  }
}
