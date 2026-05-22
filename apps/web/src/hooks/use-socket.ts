'use client';
import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth-store';
import { useWorkspaceStore } from '@/stores/workspace-store';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';

export function useSocket(workspaceId: string | null) {
  const socketRef = useRef<Socket | null>(null);
  const { token } = useAuthStore();
  const { setOnlineUsers, addOnlineUser, removeOnlineUser, updateCursor, addConsoleOutput } = useWorkspaceStore();

  useEffect(() => {
    if (!workspaceId || !token) return;

    const socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('workspace:join', { workspaceId });
    });

    socket.on('workspace:users', (users) => setOnlineUsers(users));
    socket.on('user:joined', (user) => addOnlineUser(user));
    socket.on('user:left', (data) => removeOnlineUser(data.userId));
    socket.on('cursor:update', (data) => updateCursor(data.userId, data));
    socket.on('exec:output', (data) => addConsoleOutput(data.output));
    socket.on('exec:complete', (data) => addConsoleOutput(`\n✓ ${data.status} (${data.executionMs || 0}ms)`));

    socket.on('chat:message', (msg) => {
      // Chat messages handled by chat component
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected, reconnecting...');
    });

    return () => {
      socket.emit('workspace:leave', { workspaceId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [workspaceId, token]);

  const emit = useCallback((event: string, data: any) => {
    socketRef.current?.emit(event, data);
  }, []);

  return { socket: socketRef.current, emit };
}
