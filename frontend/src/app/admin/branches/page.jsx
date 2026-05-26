'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Edit, Trash2, Loader2, GitBranch, MapPin,
  Phone, Mail, Users, Ticket, ChevronRight, Star, CheckCircle2,
  AlertCircle, Building2, FileText, Shield, Clock, ArrowUpDown,
  X, Save, ChevronDown, ChevronUp, Grip, PenLine,
} from 'lucide-react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import Modal from '../../../components/ui/Modal';
import { branchAPI } from '../../../lib/api';
import { formatDateTime } from '../../../lib/utils';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

// ── Tipe Regulasi Config ───────────────────────────────────────────────────
const REG_TYPE = {
  SLA:         { label: 'SLA',         color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',   icon: Clock },
  OPERATIONAL: { label: 'Operasional', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400', icon: FileText },
  SECURITY:    { label: 'Keamanan',    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',       icon: Shield },
  ESCALATION:  { label: 'Eskalasi',    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: ArrowUpDown },
  OTHER:       { label: 'Lainnya',     color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400',       icon: FileText },
};

function RegTypeBadge({ type }) {
  const cfg = REG_TYPE[type] || REG_TYPE.OTHER;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

// ── Branch Card ────────────────────────────────────────────────────────────
function BranchCard({ branch, onEdit, onDelete, onManageRegs, deleting }) {
  return (
    <div className={`card p-5 border-l-4 ${branch.isHeadOffice ? 'border-l-primary-500' : 'border-l-gray-200 dark:border-l-gray-700'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold text-white ${branch.isHeadOffice ? 'bg-primary-600' : 'bg-gray-500'}`}>
            {branch.code}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900 dark:text-white">{branch.name}</h3>
              {branch.isHeadOffice && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                  <Star className="w-3 h-3" /> Kantor Pusat
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${branch.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                {branch.isActive ? 'Aktif' : 'Nonaktif'}
              </span>
            </div>
            <div className="mt-1.5 space-y-0.5">
              {(branch.address || branch.city) && (
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  {[branch.address, branch.city].filter(Boolean).join(', ')}
                </p>
              )}
              {branch.phone && (
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Phone className="w-3 h-3 flex-shrink-0" />{branch.phone}
                </p>
              )}
              {branch.email && (
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Mail className="w-3 h-3 flex-shrink-0" />{branch.email}
                </p>
              )}
              {branch.managerName && (
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Users className="w-3 h-3 flex-shrink-0" />Manajer: <span className="font-medium text-gray-700 dark:text-gray-300">{branch.managerName}</span>
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => onEdit(branch)} className="btn-icon btn-secondary" title="Edit"><Edit className="w-3.5 h-3.5" /></button>
          <button onClick={() => onDelete(branch)} disabled={deleting === branch.id} className="btn-icon btn-danger" title="Hapus">
            {deleting === branch.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Users className="w-3.5 h-3.5" /><span>{branch._count?.users || 0} user</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Ticket className="w-3.5 h-3.5" /><span>{branch._count?.tickets || 0} tiket</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <FileText className="w-3.5 h-3.5" /><span>{branch._count?.regulations || 0} regulasi</span>
        </div>
        <button
          onClick={() => onManageRegs(branch)}
          className="ml-auto flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
        >
          Kelola Regulasi <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────
export default function BranchesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editBranch, setEditBranch] = useState(null);
  const [savingBranch, setSavingBranch] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Signature state (per branch modal)
  const [showSigSection, setShowSigSection] = useState(false);
  const [sigCreator, setSigCreator]   = useState('');
  const [sigChecker, setSigChecker]   = useState('');
  const [sigApprover, setSigApprover] = useState('');
  const [savingSig, setSavingSig]     = useState(false);

  // Regulation panel state
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [showRegPanel, setShowRegPanel] = useState(false);
  const [showRegModal, setShowRegModal] = useState(false);
  const [editReg, setEditReg] = useState(null);
  const [savingReg, setSavingReg] = useState(false);
  const [deletingRegId, setDeletingRegId] = useState(null);

  const branchForm = useForm();
  const regForm = useForm();

  // Queries
  const { data: branchData, isLoading } = useQuery({
    queryKey: ['branches', search],
    queryFn: () => branchAPI.list({ search: search || undefined, limit: 50 }).then(r => r.data),
  });

  const { data: regData, isLoading: regLoading } = useQuery({
    queryKey: ['regulations', selectedBranch?.id],
    queryFn: () => branchAPI.getRegulations(selectedBranch.id).then(r => r.data.data),
    enabled: !!selectedBranch,
  });

  const branches = branchData?.data || [];

  // Branch CRUD
  const openCreateBranch = () => { setEditBranch(null); branchForm.reset(); setShowBranchModal(true); };
  const openEditBranch = (b) => {
    setEditBranch(b);
    branchForm.reset({
      name: b.name, code: b.code, address: b.address || '', city: b.city || '',
      phone: b.phone || '', email: b.email || '', managerName: b.managerName || '',
      isHeadOffice: b.isHeadOffice, isActive: b.isActive,
    });
    // Pre-fill signature fields
    setSigCreator(b.sigCreator  || '');
    setSigChecker(b.sigChecker  || '');
    setSigApprover(b.sigApprover || '');
    setShowSigSection(false);
    setShowBranchModal(true);
  };

  const onSubmitBranch = async (data) => {
    setSavingBranch(true);
    try {
      if (editBranch) {
        const updated = await branchAPI.update(editBranch.id, {
          ...data,
          isActive: data.isActive === 'true' || data.isActive === true,
          isHeadOffice: data.isHeadOffice === 'true' || data.isHeadOffice === true,
        });
        // Also save signatures if sig section was opened
        if (showSigSection) {
          await branchAPI.updateSignatures(editBranch.id, { sigCreator, sigChecker, sigApprover });
        }
        toast.success('Cabang berhasil diperbarui');
      } else {
        await branchAPI.create(data);
        toast.success('Cabang berhasil ditambahkan');
      }
      setShowBranchModal(false);
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan cabang');
    } finally {
      setSavingBranch(false);
    }
  };

  const handleDeleteBranch = async (branch) => {
    const msg = branch._count?.users > 0 || branch._count?.tickets > 0
      ? `⚠️ Cabang ini memiliki ${branch._count.users} user dan ${branch._count.tickets} tiket.\n\n`
      : '';
    if (!confirm(`🗑️ Hapus cabang "${branch.name}"?\n\n${msg}Tindakan ini tidak bisa dibatalkan!`)) return;
    setDeletingId(branch.id);
    try {
      await branchAPI.delete(branch.id);
      toast.success(`Cabang "${branch.name}" berhasil dihapus`);
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menghapus cabang');
    } finally {
      setDeletingId(null);
    }
  };

  // Regulation CRUD
  const openManageRegs = (branch) => { setSelectedBranch(branch); setShowRegPanel(true); };
  const openCreateReg = () => { setEditReg(null); regForm.reset({ type: 'OPERATIONAL' }); setShowRegModal(true); };
  const openEditReg = (reg) => {
    setEditReg(reg);
    regForm.reset({ title: reg.title, content: reg.content, type: reg.type, isActive: reg.isActive });
    setShowRegModal(true);
  };

  const onSubmitReg = async (data) => {
    setSavingReg(true);
    try {
      if (editReg) {
        await branchAPI.updateRegulation(selectedBranch.id, editReg.id, { ...data, isActive: data.isActive === 'true' || data.isActive === true });
        toast.success('Regulasi berhasil diperbarui');
      } else {
        await branchAPI.createRegulation(selectedBranch.id, data);
        toast.success('Regulasi berhasil ditambahkan');
      }
      setShowRegModal(false);
      queryClient.invalidateQueries({ queryKey: ['regulations', selectedBranch.id] });
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan regulasi');
    } finally {
      setSavingReg(false);
    }
  };

  const handleDeleteReg = async (reg) => {
    if (!confirm(`Hapus regulasi "${reg.title}"?`)) return;
    setDeletingRegId(reg.id);
    try {
      await branchAPI.deleteRegulation(selectedBranch.id, reg.id);
      toast.success('Regulasi berhasil dihapus');
      queryClient.invalidateQueries({ queryKey: ['regulations', selectedBranch.id] });
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menghapus regulasi');
    } finally {
      setDeletingRegId(null);
    }
  };

  const regulations = regData?.regulations || [];

  return (
    <DashboardLayout title="Cabang Perusahaan">
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-primary-600" /> Cabang Perusahaan
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">{branchData?.pagination?.total ?? 0} cabang terdaftar</p>
          </div>
          <button onClick={openCreateBranch} className="btn-primary">
            <Plus className="w-4 h-4" /> Tambah Cabang
          </button>
        </div>

        {/* Search */}
        <div className="card p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Cari nama, kode, atau kota cabang..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Branch list + Regulation panel side-by-side */}
        <div className={`grid gap-5 ${showRegPanel ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>

          {/* Branch cards */}
          <div className="space-y-4">
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="card p-5 animate-pulse">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                    </div>
                  </div>
                </div>
              ))
            ) : branches.length === 0 ? (
              <div className="card p-12 text-center">
                <GitBranch className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Belum ada cabang</p>
                <p className="text-sm text-gray-400 mt-1">Tambahkan cabang pertama perusahaan Anda</p>
                <button onClick={openCreateBranch} className="btn-primary mt-4">
                  <Plus className="w-4 h-4" /> Tambah Cabang
                </button>
              </div>
            ) : (
              branches.map(b => (
                <BranchCard
                  key={b.id}
                  branch={b}
                  onEdit={openEditBranch}
                  onDelete={handleDeleteBranch}
                  onManageRegs={openManageRegs}
                  deleting={deletingId}
                />
              ))
            )}
          </div>

          {/* Regulation panel */}
          {showRegPanel && selectedBranch && (
            <div className="card overflow-hidden flex flex-col h-fit">
              {/* Panel header */}
              <div className="card-header flex items-center justify-between bg-gradient-to-r from-primary-600 to-indigo-600 text-white px-5 py-4">
                <div>
                  <p className="text-xs opacity-75 font-medium uppercase tracking-wider">Regulasi</p>
                  <h3 className="font-bold">{selectedBranch.name}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={openCreateReg} className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Tambah
                  </button>
                  <button onClick={() => setShowRegPanel(false)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Regulation list */}
              <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
                {regLoading ? (
                  [...Array(3)].map((_, i) => (
                    <div key={i} className="animate-pulse space-y-2 p-3 border rounded-lg border-gray-100 dark:border-gray-700">
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full" />
                    </div>
                  ))
                ) : regulations.length === 0 ? (
                  <div className="text-center py-10">
                    <FileText className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Belum ada regulasi untuk cabang ini</p>
                    <button onClick={openCreateReg} className="btn-primary mt-3 text-xs">
                      <Plus className="w-3.5 h-3.5" /> Tambah Regulasi
                    </button>
                  </div>
                ) : (
                  regulations.map((reg, idx) => (
                    <div key={reg.id} className={`border rounded-xl p-4 ${reg.isActive ? 'border-gray-100 dark:border-gray-700' : 'border-dashed border-gray-200 dark:border-gray-700 opacity-60'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-gray-400 w-5">{idx + 1}.</span>
                          <RegTypeBadge type={reg.type} />
                          {!reg.isActive && <span className="text-xs text-red-400 font-medium">(Nonaktif)</span>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => openEditReg(reg)} className="btn-icon btn-secondary" title="Edit">
                            <Edit className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteReg(reg)}
                            disabled={deletingRegId === reg.id}
                            className="btn-icon btn-danger" title="Hapus"
                          >
                            {deletingRegId === reg.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                      <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-sm mt-2">{reg.title}</h4>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{reg.content}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal Cabang ── */}
      <Modal
        isOpen={showBranchModal}
        onClose={() => setShowBranchModal(false)}
        title={editBranch ? 'Edit Cabang' : 'Tambah Cabang Baru'}
        size="md"
        footer={
          <>
            <button onClick={() => setShowBranchModal(false)} className="btn-secondary">Batal</button>
            <button onClick={branchForm.handleSubmit(onSubmitBranch)} disabled={savingBranch} className="btn-primary">
              {savingBranch ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</> : <><Save className="w-4 h-4" /> Simpan</>}
            </button>
          </>
        }
      >
        <form className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Nama Cabang *</label>
              <input className={`input ${branchForm.formState.errors.name ? 'input-error' : ''}`}
                placeholder="contoh: Cabang Bandung"
                {...branchForm.register('name', { required: 'Wajib diisi' })} />
              {branchForm.formState.errors.name && <p className="text-red-500 text-xs mt-1">{branchForm.formState.errors.name.message}</p>}
            </div>
            <div>
              <label className="label">Kode *</label>
              <input className={`input uppercase ${branchForm.formState.errors.code ? 'input-error' : ''}`}
                placeholder="contoh: BDG"
                {...branchForm.register('code', { required: 'Wajib diisi' })} />
              {branchForm.formState.errors.code && <p className="text-red-500 text-xs mt-1">{branchForm.formState.errors.code.message}</p>}
            </div>
            <div>
              <label className="label">Kota</label>
              <input className="input" placeholder="Jakarta" {...branchForm.register('city')} />
            </div>
            <div className="col-span-2">
              <label className="label">Alamat</label>
              <input className="input" placeholder="Jl. Contoh No. 1" {...branchForm.register('address')} />
            </div>
            <div>
              <label className="label">Telepon</label>
              <input className="input" placeholder="021-xxxxxxx" {...branchForm.register('phone')} />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" placeholder="cabang@perusahaan.com" {...branchForm.register('email')} />
            </div>
            <div className="col-span-2">
              <label className="label">Nama Manajer</label>
              <input className="input" placeholder="Nama kepala/manajer cabang" {...branchForm.register('managerName')} />
            </div>

            {/* Signature section — only shown when editing */}
            {editBranch && (
              <div className="col-span-2">
                <button
                  type="button"
                  onClick={() => setShowSigSection(v => !v)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-primary-600 transition-colors w-full"
                >
                  <PenLine className="w-4 h-4 text-primary-500" />
                  <span>Tanda Tangan Laporan Cabang</span>
                  <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${showSigSection ? 'rotate-180' : ''}`} />
                </button>
                {showSigSection && (
                  <div className="mt-3 space-y-3 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50 dark:bg-gray-800/30">
                    <p className="text-xs text-gray-400">
                      Nama ini akan muncul di halaman tanda tangan saat ekspor laporan PDF/Excel cabang ini.
                    </p>
                    <div>
                      <label className="label">Dibuat Oleh (Staff IT)</label>
                      <input className="input" placeholder="Nama staff IT..." value={sigCreator} onChange={e => setSigCreator(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Diperiksa Oleh (Kepala IT)</label>
                      <input className="input" placeholder="Nama kepala IT..." value={sigChecker} onChange={e => setSigChecker(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Disetujui Oleh (Manager)</label>
                      <input className="input" placeholder="Nama manager / direktur..." value={sigApprover} onChange={e => setSigApprover(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="label">Kantor Pusat?</label>
              <select className="input" {...branchForm.register('isHeadOffice')}>
                <option value={false}>Tidak</option>
                <option value={true}>Ya — Jadikan Pusat</option>
              </select>
            </div>
            {editBranch && (
              <div>
                <label className="label">Status</label>
                <select className="input" {...branchForm.register('isActive')}>
                  <option value={true}>Aktif</option>
                  <option value={false}>Nonaktif</option>
                </select>
              </div>
            )}
          </div>
        </form>
      </Modal>

      {/* ── Modal Regulasi ── */}
      <Modal
        isOpen={showRegModal}
        onClose={() => setShowRegModal(false)}
        title={editReg ? 'Edit Regulasi' : `Tambah Regulasi — ${selectedBranch?.name}`}
        size="md"
        footer={
          <>
            <button onClick={() => setShowRegModal(false)} className="btn-secondary">Batal</button>
            <button onClick={regForm.handleSubmit(onSubmitReg)} disabled={savingReg} className="btn-primary">
              {savingReg ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</> : <><Save className="w-4 h-4" /> Simpan</>}
            </button>
          </>
        }
      >
        <form className="space-y-4">
          <div>
            <label className="label">Judul Regulasi *</label>
            <input className={`input ${regForm.formState.errors.title ? 'input-error' : ''}`}
              placeholder="contoh: SLA Tiket Critical"
              {...regForm.register('title', { required: 'Wajib diisi' })} />
            {regForm.formState.errors.title && <p className="text-red-500 text-xs mt-1">{regForm.formState.errors.title.message}</p>}
          </div>

          <div>
            <label className="label">Tipe Regulasi</label>
            <select className="input" {...regForm.register('type')}>
              {Object.entries(REG_TYPE).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Isi Regulasi *</label>
            <textarea
              rows={5}
              className={`input resize-none ${regForm.formState.errors.content ? 'input-error' : ''}`}
              placeholder="Tulis ketentuan, prosedur, atau peraturan yang berlaku untuk cabang ini..."
              {...regForm.register('content', { required: 'Wajib diisi' })}
            />
            {regForm.formState.errors.content && <p className="text-red-500 text-xs mt-1">{regForm.formState.errors.content.message}</p>}
          </div>

          {editReg && (
            <div>
              <label className="label">Status</label>
              <select className="input" {...regForm.register('isActive')}>
                <option value={true}>Aktif</option>
                <option value={false}>Nonaktif</option>
              </select>
            </div>
          )}
        </form>
      </Modal>
    </DashboardLayout>
  );
}
