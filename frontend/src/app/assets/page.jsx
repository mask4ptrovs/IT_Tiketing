'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../../components/layout/DashboardLayout';
import PDFPreviewModal from '../../components/ui/PDFPreviewModal';
import { Skeleton } from '../../components/ui/Skeleton';
import { assetAPI, userAPI, branchAPI, departmentAPI } from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import { formatDateTime, cn } from '../../lib/utils';
import toast from 'react-hot-toast';
import {
  Package, Plus, Search, Edit2, Trash2, X, Monitor,
  BarChart3, CheckCircle2, AlertTriangle, Clock,
  Camera, ImageOff, FileDown, Loader2, FileText, Eye, ClipboardList,
} from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { value: 'LAPTOP',         label: 'Laptop',         icon: '💻' },
  { value: 'DESKTOP',        label: 'Desktop/PC',     icon: '🖥️' },
  { value: 'PRINTER',        label: 'Printer',        icon: '🖨️' },
  { value: 'MONITOR',        label: 'Monitor',        icon: '🖵'  },
  { value: 'KEYBOARD',       label: 'Keyboard',       icon: '⌨️' },
  { value: 'MOUSE',          label: 'Mouse',          icon: '🖱️' },
  { value: 'NETWORK_DEVICE', label: 'Network Device', icon: '📡' },
  { value: 'SERVER',         label: 'Server',         icon: '🗄️' },
  { value: 'PHONE',          label: 'Telepon',        icon: '📱' },
  { value: 'TABLET',         label: 'Tablet',         icon: '📱' },
  { value: 'UPS',            label: 'UPS',            icon: '🔋' },
  { value: 'PROJECTOR',      label: 'Projector',      icon: '📽️' },
  { value: 'OTHER',          label: 'Lainnya',        icon: '📦' },
];

