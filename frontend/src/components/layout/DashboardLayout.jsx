'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, useUIStore, useNotificationStore } from '../../lib/store';
import { notificationAPI } from '../../lib/api';
import { connectSocket, disconnectSocket } from '../../lib/socket';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';

const TYPE_ICONS = {
  TICKET_CREATED:  '🎫',
  TICKET_UPDATED:  '🔄',
  TICKET_ASSIGNED: '👤',
  TICKET_RESOLVED: '✅',
  TICKET_CLOSED:   '🔒',
  COMMENT_ADDED:   '💬',
  SLA_WARNING:     '⚠️',
  SLA_OVERDUE:     '🔴',
};

export default function DashboardLayout({ children, title }) {
  const { isAuthenticated, user } = useAuthStore();
  const { sidebarOpen } = useUIStore();
  const { setNotifications, addNotification } = useNotificationStore();
  const router = useRouter();

  // Prevent double-fetch from StrictMode
  const pollingRef = useRef(null);
  const socketBound = useRef(false);

  // ── Auth guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) router.push('/auth/login');
  }, [isAuthenticated, router]);

  // ── Fetch unread count (used on mount + polling) ───────────────────────────
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await notificationAPI.list({ limit: 5, unread: 'true' });
      const { notifications, unreadCount } = res.data.data;
      setNotifications(notifications, unreadCount);
    } catch {
      // Silently ignore — network may be unavailable
    }
  }, [setNotifications]);

  // Initial fetch
  useEffect(() => {
    if (isAuthenticated) fetchNotifications();
  }, [isAuthenticated, fetchNotifications]);

  // Polling every 60 seconds as Socket fallback
  useEffect(() => {
    if (!isAuthenticated) return;
    pollingRef.current = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(pollingRef.current);
  }, [isAuthenticated, fetchNotifications]);

  // ── Socket.IO connection + listeners ───────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || typeof window === 'undefined') return;

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const socket = connectSocket(token);

    // Guard: don't bind the same listeners twice on fast re-renders
    if (socketBound.current) return;
    socketBound.current = true;

    // ── notification:new → update badge + show toast ──
    socket.on('notification:new', (payload) => {
      // payload shape: { type, title, message, ticketId, ticketNo }
      const notif = {
        id: payload.id || Date.now().toString(),
        type: payload.type,
        title: payload.title || 'Notifikasi Baru',
        message: payload.message || '',
        isRead: false,
        createdAt: new Date().toISOString(),
        ticketId: payload.ticketId,
      };

      addNotification(notif);

      const icon = TYPE_ICONS[payload.type] || '🔔';
      toast(
        (t) => (
          <div className="flex items-start gap-3 max-w-xs">
            <span className="text-xl flex-shrink-0 mt-0.5">{icon}</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-gray-900 leading-tight">
                {payload.title || 'Notifikasi Baru'}
              </p>
              {payload.message && (
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                  {payload.message}
                </p>
              )}
            </div>
            <button
              onClick={() => toast.dismiss(t.id)}
              className="flex-shrink-0 text-gray-300 hover:text-gray-500 transition-colors text-lg leading-none"
            >
              ×
            </button>
          </div>
        ),
        {
          duration: 6000,
          style: {
            background: '#fff',
            color: '#1f2937',
            border: '1px solid #e5e7eb',
            borderRadius: '0.75rem',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
            padding: '12px 14px',
            maxWidth: '360px',
          },
        }
      );
    });

    // ── ticket:new → refresh count (for IT_STAFF / ADMIN) ──
    socket.on('ticket:new', () => {
      fetchNotifications();
    });

    // ── ticket:updated → refresh notification count ──
    socket.on('ticket:updated', () => {
      fetchNotifications();
    });

    socket.on('connect', () => {
      // Re-fetch when reconnected (may have missed events while offline)
      fetchNotifications();
    });

    socket.on('connect_error', () => {
      // Socket failed → polling fallback is already running
    });

    return () => {
      socket.off('notification:new');
      socket.off('ticket:new');
      socket.off('ticket:updated');
      socket.off('connect');
      socket.off('connect_error');
      socketBound.current = false;
      // Note: we do NOT call disconnectSocket() here —
      // the singleton lives as long as the app is open.
    };
  }, [isAuthenticated, addNotification, fetchNotifications]);

  // Disconnect socket on logout
  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
      socketBound.current = false;
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar />
      <div
        className={cn(
          'transition-all duration-300',
          sidebarOpen ? 'lg:ml-64' : 'lg:ml-16',
        )}
      >
        <Topbar title={title} />
        <main className="p-4 md:p-6 min-h-[calc(100vh-64px)]">
          {children}
        </main>
      </div>
    </div>
  );
}
