'use client';
import { useEffect, useRef, useState } from 'react';
import { Bell, Check, CheckCheck, Trash2, X, Zap, Users, Brain, Info } from 'lucide-react';
import { useNotificationStore } from '@/stores/notification-store';

const TYPE_ICONS: Record<string, { icon: typeof Bell; color: string }> = {
  WORKSPACE_INVITE: { icon: Users, color: 'text-blue-400' },
  EXECUTION_COMPLETE: { icon: Zap, color: 'text-emerald-400' },
  AI_COMPLETE: { icon: Brain, color: 'text-purple-400' },
  SYSTEM: { icon: Info, color: 'text-yellow-400' },
};

export function NotificationsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const {
    notifications, unreadCount,
    fetchNotifications, fetchUnreadCount,
    markAsRead, markAllAsRead, deleteNotification,
  } = useNotificationStore();

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isOpen) fetchNotifications();
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 hover:bg-surface-700 rounded-lg text-zinc-400 hover:text-white transition-colors"
        title="Notifications"
      >
        <Bell className="w-4.5 h-4.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-red-500 rounded-full text-[9px] font-bold flex items-center justify-center text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-surface-900 border border-surface-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-surface-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Notifications</h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllAsRead()}
                  className="p-1.5 hover:bg-surface-700 rounded-md text-zinc-500 hover:text-white transition-colors"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-surface-700 rounded-md text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-zinc-600 text-sm">
                <Bell className="w-8 h-8 mx-auto mb-2 text-zinc-700" />
                No notifications
              </div>
            ) : (
              notifications.map((n) => {
                const typeInfo = TYPE_ICONS[n.type] || TYPE_ICONS.SYSTEM;
                const Icon = typeInfo.icon;
                return (
                  <div
                    key={n.id}
                    className={`px-4 py-3 border-b border-surface-800/50 hover:bg-surface-800/50 transition-colors cursor-pointer group ${
                      !n.read ? 'bg-brand-500/5' : ''
                    }`}
                    onClick={() => !n.read && markAsRead(n.id)}
                  >
                    <div className="flex gap-3">
                      <div className={`w-8 h-8 rounded-lg bg-surface-800 flex items-center justify-center shrink-0 ${typeInfo.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{n.title}</p>
                          {!n.read && (
                            <div className="w-2 h-2 bg-brand-500 rounded-full shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-[10px] text-zinc-600 mt-1">{timeAgo(n.createdAt)}</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                        className="p-1 opacity-0 group-hover:opacity-100 hover:bg-surface-700 rounded text-zinc-500 hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
