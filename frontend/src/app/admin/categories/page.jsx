'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Tag, Loader2 } from 'lucide-react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { TableSkeleton } from '../../../components/ui/Skeleton';
import Modal from '../../../components/ui/Modal';
import { categoryAPI } from '../../../lib/api';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

const CATEGORY_CODES = ['HARDWARE','SOFTWARE','NETWORK','EMAIL','PRINTER','SECURITY','OTHER'];

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editCat, setEditCat] = useState(null);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoryAPI.list().then(r => r.data.data),
  });

  const openCreate = () => { setEditCat(null); reset({ color: '#6366f1', slaHours: 24 }); setShowModal(true); };
  const openEdit = (c) => {
    setEditCat(c); reset({ name: c.name, description: c.description, color: c.color, slaHours: c.slaHours });
    setShowModal(true);
  };

  const onSubmit = async (data) => {
    setSaving(true);
    try {
      if (editCat) {
        await categoryAPI.update(editCat.id, { ...data, slaHours: parseInt(data.slaHours) });
        toast.success('Kategori diperbarui');
      } else {
        await categoryAPI.create({ ...data, slaHours: parseInt(data.slaHours) });
        toast.success('Kategori dibuat');
      }
      setShowModal(false);
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout title="Kelola Kategori">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Kelola Kategori</h2>
            <p className="text-sm text-gray-500">{categories?.length ?? 0} kategori</p>
          </div>
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4" /> Tambah Kategori
          </button>
        </div>

        <div className="card overflow-hidden">
          {isLoading ? <TableSkeleton rows={7} cols={6} /> : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Kategori</th>
                    <th>Kode</th>
                    <th>Deskripsi</th>
                    <th>SLA (Jam)</th>
                    <th>Total Tiket</th>
                    <th>Status</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {categories?.map(c => (
                    <tr key={c.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ background: c.color }} />
                          <span className="font-medium text-gray-900 dark:text-white">{c.name}</span>
                        </div>
                      </td>
                      <td><span className="font-mono text-xs badge badge-blue">{c.code}</span></td>
                      <td className="text-gray-500 text-xs max-w-xs truncate">{c.description || '-'}</td>
                      <td className="text-center font-medium">{c.slaHours}h</td>
                      <td className="text-center">{c._count?.tickets || 0}</td>
                      <td>
                        <span className={`badge ${c.isActive ? 'badge-green' : 'badge-red'}`}>
                          {c.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td>
                        <button onClick={() => openEdit(c)} className="btn-icon btn-secondary">
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
        title={editCat ? 'Edit Kategori' : 'Tambah Kategori'}
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
            <label className="label">Nama Kategori *</label>
            <input className={`input ${errors.name ? 'input-error' : ''}`}
              {...register('name', { required: 'Wajib diisi' })} />
          </div>
          {!editCat && (
            <div>
              <label className="label">Kode *</label>
              <select className={`input ${errors.code ? 'input-error' : ''}`}
                {...register('code', { required: 'Wajib dipilih' })}>
                <option value="">Pilih kode...</option>
                {CATEGORY_CODES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Warna</label>
              <div className="flex items-center gap-2">
                <input type="color" className="w-10 h-10 rounded cursor-pointer border border-gray-300 p-0.5" {...register('color')} />
                <input className="input flex-1" {...register('color')} />
              </div>
            </div>
            <div>
              <label className="label">SLA (Jam) *</label>
              <input type="number" min="1" max="720" className="input"
                {...register('slaHours', { required: 'Wajib diisi', min: 1 })} />
            </div>
          </div>
          <div>
            <label className="label">Deskripsi</label>
            <textarea rows={2} className="input resize-none" {...register('description')} />
          </div>
          {editCat && (
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
