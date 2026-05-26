'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Edit, Trash2, Loader2, Users, GitBranch,
  Building2, Filter, ChevronDown, Phone, Mail, KeyRound, Eye, EyeOff,
} from 'lucide-react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { RoleBadge } from '../../../components/ui/Badge';
import { TableSkeleton } from '../../../components/ui/Skeleton';
import EmptyState from '../../../components/ui/EmptyState';
import Pagination from '../../../components/ui/Pagination';
import Modal from '../../../components/ui/Modal';
import { userAPI, departmentAPI, branchAPI } from '../../../lib/api';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

export default function UsersAdminPage() {
  const queryClient = useQueryClient();
  const [page, setPage]               = useState(1);
  const [search, setSearch]           = useState('');
  const [roleFilter, setRoleFilter]   = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [showModal, setShowModal]         = useState(false);
  const [editUser, setEditUser]           = useState(null);
  const [saving, setSaving]               = useState(false);
  const [deletingId, setDeletingId]       = useState(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetTarget, setResetTarget]     = useState(null);   // { id, name }
  const [resetting, setResetting]         = useState(false);
  const [showNewPwd, setShowNewPwd]       = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm();
  const {
    register: registerReset,
    handleSubmit: handleSubmitReset,
    reset: resetResetForm,
    watch: watchReset,
    formState: { errors: resetErrors },
  } = useForm();

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['users', { page, search, role: roleFilter, branchId: branchFilter }],
    queryFn: () => userAPI.list({
      page, limit: 15, search: search || undefined,
      role: roleFilter || undefined,
      branchId: branchFilter || undefined,
    }).then(r => r.data),
  });

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentAPI.list({ active: 'true' }).then(r => r.data.data),
  });

  const { data: branchData } = useQuery({
    queryKey: ['branches-list'],
    queryFn: () => branchAPI.list({ limit: 100 }).then(r => r.data.data),
  });

  const users      = data?.data       || [];
  const pagination = data?.pagination;
  const branches   = branchData       || [];

  // ── Modal helpers ──────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditUser(null);
    reset({ role: 'USER' });
    setShowModal(true);
  };

  const openEdit = (user) => {
    setEditUser(user);
    reset({
      name:         user.name,
      email:        user.email,
      role:         user.role,
      phone:        user.phone        || '',
      departmentId: user.department?.id || '',
      branchId:     user.branch?.id    || '',
      isActive:     String(user.isActive),
    });
    setShowModal(true);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const onSubmit = async (formData) => {
    setSaving(true);
    try {
      const payload = {
        ...formData,
        departmentId: formData.departmentId || null,
        branchId:     formData.branchId     || null,
      };
      if (editUser) {
        await userAPI.update(editUser.id, { ...payload, isActive: payload.isActive === 'true' });
        toast.success('User berhasil diperbarui');
      } else {
        await userAPI.create(payload);
        toast.success('User berhasil dibuat');
      }
      setShowModal(false);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (userId, userName, ticketCount) => {
    const warning = ticketCount > 0
      ? `⚠️ User ini memiliki ${ticketCount} tiket yang akan ikut TERHAPUS PERMANEN.\n\n`
      : '';
    const confirmed = confirm(
      `🗑️ HAPUS PERMANEN user "${userName}"?\n\n${warning}` +
      `Tindakan ini akan:\n` +
      `• Menghapus akun user secara permanen\n` +
      `• Menghapus semua tiket yang dibuat user ini\n` +
      `• Menghapus semua komentar dan riwayat aktivitas\n\n` +
      `Tindakan ini TIDAK BISA DIBATALKAN!`
    );
    if (!confirmed) return;
    setDeletingId(userId);
    try {
      await userAPI.permanentDelete(userId);
      toast.success(`User "${userName}" berhasil dihapus permanen`);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menghapus user');
    } finally {
      setDeletingId(null);
    }
  };

  // ── Reset Password ─────────────────────────────────────────────────────────
  const openResetPassword = (user) => {
    setResetTarget({ id: user.id, name: user.name });
    resetResetForm();
    setShowNewPwd(false);
    setShowConfirmPwd(false);
    setShowResetModal(true);
  };

  const onResetSubmit = async ({ newPassword, confirmPassword }) => {
    if (newPassword !== confirmPassword) return;
    setResetting(true);
    try {
      await userAPI.resetPassword(resetTarget.id, { newPassword });
      toast.success(`Password "${resetTarget.name}" berhasil direset`);
      setShowResetModal(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal mereset password');
    } finally {
      setResetting(false);
    }
  };

  const activeFilters = [roleFilter, branchFilter].filter(Boolean).length;

  return (
    <DashboardLayout title="Kelola User">
      <div className="space-y-4">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-primary-600" /> Kelola User
            </h2>
            <p className="text-sm text-gray-500">{pagination?.total ?? 0} user terdaftar</p>
          </div>
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4" /> Tambah User
          </button>
        </div>

        {/* ── Filter bar ── */}
        <div className="card p-4 flex flex-wrap gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Cari nama, email, Employee ID..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>

          {/* Role filter */}
          <select
            className="input w-auto"
            value={roleFilter}
            onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
          >
            <option value="">Semua Role</option>
            <option value="USER">User</option>
            <option value="IT_STAFF">IT Staff</option>
            <option value="ADMIN">Admin</option>
          </select>

          {/* Branch filter */}
          <select
            className="input w-auto"
            value={branchFilter}
            onChange={e => { setBranchFilter(e.target.value); setPage(1); }}
          >
            <option value="">Semua Cabang</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>
                {b.isHeadOffice ? '★ ' : ''}{b.name}
              </option>
            ))}
          </select>

          {/* Reset filter */}
          {activeFilters > 0 && (
            <button
              onClick={() => { setRoleFilter(''); setBranchFilter(''); setSearch(''); setPage(1); }}
              className="btn-secondary text-xs"
            >
              Reset ({activeFilters})
            </button>
          )}
        </div>

        {/* ── Table ── */}
        <div className="card overflow-hidden">
          {isLoading ? (
            <TableSkeleton rows={8} cols={8} />
          ) : users.length === 0 ? (
            <EmptyState
              icon="users"
              title="Belum ada user"
              description={search || activeFilters ? 'Tidak ada user yang sesuai filter' : 'Tambahkan user pertama'}
              action={
                !search && !activeFilters
                  ? <button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> Tambah</button>
                  : null
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Employee ID</th>
                      <th>Nama</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Cabang</th>
                      <th>Departemen</th>
                      <th>Status</th>
                      <th>Tiket</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id}>
                        {/* Employee ID */}
                        <td>
                          <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                            {u.employeeId}
                          </span>
                        </td>

                        {/* Nama */}
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center text-xs font-bold text-primary-600 flex-shrink-0">
                              {u.name?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white text-sm leading-tight">{u.name}</p>
                              {u.phone && (
                                <p className="text-xs text-gray-400 flex items-center gap-0.5">
                                  <Phone className="w-3 h-3" />{u.phone}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="text-gray-500 text-xs">{u.email}</td>

                        {/* Role */}
                        <td><RoleBadge role={u.role} /></td>

                        {/* Cabang */}
                        <td>
                          {u.branch ? (
                            <div className="flex items-center gap-1.5">
                              <span className="w-5 h-5 bg-primary-100 dark:bg-primary-900/30 rounded flex items-center justify-center text-xs font-bold text-primary-600 flex-shrink-0">
                                {u.branch.code?.slice(0, 2)}
                              </span>
                              <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">{u.branch.name}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                          )}
                        </td>

                        {/* Departemen */}
                        <td className="text-xs text-gray-500">{u.department?.name || '—'}</td>

                        {/* Status */}
                        <td>
                          <span className={`badge ${u.isActive ? 'badge-green' : 'badge-red'}`}>
                            {u.isActive ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </td>

                        {/* Tiket */}
                        <td className="text-xs text-gray-500 text-center">{u._count?.createdTickets || 0}</td>

                        {/* Aksi */}
                        <td>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openEdit(u)}
                              className="btn-icon btn-secondary"
                              title="Edit user"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => openResetPassword(u)}
                              className="btn-icon"
                              title="Reset password"
                              style={{ color: '#d97706' }}
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(u.id, u.name, u._count?.createdTickets || 0)}
                              disabled={deletingId === u.id}
                              className="btn-icon btn-danger"
                              title="Hapus permanen"
                            >
                              {deletingId === u.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
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

      {/* ── Modal Reset Password ── */}
      <Modal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        title={
          <span className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-500" />
            Reset Password — <span className="text-amber-600">{resetTarget?.name}</span>
          </span>
        }
        size="sm"
        footer={
          <>
            <button onClick={() => setShowResetModal(false)} className="btn-secondary">Batal</button>
            <button
              onClick={handleSubmitReset(onResetSubmit)}
              disabled={resetting}
              className="btn-primary bg-amber-500 hover:bg-amber-600 focus:ring-amber-400"
            >
              {resetting
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Mereset...</>
                : <><KeyRound className="w-4 h-4" /> Reset Password</>}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-700 dark:text-amber-300">
            Password baru akan langsung aktif dan sesi login user akan diakhiri.
          </div>

          {/* New password */}
          <div>
            <label className="label">Password Baru *</label>
            <div className="relative">
              <input
                type={showNewPwd ? 'text' : 'password'}
                className={`input pr-10 ${resetErrors.newPassword ? 'input-error' : ''}`}
                placeholder="Minimal 8 karakter"
                {...registerReset('newPassword', {
                  required: 'Wajib diisi',
                  minLength: { value: 8, message: 'Minimal 8 karakter' },
                })}
              />
              <button
                type="button"
                onClick={() => setShowNewPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {resetErrors.newPassword && (
              <p className="text-red-500 text-xs mt-1">{resetErrors.newPassword.message}</p>
            )}
          </div>

          {/* Confirm password */}
          <div>
            <label className="label">Konfirmasi Password *</label>
            <div className="relative">
              <input
                type={showConfirmPwd ? 'text' : 'password'}
                className={`input pr-10 ${resetErrors.confirmPassword ? 'input-error' : ''}`}
                placeholder="Ulangi password baru"
                {...registerReset('confirmPassword', {
                  required: 'Wajib diisi',
                  validate: (val) => val === watchReset('newPassword') || 'Password tidak cocok',
                })}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showConfirmPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {resetErrors.confirmPassword && (
              <p className="text-red-500 text-xs mt-1">{resetErrors.confirmPassword.message}</p>
            )}
          </div>
        </div>
      </Modal>

      {/* ── Modal Tambah/Edit User ── */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editUser ? `Edit User — ${editUser.name}` : 'Tambah User Baru'}
        size="md"
        footer={
          <>
            <button onClick={() => setShowModal(false)} className="btn-secondary">Batal</button>
            <button onClick={handleSubmit(onSubmit)} disabled={saving} className="btn-primary">
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
                : 'Simpan'}
            </button>
          </>
        }
      >
        <form className="space-y-4">
          {/* Employee ID — hanya saat create */}
          {!editUser && (
            <div>
              <label className="label">Employee ID *</label>
              <input
                className={`input ${errors.employeeId ? 'input-error' : ''}`}
                placeholder="contoh: EMP-001"
                {...register('employeeId', { required: 'Wajib diisi' })}
              />
              {errors.employeeId && <p className="text-red-500 text-xs mt-1">{errors.employeeId.message}</p>}
            </div>
          )}

          {/* Nama */}
          <div>
            <label className="label">Nama Lengkap *</label>
            <input
              className={`input ${errors.name ? 'input-error' : ''}`}
              placeholder="Nama lengkap user"
              {...register('name', { required: 'Wajib diisi' })}
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="label">Email *</label>
            <input
              type="email"
              className={`input ${errors.email ? 'input-error' : ''}`}
              placeholder="user@perusahaan.com"
              {...register('email', { required: 'Wajib diisi' })}
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>

          {/* Password — hanya saat create */}
          {!editUser && (
            <div>
              <label className="label">Password *</label>
              <input
                type="password"
                className={`input ${errors.password ? 'input-error' : ''}`}
                placeholder="Minimal 8 karakter"
                {...register('password', {
                  required: 'Wajib diisi',
                  minLength: { value: 8, message: 'Minimal 8 karakter' },
                })}
              />
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>
          )}

          {/* Role + Telepon */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Role</label>
              <select className="input" {...register('role')}>
                <option value="USER">User</option>
                <option value="IT_STAFF">IT Staff</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div>
              <label className="label">Telepon</label>
              <input className="input" placeholder="08xx-xxxx-xxxx" {...register('phone')} />
            </div>
          </div>

          {/* Cabang */}
          <div>
            <label className="label flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5 text-gray-400" /> Cabang
            </label>
            <select className="input" {...register('branchId')}>
              <option value="">— Pilih cabang —</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.isHeadOffice ? '★ ' : ''}{b.name} ({b.code})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">Cabang tempat user ini bertugas</p>
          </div>

          {/* Departemen */}
          <div>
            <label className="label flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-gray-400" /> Departemen
            </label>
            <select className="input" {...register('departmentId')}>
              <option value="">— Pilih departemen —</option>
              {departments?.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Status — hanya saat edit */}
          {editUser && (
            <div>
              <label className="label">Status Akun</label>
              <select className="input" {...register('isActive')}>
                <option value="true">Aktif</option>
                <option value="false">Nonaktif</option>
              </select>
            </div>
          )}
        </form>
      </Modal>
    </DashboardLayout>
  );
}
