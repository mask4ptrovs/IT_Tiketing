'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Upload, Trash2, Loader2, Save, Globe, Phone,
  Mail, MapPin, Tag, Image, CheckCircle2, AlertCircle,
} from 'lucide-react';
import DashboardLayout from '../../../components/layout/DashboardLayout';
import { settingAPI } from '../../../lib/api';
import toast from 'react-hot-toast';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace('/api', '');

export default function CompanySettingsPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    companyName: '',
    companyTagline: '',
    companyAddress: '',
    companyCity: '',
    companyPhone: '',
    companyEmail: '',
    companyWebsite: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [deletingLogo, setDeletingLogo] = useState(false);
  const [previewLogo, setPreviewLogo] = useState(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['company-settings'],
    queryFn: () => settingAPI.get().then(r => r.data.data),
  });

  // Populate form when data loads
  useEffect(() => {
    if (settings) {
      setForm({
        companyName:    settings.companyName    || '',
        companyTagline: settings.companyTagline || '',
        companyAddress: settings.companyAddress || '',
        companyCity:    settings.companyCity    || '',
        companyPhone:   settings.companyPhone   || '',
        companyEmail:   settings.companyEmail   || '',
        companyWebsite: settings.companyWebsite || '',
      });
    }
  }, [settings]);

  const logoUrl = settings?.companyLogo ? `${API_URL}${settings.companyLogo}` : null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingAPI.update(form);
      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
      toast.success('Pengaturan perusahaan berhasil disimpan');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan pengaturan');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Local preview
    const reader = new FileReader();
    reader.onloadend = () => setPreviewLogo(reader.result);
    reader.readAsDataURL(file);

    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      await settingAPI.uploadLogo(fd);
      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
      setPreviewLogo(null);
      toast.success('Logo berhasil diupload');
    } catch (err) {
      setPreviewLogo(null);
      toast.error(err.response?.data?.message || 'Gagal upload logo');
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteLogo = async () => {
    if (!confirm('Hapus logo perusahaan?')) return;
    setDeletingLogo(true);
    try {
      await settingAPI.deleteLogo();
      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
      toast.success('Logo berhasil dihapus');
    } catch {
      toast.error('Gagal menghapus logo');
    } finally {
      setDeletingLogo(false);
    }
  };

  const inputClass = 'input';
  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  if (isLoading) {
    return (
      <DashboardLayout title="Pengaturan Perusahaan">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Pengaturan Perusahaan">
      <div className="max-w-3xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary-600" />
              Pengaturan Perusahaan
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Data ini tampil di sidebar, header laporan PDF, dan file Excel yang diekspor
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary"
          >
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
              : <><Save className="w-4 h-4" /> Simpan Pengaturan</>
            }
          </button>
        </div>

        {/* Logo Section */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <Image className="w-4 h-4 text-gray-400" /> Logo Perusahaan
          </h3>

          <div className="flex items-start gap-6 flex-wrap">
            {/* Current logo preview */}
            <div className="flex-shrink-0">
              {(previewLogo || logoUrl) ? (
                <div className="relative group">
                  <img
                    src={previewLogo || logoUrl}
                    alt="Logo perusahaan"
                    className="w-24 h-24 object-contain rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-2"
                  />
                  {uploadingLogo && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-gray-900/70 rounded-xl">
                      <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex flex-col items-center justify-center">
                  <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center mb-1">
                    <span className="text-white font-bold text-sm">
                      {form.companyName ? form.companyName.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() : 'IT'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">No logo</p>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-48 space-y-3">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Upload logo dalam format <strong>PNG, JPG, SVG, atau WebP</strong>. Maksimal 2MB.
                  Rekomendasi ukuran: <strong>256×256px</strong> atau lebih.
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="btn-secondary"
                  >
                    {uploadingLogo
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                      : <><Upload className="w-4 h-4" /> Upload Logo</>
                    }
                  </button>
                  {logoUrl && (
                    <button
                      onClick={handleDeleteLogo}
                      disabled={deletingLogo}
                      className="btn-danger"
                    >
                      {deletingLogo
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <><Trash2 className="w-4 h-4" /> Hapus Logo</>
                      }
                    </button>
                  )}
                </div>
              </div>

              {/* Info card */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg p-3 flex gap-2">
                <AlertCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  Logo akan muncul di sidebar navigasi dan sebagai header pada laporan PDF yang diekspor.
                  Jika tidak ada logo, inisial nama perusahaan akan digunakan sebagai gantinya.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Company Info */}
        <div className="card p-6 space-y-5">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gray-400" /> Informasi Perusahaan
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="label">Nama Perusahaan *</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  className={`${inputClass} pl-9`}
                  placeholder="contoh: PT Maju Bersama Indonesia"
                  value={form.companyName}
                  onChange={set('companyName')}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Muncul di sidebar dan judul laporan</p>
            </div>

            <div className="md:col-span-2">
              <label className="label">Tagline / Sub-judul</label>
              <div className="relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  className={`${inputClass} pl-9`}
                  placeholder="contoh: Divisi IT & Infrastruktur"
                  value={form.companyTagline}
                  onChange={set('companyTagline')}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Teks kecil di bawah nama perusahaan pada sidebar</p>
            </div>
          </div>
        </div>

        {/* Address & Contact */}
        <div className="card p-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-2">
            <MapPin className="w-4 h-4 text-gray-400" /> Alamat &amp; Kontak
          </h3>
          <p className="text-xs text-gray-400 -mt-1">
            Ditampilkan pada header laporan PDF dan file Excel yang diekspor
          </p>

          <div>
            <label className="label">Alamat Lengkap</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <textarea
                rows={2}
                className={`${inputClass} pl-9 resize-none`}
                placeholder="Jl. Contoh No. 1, Kelurahan, Kecamatan"
                value={form.companyAddress}
                onChange={set('companyAddress')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Kota</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  className={`${inputClass} pl-9`}
                  placeholder="Jakarta Selatan"
                  value={form.companyCity}
                  onChange={set('companyCity')}
                />
              </div>
            </div>

            <div>
              <label className="label">Nomor Telepon</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  className={`${inputClass} pl-9`}
                  placeholder="(021) 1234-5678"
                  value={form.companyPhone}
                  onChange={set('companyPhone')}
                />
              </div>
            </div>

            <div>
              <label className="label">Email Perusahaan</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  className={`${inputClass} pl-9`}
                  placeholder="it@perusahaan.com"
                  value={form.companyEmail}
                  onChange={set('companyEmail')}
                />
              </div>
            </div>

            <div>
              <label className="label">Website</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  className={`${inputClass} pl-9`}
                  placeholder="https://www.perusahaan.com"
                  value={form.companyWebsite}
                  onChange={set('companyWebsite')}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Preview Card */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Preview Tampilan
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Sidebar preview */}
            <div>
              <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider font-medium">Sidebar</p>
              <div className="flex items-center gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 w-fit">
                {(previewLogo || logoUrl) ? (
                  <img src={previewLogo || logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-contain" />
                ) : (
                  <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-xs">
                      {form.companyName ? form.companyName.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() : 'IT'}
                    </span>
                  </div>
                )}
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white leading-none">
                    {form.companyName || 'IT Support'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {form.companyTagline || 'Ticketing System'}
                  </p>
                </div>
              </div>
            </div>

            {/* Report header preview */}
            <div>
              <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider font-medium">Header Laporan</p>
              <div className="rounded-xl overflow-hidden bg-indigo-600 px-4 py-3 text-white">
                <p className="text-sm font-bold leading-tight">{form.companyName || 'IT Support'}</p>
                <p className="text-xs opacity-80">{form.companyTagline || 'Ticketing System'}</p>
                {(form.companyAddress || form.companyCity) && (
                  <p className="text-xs opacity-60 mt-1">
                    {[form.companyAddress, form.companyCity].filter(Boolean).join(', ')}
                  </p>
                )}
                {(form.companyPhone || form.companyEmail) && (
                  <p className="text-xs opacity-60">
                    {[form.companyPhone, form.companyEmail].filter(Boolean).join('  •  ')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Save button bottom */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary px-8"
          >
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
              : <><Save className="w-4 h-4" /> Simpan Pengaturan</>
            }
          </button>
        </div>

      </div>
    </DashboardLayout>
  );
}
