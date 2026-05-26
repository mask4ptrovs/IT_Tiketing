'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { User, Lock, Save, Loader2 } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { authAPI, userAPI } from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import { RoleBadge } from '../../components/ui/Badge';
import { formatDateTime } from '../../lib/utils';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore();
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  const { register: rP, handleSubmit: hP, formState: { errors: eP } } = useForm({
    defaultValues: { name: user?.name, phone: user?.phone },
  });

  const { register: rPw, handleSubmit: hPw, reset: rPwReset, formState: { errors: ePw }, watch } = useForm();
  const newPwd = watch('newPassword');

  const saveProfile = async (data) => {
    setSavingProfile(true);
    try {
      const res = await userAPI.updateProfile(data);
      updateUser({ ...user, ...res.data.data });
      toast.success('Profil berhasil diperbarui');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal');
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (data) => {
    setSavingPwd(true);
    try {
      await authAPI.changePassword(data);
      rPwReset();
      toast.success('Password berhasil diubah. Silakan login ulang.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal mengubah password');
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <DashboardLayout title="Profil Saya">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Profil Saya</h2>
          <p className="text-sm text-gray-500 mt-0.5">Kelola informasi akun Anda</p>
        </div>

        {/* Profile card */}
        <div className="card p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-2xl flex items-center justify-center">
              <span className="text-primary-600 dark:text-primary-400 text-2xl font-bold">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{user?.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-gray-500">{user?.employeeId}</span>
                <span className="text-gray-300 dark:text-gray-700">·</span>
                <RoleBadge role={user?.role} />
              </div>
              <p className="text-xs text-gray-400 mt-1">{user?.department?.name || 'No department'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl mb-6 text-sm">
            <div>
              <p className="text-gray-500">Email</p>
              <p className="font-medium text-gray-900 dark:text-white mt-0.5">{user?.email}</p>
            </div>
            <div>
              <p className="text-gray-500">Bergabung</p>
              <p className="font-medium text-gray-900 dark:text-white mt-0.5">{formatDateTime(user?.createdAt)}</p>
            </div>
          </div>

          <form onSubmit={hP(saveProfile)} className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <User className="w-4 h-4" /> Edit Profil
            </h4>
            <div>
              <label className="label">Nama Lengkap</label>
              <input className={`input ${eP.name ? 'input-error' : ''}`}
                {...rP('name', { required: 'Nama wajib diisi' })} />
              {eP.name && <p className="text-red-500 text-xs mt-1">{eP.name.message}</p>}
            </div>
            <div>
              <label className="label">Nomor Telepon</label>
              <input type="tel" className="input" {...rP('phone')} />
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={savingProfile} className="btn-primary">
                {savingProfile ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</> : <><Save className="w-4 h-4" /> Simpan Profil</>}
              </button>
            </div>
          </form>
        </div>

        {/* Change password */}
        <div className="card p-6">
          <form onSubmit={hPw(changePassword)} className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Lock className="w-4 h-4" /> Ubah Password
            </h4>
            <div>
              <label className="label">Password Saat Ini</label>
              <input type="password" className={`input ${ePw.currentPassword ? 'input-error' : ''}`}
                {...rPw('currentPassword', { required: 'Wajib diisi' })} />
              {ePw.currentPassword && <p className="text-red-500 text-xs mt-1">{ePw.currentPassword.message}</p>}
            </div>
            <div>
              <label className="label">Password Baru</label>
              <input type="password" className={`input ${ePw.newPassword ? 'input-error' : ''}`}
                {...rPw('newPassword', { required: 'Wajib diisi', minLength: { value: 8, message: 'Min 8 karakter' } })} />
              {ePw.newPassword && <p className="text-red-500 text-xs mt-1">{ePw.newPassword.message}</p>}
            </div>
            <div>
              <label className="label">Konfirmasi Password Baru</label>
              <input type="password" className={`input ${ePw.confirmPassword ? 'input-error' : ''}`}
                {...rPw('confirmPassword', {
                  required: 'Wajib diisi',
                  validate: v => v === newPwd || 'Password tidak cocok',
                })} />
              {ePw.confirmPassword && <p className="text-red-500 text-xs mt-1">{ePw.confirmPassword.message}</p>}
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={savingPwd} className="btn-primary">
                {savingPwd ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</> : <><Lock className="w-4 h-4" /> Ubah Password</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
