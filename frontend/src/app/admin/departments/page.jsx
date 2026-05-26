'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Building2, Loader2 } from 'lucide-react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { TableSkeleton } from '../../../components/ui/Skeleton';
import EmptyState from '../../../components/ui/EmptyState';
import Modal from '../../../components/ui/Modal';
import { departmentAPI } from '../../../lib/api';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

export default function DepartmentsPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editDept, setEditDept] = useState(null);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const { data: departments, isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentAPI.list().then(r => r.data.data),
  });

  const openCreate = () => { setEditDept(null); reset(); setShowModal(true); };
  const openEdit = (d) => {
    setEditDept(d); reset({ name: d.name, code: d.code, description: d.description });
    setShowModal(true);
  };

  const onSubmit = async (data) => {
    setSaving(true);
    try {
      if (editDept) {
        await departmentAPI.update(editDept.id, data);
        toast.success('Departemen diperbarui');
      } else {
        await departmentAPI.create(data);
        toast.success('Departemen dibuat');
      }
      setShowModal(false);
      queryClient.invalidateQueries({ queryKey: ['departments'] });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout title="Kelola Departemen">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Kelola Departemen</h2>
            <p className="text-sm text-gray-500">{departments?.length ?? 0} departemen terdaftar</p>
          </div>
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4" /> Tambah Departemen
          </button>
        </div>

        <div className="card overflow-hidden">
          {isLoading ? <TableSkeleton rows={6} cols={5} /> : departments?.length === 0 ? (
            <EmptyState icon="users" title="Belum ada departemen" action={
              <button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> Tambah</button>
            } />
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Kode</th>
                    <th>Nama Departemen</th>
                    <th>Deskripsi</th>
                    <th>User</th>
                    <th>Tiket</th>
                    <th>Status</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map(d => (
                    <tr key={d.id}>
                      <td><span className="font-mono font-bold text-primary-600 text-sm">{d.code}</span></td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center">
                            <Building2 className="w-4 h-4 text-primary-600" />
                          </div>
                          <span className="font-medium text-gray-900 dark:text-white">{d.name}</span>
                        </div>
                      </td>
                      <td className="text-gray-500 text-xs max-w-xs truncate">{d.description || '-'}</td>
                      <td className="text-center">{d._count?.users || 0}</td>
                      <td className="text-center">{d._count?.tickets || 0}</td>
                      <td>
                        <span className={`badge ${d.isActive ? 'badge-green' : 'badge-red'}`}>
                          {d.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td>
                        <button onClick={() => openEdit(d)} className="btn-icon btn-secondary">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editDept ? 'Edit Departemen' : 'Tambah Departemen'}
        size="sm"
        footer={
          <>
            <button onClick={() => setShowModal(false)} className="btn-secondary">Batal</button>
            <button onClick={handleSubmit(onSubmit)} disabled={saving} className="btn-primary">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan'}
            </button>
          </>
        }
      >
        <form className="space-y-4">
          <div>
            <label className="label">Nama Departemen *</label>
            <input className={`input ${errors.name ? 'input-error' : ''}`}
              {...register('name', { required: 'Wajib diisi' })} />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          {!editDept && (
            <div>
              <label className="label">Kode *</label>
              <input className={`input uppercase ${errors.code ? 'input-error' : ''}`}
                placeholder="Contoh: IT, HR, FIN"
                {...register('code', { required: 'Wajib diisi' })} />
              {errors.code && <p className="text-red-500 text-xs mt-1">{errors.code.message}</p>}
            </div>
          )}
          <div>
            <label className="label">Deskripsi</label>
            <textarea rows={3} className="input resize-none" {...register('description')} />
          </div>
          {editDept && (
            <div>
              <label className="label">Status</label>
              <select className="input" {...register('isActive', { setValueAs: v => v === 'true' })}>
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
