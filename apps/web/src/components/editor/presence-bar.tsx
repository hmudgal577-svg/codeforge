'use client';
import { useWorkspaceStore } from '@/stores/workspace-store';

export function PresenceBar() {
  const { onlineUsers } = useWorkspaceStore();

  if (onlineUsers.length === 0) return null;

  return (
    <div className="flex items-center -space-x-1.5">
      {onlineUsers.slice(0, 5).map((u) => (
        <div key={u.userId} title={u.username}
          className="w-6 h-6 rounded-full border-2 border-surface-900 flex items-center justify-center text-[10px] font-bold text-white"
          style={{ backgroundColor: u.color }}>
          {u.username[0]?.toUpperCase()}
        </div>
      ))}
      {onlineUsers.length > 5 && (
        <div className="w-6 h-6 rounded-full border-2 border-surface-900 bg-surface-700 flex items-center justify-center text-[10px] font-medium text-zinc-400">
          +{onlineUsers.length - 5}
        </div>
      )}
    </div>
  );
}
