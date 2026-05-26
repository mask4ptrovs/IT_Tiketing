'use client';

import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../../components/layout/DashboardLayout';
import PDFPreviewModal from '../../components/ui/PDFPreviewModal';
import { vendorPOAPI } from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import toast from 'react-hot-toast';
import {
  Plus, Search, Download, Pencil, Trash2, Eye, X, FileText,
  ChevronLeft, ChevronRight, CheckCircle, Paperclip, Trash,
} from 'lucide-react';

const fmtRp = (n) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '-';

const STATUS_COLOR = {
  DRAFT:'bg-gray-100 text-gray-700', SENT:'bg-blue-100 text-blue-700',
  CONFIRMED:'bg-green-100 text-green-700', COMPLETED:'bg-emerald-100 text-emerald-700',
  CANCELLED:'bg-red-100 text-red-700',
};
const STATUSES = ['DRAFT','SENT','CONFIRMED','COMPLETED','CANCELLED'];
const emptyItem = () => ({ productName:'', qty:1, unit:'pcs', unitPrice:0, notes:'' });
const emptyForm = () => ({
  supplierName:'', supplierPhone:'', supplierFax:'', supplierAddress:'',
  deliveryDate:'', deliveryAddress:'', receiverName:'', receiverPhone:'',
  paymentMethod:'', notes:'', discount:0, ppnEnabled:false, ppnPercent:11,
  status:'DRAFT', items:[emptyItem()],
});
const calcTotals = (form) => {
  const raw = form.items.reduce((s,i)=>s+(parseFloat(i.qty||0)*parseFloat(i.unitPrice||0)),0);
  const sub = raw - parseFloat(form.discount||0);
  const ppn = form.ppnEnabled ? sub*parseFloat(form.ppnPercent||11)/100 : 0;
  return { raw, subtotal:sub, ppnAmount:ppn, grandTotal:sub+ppn };
};

