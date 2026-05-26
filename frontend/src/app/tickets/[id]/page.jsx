'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Send, Paperclip, Clock, User,
  Tag, AlertCircle, CheckCircle, Edit, Loader2, Trash2, FileDown, FileText,
} from 'lucide-react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import PDFPreviewModal from '../../../components/ui/PDFPreviewModal';
import { StatusBadge, PriorityBadge, SLABadge, RoleBadge } from '../../../components/ui/Badge';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ticketAPI, userAPI } from '../../../lib/api';
import { formatDateTime, timeAgo, cn } from '../../../lib/utils';
import { useAuthStore } from '../../../lib/store';
import toast from 'react-hot-toast';
import Link from 'next/link';

const STATUSES = ['OPEN', 'ON_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function Timeline({ logs }) {
  const icons = {
    TICKET_CREATED: '🎫',
    STATUS_CHANGED: '🔄',
    PRIORITY_CHANGED: '⚡',
    ASSIGNED: '👤',
    COMMENT_ADDED: '💬',
    ATTACHMENT_ADDED: '📎',
    TICKET_RESOLVED: '✅',
    TICKET_CLOSED: '🔒',
  };

  return (
    <div className="space-y-3">
      {logs?.map((log, i) => (
        <div key={log.id} className="flex gap-3">
          <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
            {icons[log.type] || '📋'}
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-700 dark:text-gray-300">{log.description}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-400">by {log.actor?.name}</span>
              <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
              <span className="text-xs text-gray-400">{timeAgo(log.createdAt)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TicketDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const openPreview = useCallback(() => setPreviewOpen(true), []);

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => ticketAPI.get(id).then(r => r.data.data),
  });

  const { data: staffList } = useQuery({
    queryKey: ['itStaff'],
    queryFn: () => userAPI.list({ role: 'IT_STAFF' }).then(r => r.data.data),
    enabled: user?.role === 'ADMIN' || user?.role === 'IT_STAFF',
  });

  const updateMutation = useMutation({
    mutationFn: (data) => ticketAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Tiket diperbarui');
      setEditingStatus(false);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal update'),
  });

  const handleDownloadReport = async () => {
    setDownloading(true);
    try {
      const res = await ticketAPI.downloadReport(id);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `Laporan-Tiket-${ticket.ticketNo}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Laporan berhasil diunduh');
    } catch {
      toast.error('Gagal mengunduh laporan');
    } finally {
      setDownloading(false);
    }
  };

  const handleDeleteTicket = async () => {
    if (!confirm(`Hapus tiket #${ticket.ticketNo}? Semua data termasuk komentar dan lampiran akan dihapus permanen.`)) return;
    setDeleting(true);
    try {
      await ticketAPI.delete(id);
      toast.success(`Tiket #${ticket.ticketNo} berhasil dihapus`);
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      router.push('/tickets');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menghapus tiket');
      setDeleting(false);
    }
  };

  const handleAddComment = async () => {
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      await ticketAPI.addComment(id, { content: comment, isInternal });
      setComment('');
      setIsInternal(false);
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      toast.success('Komentar ditambahkan');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menambah komentar');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout title="Detail Tiket">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Skeleton className="h-48 w-full rounded-xl" />
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!ticket) {
    return (
      <DashboardLayout title="Tiket Tidak Ditemukan">
        <div className="text-center py-16">
          <p className="text-gray-500">Tiket tidak ditemukan</p>
          <Link href="/tickets" className="btn-primary mt-4 inline-flex">Kembali</Link>
        </div>
      </DashboardLayout>
    );
  }

  const canEdit = user?.role !== 'USER';

  return (
    <DashboardLayout title={`Tiket #${ticket.ticketNo}`}>
      <div className="space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2">
          <Link href="/tickets" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> Tiket
          </Link>
          <span className="text-gray-300 dark:text-gray-700">/</span>
          <span className="text-sm text-gray-900 dark:text-white font-medium">#{ticket.ticketNo}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-4">
            {/* Ticket header */}
            <div className="card p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">{ticket.title}</h1>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={ticket.status} />
                  <PriorityBadge priority={ticket.priority} />
                </div>
              </div>

              <p className="text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">
                {ticket.description}
              </p>

              {/* Attachments */}
              {ticket.attachments?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <p className="text-xs font-medium text-gray-500 mb-3 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" />
                    Lampiran ({ticket.attachments.length})
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {ticket.attachments.map(att => {
                      const isImage = att.mimeType?.startsWith('image/');
                      return (
                        <a
                          key={att.id}
                          href={att.url}
                          target="_blank"
                          rel="noreferrer"
                          className="group rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:border-primary-400 hover:shadow-md transition-all block"
                          title={att.originalName}
                        >
                          {isImage ? (
                            <div className="aspect-video bg-gray-100 dark:bg-gray-700 relative overflow-hidden">
                              <img
                                src={att.url}
                                alt={att.originalName}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                onError={e => { e.currentTarget.style.display = 'none'; }}
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 text-gray-800 text-xs px-2 py-1 rounded-full font-medium shadow">
                                  Lihat
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="aspect-video bg-gray-50 dark:bg-gray-800 flex flex-col items-center justify-center gap-1">
                              <Paperclip className="w-8 h-8 text-gray-400 group-hover:text-primary-500 transition-colors" />
                              <span className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide">
                                {att.originalName?.split('.').pop()}
                              </span>
                            </div>
                          )}
                          <div className="px-2 py-1.5 bg-white dark:bg-gray-800">
                            <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{att.originalName}</p>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Comments */}
            <div className="card">
              <div className="card-header">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Komentar ({ticket.comments?.length || 0})
                </h3>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {ticket.comments?.length > 0 ? ticket.comments.map(c => (
                  <div key={c.id} className={cn('p-4', c.isInternal && 'bg-amber-50/50 dark:bg-amber-900/10')}>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-primary-600 text-xs font-bold">{c.author?.name?.charAt(0)}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{c.author?.name}</span>
                          <RoleBadge role={c.author?.role} />
                          {c.isInternal && <span className="badge badge-yellow text-xs">Internal Note</span>}
                          <span className="text-xs text-gray-400">{timeAgo(c.createdAt)}</span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                          {c.content}
                        </p>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="px-6 py-8 text-center text-sm text-gray-400">
                    Belum ada komentar. Jadilah yang pertama!
                  </div>
                )}
              </div>

              {/* Add comment */}
              {ticket.status !== 'CLOSED' && (
                <div className="p-4 border-t border-gray-100 dark:border-gray-800">
                  {canEdit && (
                    <div className="flex items-center gap-2 mb-3">
                      <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isInternal}
                          onChange={e => setIsInternal(e.target.checked)}
                          className="rounded"
                        />
                        Internal Note (hanya IT staff)
                      </label>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-primary-600 text-xs font-bold">{user?.name?.charAt(0)}</span>
                    </div>
                    <div className="flex-1">
                      <textarea
                        rows={3}
                        className={cn('input resize-none', isInternal && 'border-amber-300 dark:border-amber-700')}
                        placeholder={isInternal ? 'Tulis catatan internal...' : 'Tulis komentar...'}
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                      />
                      <div className="flex justify-end mt-2">
                        <button
                          onClick={handleAddComment}
                          disabled={!comment.trim() || submitting}
                          className="btn-primary btn-sm"
                        >
                          {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                          {isInternal ? 'Tambah Note' : 'Kirim'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Timeline */}
            {ticket.activityLogs?.length > 0 && (
              <div className="card p-6">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Timeline Aktivitas</h3>
                <Timeline logs={ticket.activityLogs} />
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Details */}
            <div className="card p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Detail Tiket</h3>

              <div className="space-y-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-gray-500">No. Tiket</span>
                  <span className="font-mono font-medium text-gray-900 dark:text-white">#{ticket.ticketNo}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-500">Kategori</span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="w-2 h-2 rounded-full" style={{ background: ticket.category?.color }} />
                    {ticket.category?.name}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-500">Departemen</span>
                  <span className="font-medium text-gray-900 dark:text-white">{ticket.department?.name || '-'}</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-gray-500">Pelapor</span>
                  <div className="text-right">
                    <p className="font-medium text-gray-900 dark:text-white">{ticket.creator?.name}</p>
                    <p className="text-xs text-gray-400">{ticket.creator?.employeeId}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-500">SLA</span>
                  <SLABadge slaBreached={ticket.slaBreached} slaDeadline={ticket.slaDeadline} />
                </div>
                {ticket.slaDeadline && (
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-gray-500">Deadline</span>
                    <span className="text-xs text-right text-gray-900 dark:text-white">{formatDateTime(ticket.slaDeadline)}</span>
                  </div>
                )}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-gray-500">Dibuat</span>
                  <span className="text-xs text-right text-gray-900 dark:text-white">{formatDateTime(ticket.createdAt)}</span>
                </div>
                {ticket.resolvedAt && (
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-gray-500">Selesai</span>
                    <span className="text-xs text-right text-gray-900 dark:text-white">{formatDateTime(ticket.resolvedAt)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Download PDF Report */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Laporan</h3>
              <div className="flex gap-2 mb-2">
                <button
                  onClick={openPreview}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors"
                >
                  <FileText className="w-4 h-4" /> Preview
                </button>
                <button
                  onClick={handleDownloadReport}
                  disabled={downloading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium transition-colors"
                >
                  {downloading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyiapkan...</>
                    : <><FileDown className="w-4 h-4" /> Unduh PDF</>}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1 text-center">
                Preview atau unduh laporan lengkap tiket ini
              </p>
            </div>

            {/* Admin: Delete ticket */}
            {user?.role === 'ADMIN' && (
              <div className="card p-5 border border-red-200 dark:border-red-900">
                <h3 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-3">Zona Berbahaya</h3>
                <button
                  onClick={handleDeleteTicket}
                  disabled={deleting}
                  className="btn-danger w-full"
                >
                  {deleting
                    ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> Menghapus...</>
                    : <><Trash2 className="w-4 h-4" /> Hapus Tiket Ini</>}
                </button>
                <p className="text-xs text-gray-400 mt-2 text-center">Tindakan ini tidak bisa dibatalkan</p>
              </div>
            )}

            {/* IT Staff actions */}
            {canEdit && (
              <div className="card p-5 space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Tindakan IT</h3>

                <div>
                  <label className="label">Ubah Status</label>
                  <select
                    className="input"
                    value={ticket.status}
                    onChange={e => updateMutation.mutate({ status: e.target.value })}
                    disabled={updateMutation.isPending}
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </div>

                <div>
                  <label className="label">Ubah Prioritas</label>
                  <select
                    className="input"
                    value={ticket.priority}
                    onChange={e => updateMutation.mutate({ priority: e.target.value })}
                    disabled={updateMutation.isPending}
                  >
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                {staffList && (
                  <div>
                    <label className="label">Assign Ke</label>
                    <select
                      className="input"
                      value={ticket.assigneeId || ''}
                      onChange={e => updateMutation.mutate({ assigneeId: e.target.value || null })}
                      disabled={updateMutation.isPending}
                    >
                      <option value="">Belum diassign</option>
                      {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}

                {ticket.assignee && (
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">Ditangani oleh</p>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
                        <span className="text-primary-600 text-xs font-bold">{ticket.assignee.name.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{ticket.assignee.name}</p>
                        <p className="text-xs text-gray-400">{ticket.assignee.email}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <PDFPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        fetchFn={() => ticketAPI.downloadReport(id)}
        filename={ticket ? `Laporan-Tiket-${ticket.ticketNo}.pdf` : 'laporan-tiket.pdf'}
        title={ticket ? `Preview Laporan — ${ticket.ticketNo}` : 'Preview Laporan'}
      />
    </DashboardLayout>
  );
}
