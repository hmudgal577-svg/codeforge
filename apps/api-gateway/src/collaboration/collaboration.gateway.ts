// ============================================
// Collaboration Gateway — Enhanced CRDT Sync
// ============================================
// Upgraded WebSocket server with binary CRDT
// synchronization, compressed cursors, offline
// recovery, room state persistence, AI chatbot,
// and distributed event integration.

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

// ── Presence colors for cursor indicators ───────
const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9', '#F0B27A', '#82E0AA',
];

interface ConnectedUser {
  userId: string;
  username: string;
  avatarUrl?: string;
  color: string;
  workspaceId?: string;
  lastActivity: number;
  syncState: 'syncing' | 'synced' | 'offline';
}

interface RoomState {
  documentVersions: Map<string, number>;
  lastSync: number;
  userCount: number;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  namespace: '/',
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 5 * 1024 * 1024, // 5MB for binary CRDT updates
})
export class CollaborationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CollaborationGateway.name);
  private connectedUsers = new Map<string, ConnectedUser>();
  private roomStates = new Map<string, RoomState>();

  // Metrics
  private metrics = {
    totalConnections: 0,
    totalMessages: 0,
    totalSyncBytes: 0,
    roomCount: 0,
  };

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  afterInit() {
    this.logger.log('🔌 WebSocket Gateway initialized (CRDT-enhanced)');

    // Periodic room cleanup
    setInterval(() => this.cleanupStaleRooms(), 60000);

    // Periodic metrics log
    setInterval(() => {
      this.logger.debug(
        `[Metrics] connections=${this.connectedUsers.size} rooms=${this.roomStates.size} msgs=${this.metrics.totalMessages} sync=${Math.round(this.metrics.totalSyncBytes/1024)}KB`
      );
    }, 30000);
  }

  // ── Connection Handling ─────────────────────────

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwt.verify(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, username: true, avatarUrl: true },
      });

      if (!user) {
        client.disconnect();
        return;
      }

      const color = COLORS[this.connectedUsers.size % COLORS.length];
      this.connectedUsers.set(client.id, {
        userId: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl || undefined,
        color,
        lastActivity: Date.now(),
        syncState: 'syncing',
      });

      (client as any).user = user;
      this.metrics.totalConnections++;
      this.logger.log(`User connected: ${user.username} (${client.id})`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const user = this.connectedUsers.get(client.id);
    if (user?.workspaceId) {
      this.server.to(user.workspaceId).emit('user:left', {
        userId: user.userId,
        username: user.username,
      });

      // Update room user count
      const room = this.roomStates.get(user.workspaceId);
      if (room) {
        room.userCount = Math.max(0, room.userCount - 1);
      }
    }
    this.connectedUsers.delete(client.id);
    this.logger.log(`User disconnected: ${client.id}`);
  }

  // ── Workspace Events ───────────────────────────

  @SubscribeMessage('workspace:join')
  async handleJoinWorkspace(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { workspaceId: string },
  ) {
    const user = this.connectedUsers.get(client.id);
    if (!user) return;

    client.join(data.workspaceId);
    user.workspaceId = data.workspaceId;
    user.syncState = 'syncing';

    // Initialize room state
    if (!this.roomStates.has(data.workspaceId)) {
      this.roomStates.set(data.workspaceId, {
        documentVersions: new Map(),
        lastSync: Date.now(),
        userCount: 0,
      });
    }

    const room = this.roomStates.get(data.workspaceId)!;
    room.userCount++;

    // Get all users in workspace
    const roomUsers = Array.from(this.connectedUsers.values())
      .filter((u) => u.workspaceId === data.workspaceId);

    // Notify others
    client.to(data.workspaceId).emit('user:joined', {
      userId: user.userId,
      username: user.username,
      avatarUrl: user.avatarUrl,
      color: user.color,
    });

    // Send current users list
    client.emit('workspace:users', roomUsers);

    user.syncState = 'synced';
    this.logger.log(`${user.username} joined workspace ${data.workspaceId} (${room.userCount} users)`);
  }

  @SubscribeMessage('workspace:leave')
  handleLeaveWorkspace(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { workspaceId: string },
  ) {
    const user = this.connectedUsers.get(client.id);
    if (!user) return;

    client.leave(data.workspaceId);
    user.workspaceId = undefined;

    const room = this.roomStates.get(data.workspaceId);
    if (room) room.userCount = Math.max(0, room.userCount - 1);

    this.server.to(data.workspaceId).emit('user:left', {
      userId: user.userId,
      username: user.username,
    });
  }

  // ── CRDT Document Sync (Binary) ────────────────

  @SubscribeMessage('doc:update')
  handleDocUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { workspaceId: string; update: ArrayBuffer; fileId?: string },
  ) {
    const user = this.connectedUsers.get(client.id);
    if (!user) return;

    user.lastActivity = Date.now();
    this.metrics.totalMessages++;

    const updateSize = data.update instanceof ArrayBuffer ? data.update.byteLength : 0;
    this.metrics.totalSyncBytes += updateSize;

    // Broadcast binary CRDT update to all other users
    client.to(data.workspaceId).emit('doc:update', {
      update: data.update,
      userId: user.userId,
      fileId: data.fileId,
      timestamp: Date.now(),
    });

    // Track document version
    const room = this.roomStates.get(data.workspaceId);
    if (room && data.fileId) {
      const version = (room.documentVersions.get(data.fileId) || 0) + 1;
      room.documentVersions.set(data.fileId, version);
      room.lastSync = Date.now();
    }
  }

  @SubscribeMessage('doc:awareness')
  handleAwareness(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { workspaceId: string; awareness: ArrayBuffer },
  ) {
    this.metrics.totalMessages++;
    client.to(data.workspaceId).emit('doc:awareness', {
      awareness: data.awareness,
      userId: this.connectedUsers.get(client.id)?.userId,
    });
  }

  // ── Offline Recovery ──────────────────────────

  @SubscribeMessage('doc:recovery')
  handleRecoveryRequest(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { workspaceId: string; stateVector: ArrayBuffer },
  ) {
    const user = this.connectedUsers.get(client.id);
    if (!user) return;

    user.syncState = 'syncing';
    this.logger.log(`Recovery requested by ${user.username} for workspace ${data.workspaceId}`);

    // Request full state from other connected clients
    client.to(data.workspaceId).emit('doc:state-request', {
      requesterId: client.id,
      stateVector: data.stateVector,
    });
  }

  @SubscribeMessage('doc:state-response')
  handleStateResponse(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { targetId: string; state: ArrayBuffer },
  ) {
    // Forward full state to the requesting client
    this.server.to(data.targetId).emit('doc:full-state', {
      state: data.state,
      fromUserId: this.connectedUsers.get(client.id)?.userId,
    });
  }

  // ── Compressed Cursor Sync ─────────────────────

  @SubscribeMessage('cursor:update')
  handleCursorUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      workspaceId: string;
      fileName: string;
      lineNumber: number;
      column: number;
      selectionLength?: number;
    },
  ) {
    const user = this.connectedUsers.get(client.id);
    if (!user) return;

    // Compressed cursor broadcast
    client.to(data.workspaceId).emit('cursor:update', {
      u: user.userId.substring(0, 8),
      n: user.username,
      c: user.color,
      f: data.fileName,
      l: data.lineNumber,
      co: data.column,
      s: data.selectionLength,
    });
  }

  // ── Chat with AI Bot ────────────────────────────

  @SubscribeMessage('chat:message')
  async handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { workspaceId: string; content: string },
  ) {
    const user = this.connectedUsers.get(client.id);
    if (!user || !data.content.trim()) return;

    // Save & broadcast user message
    const message = await this.prisma.chatMessage.create({
      data: {
        workspaceId: data.workspaceId,
        userId: user.userId,
        content: data.content.trim().substring(0, 2000),
      },
    });

    this.server.to(data.workspaceId).emit('chat:message', {
      id: message.id,
      userId: user.userId,
      username: user.username,
      avatarUrl: user.avatarUrl,
      content: message.content,
      createdAt: message.createdAt,
    });

    // ── AI Bot Response ──────────────────────────
    this.generateAIResponse(data.workspaceId, data.content.trim()).catch((err) => {
      this.logger.error(`AI chat failed: ${err.message}`);
    });
  }

  // AI chatbot — calls Gemini/Groq and responds in chat
  private async generateAIResponse(workspaceId: string, userMessage: string): Promise<void> {
    // Determine which AI provider to use
    let apiKey = this.config.get<string>('GROQ_API_KEY', '');
    let baseUrl = 'https://api.groq.com/openai/v1';
    let model = 'llama-3.1-8b-instant';

    // If Groq key is placeholder or empty, try primary (Gemini)
    if (!apiKey || apiKey.includes('YAHAN') || apiKey.length < 10) {
      apiKey = this.config.get<string>('OPENAI_API_KEY', '');
      baseUrl = this.config.get<string>('AI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta/openai');
      model = this.config.get<string>('OPENAI_MODEL', 'gemini-2.0-flash');
    }

    if (!apiKey || apiKey.includes('YAHAN') || apiKey.length < 10) {
      this.server.to(workspaceId).emit('chat:message', {
        id: `ai-${Date.now()}`,
        userId: 'ai-bot',
        username: '🤖 CodeForge AI',
        content: '⚠️ AI is not configured. Please add a valid API key (Gemini or Groq) in `.env` file.',
        createdAt: new Date(),
      });
      return;
    }

    try {
      // Get recent chat history for context (last 10 user messages only)
      const recentMessages = await this.prisma.chatMessage.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { userId: true, content: true },
      });

      const chatHistory = recentMessages.reverse().map((m: any) => ({
        role: 'user' as const,
        content: m.content,
      }));

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are CodeForge AI — a friendly and helpful coding assistant inside a collaborative IDE. Answer coding questions, explain concepts, help debug code, and suggest improvements. Keep responses concise (under 300 words). Use markdown formatting. Be conversational and supportive. If the user greets you, greet them back warmly. Always respond in the same language the user writes in.',
            },
            ...chatHistory,
            { role: 'user', content: userMessage },
          ],
          max_tokens: 1000,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`AI API error: ${response.status} ${errText.substring(0, 200)}`);
      }

      const respData = await response.json() as any;
      const aiResponse = respData.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';

      // Broadcast AI response directly (no DB save — ai-bot is not a real user)
      this.server.to(workspaceId).emit('chat:message', {
        id: `ai-${Date.now()}`,
        userId: 'ai-bot',
        username: '🤖 CodeForge AI',
        content: aiResponse.substring(0, 4000),
        createdAt: new Date(),
      });

      this.logger.log(`AI chat response sent in workspace ${workspaceId} (${model})`);
    } catch (error: any) {
      this.logger.error(`AI chat error: ${error.message}`);
      this.server.to(workspaceId).emit('chat:message', {
        id: `ai-err-${Date.now()}`,
        userId: 'ai-bot',
        username: '🤖 CodeForge AI',
        content: '⚠️ Sorry, I encountered an error. Please try again in a moment.',
        createdAt: new Date(),
      });
    }
  }

  // ── File Events ────────────────────────────────

  @SubscribeMessage('file:change')
  handleFileChange(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { workspaceId: string; action: string; file: any },
  ) {
    client.to(data.workspaceId).emit('file:change', {
      action: data.action,
      file: data.file,
      userId: this.connectedUsers.get(client.id)?.userId,
    });
  }

  // ── Execution Output ──────────────────────────

  emitExecutionOutput(workspaceId: string, jobId: string, output: string, isError = false) {
    this.server.to(workspaceId).emit('exec:output', { jobId, output, isError });
  }

  emitExecutionComplete(workspaceId: string, jobId: string, status: string, executionMs?: number) {
    this.server.to(workspaceId).emit('exec:complete', { jobId, status, executionMs });
  }

  // ── Monitoring ─────────────────────────────────

  getMetrics() {
    return {
      ...this.metrics,
      activeConnections: this.connectedUsers.size,
      activeRooms: this.roomStates.size,
      users: Array.from(this.connectedUsers.values()).map(u => ({
        userId: u.userId,
        username: u.username,
        workspaceId: u.workspaceId,
        syncState: u.syncState,
        lastActivity: u.lastActivity,
      })),
    };
  }

  // ── Cleanup ────────────────────────────────────

  private cleanupStaleRooms(): void {
    const now = Date.now();
    const staleThreshold = 3600000; // 1 hour

    for (const [roomId, room] of this.roomStates) {
      if (room.userCount === 0 && now - room.lastSync > staleThreshold) {
        this.roomStates.delete(roomId);
      }
    }
  }
}