export default function VendorPOPage() {
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
    queryKey: ['vendor-po', page, search, statusF],
    queryFn: () => vendorPOAPI.list({ page, limit:10, search:search||undefined, status:statusF||undefined }).then(r=>r.data),
  });
  const rows = data?.data || [];
  const meta = data?.pagination || {};

  const deleteMut = useMutation({ mutationFn:(id)=>vendorPOAPI.delete(id), onSuccess:()=>{ qc.invalidateQueries(['vendor-po']); toast.success('PO dihapus'); } });

  const handleDownload = async (id, poNumber) => {
    try {
      const res = await vendorPOAPI.downloadPDF(id);
      const url = URL.createObjectURL(new Blob([res.data],{type:'application/pdf'}));
      const a = document.createElement('a'); a.href=url; a.download=`PO-${poNumber}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Gagal download PDF'); }
  };

  // ── PDF Preview state ─────────────────────────────────────────────────────
  const [previewMeta, setPreviewMeta] = useState(null); // {fetchFn, filename, title}
  const openPreview = useCallback((id, poNumber) => {
    setPreviewMeta({
      fetchFn:  () => vendorPOAPI.downloadPDF(id),
      filename: `PO-Vendor-${poNumber}.pdf`,
      title:    `Preview PO Vendor — ${poNumber}`,
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
      await vendorPOAPI.uploadAttachments(attachModal.id, fd);
      qc.invalidateQueries(['vendor-po']);
      // refresh attachModal data
      const fresh = await vendorPOAPI.get(attachModal.id).then(r => r.data.data);
      setAttachModal(fresh);
      toast.success('Lampiran berhasil diupload');
    } catch (err) { toast.error('Gagal upload lampiran: ' + (err?.response?.data?.message || err.message || '')); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleDeleteAttach = async (attachId) => {
    if (!confirm('Hapus lampiran ini?')) return;
    try {
      await vendorPOAPI.deleteAttachment(attachModal.id, attachId);
      qc.invalidateQueries(['vendor-po']);
      const fresh = await vendorPOAPI.get(attachModal.id).then(r => r.data.data);
      setAttachModal(fresh);
      toast.success('Lampiran dihapus');
    } catch { toast.error('Gagal menghapus lampiran'); }
  };

  const openCreate = () => { setForm(emptyForm()); setModal('create'); };
  const openEdit = (r) => {
    setSelected(r);
    setForm({ supplierName:r.supplierName, supplierPhone:r.supplierPhone||'', supplierFax:r.supplierFax||'', supplierAddress:r.supplierAddress||'', deliveryDate:r.deliveryDate||'', deliveryAddress:r.deliveryAddress||'', receiverName:r.receiverName||'', receiverPhone:r.receiverPhone||'', paymentMethod:r.paymentMethod||'', notes:r.notes||'', discount:r.discount||0, ppnEnabled:r.ppnEnabled||false, ppnPercent:r.ppnPercent||11, status:r.status, items:r.items?.map(i=>({productName:i.productName,qty:i.qty,unit:i.unit,unitPrice:i.unitPrice,notes:i.notes||''})) || [emptyItem()] });
    setModal('edit');
  };

  const setItem = (idx,field,val) => setForm(f=>({...f,items:f.items.map((it,i)=>i===idx?{...it,[field]:val}:it)}));
  const addItem = () => setForm(f=>({...f,items:[...f.items,emptyItem()]}));
  const remItem = (idx) => setForm(f=>({...f,items:f.items.filter((_,i)=>i!==idx)}));

  const handleSave = async () => {
    if (!form.supplierName.trim()) { toast.error('Nama supplier wajib diisi'); return; }
    if (!form.items[0]?.productName?.trim()) { toast.error('Minimal satu item harus diisi'); return; }
    setSaving(true);
    try {
      if (modal==='create') await vendorPOAPI.create(form);
      else await vendorPOAPI.update(selected.id, form);
      qc.invalidateQueries(['vendor-po']);
      setModal(null);
      toast.success(modal==='create'?'PO Vendor dibuat':'PO Vendor diperbarui');
    } catch(e) { toast.error(e.response?.data?.message||'Gagal menyimpan'); }
    finally { setSaving(false); }
  };

  const totals = calcTotals(form);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg"><FileText className="w-6 h-6 text-blue-600" /></div>
            <div><h1 className="text-2xl font-bold text-gray-900">Surat PO Vendor</h1><p className="text-sm text-gray-500">Purchase Order ke Supplier Eksternal</p></div>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" /> Buat PO Vendor
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Cari nomor PO, supplier..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <select value={statusF} onChange={e=>{setStatusF(e.target.value);setPage(1);}} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Semua Status</option>
              {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{['No. PO','Tanggal','Supplier','Total','Status','Aksi'].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {isLoading ? [...Array(5)].map((_,i)=><tr key={i}><td colSpan={6}><div className="h-4 bg-gray-100 rounded animate-pulse m-3" /></td></tr>)
                : rows.length===0 ? <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400"><FileText className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>Belum ada PO Vendor</p></td></tr>
                : rows.map(r=>(
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono font-medium text-blue-700">{r.poNumber}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{fmtDate(r.poDate)}</td>
                    <td className="px-4 py-3 text-sm text-gray-800">{r.supplierName}</td>
                    <td className="px-4 py-3 text-sm font-medium">{fmtRp(r.grandTotal)}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.status]||''}`}>{r.status}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={()=>{setSelected(r);setModal('view');}} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Lihat detail"><Eye className="w-4 h-4" /></button>
                        <button onClick={()=>openPreview(r.id,r.poNumber)} className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg" title="Preview PDF"><FileText className="w-4 h-4" /></button>
                        <button onClick={()=>handleDownload(r.id,r.poNumber)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Unduh PDF"><Download className="w-4 h-4" /></button>
                        <button onClick={()=>setAttachModal(r)} title="Lampiran" className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"><Paperclip className="w-4 h-4" /></button>
                        <button onClick={()=>openEdit(r)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                        {(user?.role==='ADMIN'||user?.role==='IT_STAFF')&&<button onClick={()=>{if(confirm('Hapus PO ini?'))deleteMut.mutate(r.id);}} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    </td>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{modal==='create'?'Buat PO Vendor Baru':`Edit PO — ${selected?.poNumber}`}</h2>
              <button onClick={()=>setModal(null)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto p-6 space-y-6 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[{l:'Nama Supplier *',f:'supplierName'},{l:'Telepon Supplier',f:'supplierPhone'},{l:'Fax Supplier',f:'supplierFax'},{l:'Cara Pembayaran',f:'paymentMethod'}].map(({l,f})=>(
                  <div key={f}><label className="block text-xs font-medium text-gray-600 mb-1">{l}</label><input value={form[f]} onChange={e=>setForm(s=>({...s,[f]:e.target.value}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                ))}
                <div className="md:col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Alamat Supplier</label><input value={form.supplierAddress} onChange={e=>setForm(s=>({...s,supplierAddress:e.target.value}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                {[{l:'Tgl Pengiriman',f:'deliveryDate',t:'date'},{l:'Penerima',f:'receiverName'},{l:'Telepon Penerima',f:'receiverPhone'}].map(({l,f,t})=>(
                  <div key={f}><label className="block text-xs font-medium text-gray-600 mb-1">{l}</label><input type={t||'text'} value={t==='date'&&form[f]?form[f].substring(0,10):form[f]} onChange={e=>setForm(s=>({...s,[f]:e.target.value}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                ))}
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Status</label><select value={form.status} onChange={e=>setForm(s=>({...s,status:e.target.value}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">{STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
                <div className="md:col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Alamat Pengiriman</label><input value={form.deliveryAddress} onChange={e=>setForm(s=>({...s,deliveryAddress:e.target.value}))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                <div className="md:col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Catatan</label><textarea value={form.notes} onChange={e=>setForm(s=>({...s,notes:e.target.value}))} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" /></div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase">Daftar Item</h3>
                  <button onClick={addItem} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100"><Plus className="w-3 h-3" /> Tambah</button>
                </div>
                <table className="w-full text-sm"><thead><tr className="bg-blue-50">{['#','Produk','Qty','Satuan','Harga','Total',''].map(h=><th key={h} className="px-3 py-2 text-left text-xs font-semibold text-blue-800">{h}</th>)}</tr></thead>
                  <tbody>{form.items.map((it,idx)=>(
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="px-3 py-2 text-gray-400 text-xs">{idx+1}</td>
                      <td className="px-3 py-2"><input value={it.productName} onChange={e=>setItem(idx,'productName',e.target.value)} placeholder="Nama produk" className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none" /></td>
                      <td className="px-3 py-2"><input type="number" min="1" value={it.qty} onChange={e=>setItem(idx,'qty',e.target.value)} className="w-16 px-2 py-1 border border-gray-200 rounded text-xs text-center focus:outline-none" /></td>
                      <td className="px-3 py-2"><input value={it.unit} onChange={e=>setItem(idx,'unit',e.target.value)} className="w-16 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none" /></td>
                      <td className="px-3 py-2"><input type="number" min="0" value={it.unitPrice} onChange={e=>setItem(idx,'unitPrice',e.target.value)} className="w-28 px-2 py-1 border border-gray-200 rounded text-xs text-right focus:outline-none" /></td>
                      <td className="px-3 py-2 text-xs font-medium whitespace-nowrap">{fmtRp(parseFloat(it.qty||0)*parseFloat(it.unitPrice||0))}</td>
                      <td className="px-3 py-2">{form.items.length>1&&<button onClick={()=>remItem(idx)} className="p-1 text-red-400 hover:text-red-600 rounded"><X className="w-3 h-3" /></button>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="flex justify-end">
                <div className="w-64 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{fmtRp(totals.raw)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-gray-500">Diskon</span><input type="number" min="0" value={form.discount} onChange={e=>setForm(s=>({...s,discount:e.target.value}))} className="w-28 px-2 py-1 border border-gray-200 rounded text-xs text-right focus:outline-none" /></div>
                  <div className="flex items-center gap-2"><input type="checkbox" id="ppn" checked={form.ppnEnabled} onChange={e=>setForm(s=>({...s,ppnEnabled:e.target.checked}))} /><label htmlFor="ppn" className="text-gray-500 text-xs">PPN</label>{form.ppnEnabled&&<input type="number" min="0" max="100" value={form.ppnPercent} onChange={e=>setForm(s=>({...s,ppnPercent:e.target.value}))} className="w-16 px-2 py-1 border border-gray-200 rounded text-xs text-right focus:outline-none" />}</div>
                  {form.ppnEnabled&&<div className="flex justify-between"><span className="text-gray-500">PPN ({form.ppnPercent}%)</span><span>{fmtRp(totals.ppnAmount)}</span></div>}
                  <div className="flex justify-between font-bold text-base border-t pt-2"><span>TOTAL</span><span className="text-blue-700">{fmtRp(totals.grandTotal)}</span></div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
              <button onClick={()=>setModal(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Batal</button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-60">
                {saving?<><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</>:<><CheckCircle className="w-4 h-4" />Simpan</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal==='view'&&selected&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div><h2 className="text-lg font-bold">Detail PO Vendor</h2><p className="text-sm font-mono text-blue-700">{selected.poNumber}</p></div>
              <div className="flex items-center gap-2">
                <button onClick={()=>openPreview(selected.id,selected.poNumber)} className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"><FileText className="w-4 h-4" />Preview</button>
                <button onClick={()=>handleDownload(selected.id,selected.poNumber)} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"><Download className="w-4 h-4" />PDF</button>
                <button onClick={()=>setModal(null)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="overflow-y-auto p-6 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-gray-500">Tanggal</span><p className="font-medium">{fmtDate(selected.poDate)}</p></div>
                <div><span className="text-gray-500">Status</span><p><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[selected.status]||''}`}>{selected.status}</span></p></div>
                <div><span className="text-gray-500">Supplier</span><p className="font-medium">{selected.supplierName}</p></div>
                <div><span className="text-gray-500">Total</span><p className="font-bold text-blue-700">{fmtRp(selected.grandTotal)}</p></div>
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

      {/* ── PDF Preview Modal ── */}
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
