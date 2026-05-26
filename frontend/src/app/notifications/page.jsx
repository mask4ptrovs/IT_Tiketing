'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck, Trash2 } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import EmptyState from '../../components/ui/EmptyState';
import { notificationAPI } from '../../lib/api';
import { useNotificationStore } from '../../lib/store';
import { timeAgo } from '../../lib/utils';
import toast from 'react-hot-toast';

const TYPE_COLORS = {
  TICKET_CREATED:  'bg-blue-500',
  TICKET_UPDATED:  'bg-indigo-500',
  TICKET_ASSIGNED: 'bg-purple-500',
  TICKET_RESOLVED: 'bg-green-500',
  TICKET_CLOSED:   'bg-gray-500',
  COMMENT_ADDED:   'bg-amber-500',
  SLA_WARNING:     'bg-orange-500',
  SLA_OVERDUE:     'bg-red-500',
};

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { markAllRead: storeMarkAll } = useNotificationStore();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationAPI.list({ limit: 50 }).then(r => r.data.data),
  });

  const handleMarkAllRead = async () => {
    try {
      await notificationAPI.markAllRead();
      storeMarkAll();
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('Semua notifikasi ditandai dibaca');
    } catch {
      toast.error('Gagal');
    }
  };

  const handleMarkRead = async (id) => {
    try {
      await notificationAPI.markRead(id);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch {}
  };

  const handleDelete = async (id) => {
    try {
      await notificationAPI.delete(id);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('Notifikasi dihapus');
    } catch {
      toast.error('Gagal');
    }
  };

  const notifications = data?.notifications || [];
  const unread = notifications.filter(n => !n.isRead).length;

  return (
    <DashboardLayout title="Notifikasi">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Notifikasi</h2>
            <p className="text-sm text-gray-500">{unread > 0 ? `${unread} belum dibaca` : 'Semua sudah dibaca'}</p>
          </div>
          {unread > 0 && (
            <button onClick={handleMarkAllRead} className="btn-secondary btn-sm">
              <CheckCheck className="w-3.5 h-3.5" /> Tandai Semua Dibaca
            </button>
          )}
        </div>

        <div className="card overflow-hidden">
          {notifications.length === 0 ? (
            <EmptyState
              icon="bell"
              title="Tidak ada notifikasi"
              description="Notifikasi akan muncul saat ada update tiket"
            />
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {notifications.map(n => (
                <div
                  key={n.id}
                  className={`flex items-start gap-4 p-4 transition-colors ${!n.isRead ? 'bg-primary-50/50 dark:bg-primary-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
                >
                  <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${TYPE_COLORS[n.type] || 'bg-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{n.title}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{n.message}</p>
                    <p className="text-xs text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!n.isRead && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-green-500 transition-colors"
                        title="Tandai dibaca"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(n.id)}
                      className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500 transition-colors"
                      title="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
