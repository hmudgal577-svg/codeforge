// ============================================
// Shared TypeScript types for CodeForge
// Used across frontend, backend, and workers
// ============================================

// ── User & Auth ─────────────────────────────────

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export interface IUser {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface ILoginRequest {
  email: string;
  password: string;
}

export interface IRegisterRequest {
  email: string;
  username: string;
  password: string;
}

// ── Workspace ───────────────────────────────────

export enum WorkspaceRole {
  OWNER = 'OWNER',
  EDITOR = 'EDITOR',
  VIEWER = 'VIEWER',
}

export interface IWorkspace {
  id: string;
  name: string;
  description?: string;
  language: string;
  ownerId: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWorkspaceMember {
  id: string;
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  user?: IUser;
}

// ── Files & Folders ─────────────────────────────

export enum FileType {
  FILE = 'FILE',
  FOLDER = 'FOLDER',
}

export interface IFile {
  id: string;
  name: string;
  path: string;
  content?: string;
  language?: string;
  workspaceId: string;
  folderId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IFolder {
  id: string;
  name: string;
  path: string;
  workspaceId: string;
  parentId?: string;
  children?: IFolder[];
  files?: IFile[];
}

// ── Execution ───────────────────────────────────

export enum ExecutionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  TIMEOUT = 'TIMEOUT',
  CANCELLED = 'CANCELLED',
}

export enum ExecutionLanguage {
  PYTHON = 'python',
  JAVASCRIPT = 'javascript',
  CPP = 'cpp',
  JAVA = 'java',
}

export interface IExecutionJob {
  id: string;
  workspaceId: string;
  userId: string;
  language: ExecutionLanguage;
  code: string;
  stdin?: string;
  status: ExecutionStatus;
  output?: string;
  error?: string;
  executionTime?: number;
  memoryUsed?: number;
  createdAt: Date;
  completedAt?: Date;
}

export interface IExecutionRequest {
  workspaceId: string;
  language: ExecutionLanguage;
  code: string;
  stdin?: string;
}

export interface IExecutionResult {
  jobId: string;
  status: ExecutionStatus;
  output: string;
  error?: string;
  executionTime: number;
  memoryUsed?: number;
}

// ── AI ──────────────────────────────────────────

export enum AiAnalysisType {
  EXPLAIN = 'EXPLAIN',
  DEBUG = 'DEBUG',
  OPTIMIZE = 'OPTIMIZE',
  VULNERABILITY = 'VULNERABILITY',
  COMPLEXITY = 'COMPLEXITY',
  REFACTOR = 'REFACTOR',
  SUMMARIZE = 'SUMMARIZE',
}

export enum AiRequestStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface IAiRequest {
  id: string;
  userId: string;
  workspaceId: string;
  type: AiAnalysisType;
  code: string;
  language: string;
  status: AiRequestStatus;
  result?: string;
  tokensUsed?: number;
  createdAt: Date;
  completedAt?: Date;
}

// ── WebSocket Events ────────────────────────────

export enum WsEvent {
  // Connection
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',

  // Workspace
  JOIN_WORKSPACE = 'workspace:join',
  LEAVE_WORKSPACE = 'workspace:leave',
  WORKSPACE_USERS = 'workspace:users',

  // Document sync (Yjs)
  DOC_UPDATE = 'doc:update',
  DOC_AWARENESS = 'doc:awareness',

  // Cursor
  CURSOR_UPDATE = 'cursor:update',

  // Presence
  PRESENCE_UPDATE = 'presence:update',
  USER_JOINED = 'user:joined',
  USER_LEFT = 'user:left',

  // File operations
  FILE_CREATED = 'file:created',
  FILE_UPDATED = 'file:updated',
  FILE_DELETED = 'file:deleted',

  // Execution
  EXEC_START = 'exec:start',
  EXEC_OUTPUT = 'exec:output',
  EXEC_COMPLETE = 'exec:complete',
  EXEC_ERROR = 'exec:error',

  // Chat
  CHAT_MESSAGE = 'chat:message',
  CHAT_HISTORY = 'chat:history',

  // AI
  AI_REQUEST = 'ai:request',
  AI_STREAM = 'ai:stream',
  AI_COMPLETE = 'ai:complete',
}

// ── Chat ────────────────────────────────────────

export interface IChatMessage {
  id: string;
  workspaceId: string;
  userId: string;
  content: string;
  user?: Pick<IUser, 'id' | 'username' | 'avatarUrl'>;
  createdAt: Date;
}

// ── Notifications ───────────────────────────────

export enum NotificationType {
  WORKSPACE_INVITE = 'WORKSPACE_INVITE',
  EXECUTION_COMPLETE = 'EXECUTION_COMPLETE',
  AI_COMPLETE = 'AI_COMPLETE',
  SYSTEM = 'SYSTEM',
}

export interface INotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

// ── Presence ────────────────────────────────────

export interface IPresenceUser {
  userId: string;
  username: string;
  avatarUrl?: string;
  color: string;
  cursor?: {
    lineNumber: number;
    column: number;
    fileName?: string;
  };
  lastSeen: Date;
}

// ── API Response ────────────────────────────────

export interface IApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

// ── Admin Analytics ─────────────────────────────

export interface ISystemMetrics {
  activeUsers: number;
  totalWorkspaces: number;
  activeExecutions: number;
  queueDepth: number;
  wsConnections: number;
  cpuUsage: number;
  memoryUsage: number;
  uptime: number;
}
