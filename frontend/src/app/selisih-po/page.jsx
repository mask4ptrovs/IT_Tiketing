'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../../components/layout/DashboardLayout';
import PDFPreviewModal from '../../components/ui/PDFPreviewModal';
import { selisihPOAPI } from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import toast from 'react-hot-toast';
import { useRef } from 'react';
import {
  Plus, Search, Download, Pencil, Trash2, Eye, X, FileText,
  ChevronLeft, ChevronRight, CheckCircle, Paperclip, Trash,
} from 'lucide-react';

const fmtRp = (n) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const STATUS_COLOR = { DRAFT:'bg-gray-100 text-gray-700', SUBMITTED:'bg-blue-100 text-blue-700', APPROVED:'bg-green-100 text-green-700', REJECTED:'bg-red-100 text-red-700', COMPLETED:'bg-emerald-100 text-emerald-700' };
const STATUSES = ['DRAFT','SUBMITTED','APPROVED','REJECTED','COMPLETED'];
const emptyItem = () => ({ itemName:'', supplier:'', qty:1, unit:'pcs', unitPrice:0 });
const emptyForm = () => ({ department:'', requestor:'', preparedBy:'', description:'', bankInfo:'', refPoNumber:'', refPoDate:'', refPoAmount:0, status:'DRAFT', sigDiajukan:'', sigMengetahui:'', items:[emptyItem()] });