const STATUSES = [
  { value: 'AVAILABLE',   label: 'Tersedia',    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'IN_USE',      label: 'Digunakan',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 'MAINTENANCE', label: 'Maintenance', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  { value: 'RETIRED',     label: 'Pensiun',     color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  { value: 'LOST',        label: 'Hilang',      color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
];

const CONDITIONS = [
  { value: 'EXCELLENT', label: 'Sangat Baik', color: 'text-emerald-600' },
  { value: 'GOOD',      label: 'Baik',        color: 'text-green-600' },
  { value: 'FAIR',      label: 'Cukup',       color: 'text-yellow-600' },
  { value: 'POOR',      label: 'Buruk',       color: 'text-orange-600' },
  { value: 'DAMAGED',   label: 'Rusak',       color: 'text-red-600' },
];

const catLabel  = (v) => CATEGORIES.find(c => c.value === v)?.label  || v;
const catIcon   = (v) => CATEGORIES.find(c => c.value === v)?.icon   || '📦';
const statusObj = (v) => STATUSES.find(s => s.value === v)   || { label: v, color: 'bg-gray-100 text-gray-600' };
const condObj   = (v) => CONDITIONS.find(c => c.value === v) || { label: v, color: 'text-gray-600' };

const fmtRp = (n) => n != null
  ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
  : '-';

const EMPTY_FORM = {
  name: '', category: 'LAPTOP', brand: '', model: '', serialNumber: '',
  purchaseDate: '', purchasePrice: '', condition: 'GOOD', status: 'AVAILABLE',
  location: '', notes: '', assignedUserId: '', branchId: '', departmentId: '',
};

// ── Summary cards ──────────────────────────────────────────────────────────────
function SummaryCards({ summary }) {
  const cards = [
    { label: 'Total Aset',   value: summary?.total ?? 0,                color: 'bg-indigo-600',  icon: Package },
    { label: 'Tersedia',     value: summary?.byStatus?.AVAILABLE   ?? 0, color: 'bg-green-600',  icon: CheckCircle2 },
    { label: 'Digunakan',    value: summary?.byStatus?.IN_USE      ?? 0, color: 'bg-blue-600',   icon: Monitor },
    { label: 'Maintenance',  value: summary?.byStatus?.MAINTENANCE ?? 0, color: 'bg-yellow-500', icon: Clock },
    { label: 'Rusak/Hilang', value: (summary?.byStatus?.DAMAGED ?? 0) + (summary?.byStatus?.LOST ?? 0), color: 'bg-red-600', icon: AlertTriangle },
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

// ── Asset row ──────────────────────────────────────────────────────────────────
function AssetRow({ asset, onEdit, onDelete, onHandover, canDelete }) {
  const s = statusObj(asset.status);
  const c = condObj(asset.condition);
  const [handoverLoading, setHandoverLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleHandover = async () => {
    setHandoverLoading(true);
    try {
      const res = await assetAPI.downloadHandoverLetter(asset.id);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `SerahTerima-${asset.assetCode}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Surat serah terima berhasil diunduh');
    } catch (e) {
      const msg = e.response?.data?.message || 'Gagal membuat surat serah terima';
      toast.error(msg);
    } finally {
      setHandoverLoading(false);
    }
  };

  return (
    <>
    <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
      {/* Photo thumbnail */}
      <td className="px-3 py-3 w-12">
        {asset.photoUrl ? (
          <img
            src={asset.photoUrl}
            alt={asset.name}
            className="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-gray-700 bg-gray-100"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-lg">
            {catIcon(asset.category)}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <div>
          <p className="font-medium text-sm text-gray-900 dark:text-white">{asset.name}</p>
          <p className="text-xs text-gray-400 font-mono">{asset.assetCode}</p>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{catLabel(asset.category)}</td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
        {asset.brand ? `${asset.brand}${asset.model ? ' ' + asset.model : ''}` : '-'}
      </td>
      <td className="px-4 py-3">
        <span className={cn('text-xs font-semibold px-2 py-1 rounded-full', s.color)}>{s.label}</span>
      </td>
      <td className="px-4 py-3">
        <span className={cn('text-xs font-semibold', c.color)}>{c.label}</span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{asset.assignedUser?.name || '-'}</td>
      <td className="px-4 py-3 text-sm text-gray-500">{asset.location || '-'}</td>
      <td className="px-4 py-3 text-sm text-gray-500">{asset.branch?.code || '-'}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Preview & Handover letter — only if asset is assigned to someone */}
          {asset.assignedUser && (
            <>
              <button
                onClick={() => setPreviewOpen(true)}
                className="p-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 text-gray-400 hover:text-purple-600 transition-colors"
                title="Preview Surat Serah Terima"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleHandover}
                disabled={handoverLoading}
                className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-gray-400 hover:text-emerald-600 transition-colors"
                title="Unduh Surat Serah Terima"
              >
                {handoverLoading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <FileText className="w-3.5 h-3.5" />
                }
              </button>
            </>
          )}
          <button
            onClick={() => onEdit(asset)}
            className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-gray-400 hover:text-indigo-600 transition-colors"
            title="Edit"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          {canDelete && (
            <button
              onClick={() => onDelete(asset)}
              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
              title="Hapus"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>

    {/* PDF Preview Modal — Surat Serah Terima */}
    <PDFPreviewModal
      isOpen={previewOpen}
      onClose={() => setPreviewOpen(false)}
      fetchFn={() => assetAPI.downloadHandoverLetter(asset.id)}
      filename={`SerahTerima-${asset.assetCode}.pdf`}
      title={`Preview Serah Terima — ${asset.assetCode}`}
    />
    </>
  );
}

// ── Asset form modal ───────────────────────────────────────────────────────────
function AssetModal({ open, onClose, initial, users, branches, departments, userRole }) {
  const [form, setForm]           = useState(EMPTY_FORM);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPreview] = useState(null);
  const [removePhoto, setRemove]  = useState(false);
  const fileRef = useRef();
  const qc = useQueryClient();

  // Reset form whenever modal opens/closes or initial changes
  useEffect(() => {
    if (open) {
      setForm(initial ? {
        name:           initial.name           || '',
        category:       initial.category       || 'LAPTOP',
        brand:          initial.brand          || '',
        model:          initial.model          || '',
        serialNumber:   initial.serialNumber   || '',
        purchaseDate:   initial.purchaseDate   || '',
        purchasePrice:  initial.purchasePrice  != null ? String(initial.purchasePrice) : '',
        condition:      initial.condition      || 'GOOD',
        status:         initial.status         || 'AVAILABLE',
        location:       initial.location       || '',
        notes:          initial.notes          || '',
        assignedUserId: initial.assignedUserId || '',
        branchId:       initial.branchId       || '',
        departmentId:   initial.departmentId   || '',
      } : EMPTY_FORM);
      setPhotoFile(null);
      setPreview(initial?.photoUrl || null);
      setRemove(false);
    }
  }, [open, initial]);

  const createMutation = useMutation({
    mutationFn: (fd) => assetAPI.create(fd),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      qc.invalidateQueries({ queryKey: ['asset-summary'] });
      toast.success('Aset berhasil ditambahkan');
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Gagal menyimpan aset'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, fd }) => assetAPI.update(id, fd),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      qc.invalidateQueries({ queryKey: ['asset-summary'] });
      toast.success('Aset berhasil diperbarui');
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Gagal memperbarui aset'),
  });

  const isEdit = !!initial?.id;
  const busy = createMutation.isPending || updateMutation.isPending;
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('File harus berupa gambar (JPG, PNG, dll)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran foto maksimal 5 MB');
      return;
    }
    setPhotoFile(file);
    setRemove(false);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPreview(null);
    setRemove(true);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.category) return toast.error('Nama dan kategori wajib diisi');

    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) fd.append(k, v);
    });
    if (photoFile) fd.append('photo', photoFile);
    if (removePhoto) fd.append('removePhoto', 'true');

    if (isEdit) updateMutation.mutate({ id: initial.id, fd });
    else createMutation.mutate(fd);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        {/* Modal header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {isEdit ? 'Edit Aset' : 'Tambah Aset Baru'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">

          {/* ── Photo upload ─────────────────────────────────────────────── */}
          <div>
            <label className="label">Foto Aset</label>
            <div className="flex items-start gap-4">
              {/* Preview box */}
              <div className="w-28 h-28 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-center overflow-hidden flex-shrink-0 relative">
                {photoPreview && !removePhoto ? (
                  <>
                    <img
                      src={photoPreview}
                      alt="preview"
                      className="w-full h-full object-cover rounded-xl"
                    />
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center shadow"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-1 text-gray-400">
                    <Camera className="w-6 h-6" />
                    <span className="text-[10px]">Foto</span>
                  </div>
                )}
              </div>

              <div className="flex-1">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                  id="asset-photo-input"
                />
                <label
                  htmlFor="asset-photo-input"
                  className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm text-gray-600 dark:text-gray-400 transition-colors"
                >
                  <Camera className="w-4 h-4" />
                  {photoPreview && !removePhoto ? 'Ganti Foto' : 'Pilih Foto'}
                </label>
                <p className="text-xs text-gray-400 mt-2">
                  Format: JPG, PNG, WEBP. Maks. 5 MB.
                </p>
                {isEdit && initial?.photoUrl && !photoFile && !removePhoto && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="mt-1 text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                  >
                    <ImageOff className="w-3 h-3" /> Hapus foto
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Name + Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Nama Aset <span className="text-red-500">*</span></label>
              <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="cth. Laptop Dell Latitude 5530" required />
            </div>
            <div>
              <label className="label">Kategori <span className="text-red-500">*</span></label>
              <select className="input" value={form.category} onChange={e => set('category', e.target.value)} required>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
              </select>
            </div>
          </div>

          {/* Brand + Model */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Merek</label>
              <input className="input" value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="Dell, HP, Lenovo..." />
            </div>
            <div>
              <label className="label">Model / Tipe</label>
              <input className="input" value={form.model} onChange={e => set('model', e.target.value)} placeholder="Latitude 5530, ProBook 440..." />
            </div>
          </div>

          {/* Serial + Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Serial Number</label>
              <input className="input font-mono text-sm" value={form.serialNumber} onChange={e => set('serialNumber', e.target.value)} placeholder="SN1234567890" />
            </div>
            <div>
              <label className="label">Lokasi</label>
              <input className="input" value={form.location} onChange={e => set('location', e.target.value)} placeholder="Ruang IT Lantai 2..." />
            </div>
          </div>

          {/* Purchase date + price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Tanggal Pembelian</label>
              <input type="date" className="input" value={form.purchaseDate} onChange={e => set('purchaseDate', e.target.value)} />
            </div>
            <div>
              <label className="label">Harga Pembelian (Rp)</label>
              <input type="number" className="input" value={form.purchasePrice} onChange={e => set('purchasePrice', e.target.value)} placeholder="15000000" min="0" />
            </div>
          </div>

          {/* Condition + Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Kondisi</label>
              <select className="input" value={form.condition} onChange={e => set('condition', e.target.value)}>
                {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Assigned user + Department */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Ditugaskan ke User</label>
              <select className="input" value={form.assignedUserId} onChange={e => set('assignedUserId', e.target.value)}>
                <option value="">-- Tidak ada --</option>
                {users?.map(u => <option key={u.id} value={u.id}>{u.name} ({u.employeeId || u.email})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Departemen</label>
              <select className="input" value={form.departmentId} onChange={e => set('departmentId', e.target.value)}>
                <option value="">-- Pilih Departemen --</option>
                {departments?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          {/* Branch (ADMIN only) */}
          {userRole === 'ADMIN' && (
            <div>
              <label className="label">Cabang</label>
              <select className="input" value={form.branchId} onChange={e => set('branchId', e.target.value)}>
                <option value="">-- Pilih Cabang --</option>
                {branches?.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="label">Catatan</label>
            <textarea className="input resize-none" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Catatan tambahan tentang aset ini..." />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Batal</button>
            <button type="submit" disabled={busy} className="btn-primary flex items-center gap-2">
              {busy && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {isEdit ? 'Simpan Perubahan' : 'Tambah Aset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function AssetsPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const [search, setSearch]         = useState('');
  const [filterStatus, setFStatus]  = useState('');
  const [filterCategory, setFCat]   = useState('');
  const [filterCondition, setFCond] = useState('');
  const [modalOpen, setModalOpen]   = useState(false);
  const [editAsset, setEditAsset]   = useState(null);

  const branchParam = user?.role === 'IT_STAFF' ? user.branchId : undefined;

  const { data: summaryData } = useQuery({
    queryKey: ['asset-summary', branchParam],
    queryFn: () => assetAPI.summary(branchParam ? { branchId: branchParam } : {}).then(r => r.data.data),
    staleTime: 30_000,
  });

  const { data: assetsData, isLoading } = useQuery({
    queryKey: ['assets', search, filterStatus, filterCategory, filterCondition],
    queryFn: () => assetAPI.list({
      search:    search         || undefined,
      status:    filterStatus   || undefined,
      category:  filterCategory || undefined,
      condition: filterCondition || undefined,
      limit: 100,
    }).then(r => r.data.data),
    staleTime: 30_000,
  });

  const { data: usersData } = useQuery({
    queryKey: ['all-users-asset'],
    queryFn: () => userAPI.list({ limit: 200 }).then(r => r.data.data),
  });

  const { data: branchesData } = useQuery({
    queryKey: ['branches-asset'],
    queryFn: () => branchAPI.list({ limit: 100 }).then(r => r.data.data?.branches || r.data.data),
    enabled: user?.role === 'ADMIN',
  });

  const { data: deptData } = useQuery({
    queryKey: ['depts-asset'],
    queryFn: () => departmentAPI.list({ limit: 100 }).then(r => r.data.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => assetAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      qc.invalidateQueries({ queryKey: ['asset-summary'] });
      toast.success('Aset dihapus');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Gagal menghapus'),
  });

  const handleEdit = (asset) => {
    setEditAsset({
      id:             asset.id,
      name:           asset.name,
      category:       asset.category,
      brand:          asset.brand          || '',
      model:          asset.model          || '',
      serialNumber:   asset.serialNumber   || '',
      purchaseDate:   asset.purchaseDate   ? asset.purchaseDate.slice(0, 10) : '',
      purchasePrice:  asset.purchasePrice  != null ? String(asset.purchasePrice) : '',
      condition:      asset.condition,
      status:         asset.status,
      location:       asset.location       || '',
      notes:          asset.notes          || '',
      assignedUserId: asset.assignedUserId || '',
      branchId:       asset.branchId       || '',
      departmentId:   asset.departmentId   || '',
      photoUrl:       asset.photoUrl       || null,
    });
    setModalOpen(true);
  };

  const handleDelete = (asset) => {
    if (!confirm(`Hapus aset "${asset.name}" (${asset.assetCode})? Tindakan ini tidak bisa dibatalkan.`)) return;
    deleteMutation.mutate(asset.id);
  };

  const handleNew   = () => { setEditAsset(null); setModalOpen(true); };
  const handleClose = () => { setModalOpen(false); setEditAsset(null); };

  const assets = assetsData?.assets ?? assetsData ?? [];

  // ── Laporan PDF ──────────────────────────────────────────────────────────────
  const [reportLoading, setReportLoading]     = useState(false);
  const [reportPreviewOpen, setReportPreview] = useState(false);

  const reportParams = useMemo(() => ({
    ...(user?.role === 'IT_STAFF' && user.branchId ? { branchId: user.branchId } : {}),
    ...(filterCategory ? { category: filterCategory } : {}),
    ...(filterStatus   ? { status:   filterStatus   } : {}),
  }), [user, filterCategory, filterStatus]);

  const reportFetchFn = useCallback(
    () => assetAPI.downloadReport(reportParams),
    [reportParams]
  );

  const handleDownloadReport = async () => {
    setReportLoading(true);
    try {
      const res = await assetAPI.downloadReport(reportParams);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `Laporan-Aset-IT-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Laporan berhasil diunduh');
    } catch (e) {
      toast.error('Gagal mengunduh laporan');
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <DashboardLayout title="Inventaris Aset IT">
      <div className="space-y-5">

        <SummaryCards summary={summaryData} />

        <div className="card">
          {/* Header */}
          <div className="card-header flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Package className="w-4 h-4 text-indigo-500" />
              Daftar Aset ({assets.length})
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setReportPreview(true)}
                className="btn-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-colors"
              >
                <FileText className="w-3.5 h-3.5" /> Preview Laporan
              </button>
              <button
                onClick={handleDownloadReport}
                disabled={reportLoading}
                className="btn-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-medium transition-colors"
              >
                {reportLoading
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Menyiapkan...</>
                  : <><ClipboardList className="w-3.5 h-3.5" /> Laporan PDF</>}
              </button>
              <button onClick={handleNew} className="btn-primary btn-sm">
                <Plus className="w-3.5 h-3.5" /> Tambah Aset
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                className="input pl-9 py-1.5 text-sm"
                placeholder="Cari kode, nama, merek, SN..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select className="input py-1.5 text-sm w-auto" value={filterStatus} onChange={e => setFStatus(e.target.value)}>
              <option value="">Semua Status</option>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select className="input py-1.5 text-sm w-auto" value={filterCategory} onChange={e => setFCat(e.target.value)}>
              <option value="">Semua Kategori</option>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select className="input py-1.5 text-sm w-auto" value={filterCondition} onChange={e => setFCond(e.target.value)}>
              <option value="">Semua Kondisi</option>
              {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            {(search || filterStatus || filterCategory || filterCondition) && (
              <button
                onClick={() => { setSearch(''); setFStatus(''); setFCat(''); setFCond(''); }}
                className="btn-secondary btn-sm"
              >
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
            ) : assets.length === 0 ? (
              <div className="py-16 text-center">
                <Package className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Belum ada aset yang tercatat</p>
                <button onClick={handleNew} className="btn-primary btn-sm mt-4">
                  <Plus className="w-3.5 h-3.5" /> Tambah Aset Pertama
                </button>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    {['', 'Aset', 'Kategori', 'Merek/Model', 'Status', 'Kondisi', 'Pengguna', 'Lokasi', 'Cabang', ''].map((h, i) => (
                      <th key={i} className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assets.map(asset => (
                    <AssetRow
                      key={asset.id}
                      asset={asset}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      canDelete={user?.role === 'ADMIN'}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Category breakdown */}
        {summaryData && Object.keys(summaryData.byCategory || {}).length > 0 && (
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-500" /> Distribusi Kategori
            </h3>
            <div className="space-y-2.5">
              {Object.entries(summaryData.byCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, count]) => {
                  const pct = summaryData.total > 0 ? Math.round((count / summaryData.total) * 100) : 0;
                  return (
                    <div key={cat} className="flex items-center gap-3">
                      <span className="text-base w-6 flex-shrink-0">{catIcon(cat)}</span>
                      <span className="text-xs text-gray-600 dark:text-gray-400 w-28 flex-shrink-0">{catLabel(cat)}</span>
                      <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
                        <div className="h-2 bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 w-12 text-right">{count} ({pct}%)</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      <AssetModal
        open={modalOpen}
        onClose={handleClose}
        initial={editAsset}
        users={usersData?.users ?? usersData ?? []}
        branches={branchesData?.branches ?? branchesData ?? []}
        departments={deptData?.departments ?? deptData ?? []}
        userRole={user?.role}
        userBranchId={user?.branchId}
      />

      <PDFPreviewModal
        isOpen={reportPreviewOpen}
        onClose={() => setReportPreview(false)}
        fetchFn={reportFetchFn}
        filename={`Laporan-Aset-IT-${Date.now()}.pdf`}
        title="Preview Laporan Inventaris Aset IT"
      />
    </DashboardLayout>
  );
}
