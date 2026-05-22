// ============================================
// CRDT Client — Frontend Sync Layer
// ============================================
// Browser-side CRDT client with Yjs, binary
// WebSocket transport, offline IndexedDB queue,
// and reconnection with state vector recovery.

import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

enum SyncMessageType {
  SYNC_STEP1 = 0,
  SYNC_STEP2 = 1,
  SYNC_UPDATE = 2,
  AWARENESS_UPDATE = 3,
  AWARENESS_QUERY = 4,
  STATE_VECTOR_REQUEST = 10,
  STATE_VECTOR_RESPONSE = 11,
  FULL_STATE_REQUEST = 12,
  FULL_STATE_RESPONSE = 13,
}

interface PendingUpdate {
  data: Uint8Array;
  timestamp: number;
}

/**
 * CRDTClient — Browser synchronization
 *
 * Features:
 * - Yjs document with binary delta sync
 * - Binary WebSocket transport
 * - Offline queue with IndexedDB persistence
 * - Reconnection with state vector recovery
 * - Awareness protocol for cursors
 */
export class CRDTClient {
  public doc: Y.Doc;
  public awareness: Awareness;
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private roomId: string;
  private token: string;
  private connected = false;
  private pendingUpdates: PendingUpdate[] = [];
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private lastStateVector: Uint8Array | null = null;
  private onSyncCallbacks: Array<() => void> = [];
  private onConnectionChangeCallbacks: Array<(connected: boolean) => void> = [];
  private destroyed = false;