export default function SelisihPOPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['selisih-po', page, search, statusF],
    queryFn: () => selisihPOAPI.list({ page, limit:10, search:search||undefined, status:statusF||undefined }).then(r=>r.data),
  });
  const rows = data?.data || [];
  const meta = data?.pagination || {};

  const deleteMut = useMutation({ mutationFn:(id)=>selisihPOAPI.delete(id), onSuccess:()=>{ qc.invalidateQueries(['selisih-po']); toast.success('PO dihapus'); } });

  const handleDownload = async (id, poNumber) => {
    try {
      const res = await selisihPOAPI.downloadPDF(id);
      const url = URL.createObjectURL(new Blob([res.data],{type:'application/pdf'}));
      const a = document.createElement('a'); a.href=url; a.download=`SPO-${poNumber}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Gagal download PDF'); }
  };

  // PDF Preview
  const [previewMeta, setPreviewMeta] = useState(null);
  const openPreview = useCallback((id, docNumber) => {
    setPreviewMeta({
      fetchFn:  () => selisihPOAPI.downloadPDF(id),
      filename: `PO-Selisih-${docNumber}.pdf`,
      title:    `Preview PO Selisih — ${docNumber}`,
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
      await selisihPOAPI.uploadAttachments(attachModal.id, fd);
      qc.invalidateQueries(['selisih-po']);
      // refresh attachModal data
      const fresh = await selisihPOAPI.get(attachModal.id).then(r => r.data.data);
      setAttachModal(fresh);
      toast.success('Lampiran berhasil diupload');
    } catch (err) { toast.error('Gagal upload lampiran: ' + (err?.response?.data?.message || err.message || '')); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleDeleteAttach = async (attachId) => {
    if (!confirm('Hapus lampiran ini?')) return;
    try {
      await selisihPOAPI.deleteAttachment(attachModal.id, attachId);
      qc.invalidateQueries(['selisih-po']);
      const fresh = await selisihPOAPI.get(attachModal.id).then(r => r.data.data);
      setAttachModal(fresh);
      toast.success('Lampiran dihapus');
    } catch { toast.error('Gagal menghapus lampiran'); }
  };

  const openCreate = () => { setForm(emptyForm()); setModal('create'); };
  const openEdit = (r) => {
    setSelected(r);
    setForm({ department:r.department||'', requestor:r.requestor||'', preparedBy:r.preparedBy||'', description:r.description||'', bankInfo:r.bankInfo||'', refPoNumber:r.refPoNumber||'', refPoDate:r.refPoDate||'', refPoAmount:r.refPoAmount||0, status:r.status, sigDiajukan:r.sigDiajukan||'', sigMengetahui:r.sigMengetahui||'', items:r.items?.map(i=>({itemName:i.itemName,supplier:i.supplier||'',qty:i.qty,unit:i.unit,unitPrice:i.unitPrice}))||[emptyItem()] });
    setModal('edit');
  };

  const setItem = (idx,field,val) => setForm(f=>({...f,items:f.items.map((it,i)=>i===idx?{...it,[field]:val}:it)}));
  const addItem = () => setForm(f=>({...f,items:[...f.items,emptyItem()]}));
  const remItem = (idx) => setForm(f=>({...f,items:f.items.filter((_,i)=>i!==idx)}));

  const handleSave = async () => {
    if (!form.department.trim()) { toast.error('Departemen wajib diisi'); return; }
    if (!form.requestor.trim()) { toast.error('Nama pemohon wajib diisi'); return; }
    if (!form.items[0]?.itemName?.trim()) { toast.error('Minimal satu item harus diisi'); return; }
    setSaving(true);
    try {
      if (modal==='create') await selisihPOAPI.create(form);
      else await selisihPOAPI.update(selected.id, form);
      qc.invalidateQueries(['selisih-po']); setModal(null);
      toast.success(modal==='create'?'PO Selisih dibuat':'PO Selisih diperbarui');
    } catch(e) { toast.error(e.response?.data?.message||'Gagal menyimpan'); }
    finally { setSaving(false); }
  };

  const totalBelanja = form.items.reduce((s,i)=>s+parseFloat(i.qty||0)*parseFloat(i.unitPrice||0),0);
  const selisih = totalBelanja - parseFloat(form.refPoAmount||0);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg"><Search className="w-6 h-6 text-amber-600" /></div>
            <div><h1 className="text-2xl font-bold text-gray-900">PO Selisih</h1><p className="text-sm text-gray-500">PO Selisih dan Klaim Penggantian</p></div>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"><Plus className="w-4 h-4" />Buat PO Selisih</button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Cari nomor PO, departemen..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" /></div>
            <select value={statusF} onChange={e=>{setStatusF(e.target.value);setPage(1);}} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"><option value="">Semua Status</option>{STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100"><tr>{['No. PO','Tanggal','Departemen','Pemohon','Total','Selisih','Status','Aksi'].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-50">
                {isLoading ? [...Array(5)].map((_,i)=><tr key={i}><td colSpan={8}><div className="h-4 bg-gray-100 rounded animate-pulse m-3" /></td></tr>)
                : rows.length===0 ? <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400"><p>Belum ada PO Selisih</p></td></tr>
                : rows.map(r=>{
                  const diff = (r.totalAmount||0)-(r.refPoAmount||0);
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-mono font-medium text-amber-700">{r.poNumber}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{fmtDate(r.poDate)}</td>
                      <td className="px-4 py-3 text-sm">{r.department}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{r.requestor}</td>
                      <td className="px-4 py-3 text-sm font-medium">{fmtRp(r.totalAmount)}</td>
                      <td className="px-4 py-3 text-sm font-semibold"><span className={diff>=0?'text-red-600':'text-green-600'}>{fmtRp(Math.abs(diff))}</span></td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.status]||''}`}>{r.status}</span></td>
                      <td className="px-4 py-3"><div className="flex items-center gap-1">
                        <button onClick={()=>{setSelected(r);setModal('view');}} className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg" title="Lihat detail"><Eye className="w-4 h-4" /></button>
                      <button onClick={()=>openPreview(r.id,r.poNumber)} className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg" title="Preview PDF"><FileText className="w-4 h-4" /></button>
                        <button onClick={()=>handleDownload(r.id,r.poNumber)} className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg"><Download className="w-4 h-4" /></button>
                        <button onClick={()=>setAttachModal(r)} title="Lampiran" className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"><Paperclip className="w-4 h-4" /></button>
                        <button onClick={()=>openEdit(r)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                        {(user?.role==='ADMIN'||user?.role==='IT_STAFF')&&<button onClick={()=>{if(confirm('Hapus?'))deleteMut.mutate(r.id);}} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>}
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {meta.totalPages>1&&<div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between"><p className="text-sm text-gray-500">Halaman {meta.page} dari {meta.totalPages}</p><div className="flex gap-2"><button onClick={()=>setPage(p=>p-1)} disabled={page===1} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button><button onClick={()=>setPage(p=>p+1)} disabled={page===meta.totalPages} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button></div></div>}
        </div>
      </div>

      {(modal==='create'||modal==='edit')&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold">{modal==='create'?'Buat PO Selisih Baru':`Edit — ${selected?.poNumber}`}</h2>
              <button onClick={()=>setModal(null)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto p-6 space-y-5 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[{l:'Departemen *',f:'department'},{l:'Nama Pemohon *',f:'requestor'},{l:'Disiapkan Oleh',f:'preparedBy'}].map(({l,f})=>(
                  <div key={f}><label className="block text-xs font-medium text-gray-600 mb-1">{l}</label><input value={form[f]} onChange={e=>setForm(s=>({...s,[f]:e.target.value}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" /></div>
                ))}
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Status</label><select value={form.status} onChange={e=>setForm(s=>({...s,status:e.target.value}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">{STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
                <div className="md:col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Keperluan</label><textarea value={form.description} onChange={e=>setForm(s=>({...s,description:e.target.value}))} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" /></div>
                <div className="md:col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Info Rekening Bank</label><textarea value={form.bankInfo} onChange={e=>setForm(s=>({...s,bankInfo:e.target.value}))} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" /></div>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-amber-800 mb-3">Referensi PO Awal</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">No. PO Referensi</label><input value={form.refPoNumber} onChange={e=>setForm(s=>({...s,refPoNumber:e.target.value}))} placeholder="IPO/I/2026/001" className="w-full px-3 py-2 border border-amber-200 bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" /></div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Tanggal PO Ref</label><input type="date" value={form.refPoDate?form.refPoDate.substring(0,10):''} onChange={e=>setForm(s=>({...s,refPoDate:e.target.value}))} className="w-full px-3 py-2 border border-amber-200 bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" /></div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Jumlah PO Ref (Rp)</label><input type="number" min="0" value={form.refPoAmount} onChange={e=>setForm(s=>({...s,refPoAmount:e.target.value}))} className="w-full px-3 py-2 border border-amber-200 bg-white rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-500" /></div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-semibold text-gray-700 uppercase">Daftar Item Aktual</h3><button onClick={addItem} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100"><Plus className="w-3 h-3" />Tambah</button></div>
                <table className="w-full text-sm"><thead><tr className="bg-amber-50">{['#','Nama Item','Supplier','Qty','Satuan','Harga','Total',''].map(h=><th key={h} className="px-3 py-2 text-left text-xs font-semibold text-amber-800">{h}</th>)}</tr></thead>
                  <tbody>{form.items.map((it,idx)=>(
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="px-3 py-2 text-gray-400 text-xs">{idx+1}</td>
                      <td className="px-3 py-2"><input value={it.itemName} onChange={e=>setItem(idx,'itemName',e.target.value)} placeholder="Nama item" className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none" /></td>
                      <td className="px-3 py-2"><input value={it.supplier} onChange={e=>setItem(idx,'supplier',e.target.value)} placeholder="Supplier" className="w-28 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none" /></td>
                      <td className="px-3 py-2"><input type="number" min="1" value={it.qty} onChange={e=>setItem(idx,'qty',e.target.value)} className="w-14 px-2 py-1 border border-gray-200 rounded text-xs text-center focus:outline-none" /></td>
                      <td className="px-3 py-2"><input value={it.unit} onChange={e=>setItem(idx,'unit',e.target.value)} className="w-14 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none" /></td>
                      <td className="px-3 py-2"><input type="number" min="0" value={it.unitPrice} onChange={e=>setItem(idx,'unitPrice',e.target.value)} className="w-28 px-2 py-1 border border-gray-200 rounded text-xs text-right focus:outline-none" /></td>
                      <td className="px-3 py-2 text-xs font-medium whitespace-nowrap">{fmtRp(parseFloat(it.qty||0)*parseFloat(it.unitPrice||0))}</td>
                      <td className="px-3 py-2">{form.items.length>1&&<button onClick={()=>remItem(idx)} className="p-1 text-red-400 hover:text-red-600 rounded"><X className="w-3 h-3" /></button>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-amber-800 mb-3">Ringkasan Selisih</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-600">Total Belanja Aktual</span><span className="font-semibold">{fmtRp(totalBelanja)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Jumlah PO Referensi</span><span className="font-semibold text-blue-700">{fmtRp(parseFloat(form.refPoAmount||0))}</span></div>
                  <div className="flex justify-between border-t border-amber-200 pt-2"><span className="font-bold text-amber-900">SELISIH</span><span className={`font-bold text-lg ${selisih>=0?'text-red-600':'text-green-600'}`}>{selisih>=0?'+':''}{fmtRp(selisih)}</span></div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[{l:'Yang Mengajukan',f:'sigDiajukan'},{l:'Yang Mengetahui',f:'sigMengetahui'}].map(({l,f})=>(
                  <div key={f}><label className="block text-xs font-medium text-gray-600 mb-1">{l}</label><input value={form[f]} onChange={e=>setForm(s=>({...s,[f]:e.target.value}))} placeholder="Nama / Jabatan" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" /></div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
              <button onClick={()=>setModal(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Batal</button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:opacity-60">
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
              <div><h2 className="text-lg font-bold">Detail PO Selisih</h2><p className="text-sm font-mono text-amber-700">{selected.poNumber}</p></div>
              <div className="flex items-center gap-2">
                <button onClick={()=>handleDownload(selected.id,selected.poNumber)} className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"><FileText className="w-4 h-4" />Preview</button>
                <button onClick={()=>handleDownload(selected.id,selected.poNumber)} className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700"><Download className="w-4 h-4" />PDF</button>
                <button onClick={()=>setModal(null)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="overflow-y-auto p-6 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-gray-500">Departemen</span><p className="font-medium">{selected.department}</p></div>
                <div><span className="text-gray-500">Status</span><p><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[selected.status]||''}`}>{selected.status}</span></p></div>
                <div><span className="text-gray-500">Total Belanja</span><p className="font-bold">{fmtRp(selected.totalAmount)}</p></div>
                <div><span className="text-gray-500">Selisih</span><p className={`font-bold ${((selected.totalAmount||0)-(selected.refPoAmount||0))>=0?'text-red-600':'text-green-600'}`}>{fmtRp(Math.abs((selected.totalAmount||0)-(selected.refPoAmount||0)))}</p></div>
              </div>
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
