'use client';

import { useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, RefreshCw, Trash2, Upload, X, Image,
  FileText, File, Loader2, Paperclip, CheckCircle2,
} from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { StatusBadge, PriorityBadge, SLABadge } from '../../components/ui/Badge';
import { TableSkeleton } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import Modal from '../../components/ui/Modal';
import { ticketAPI, categoryAPI, departmentAPI, userAPI } from '../../lib/api';
import { formatDateTime, timeAgo } from '../../lib/utils';
import { useAuthStore } from '../../lib/store';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import Link from 'next/link';

// ── File icon helper ──────────────────────────────────────────────────────────
function FileIcon({ mimeType, className = 'w-6 h-6' }) {
  if (mimeType?.startsWith('image/')) return <Image className={`${className} text-blue-500`} />;
  if (mimeType === 'application/pdf') return <FileText className={`${className} text-red-500`} />;
  if (mimeType?.includes('word') || mimeType?.includes('document')) return <FileText className={`${className} text-blue-700`} />;
  if (mimeType?.includes('sheet') || mimeType?.includes('excel')) return <FileText className={`${className} text-green-600`} />;
  return <File className={`${className} text-gray-500`} />;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const STATUSES = ['OPEN', 'ON_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED'];

export default function TicketsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({});
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const { register: rForm, handleSubmit: hForm, reset: rReset, formState: { errors: formErrors } } = useForm();

  // ── Upload state ────────────────────────────────────────────────────────────
  const fileInputRef = useRef(null);
  const [attachments, setAttachments] = useState([]);   // Array of { file, preview, id }
  const [isDragging, setIsDragging]   = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // null | 'uploading' | 'done'

  const MAX_FILES = 5;
  const MAX_SIZE  = 10 * 1024 * 1024; // 10 MB per file
  const ACCEPTED  = ['image/png','image/jpeg','image/gif','image/webp','image/svg+xml',
                     'application/pdf',
                     'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                     'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

  const addFiles = useCallback((incomingFiles) => {
    const valid = [];
    for (const file of incomingFiles) {
      if (!ACCEPTED.includes(file.type)) {
        toast.error(`${file.name}: tipe file tidak didukung`); continue;
      }
      if (file.size > MAX_SIZE) {
        toast.error(`${file.name}: ukuran melebihi 10 MB`); continue;
      }
      if (attachments.length + valid.length >= MAX_FILES) {
        toast.error(`Maksimal ${MAX_FILES} file`); break;
      }
      const id = Math.random().toString(36).slice(2);
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      valid.push({ id, file, preview });
    }
    if (valid.length) setAttachments(prev => [...prev, ...valid]);
  }, [attachments]);

  const removeFile = (id) => {
    setAttachments(prev => {
      const item = prev.find(a => a.id === id);
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return prev.filter(a => a.id !== id);
    });
  };

  const onDragOver  = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = ()  => setIsDragging(false);
  const onDrop      = (e) => {
    e.preventDefault(); setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const resetForm = () => {
    rReset();
    attachments.forEach(a => { if (a.preview) URL.revokeObjectURL(a.preview); });
    setAttachments([]);
    setUploadProgress(null);
  };

  const queryParams = { page, limit: 15, search, ...filters };

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', queryParams],
    queryFn: () => ticketAPI.list(queryParams).then(r => r.data),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoryAPI.list({ active: 'true' }).then(r => r.data.data),
  });

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentAPI.list({ active: 'true' }).then(r => r.data.data),
    enabled: user?.role !== 'USER',
  });

  const { data: itStaff } = useQuery({
    queryKey: ['itStaff'],
    queryFn: () => userAPI.list({ role: 'IT_STAFF' }).then(r => r.data.data),
    enabled: user?.role === 'ADMIN',
  });

  const handleCreateTicket = async (formData) => {
    setCreating(true);
    try {
      // Step 1: Create ticket
      const res = await ticketAPI.create(formData);
      const newTicket = res.data.data;

      // Step 2: Upload attachments if any
      if (attachments.length > 0) {
        setUploadProgress('uploading');
        const fd = new FormData();
        attachments.forEach(a => fd.append('files', a.file));
        try {
          await ticketAPI.uploadFiles(newTicket.id, fd);
        } catch {
          toast.error('Tiket dibuat, tapi gagal upload beberapa file');
        }
        setUploadProgress('done');
      }

      toast.success('Tiket berhasil dibuat!');
      resetForm();
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal membuat tiket');
    } finally {
      setCreating(false);
      setUploadProgress(null);
    }
  };

  const handleDeleteTicket = async (ticketId, ticketNo, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Hapus tiket #${ticketNo}? Tindakan ini tidak bisa dibatalkan.`)) return;
    setDeletingId(ticketId);
    try {
      await ticketAPI.delete(ticketId);
      toast.success(`Tiket #${ticketNo} berhasil dihapus`);
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menghapus tiket');
    } finally {
      setDeletingId(null);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => {
      const next = { ...prev };
      if (value === '' || value === 'ALL') delete next[key];
      else next[key] = value;
      return next;
    });
    setPage(1);
  };

  const tickets = data?.data || [];
  const pagination = data?.pagination;

  return (
    <DashboardLayout title="Tiket IT">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {user?.role === 'USER' ? 'Tiket Saya' : 'Semua Tiket'}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {pagination?.total ?? 0} tiket ditemukan
            </p>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Buat Tiket
          </button>
        </div>

        {/* Filters */}
        <div className="card p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                className="input pl-9"
                placeholder="Cari nomor tiket atau judul..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>

            <select className="input w-auto min-w-32" onChange={e => handleFilterChange('status', e.target.value)}>
              <option value="ALL">Semua Status</option>
              {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>

            <select className="input w-auto min-w-32" onChange={e => handleFilterChange('priority', e.target.value)}>
              <option value="ALL">Semua Prioritas</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>

            {categories && (
              <select className="input w-auto min-w-32" onChange={e => handleFilterChange('category', e.target.value)}>
                <option value="ALL">Semua Kategori</option>
                {categories.map(c => <option key={c.id} value={c.code}>{c.name}</option>)}
              </select>
            )}

            <button
              onClick={() => { setFilters({}); setSearch(''); setPage(1); }}
              className="btn-secondary"
              title="Reset filter"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          {isLoading ? (
            <TableSkeleton rows={8} cols={7} />
          ) : tickets.length === 0 ? (
            <EmptyState
              title="Tidak ada tiket"
              description="Belum ada tiket yang cocok dengan filter Anda"
              action={
                <button onClick={() => setShowCreate(true)} className="btn-primary">
                  <Plus className="w-4 h-4" /> Buat Tiket Baru
                </button>
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>No. Tiket</th>
                      <th>Judul</th>
                      <th>Kategori</th>
                      <th>Prioritas</th>
                      <th>Status</th>
                      {user?.role !== 'USER' && <th>Pelapor</th>}
                      <th>SLA</th>
                      <th>Tanggal</th>
                      {user?.role === 'ADMIN' && <th>Aksi</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map(ticket => (
                      <tr key={ticket.id}>
                        <td>
                          <Link href={`/tickets/${ticket.id}`} className="font-mono text-xs text-primary-600 hover:text-primary-700 font-medium">
                            #{ticket.ticketNo}
                          </Link>
                        </td>
                        <td>
                          <Link href={`/tickets/${ticket.id}`} className="hover:text-primary-600 transition-colors">
                            <p className="font-medium text-gray-900 dark:text-white line-clamp-1 max-w-xs">{ticket.title}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{ticket._count?.comments} komentar</p>
                          </Link>
                        </td>
                        <td>
                          <span className="flex items-center gap-1.5 text-xs">
                            <span className="w-2 h-2 rounded-full" style={{ background: ticket.category?.color }} />
                            {ticket.category?.name}
                          </span>
                        </td>
                        <td><PriorityBadge priority={ticket.priority} /></td>
                        <td><StatusBadge status={ticket.status} /></td>
                        {user?.role !== 'USER' && (
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center text-xs font-medium">
                                {ticket.creator?.name?.charAt(0)}
                              </div>
                              <span className="text-xs text-gray-600 dark:text-gray-400">{ticket.creator?.name}</span>
                            </div>
                          </td>
                        )}
                        <td><SLABadge slaBreached={ticket.slaBreached} slaDeadline={ticket.slaDeadline} /></td>
                        <td>
                          <p className="text-xs text-gray-500">{timeAgo(ticket.createdAt)}</p>
                        </td>
                        {user?.role === 'ADMIN' && (
                          <td>
                            <button
                              onClick={(e) => handleDeleteTicket(ticket.id, ticket.ticketNo, e)}
                              disabled={deletingId === ticket.id}
                              className="btn-icon btn-danger"
                              title="Hapus tiket"
                            >
                              {deletingId === ticket.id
                                ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                                : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination pagination={pagination} onPageChange={setPage} />
            </>
          )}
        </div>
      </div>

      {/* Create Ticket Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => { setShowCreate(false); resetForm(); }}
        title="Buat Tiket Baru"
        size="lg"
        footer={
          <>
            <button onClick={() => { setShowCreate(false); resetForm(); }} className="btn-secondary" disabled={creating}>
              Batal
            </button>
            <button onClick={hForm(handleCreateTicket)} disabled={creating} className="btn-primary">
              {creating ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {uploadProgress === 'uploading' ? 'Mengupload file...' : 'Menyimpan...'}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Buat Tiket
                </span>
              )}
            </button>
          </>
        }
      >
        <form className="space-y-4">
          {/* Title */}
          <div>
            <label className="label">Judul Masalah *</label>
            <input
              className={`input ${formErrors.title ? 'input-error' : ''}`}
              placeholder="Contoh: Laptop tidak bisa menyala"
              {...rForm('title', { required: 'Judul wajib diisi' })}
            />
            {formErrors.title && <p className="text-red-500 text-xs mt-1">{formErrors.title.message}</p>}
          </div>

          {/* Category & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Kategori *</label>
              <select className={`input ${formErrors.categoryId ? 'input-error' : ''}`}
                {...rForm('categoryId', { required: 'Kategori wajib dipilih' })}>
                <option value="">Pilih kategori...</option>
                {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {formErrors.categoryId && <p className="text-red-500 text-xs mt-1">{formErrors.categoryId.message}</p>}
            </div>
            <div>
              <label className="label">Prioritas</label>
              <select className="input" {...rForm('priority')}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="label">Deskripsi Masalah *</label>
            <textarea
              rows={4}
              className={`input resize-none ${formErrors.description ? 'input-error' : ''}`}
              placeholder="Jelaskan masalah yang Anda alami secara detail..."
              {...rForm('description', { required: 'Deskripsi wajib diisi' })}
            />
            {formErrors.description && <p className="text-red-500 text-xs mt-1">{formErrors.description.message}</p>}
          </div>

          {/* ── File Upload Area ────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-gray-400" />
                Foto / Dokumen Pendukung
              </label>
              <span className="text-xs text-gray-400">
                {attachments.length}/{MAX_FILES} file · maks. 10 MB/file
              </span>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => attachments.length < MAX_FILES && fileInputRef.current?.click()}
              className={`
                relative border-2 border-dashed rounded-xl transition-all cursor-pointer select-none
                ${isDragging
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-primary-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }
                ${attachments.length >= MAX_FILES ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED.join(',')}
                className="hidden"
                onChange={e => { addFiles(Array.from(e.target.files)); e.target.value = ''; }}
              />

              {attachments.length === 0 ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                  <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center mb-3">
                    <Upload className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Drag &amp; drop file di sini, atau <span className="text-primary-600">klik untuk memilih</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    PNG, JPG, GIF, PDF, Word, Excel — maks. {MAX_FILES} file
                  </p>
                </div>
              ) : (
                /* File grid preview */
                <div className="p-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {attachments.map(att => (
                      <div
                        key={att.id}
                        onClick={e => e.stopPropagation()}
                        className="relative group rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
                      >
                        {att.preview ? (
                          /* Image thumbnail */
                          <div className="aspect-video bg-gray-100 dark:bg-gray-700 relative">
                            <img
                              src={att.preview}
                              alt={att.file.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          /* Non-image file icon */
                          <div className="aspect-video bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                            <FileIcon mimeType={att.file.type} className="w-10 h-10" />
                          </div>
                        )}
                        {/* File info */}
                        <div className="px-2 py-1.5">
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate" title={att.file.name}>
                            {att.file.name}
                          </p>
                          <p className="text-[10px] text-gray-400">{formatBytes(att.file.size)}</p>
                        </div>
                        {/* Remove button */}
                        <button
                          type="button"
                          onClick={() => removeFile(att.id)}
                          className="absolute top-1.5 right-1.5 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                          title="Hapus file"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}

                    {/* Add more button if under limit */}
                    {attachments.length < MAX_FILES && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="aspect-video rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-primary-400 flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-primary-500 transition-colors"
                      >
                        <Plus className="w-5 h-5" />
                        <span className="text-xs">Tambah</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Upload progress indicator */}
            {uploadProgress === 'uploading' && (
              <div className="flex items-center gap-2 mt-2 text-xs text-primary-600">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Mengupload {attachments.length} file...
              </div>
            )}
            {uploadProgress === 'done' && (
              <div className="flex items-center gap-2 mt-2 text-xs text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" />
                File berhasil diupload
              </div>
            )}
          </div>

          {/* Department (non-user only) */}
          {user?.role !== 'USER' && departments && (
            <div>
              <label className="label">Departemen</label>
              <select className="input" {...rForm('departmentId')}>
                <option value="">Pilih departemen...</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
        </form>
      </Modal>
    </DashboardLayout>
  );
}