  constructor(wsUrl: string, roomId: string, token: string) {
    this.wsUrl = wsUrl;
    this.roomId = roomId;
    this.token = token;

    // Initialize Yjs document
    this.doc = new Y.Doc();
    this.awareness = new Awareness(this.doc);

    // Listen for local document updates
    this.doc.on('update', (update: Uint8Array, origin: any) => {
      if (origin === 'remote') return; // Don't echo remote updates

      const msg = this.encodeUpdate(update);
      if (this.connected && this.ws) {
        this.ws.send(msg);
      } else {
        // Queue for offline sync
        this.pendingUpdates.push({ data: msg, timestamp: Date.now() });
        this.persistOfflineQueue();
      }
    });

    // Listen for awareness changes (cursor movements)
    this.awareness.on('update', ({ added, updated, removed }: any) => {
      if (!this.connected || !this.ws) return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, SyncMessageType.AWARENESS_UPDATE);
      const states = this.awareness.getStates();
      const changedClients = [...added, ...updated, ...removed];
      const update: Record<string, any> = {};
      for (const clientId of changedClients) {
        update[clientId] = states.get(clientId) || null;
      }
      encoding.writeVarString(encoder, JSON.stringify(update));
      this.ws.send(encoding.toUint8Array(encoder));
    });
  }

  /**
   * Connect to the sync server
   */
  connect(): void {
    if (this.destroyed) return;

    try {
      const url = `${this.wsUrl}?room=${this.roomId}&token=${this.token}`;
      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.notifyConnectionChange(true);

        // Send sync step 1 (our state vector)
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, SyncMessageType.SYNC_STEP1);
        const sv = Y.encodeStateVector(this.doc);
        encoding.writeVarUint8Array(encoder, sv);
        this.ws!.send(encoding.toUint8Array(encoder));

        // Flush offline queue
        this.flushPendingUpdates();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(new Uint8Array(event.data));
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.notifyConnectionChange(false);
        // Save state vector for recovery
        this.lastStateVector = Y.encodeStateVector(this.doc);
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.connected = false;
        this.notifyConnectionChange(false);
      };
    } catch (err) {
      this.scheduleReconnect();
    }
  }

  /**
   * Handle incoming binary message
   */
  private handleMessage(data: Uint8Array): void {
    const decoder = decoding.createDecoder(data);
    const msgType = decoding.readVarUint(decoder);

    switch (msgType) {
      case SyncMessageType.SYNC_STEP1: {
        // Server sent their state vector, send our diff
        const sv = decoding.readVarUint8Array(decoder);
        const diff = Y.encodeStateAsUpdate(this.doc, sv);
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, SyncMessageType.SYNC_STEP2);
        encoding.writeVarUint8Array(encoder, diff);
        this.ws?.send(encoding.toUint8Array(encoder));
        break;
      }

      case SyncMessageType.SYNC_STEP2: {
        const update = decoding.readVarUint8Array(decoder);
        Y.applyUpdate(this.doc, update, 'remote');
        this.notifySync();
        break;
      }

      case SyncMessageType.SYNC_UPDATE: {
        const update = decoding.readVarUint8Array(decoder);
        Y.applyUpdate(this.doc, update, 'remote');
        break;
      }

      case SyncMessageType.FULL_STATE_RESPONSE: {
        const state = decoding.readVarUint8Array(decoder);
        Y.applyUpdate(this.doc, state, 'remote');
        this.notifySync();
        break;
      }

      case SyncMessageType.AWARENESS_UPDATE: {
        try {
          const statesJson = decoding.readVarString(decoder);
          const states = JSON.parse(statesJson);
          for (const [clientId, state] of Object.entries(states)) {
            if (state === null) {
              this.awareness.setLocalStateField(clientId, null);
            }
          }
        } catch {}
        break;
      }
    }
  }

  /**
   * Encode a document update as binary message
   */
  private encodeUpdate(update: Uint8Array): Uint8Array {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, SyncMessageType.SYNC_UPDATE);
    encoding.writeVarUint8Array(encoder, update);
    return encoding.toUint8Array(encoder);
  }

  /**
   * Flush queued offline updates
   */
  private flushPendingUpdates(): void {
    while (this.pendingUpdates.length > 0 && this.connected && this.ws) {
      const update = this.pendingUpdates.shift()!;
      this.ws.send(update.data);
    }
    this.clearOfflineQueue();
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectAttempts >= this.maxReconnectAttempts) return;

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Set cursor position (awareness)
   */
  setCursor(fileName: string, line: number, column: number, username: string, color: string): void {
    this.awareness.setLocalStateField('cursor', {
      fileName, line, column, username, color,
      timestamp: Date.now(),
    });
  }

  /**
   * Get remote cursors
   */
  getRemoteCursors(): Array<{ clientId: number; cursor: any }> {
    const cursors: Array<{ clientId: number; cursor: any }> = [];
    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId !== this.doc.clientID && state.cursor) {
        cursors.push({ clientId, cursor: state.cursor });
      }
    });
    return cursors;
  }

  /**
   * Get a shared Yjs text type for a file
   */
  getFileText(fileName: string): Y.Text {
    return this.doc.getText(`file:${fileName}`);
  }

  /**
   * Register sync callback
   */
  onSync(callback: () => void): void {
    this.onSyncCallbacks.push(callback);
  }

  /**
   * Register connection change callback
   */
  onConnectionChange(callback: (connected: boolean) => void): void {
    this.onConnectionChangeCallbacks.push(callback);
  }

  private notifySync(): void {
    this.onSyncCallbacks.forEach(cb => cb());
  }

  private notifyConnectionChange(connected: boolean): void {
    this.onConnectionChangeCallbacks.forEach(cb => cb(connected));
  }

  /**
   * Persist offline queue to IndexedDB
   */
  private async persistOfflineQueue(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
      const db = await this.openDB();
      const tx = db.transaction('updates', 'readwrite');
      const store = tx.objectStore('updates');
      for (const update of this.pendingUpdates) {
        store.add({ room: this.roomId, data: Array.from(update.data), timestamp: update.timestamp });
      }
    } catch {}
  }

  private async clearOfflineQueue(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
      const db = await this.openDB();
      const tx = db.transaction('updates', 'readwrite');
      tx.objectStore('updates').clear();
    } catch {}
  }

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('codeforge-crdt', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('updates', { autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Get sync status
   */
  getStatus(): { connected: boolean; pendingUpdates: number; reconnectAttempts: number } {
    return {
      connected: this.connected,
      pendingUpdates: this.pendingUpdates.length,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  /**
   * Disconnect and cleanup
   */
  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.awareness.destroy();
    this.doc.destroy();
  }
}
