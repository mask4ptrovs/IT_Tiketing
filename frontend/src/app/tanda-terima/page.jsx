'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../../components/layout/DashboardLayout';
import PDFPreviewModal from '../../components/ui/PDFPreviewModal';
import { tandaTerimaAPI } from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import toast from 'react-hot-toast';
import { useRef } from 'react';
import {
  Plus, Search, Download, Pencil, Trash2, Eye, X, FileText,
  ChevronLeft, ChevronRight, CheckCircle, Paperclip, Trash,
} from 'lucide-react';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const emptyItem = () => ({ description:'', itemDate:'' });
const emptyForm = () => ({ receivedFrom:'', addressedTo:'', ccTo:'', receivedBy:'', notes:'', sigPenyerah:'', sigPenerima:'', items:[emptyItem()] });

export default function TandaTerimaPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tanda-terima', page, search],
    queryFn: () => tandaTerimaAPI.list({ page, limit:10, search:search||undefined }).then(r=>r.data),
  });
  const rows = data?.data || [];
  const meta = data?.pagination || {};

  const deleteMut = useMutation({ mutationFn:(id)=>tandaTerimaAPI.delete(id), onSuccess:()=>{ qc.invalidateQueries(['tanda-terima']); toast.success('Tanda terima dihapus'); } });

  const handleDownload = async (id, ttNumber) => {
    try {
      const res = await tandaTerimaAPI.downloadPDF(id);
      const url = URL.createObjectURL(new Blob([res.data],{type:'application/pdf'}));
      const a = document.createElement('a'); a.href=url; a.download=`TT-${ttNumber}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Gagal download PDF'); }
  };

  // PDF Preview
  const [previewMeta, setPreviewMeta] = useState(null);
  const openPreview = useCallback((id, docNumber) => {
    setPreviewMeta({
      fetchFn:  () => tandaTerimaAPI.downloadPDF(id),
      filename: `Tanda-Terima-${docNumber}.pdf`,
      title:    `Preview Tanda Terima — ${docNumber}`,
    });
  }, []);


  // ── Attachment state ──────────────────────────────────────────────────────
  const [attachModal, setAttachModal] = useState(null); // holds the PO row
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace('/api','');

  const isImage = (mime) => mime && mime.startsWith('image/');

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length || !attachModal) return;
    const fd = new FormData();
    files.forEach(f => fd.append('photos', f));
    setUploading(true);
    try {
      await tandaTerimaAPI.uploadAttachments(attachModal.id, fd);
      qc.invalidateQueries(['tanda-terima']);
      // refresh attachModal data
      const fresh = await tandaTerimaAPI.get(attachModal.id).then(r => r.data.data);
      setAttachModal(fresh);
      toast.success('Lampiran berhasil diupload');
    } catch (err) { toast.error('Gagal upload lampiran: ' + (err?.response?.data?.message || err.message || '')); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleDeleteAttach = async (attachId) => {
    if (!confirm('Hapus lampiran ini?')) return;
    try {
      await tandaTerimaAPI.deleteAttachment(attachModal.id, attachId);
      qc.invalidateQueries(['tanda-terima']);
      const fresh = await tandaTerimaAPI.get(attachModal.id).then(r => r.data.data);
      setAttachModal(fresh);
      toast.success('Lampiran dihapus');
    } catch { toast.error('Gagal menghapus lampiran'); }
  };

  const openCreate = () => { setForm(emptyForm()); setModal('create'); };
  const openEdit = (r) => {
    setSelected(r);
    setForm({ receivedFrom:r.receivedFrom||'', addressedTo:r.addressedTo||'', ccTo:r.ccTo||'', receivedBy:r.receivedBy||'', notes:r.notes||'', sigPenyerah:r.sigPenyerah||'', sigPenerima:r.sigPenerima||'', items:r.items?.map(i=>({description:i.description, itemDate:i.itemDate?i.itemDate.substring(0,10):''}))||[emptyItem()] });
    setModal('edit');
  };

  const setItem = (idx,field,val) => setForm(f=>({...f,items:f.items.map((it,i)=>i===idx?{...it,[field]:val}:it)}));
  const addItem = () => setForm(f=>({...f,items:[...f.items,emptyItem()]}));
  const remItem = (idx) => setForm(f=>({...f,items:f.items.filter((_,i)=>i!==idx)}));

  const handleSave = async () => {
    if (!form.receivedFrom.trim()) { toast.error('Diterima dari wajib diisi'); return; }
    if (!form.addressedTo.trim()) { toast.error('Ditujukan kepada wajib diisi'); return; }
    if (!form.items[0]?.description?.trim()) { toast.error('Minimal satu item harus diisi'); return; }
    setSaving(true);
    try {
      if (modal==='create') await tandaTerimaAPI.create(form);
      else await tandaTerimaAPI.update(selected.id, form);
      qc.invalidateQueries(['tanda-terima']); setModal(null);
      toast.success(modal==='create'?'Tanda Terima dibuat':'Tanda Terima diperbarui');
    } catch(e) { toast.error(e.response?.data?.message||'Gagal menyimpan'); }
    finally { setSaving(false); }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg"><Download className="w-6 h-6 text-purple-600" /></div>
            <div><h1 className="text-2xl font-bold text-gray-900">Tanda Terima</h1><p className="text-sm text-gray-500">Dokumen Tanda Terima Barang dan Surat</p></div>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"><Plus className="w-4 h-4" />Buat Tanda Terima</button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Cari nomor TT, pengirim, penerima..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" /></div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100"><tr>{['No. TT','Tanggal','Diterima Dari','Ditujukan Kepada','Diterima Oleh','Item','Aksi'].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-50">
                {isLoading ? [...Array(5)].map((_,i)=><tr key={i}><td colSpan={7}><div className="h-4 bg-gray-100 rounded animate-pulse m-3" /></td></tr>)
                : rows.length===0 ? <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400"><p>Belum ada Tanda Terima</p></td></tr>
                : rows.map(r=>(
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono font-medium text-purple-700">{r.ttNumber}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{fmtDate(r.ttDate)}</td>
                    <td className="px-4 py-3 text-sm">{r.receivedFrom}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.addressedTo}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.receivedBy||'-'}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">{r.items?.length||0} item</span></td>
                    <td className="px-4 py-3"><div className="flex items-center gap-1">
                      <button onClick={()=>{setSelected(r);setModal('view');}} className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg" title="Lihat detail"><Eye className="w-4 h-4" /></button>
                      <button onClick={()=>openPreview(r.id,r.ttNumber)} className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg" title="Preview PDF"><FileText className="w-4 h-4" /></button>
                      <button onClick={()=>handleDownload(r.id,r.ttNumber)} className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg" title="Unduh PDF"><Download className="w-4 h-4" /></button>
                      <button onClick={()=>setAttachModal(r)} title="Lampiran" className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"><Paperclip className="w-4 h-4" /></button>
                      <button onClick={()=>openEdit(r)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                      {(user?.role==='ADMIN'||user?.role==='IT_STAFF')&&<button onClick={()=>{if(confirm('Hapus?'))deleteMut.mutate(r.id);}} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {meta.totalPages>1&&<div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between"><p className="text-sm text-gray-500">Halaman {meta.page} dari {meta.totalPages}</p><div className="flex gap-2"><button onClick={()=>setPage(p=>p-1)} disabled={page===1} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button><button onClick={()=>setPage(p=>p+1)} disabled={page===meta.totalPages} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button></div></div>}
        </div>
      </div>

      {(modal==='create'||modal==='edit')&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold">{modal==='create'?'Buat Tanda Terima Baru':`Edit — ${selected?.ttNumber}`}</h2>
              <button onClick={()=>setModal(null)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto p-6 space-y-5 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[{l:'Diterima Dari *',f:'receivedFrom'},{l:'Ditujukan Kepada *',f:'addressedTo'},{l:'Tembusan (CC)',f:'ccTo'},{l:'Diterima Oleh',f:'receivedBy'}].map(({l,f})=>(
                  <div key={f}><label className="block text-xs font-medium text-gray-600 mb-1">{l}</label><input value={form[f]} onChange={e=>setForm(s=>({...s,[f]:e.target.value}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" /></div>
                ))}
                <div className="md:col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Catatan</label><textarea value={form.notes} onChange={e=>setForm(s=>({...s,notes:e.target.value}))} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" /></div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-semibold text-gray-700 uppercase">Daftar Barang / Dokumen</h3><button onClick={addItem} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100"><Plus className="w-3 h-3" />Tambah</button></div>
                <div className="space-y-2">
                  {form.items.map((it,idx)=>(
                    <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center flex-shrink-0">{idx+1}</div>
                      <div className="flex-1 grid grid-cols-3 gap-2">
                        <div className="col-span-2"><input value={it.description} onChange={e=>setItem(idx,'description',e.target.value)} placeholder="Deskripsi barang atau dokumen *" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500" /></div>
                        <div><input type="date" value={it.itemDate} onChange={e=>setItem(idx,'itemDate',e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500" title="Tanggal item (opsional)" /></div>
                      </div>
                      {form.items.length>1&&<button onClick={()=>remItem(idx)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg flex-shrink-0"><X className="w-4 h-4" /></button>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[{l:'Yang Menyerahkan',f:'sigPenyerah'},{l:'Yang Menerima',f:'sigPenerima'}].map(({l,f})=>(
                  <div key={f}><label className="block text-xs font-medium text-gray-600 mb-1">{l}</label><input value={form[f]} onChange={e=>setForm(s=>({...s,[f]:e.target.value}))} placeholder="Nama / Jabatan" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" /></div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
              <button onClick={()=>setModal(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Batal</button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-60">
                {saving?<><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</>:<><CheckCircle className="w-4 h-4" />Simpan</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal==='view'&&selected&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div><h2 className="text-lg font-bold">Detail Tanda Terima</h2><p className="text-sm font-mono text-purple-700">{selected.ttNumber}</p></div>
              <div className="flex items-center gap-2">
                <button onClick={()=>openPreview(selected.id,selected.ttNumber)} className="flex items-center gap-2 px-3 py-1.5 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-600"><FileText className="w-4 h-4" />Preview</button>
                <button onClick={()=>handleDownload(selected.id,selected.ttNumber)} className="flex items-center gap-2 px-3 py-1.5 bg-purple-700 text-white text-sm rounded-lg hover:bg-purple-800"><Download className="w-4 h-4" />PDF</button>
                <button onClick={()=>setModal(null)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="overflow-y-auto p-6 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-gray-500">Tanggal</span><p className="font-medium">{fmtDate(selected.ttDate)}</p></div>
                <div><span className="text-gray-500">Diterima Oleh</span><p className="font-medium">{selected.receivedBy||'-'}</p></div>
                <div><span className="text-gray-500">Diterima Dari</span><p className="font-medium">{selected.receivedFrom}</p></div>
                <div><span className="text-gray-500">Ditujukan Kepada</span><p className="font-medium">{selected.addressedTo}</p></div>
              </div>
              {selected.items?.length>0&&(
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Daftar Item</h4>
                  <div className="space-y-2">
                    {selected.items.map((it,i)=>(
                      <div key={i} className="flex items-start gap-3 p-2 bg-gray-50 rounded-lg">
                        <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{it.itemNo||i+1}</div>
                        <div><p className="text-sm font-medium">{it.description}</p>{it.itemDate&&<p className="text-xs text-gray-400 mt-0.5">{fmtDate(it.itemDate)}</p>}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Attachment Modal ── */}
      {attachModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-900">Lampiran Foto / Dokumen</h2>
                <p className="text-xs text-gray-500 mt-0.5 font-mono">{attachModal.poNumber || attachModal.ttNumber}</p>
              </div>
              <button onClick={() => setAttachModal(null)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto p-5 flex-1 space-y-4">
              {/* Upload button */}
              <div>
                <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={handleUpload} />
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-60">
                  {uploading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Mengupload...</> : <><Paperclip className="w-4 h-4" />Upload Foto / Dokumen</>}
                </button>
                <p className="text-xs text-gray-400 mt-1">Format: JPG, PNG, PDF — Maks 10MB per file</p>
              </div>
              {/* Attachment list */}
              {(!attachModal.attachments || attachModal.attachments.length === 0) ? (
                <div className="text-center py-8 text-gray-400">
                  <Paperclip className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Belum ada lampiran</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {attachModal.attachments.map(att => (
                    <div key={att.id} className="relative group border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                      {isImage(att.mimeType) ? (
                        <a href={`${API_URL}${att.url.replace(/^https?:\/\/[^/]+/,'')}`} target="_blank" rel="noreferrer">
                          <img src={`${API_URL}${att.url.replace(/^https?:\/\/[^/]+/,'')}`} alt={att.originalName}
                            className="w-full h-32 object-cover" />
                        </a>
                      ) : (
                        <a href={`${API_URL}${att.url.replace(/^https?:\/\/[^/]+/,'')}`} target="_blank" rel="noreferrer"
                          className="flex flex-col items-center justify-center h-32 text-gray-400 hover:text-blue-600">
                          <Paperclip className="w-8 h-8 mb-1" />
                          <span className="text-xs px-2 text-center truncate w-full">{att.originalName}</span>
                        </a>
                      )}
                      <button onClick={() => handleDeleteAttach(att.id)}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600">
                        <Trash className="w-3 h-3" />
                      </button>
                      <p className="px-2 py-1 text-xs text-gray-500 truncate">{att.originalName}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 text-right">
              <button onClick={() => setAttachModal(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      <PDFPreviewModal
        isOpen={!!previewMeta}
        onClose={() => setPreviewMeta(null)}
        fetchFn={previewMeta?.fetchFn}
        filename={previewMeta?.filename}
        title={previewMeta?.title}
      />
    </DashboardLayout>
  );
}
