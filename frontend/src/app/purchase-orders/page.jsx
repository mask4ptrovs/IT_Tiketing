'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../../components/layout/DashboardLayout';
import PDFPreviewModal from '../../components/ui/PDFPreviewModal';
import { Skeleton } from '../../components/ui/Skeleton';
import { poAPI } from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import { formatDateTime, cn } from '../../lib/utils';
import toast from 'react-hot-toast';
import {
  ShoppingCart, Plus, Search, Edit2, Trash2, X,
  FileDown, Loader2, CheckCircle2, XCircle, Clock,
  AlertTriangle, Eye, Trash, Paperclip, FileText,
} from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────────
const STATUSES = [
  { value: 'PENDING',   label: 'Menunggu',   color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
  { value: 'APPROVED',  label: 'Disetujui',  color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',   icon: CheckCircle2 },
  { value: 'REJECTED',  label: 'Ditolak',    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',           icon: XCircle },
  { value: 'CANCELLED', label: 'Dibatalkan', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',          icon: XCircle },
];

const statusObj = (v) => STATUSES.find(s => s.value === v) || { label: v, color: 'bg-gray-100 text-gray-600', icon: Clock };

const fmtRp = (n) => n != null
  ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
  : 'Rp 0';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const EMPTY_ITEM = { itemName: '', specification: '', qty: 1, unit: 'pcs', estimatedPrice: '', notes: '' };

const EMPTY_FORM = {
  companyName: '', workLocation: '', position: '', deadline: '',
  justification: '', notes: '',
};

// ── Summary cards ─────────────────────────────────────────────────────────────
function SummaryCards({ summary }) {
  const cards = [
    { label: 'Total PR',   value: summary?.total ?? 0,               color: 'bg-indigo-600',  icon: ShoppingCart },
    { label: 'Menunggu',   value: summary?.byStatus?.PENDING   ?? 0, color: 'bg-yellow-500',  icon: Clock },
    { label: 'Disetujui',  value: summary?.byStatus?.APPROVED  ?? 0, color: 'bg-green-600',   icon: CheckCircle2 },
    { label: 'Ditolak',    value: summary?.byStatus?.REJECTED  ?? 0, color: 'bg-red-600',     icon: XCircle },
    { label: 'Dibatalkan', value: summary?.byStatus?.CANCELLED ?? 0, color: 'bg-gray-500',    icon: AlertTriangle },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map(c => (
        <div key={c.label} className={cn('rounded-xl p-4 text-white flex items-center gap-3', c.color)}>
          <c.icon className="w-7 h-7 opacity-80 flex-shrink-0" />
          <div>
            <p className="text-2xl font-bold leading-none">{c.value}</p>
            <p className="text-xs opacity-80 mt-0.5">{c.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Item row inside modal ─────────────────────────────────────────────────────
function ItemRow({ item, index, onChange, onRemove, canRemove }) {
  const set = (k, v) => onChange(index, { ...item, [k]: v });
  return (
    <tr className="border-b border-gray-100 dark:border-gray-800">
      <td className="px-2 py-2 text-center text-xs text-gray-400 font-mono w-8">{index + 1}</td>
      <td className="px-1 py-1">
        <input
          className="input text-sm py-1.5"
          placeholder="Nama barang/jasa"
          value={item.itemName}
          onChange={e => set('itemName', e.target.value)}
          required
        />
      </td>
      <td className="px-1 py-1">
        <input
          className="input text-sm py-1.5"
          placeholder="Spesifikasi"
          value={item.specification}
          onChange={e => set('specification', e.target.value)}
        />
      </td>
      <td className="px-1 py-1 w-16">
        <input
          type="number"
          className="input text-sm py-1.5 text-center"
          min="1"
          value={item.qty}
          onChange={e => set('qty', e.target.value)}
        />
      </td>
      <td className="px-1 py-1 w-20">
        <input
          className="input text-sm py-1.5"
          placeholder="pcs"
          value={item.unit}
          onChange={e => set('unit', e.target.value)}
        />
      </td>
      <td className="px-1 py-1 w-32">
        <input
          type="number"
          className="input text-sm py-1.5"
          placeholder="0"
          min="0"
          value={item.estimatedPrice}
          onChange={e => set('estimatedPrice', e.target.value)}
        />
      </td>
      <td className="px-1 py-1">
        <input
          className="input text-sm py-1.5"
          placeholder="Keterangan"
          value={item.notes}
          onChange={e => set('notes', e.target.value)}
        />
      </td>
      <td className="px-2 py-1 w-8">
        {canRemove && (
          <button type="button" onClick={() => onRemove(index)}
            className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors">
            <Trash className="w-3.5 h-3.5" />
          </button>
        )}
      </td>
    </tr>
  );
}

// ── Create/Edit Modal ─────────────────────────────────────────────────────────
function POModal({ open, onClose, initial }) {
  const [form, setForm]     = useState(EMPTY_FORM);
  const [items, setItems]   = useState([{ ...EMPTY_ITEM }]);
  const [pendingFiles, setPendingFiles]             = useState([]); // { file, preview, id }
  const [existingAttachments, setExistingAttachments] = useState([]);
  const photoInputRef = useRef(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (open) {
      if (initial) {
        setForm({
          companyName:   initial.companyName   || '',
          workLocation:  initial.workLocation  || '',
          position:      initial.position      || '',
          deadline:      initial.deadline ? initial.deadline.slice(0, 10) : '',
          justification: initial.justification || '',
          notes:         initial.notes         || '',
        });
        setItems(initial.items?.length > 0
          ? initial.items.map(it => ({
              itemName:       it.itemName       || '',
              specification:  it.specification  || '',
              qty:            it.qty            || 1,
              unit:           it.unit           || 'pcs',
              estimatedPrice: it.estimatedPrice != null ? String(it.estimatedPrice) : '',
              notes:          it.notes          || '',
            }))
          : [{ ...EMPTY_ITEM }]
        );
        setExistingAttachments(initial.attachments || []);
      } else {
        setForm(EMPTY_FORM);
        setItems([{ ...EMPTY_ITEM }]);
        setExistingAttachments([]);
      }
      setPendingFiles([]);
    }
  }, [open, initial]);

  // Cleanup object URLs on unmount / close
  useEffect(() => {
    if (!open) {
      pendingFiles.forEach(f => URL.revokeObjectURL(f.preview));
    }
  }, [open]); // eslint-disable-line

  const deleteAttachmentMutation = useMutation({
    mutationFn: ({ poId, attachId }) => poAPI.deleteAttachment(poId, attachId),
    onError: () => toast.error('Gagal menghapus lampiran'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => poAPI.create(data),
    onSuccess: async (res) => {
      const newPO = res.data?.data || res.data;
      if (pendingFiles.length > 0 && newPO?.id) {
        const fd = new FormData();
        pendingFiles.forEach(f => fd.append('photos', f.file));
        try {
          await poAPI.uploadAttachments(newPO.id, fd);
        } catch {
          toast.error('PR dibuat tapi gagal upload lampiran foto');
        }
      }
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['po-summary'] });
      toast.success('Purchase Request berhasil dibuat');
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Gagal menyimpan PR'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => poAPI.update(id, data),
    onSuccess: async (_, vars) => {
      if (pendingFiles.length > 0) {
        const fd = new FormData();
        pendingFiles.forEach(f => fd.append('photos', f.file));
        try {
          await poAPI.uploadAttachments(vars.id, fd);
        } catch {
          toast.error('PR diperbarui tapi gagal upload lampiran baru');
        }
      }
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['po-summary'] });
      toast.success('Purchase Request berhasil diperbarui');
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Gagal memperbarui PR'),
  });

  const isEdit = !!initial?.id;
  const busy   = createMutation.isPending || updateMutation.isPending;
  const set    = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleItemChange = (idx, updated) => setItems(prev => prev.map((it, i) => i === idx ? updated : it));
  const handleAddItem    = () => setItems(prev => [...prev, { ...EMPTY_ITEM }]);
  const handleRemoveItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  const totalEstimate = items.reduce((sum, it) =>
    sum + (parseFloat(it.qty || 0) * parseFloat(it.estimatedPrice || 0)), 0);

  const handlePhotoChange = (e) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter(f => {
      if (!f.type.startsWith('image/')) { toast.error(`${f.name}: bukan file gambar`); return false; }
      if (f.size > 10 * 1024 * 1024) { toast.error(`${f.name}: ukuran melebihi 10MB`); return false; }
      return true;
    });
    const newEntries = valid.map(f => ({
      file: f,
      preview: URL.createObjectURL(f),
      id: Math.random().toString(36).slice(2),
    }));
    setPendingFiles(prev => [...prev, ...newEntries]);
    e.target.value = '';
  };

  const removePendingFile = (id) => {
    setPendingFiles(prev => {
      const entry = prev.find(f => f.id === id);
      if (entry) URL.revokeObjectURL(entry.preview);
      return prev.filter(f => f.id !== id);
    });
  };

  const removeExistingAttachment = (attachId) => {
    if (!initial?.id) return;
    deleteAttachmentMutation.mutate({ poId: initial.id, attachId });
    setExistingAttachments(prev => prev.filter(a => a.id !== attachId));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.companyName.trim() || !form.workLocation.trim()) {
      return toast.error('Nama perusahaan dan lokasi kerja wajib diisi');
    }
    const validItems = items.filter(it => it.itemName.trim());
    if (validItems.length === 0) return toast.error('Minimal satu item harus diisi');

    const payload = {
      ...form,
      items: validItems.map((it, idx) => ({
        ...it,
        itemNo: idx + 1,
        qty: parseFloat(it.qty || 1),
        estimatedPrice: parseFloat(it.estimatedPrice || 0),
      })),
    };

    if (isEdit) updateMutation.mutate({ id: initial.id, data: payload });
    else createMutation.mutate(payload);
  };

  if (!open) return null;

  const totalAttachments = existingAttachments.length + pendingFiles.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {isEdit ? 'Edit Purchase Request' : 'Buat Purchase Request Baru'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Info fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Nama Perusahaan <span className="text-red-500">*</span></label>
              <input className="input" value={form.companyName}
                onChange={e => set('companyName', e.target.value)} placeholder="PT. Contoh..." required />
            </div>
            <div>
              <label className="label">Lokasi Kerja <span className="text-red-500">*</span></label>
              <input className="input" value={form.workLocation}
                onChange={e => set('workLocation', e.target.value)} placeholder="Mall Indramayu..." required />
            </div>
            <div>
              <label className="label">Jabatan</label>
              <input className="input" value={form.position}
                onChange={e => set('position', e.target.value)} placeholder="Staff IT, Manager..." />
            </div>
            <div>
              <label className="label">Deadline Kebutuhan</label>
              <input type="date" className="input" value={form.deadline}
                onChange={e => set('deadline', e.target.value)} />
            </div>
          </div>

          {/* Items table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Detail Permintaan Barang / Jasa <span className="text-red-500">*</span></label>
              <button type="button" onClick={handleAddItem} className="btn-secondary btn-sm text-xs">
                <Plus className="w-3 h-3" /> Tambah Item
              </button>
            </div>
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 dark:bg-gray-800/50">
                    <tr>
                      {['No', 'Nama Barang / Jasa *', 'Spesifikasi', 'Qty', 'Satuan', 'Estimasi Harga (Rp)', 'Keterangan', ''].map((h, i) => (
                        <th key={i} className="px-2 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <ItemRow
                        key={idx} item={item} index={idx}
                        onChange={handleItemChange} onRemove={handleRemoveItem}
                        canRemove={items.length > 1}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Total */}
            <div className="flex justify-end mt-3">
              <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/40 rounded-xl px-4 py-2.5">
                <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">Total Estimasi Biaya: </span>
                <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">{fmtRp(totalEstimate)}</span>
              </div>
            </div>
          </div>

          {/* Justification */}
          <div>
            <label className="label">Alasan / Justifikasi Kebutuhan</label>
            <p className="text-xs text-gray-400 mb-1.5">Jelaskan alasan pengadaan barang/jasa tersebut</p>
            <textarea className="input resize-none" rows={4}
              value={form.justification}
              onChange={e => set('justification', e.target.value)}
              placeholder="Penunjang operasional kantor..." />
          </div>

          {/* Notes */}
          <div>
            <label className="label">Catatan Tambahan</label>
            <textarea className="input resize-none" rows={2}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Catatan lain jika ada..." />
          </div>

          {/* Photo Attachments */}
          <div>
            <label className="label flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5 text-gray-400" />
              Lampiran Foto Barang
              {totalAttachments > 0 && (
                <span className="ml-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded-full">
                  {totalAttachments}
                </span>
              )}
            </label>
            <p className="text-xs text-gray-400 mb-2">
              Unggah foto barang yang akan dipesan — akan dilampirkan dalam PDF (opsional, maks 10 foto, maks 10MB/foto)
            </p>

            {/* Existing attachments (edit mode) */}
            {existingAttachments.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 font-medium">Foto tersimpan:</p>
                <div className="flex flex-wrap gap-2">
                  {existingAttachments.map(att => (
                    <div key={att.id} className="relative group">
                      <img
                        src={att.url} alt={att.originalName}
                        className="w-20 h-20 object-cover rounded-xl border border-gray-200 dark:border-gray-700"
                      />
                      <button
                        type="button"
                        onClick={() => removeExistingAttachment(att.id)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                        title="Hapus lampiran"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <p className="text-xs text-gray-400 text-center mt-0.5 truncate max-w-[80px]">{att.originalName}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending new files */}
            {pendingFiles.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 font-medium">Foto baru (belum diunggah):</p>
                <div className="flex flex-wrap gap-2">
                  {pendingFiles.map(entry => (
                    <div key={entry.id} className="relative group">
                      <img
                        src={entry.preview} alt={entry.file.name}
                        className="w-20 h-20 object-cover rounded-xl border-2 border-indigo-300 dark:border-indigo-600"
                      />
                      <button
                        type="button"
                        onClick={() => removePendingFile(entry.id)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md"
                        title="Hapus"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <p className="text-xs text-gray-400 text-center mt-0.5 truncate max-w-[80px]">{entry.file.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload button */}
            <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/40 dark:hover:bg-indigo-900/10 text-gray-500 hover:text-indigo-600 text-sm transition-colors"
            >
              <Paperclip className="w-4 h-4" />
              {totalAttachments > 0 ? 'Tambah foto lagi' : 'Pilih Foto'}
            </button>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Batal</button>
            <button type="submit" disabled={busy} className="btn-primary flex items-center gap-2">
              {busy && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {isEdit ? 'Simpan Perubahan' : 'Kirim Purchase Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Detail / View Modal ───────────────────────────────────────────────────────
function PODetailModal({ open, onClose, po, onApprove, onReject, userRole, onAttachmentDeleted }) {
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject]     = useState(false);
  const [downloading, setDownloading]   = useState(false);
  const [previewOpen, setPreviewOpen]   = useState(false);
  const qc = useQueryClient();

  const s = statusObj(po?.status);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await poAPI.downloadPDF(po.id);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = `PR-${po.poNumber}.pdf`; a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF berhasil diunduh');
    } catch {
      toast.error('Gagal mengunduh PDF');
    } finally {
      setDownloading(false);
    }
  };

  const deleteAttachMutation = useMutation({
    mutationFn: ({ poId, attachId }) => poAPI.deleteAttachment(poId, attachId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast.success('Lampiran dihapus');
    },
    onError: () => toast.error('Gagal menghapus lampiran'),
  });

  const handleDeleteAttachment = (attachId) => {
    if (!confirm('Hapus lampiran foto ini?')) return;
    deleteAttachMutation.mutate({ poId: po.id, attachId });
  };

  if (!open || !po) return null;

  const canDeleteAttachment = userRole === 'ADMIN';

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{po.poNumber}</h2>
            <span className={cn('text-xs font-semibold px-2 py-1 rounded-full', s.color)}>{s.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPreviewOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-colors">
              <FileText className="w-3.5 h-3.5" />
              Preview
            </button>
            <button onClick={handleDownload} disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors">
              {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
              Unduh PDF
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              ['Nomor PR',      po.poNumber],
              ['Tgl Pengajuan', fmtDate(po.submissionDate)],
              ['Perusahaan',    po.companyName],
              ['Lokasi Kerja',  po.workLocation],
              ['Jabatan',       po.position || '-'],
              ['Deadline',      fmtDate(po.deadline)],
              ['Dibuat oleh',   po.createdBy?.name || '-'],
              ['Cabang',        po.branch?.name || '-'],
              ['Total',         fmtRp(po.totalEstimate)],
            ].map(([k, v]) => (
              <div key={k} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-0.5">{k}</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{v}</p>
              </div>
            ))}
          </div>

          {/* Items table */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Detail Barang / Jasa</h3>
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    {['No', 'Nama Barang/Jasa', 'Spesifikasi', 'Qty', 'Satuan', 'Est. Harga', 'Subtotal', 'Ket'].map((h, i) => (
                      <th key={i} className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {po.items?.map((item) => (
                    <tr key={item.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="px-3 py-2 text-center text-gray-500 font-mono">{item.itemNo}</td>
                      <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{item.itemName}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{item.specification || '-'}</td>
                      <td className="px-3 py-2 text-center">{item.qty}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{item.unit}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtRp(item.estimatedPrice)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{fmtRp(item.qty * item.estimatedPrice)}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{item.notes || '-'}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-indigo-50 dark:bg-indigo-900/20">
                    <td colSpan={6} className="px-3 py-2 font-bold text-sm text-gray-900 dark:text-white text-right">Total Estimasi:</td>
                    <td className="px-3 py-2 font-bold text-sm text-indigo-700 dark:text-indigo-300 font-mono">{fmtRp(po.totalEstimate)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Photo Attachments Gallery */}
          {po.attachments?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-gray-400" />
                Lampiran Foto ({po.attachments.length})
              </h3>
              <div className="flex flex-wrap gap-3">
                {po.attachments.map(att => (
                  <div key={att.id} className="relative group flex flex-col items-center">
                    <a href={att.url} target="_blank" rel="noopener noreferrer" className="block">
                      <img
                        src={att.url} alt={att.originalName}
                        className="w-24 h-24 object-cover rounded-xl border border-gray-200 dark:border-gray-700 hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
                      />
                    </a>
                    {canDeleteAttachment && (
                      <button
                        type="button"
                        onClick={() => handleDeleteAttachment(att.id)}
                        disabled={deleteAttachMutation.isPending}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                        title="Hapus lampiran"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    <p className="text-xs text-gray-400 text-center mt-1 truncate max-w-[96px]">{att.originalName}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Justification */}
          {po.justification && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Alasan / Justifikasi</h3>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {po.justification}
              </div>
            </div>
          )}

          {/* Reject reason */}
          {po.status === 'REJECTED' && po.rejectedReason && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg p-3">
              <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">Alasan Penolakan:</p>
              <p className="text-sm text-red-700 dark:text-red-300">{po.rejectedReason}</p>
            </div>
          )}

          {/* ADMIN actions */}
          {userRole === 'ADMIN' && po.status === 'PENDING' && (
            <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
              {!showReject ? (
                <div className="flex gap-3">
                  <button onClick={() => onApprove(po.id)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium text-sm transition-colors">
                    <CheckCircle2 className="w-4 h-4" /> Setujui PR
                  </button>
                  <button onClick={() => setShowReject(true)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium text-sm transition-colors">
                    <XCircle className="w-4 h-4" /> Tolak PR
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea className="input resize-none" rows={3}
                    placeholder="Alasan penolakan (opsional)..."
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                  />
                  <div className="flex gap-3">
                    <button onClick={() => { onReject(po.id, rejectReason); setShowReject(false); setRejectReason(''); }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-colors">
                      <XCircle className="w-4 h-4" /> Konfirmasi Tolak
                    </button>
                    <button onClick={() => setShowReject(false)} className="btn-secondary">Batal</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* PDF Preview Modal */}
    <PDFPreviewModal
      isOpen={previewOpen}
      onClose={() => setPreviewOpen(false)}
      fetchFn={() => poAPI.downloadPDF(po.id)}
      filename={`PR-${po?.poNumber}.pdf`}
      title={`Preview PR — ${po?.poNumber}`}
    />
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PurchaseOrdersPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const [search, setSearch]        = useState('');
  const [filterStatus, setFStatus] = useState('');
  const [modalOpen, setModalOpen]  = useState(false);
  const [editPO, setEditPO]        = useState(null);
  const [viewPO, setViewPO]        = useState(null);

  const { data: summaryData } = useQuery({
    queryKey: ['po-summary'],
    queryFn: () => poAPI.summary().then(r => r.data.data),
    staleTime: 30_000,
  });

  const { data: posData, isLoading } = useQuery({
    queryKey: ['purchase-orders', search, filterStatus],
    queryFn: () => poAPI.list({
      search:    search       || undefined,
      status:    filterStatus || undefined,
      limit: 100,
    }).then(r => r.data.data),
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => poAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['po-summary'] });
      toast.success('Purchase Request dihapus');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Gagal menghapus PR'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, rejectedReason }) =>
      poAPI.updateStatus(id, { status, rejectedReason }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['po-summary'] });
      const label = vars.status === 'APPROVED' ? 'disetujui' : 'ditolak';
      toast.success(`PR berhasil ${label}`);
      setViewPO(null);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Gagal memperbarui status'),
  });

  const handleEdit  = (po) => { setEditPO(po); setModalOpen(true); };
  const handleNew   = () => { setEditPO(null); setModalOpen(true); };
  const handleClose = () => { setModalOpen(false); setEditPO(null); };
  const handleView  = (po) => setViewPO(po);

  const handleDelete = (po) => {
    if (!confirm(`Hapus Purchase Request "${po.poNumber}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    deleteMutation.mutate(po.id);
  };

  const handleApprove = (id) => statusMutation.mutate({ id, status: 'APPROVED' });
  const handleReject  = (id, reason) => statusMutation.mutate({ id, status: 'REJECTED', rejectedReason: reason });

  const pos = posData?.purchaseOrders ?? posData ?? [];
  const canEdit   = (po) => po.createdById === user?.id || user?.role === 'ADMIN';
  const canDelete = (po) => (po.createdById === user?.id && po.status !== 'APPROVED') || user?.role === 'ADMIN';

  return (
    <DashboardLayout title="Purchase Request">
      <div className="space-y-5">

        <SummaryCards summary={summaryData} />

        <div className="card">
          {/* Header */}
          <div className="card-header flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-indigo-500" />
              Daftar Purchase Request ({pos.length})
            </h2>
            <button onClick={handleNew} className="btn-primary btn-sm">
              <Plus className="w-3.5 h-3.5" /> Buat PR Baru
            </button>
          </div>

          {/* Filters */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                className="input pl-9 py-1.5 text-sm"
                placeholder="Cari nomor, perusahaan, lokasi..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select className="input py-1.5 text-sm w-auto" value={filterStatus} onChange={e => setFStatus(e.target.value)}>
              <option value="">Semua Status</option>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            {(search || filterStatus) && (
              <button onClick={() => { setSearch(''); setFStatus(''); }} className="btn-secondary btn-sm">
                <X className="w-3.5 h-3.5" /> Reset
              </button>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : pos.length === 0 ? (
              <div className="py-16 text-center">
                <ShoppingCart className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Belum ada Purchase Request</p>
                <button onClick={handleNew} className="btn-primary btn-sm mt-4">
                  <Plus className="w-3.5 h-3.5" /> Buat PR Pertama
                </button>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    {['Nomor PR', 'Perusahaan', 'Lokasi', 'Tgl Pengajuan', 'Deadline', 'Total', 'Foto', 'Status', 'Dibuat Oleh', ''].map((h, i) => (
                      <th key={i} className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pos.map(po => {
                    const s = statusObj(po.status);
                    const SIcon = s.icon;
                    return (
                      <tr key={po.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
                        <td className="px-4 py-3">
                          <p className="font-mono text-sm font-semibold text-indigo-600 dark:text-indigo-400">{po.poNumber}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{po.companyName}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{po.workLocation}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(po.submissionDate)}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(po.deadline)}</td>
                        <td className="px-4 py-3 text-sm font-mono font-semibold text-gray-900 dark:text-white">{fmtRp(po.totalEstimate)}</td>
                        <td className="px-4 py-3">
                          {po.attachments?.length > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full font-medium">
                              <Paperclip className="w-3 h-3" />
                              {po.attachments.length}
                            </span>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-700 text-xs">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full', s.color)}>
                            <SIcon className="w-3 h-3" />
                            {s.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{po.createdBy?.name || '-'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleView(po)}
                              className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-gray-400 hover:text-indigo-600 transition-colors"
                              title="Lihat Detail">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {canEdit(po) && po.status === 'PENDING' && (
                              <button onClick={() => handleEdit(po)}
                                className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-400 hover:text-blue-600 transition-colors"
                                title="Edit">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canDelete(po) && (
                              <button onClick={() => handleDelete(po)}
                                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
                                title="Hapus">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Create / Edit modal */}
      <POModal
        open={modalOpen}
        onClose={handleClose}
        initial={editPO}
      />

      {/* Detail / Approve modal */}
      <PODetailModal
        open={!!viewPO}
        onClose={() => setViewPO(null)}
        po={viewPO}
        userRole={user?.role}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </DashboardLayout>
  );
}
