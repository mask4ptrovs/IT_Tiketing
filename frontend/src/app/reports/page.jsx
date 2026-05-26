'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileDown, Filter, BarChart3, FileSpreadsheet, FileText, Loader2,
  Calendar, ChevronDown, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle2, Clock, Ticket, Users, ShieldAlert, Award,
  PenLine, Download, RefreshCw, Eye, Save, MapPin, GitBranch,
} from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import PDFPreviewModal from '../../components/ui/PDFPreviewModal';
import { StatusBadge, PriorityBadge, SLABadge } from '../../components/ui/Badge';
import { TableSkeleton } from '../../components/ui/Skeleton';
import Pagination from '../../components/ui/Pagination';
import { reportAPI, departmentAPI, userAPI, settingAPI, branchAPI } from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import { formatDateTime, formatDate, downloadBlob } from '../../lib/utils';
import toast from 'react-hot-toast';

// ── Period preset helper ───────────────────────────────────────────────────────
function getPreset(preset) {
  const today = new Date();
  const pad = d => d.toISOString().split('T')[0];
  switch (preset) {
    case 'today':
      return { dateFrom: pad(today), dateTo: pad(today) };
    case 'week': {
      const mon = new Date(today);
      const day = today.getDay() || 7;
      mon.setDate(today.getDate() - day + 1);
      return { dateFrom: pad(mon), dateTo: pad(today) };
    }
    case 'month':
      return {
        dateFrom: pad(new Date(today.getFullYear(), today.getMonth(), 1)),
        dateTo: pad(today),
      };
    case 'last_month': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last  = new Date(today.getFullYear(), today.getMonth(), 0);
      return { dateFrom: pad(first), dateTo: pad(last) };
    }
    default:
      return null;
  }
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color, bgColor, borderColor }) {
  return (
    <div className={`relative overflow-hidden rounded-xl border ${borderColor} ${bgColor} p-5`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{value ?? '—'}</p>
          {sub && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
        </div>
        <div className={`${color} rounded-xl p-2.5`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  );
}

// ── Category bar ──────────────────────────────────────────────────────────────
function CategoryBar({ name, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 text-xs text-gray-600 dark:text-gray-400 truncate flex-shrink-0">{name}</span>
      <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">{count}</span>
      <span className="w-8 text-right text-xs text-gray-400">{pct}%</span>
    </div>
  );
}

const CAT_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-cyan-500', 'bg-teal-500',
  'bg-green-500', 'bg-amber-500', 'bg-orange-500', 'bg-rose-500',
];

// ── Signature block preview ───────────────────────────────────────────────────
function SignatureBlock({ title, role, name }) {
  return (
    <div className="flex flex-col items-center gap-1 flex-1 min-w-32">
      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{title}</p>
      <div className="w-full h-14 border-b-2 border-dashed border-gray-300 dark:border-gray-600 mt-2" />
      <p className="text-xs font-medium text-gray-800 dark:text-gray-200 mt-1">{name}</p>
      <p className="text-xs text-gray-400">{role}</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const todayStr = new Date().toISOString().split('T')[0];
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [activePreset, setActivePreset] = useState('month');
  const [filters, setFilters] = useState({ ...getPreset('month') });
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [showSignaturePreview, setShowSignaturePreview] = useState(false);
  const [savingSig, setSavingSig] = useState(false);

  // Admin: branch filter; IT_STAFF/USER: locked to own branch
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const isAdmin = user?.role === 'ADMIN';
  const userBranchId = (user?.role === 'IT_STAFF' || user?.role === 'USER') ? (user?.branchId || null) : null;
  const effectiveBranchId = isAdmin ? (selectedBranchId || null) : userBranchId;

  // Signature fields
  const [sigCreator, setSigCreator]   = useState('');
  const [sigChecker, setSigChecker]   = useState('');
  const [sigApprover, setSigApprover] = useState('');

  const applyPreset = (preset) => {
    const dates = getPreset(preset);
    if (dates) {
      setFilters(f => ({ ...f, ...dates }));
      setActivePreset(preset);
      setPage(1);
    }
  };

  // Branches list for admin filter
  const { data: branchesData } = useQuery({
    queryKey: ['branches-report'],
    queryFn: () => branchAPI.list({ limit: 100 }).then(r => r.data.data || []),
    enabled: isAdmin,
  });
  const branches = branchesData || [];

  const reportFilters = {
    ...filters,
    ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
  };

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['reports', reportFilters],
    queryFn: () => reportAPI.list(reportFilters).then(r => r.data.data),
  });

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentAPI.list({ active: 'true' }).then(r => r.data.data),
  });

  const itStaffFilters = { role: 'IT_STAFF', limit: 100, ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}) };
  const { data: itStaffData } = useQuery({
    queryKey: ['itStaff', effectiveBranchId],
    queryFn: () => userAPI.list(itStaffFilters).then(r => r.data.data),
  });

  const { data: companySettings } = useQuery({
    queryKey: ['company-settings'],
    queryFn: () => settingAPI.get().then(r => r.data.data),
    staleTime: 5 * 60 * 1000,
  });

  // Load branch data (for signatures) — based on effectiveBranchId
  const { data: activeBranchData } = useQuery({
    queryKey: ['branch-detail', effectiveBranchId],
    queryFn: () => branchAPI.get(effectiveBranchId).then(r => r.data.data),
    enabled: !!effectiveBranchId,
  });

  // Pre-fill signature fields from the active branch's saved signatures
  useEffect(() => {
    if (activeBranchData) {
      setSigCreator(activeBranchData.sigCreator  || '');
      setSigChecker(activeBranchData.sigChecker  || '');
      setSigApprover(activeBranchData.sigApprover || '');
    } else {
      // fallback: clear when no branch selected
      setSigCreator('');
      setSigChecker('');
      setSigApprover('');
    }
  }, [activeBranchData]);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace('/api', '');
  const companyLogoUrl = companySettings?.companyLogo ? `${API_URL}${companySettings.companyLogo}` : null;

  const handleSaveSignatures = async () => {
    if (!effectiveBranchId) {
      toast.error('Pilih cabang terlebih dahulu untuk menyimpan tanda tangan');
      return;
    }
    setSavingSig(true);
    try {
      await branchAPI.updateSignatures(effectiveBranchId, { sigCreator, sigChecker, sigApprover });
      queryClient.invalidateQueries({ queryKey: ['branch-detail', effectiveBranchId] });
      toast.success('Nama tanda tangan cabang berhasil disimpan');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan nama tanda tangan');
    } finally {
      setSavingSig(false);
    }
  };

  const handleExport = async (type) => {
    setExporting(type);
    try {
      const exportFilters = {
        ...filters,
        ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
        sigCreator: sigCreator || undefined,
        sigChecker: sigChecker || undefined,
        sigApprover: sigApprover || undefined,
      };
      const res = type === 'excel'
        ? await reportAPI.exportExcel(exportFilters)
        : await reportAPI.exportPDF(exportFilters);
      const ext = type === 'excel' ? 'xlsx' : 'pdf';
      downloadBlob(res.data, `laporan-IT-${filters.dateFrom}-sd-${filters.dateTo}.${ext}`);
      toast.success(`Laporan ${type === 'excel' ? 'Excel' : 'PDF'} berhasil diunduh`);
    } catch {
      toast.error('Gagal mengekspor laporan');
    } finally {
      setExporting(null);
    }
  };

  const previewFetchFn = useCallback(() => {
    const exportFilters = {
      ...filters,
      ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
      sigCreator: sigCreator || undefined,
      sigChecker: sigChecker || undefined,
      sigApprover: sigApprover || undefined,
    };
    return reportAPI.exportPDF(exportFilters);
  }, [filters, effectiveBranchId, sigCreator, sigChecker, sigApprover]);

  const tickets  = data?.tickets  || [];
  const summary  = data?.summary;
  const byCategory = summary?.byCategory || {};

  const PAGE_SIZE = 20;
  const paginatedTickets = tickets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const slaRate = summary?.total > 0
    ? Math.round((summary.resolvedWithinSLA / summary.total) * 100)
    : 0;

  const categoryEntries = useMemo(() =>
    Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8),
    [byCategory]
  );

  const presets = [
    { id: 'today',      label: 'Hari Ini' },
    { id: 'week',       label: 'Minggu Ini' },
    { id: 'month',      label: 'Bulan Ini' },
    { id: 'last_month', label: 'Bulan Lalu' },
    { id: 'custom',     label: 'Custom' },
  ];

  return (
    <DashboardLayout title="Laporan">
      <div className="space-y-6">

        {/* ── Header ── */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 p-6 text-white shadow-lg">
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {companyLogoUrl ? (
                <img src={companyLogoUrl} alt="Logo" className="w-10 h-10 rounded-lg object-contain bg-white/20 p-1" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                  <BarChart3 className="w-5 h-5" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-medium opacity-80 uppercase tracking-wider">
                    {companySettings?.companyName || 'IT Support'}
                  </span>
                  {/* Branch badge — shown for IT_STAFF/USER or when admin has selected a branch */}
                  {(user?.branch && !isAdmin) && (
                    <span className="inline-flex items-center gap-1 bg-white/20 border border-white/30 rounded-full px-2 py-0.5 text-xs font-semibold">
                      <MapPin className="w-2.5 h-2.5" />
                      {user.branch.isHeadOffice ? '★ ' : ''}{user.branch.name}
                      <span className="opacity-70">· {user.branch.code}</span>
                    </span>
                  )}
                  {isAdmin && selectedBranchId && (
                    <span className="inline-flex items-center gap-1 bg-white/20 border border-white/30 rounded-full px-2 py-0.5 text-xs font-semibold">
                      <MapPin className="w-2.5 h-2.5" />
                      {branches.find(b => b.id === selectedBranchId)?.name}
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-bold">Laporan Tiket &amp; Performa</h1>
                <p className="text-sm opacity-75 mt-1">
                  {filters.dateFrom === filters.dateTo
                    ? formatDate(filters.dateFrom)
                    : `${formatDate(filters.dateFrom)} — ${formatDate(filters.dateTo)}`
                  }
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white border border-white/30 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={() => handleExport('excel')}
                disabled={exporting !== null}
                className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow transition-colors"
              >
                {exporting === 'excel' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                Export Excel
              </button>
              <button
                onClick={() => setPdfPreviewOpen(true)}
                disabled={exporting !== null}
                className="flex items-center gap-1.5 bg-purple-500 hover:bg-purple-400 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                Preview PDF
              </button>
              <button
                onClick={() => handleExport('pdf')}
                disabled={exporting !== null}
                className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-400 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow transition-colors"
              >
                {exporting === 'pdf' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                Export PDF
              </button>
            </div>
          </div>
        </div>

        {/* ── Period tabs + Filters ── */}
        <div className="card p-5 space-y-4">
          {/* Period presets */}
          <div className="flex flex-wrap items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <div className="flex flex-wrap gap-1.5">
              {presets.map(p => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
                    activePreset === p.id
                      ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-primary-400'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom date range (always visible) */}
          <div className={`grid gap-3 ${isAdmin ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5' : 'grid-cols-2 md:grid-cols-4'}`}>
            <div>
              <label className="label">Tanggal Dari</label>
              <input type="date" className="input" value={filters.dateFrom}
                max={filters.dateTo}
                onChange={e => { setFilters(p => ({ ...p, dateFrom: e.target.value })); setActivePreset('custom'); setPage(1); }} />
            </div>
            <div>
              <label className="label">Tanggal Sampai</label>
              <input type="date" className="input" value={filters.dateTo}
                min={filters.dateFrom} max={todayStr}
                onChange={e => { setFilters(p => ({ ...p, dateTo: e.target.value })); setActivePreset('custom'); setPage(1); }} />
            </div>
            {/* Admin-only: branch filter */}
            {isAdmin && (
              <div>
                <label className="label flex items-center gap-1">
                  <GitBranch className="w-3 h-3" /> Cabang
                </label>
                <select className="input"
                  value={selectedBranchId}
                  onChange={e => { setSelectedBranchId(e.target.value); setPage(1); }}>
                  <option value="">Semua Cabang</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.isHeadOffice ? '★ ' : ''}{b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {/* Non-admin: show locked branch info */}
            {!isAdmin && user?.branch && (
              <div>
                <label className="label flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Cabang
                </label>
                <div className="input flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 cursor-not-allowed text-gray-500">
                  <MapPin className="w-3.5 h-3.5 text-primary-500 flex-shrink-0" />
                  <span className="truncate text-sm">{user.branch.name}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{user.branch.code}</span>
                </div>
              </div>
            )}
            <div>
              <label className="label">Departemen</label>
              <select className="input"
                onChange={e => { setFilters(p => ({ ...p, departmentId: e.target.value || undefined })); setPage(1); }}>
                <option value="">Semua Departemen</option>
                {departments?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Teknisi</label>
              <select className="input"
                onChange={e => { setFilters(p => ({ ...p, assigneeId: e.target.value || undefined })); setPage(1); }}>
                <option value="">Semua Teknisi</option>
                {itStaffData?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ── Stat cards ── */}
        {summary ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard icon={Ticket}       label="Total Tiket"     value={summary.total}
              sub="dalam periode ini"
              color="bg-violet-600" bgColor="bg-violet-50 dark:bg-violet-900/20" borderColor="border-violet-200 dark:border-violet-800" />
            <StatCard icon={Clock}        label="Open"            value={summary.byStatus?.OPEN || 0}
              sub="menunggu penanganan"
              color="bg-blue-600" bgColor="bg-blue-50 dark:bg-blue-900/20" borderColor="border-blue-200 dark:border-blue-800" />
            <StatCard icon={TrendingUp}   label="On Progress"     value={summary.byStatus?.ON_PROGRESS || 0}
              sub="sedang dikerjakan"
              color="bg-amber-500" bgColor="bg-amber-50 dark:bg-amber-900/20" borderColor="border-amber-200 dark:border-amber-800" />
            <StatCard icon={CheckCircle2} label="Selesai"         value={(summary.byStatus?.RESOLVED || 0) + (summary.byStatus?.CLOSED || 0)}
              sub="resolved + closed"
              color="bg-emerald-600" bgColor="bg-emerald-50 dark:bg-emerald-900/20" borderColor="border-emerald-200 dark:border-emerald-800" />
            <StatCard icon={ShieldAlert}  label="SLA Breached"    value={summary.slaBreached}
              sub="melewati batas waktu"
              color="bg-rose-600" bgColor="bg-rose-50 dark:bg-rose-900/20" borderColor="border-rose-200 dark:border-rose-800" />
            <StatCard icon={Award}        label="SLA Rate"        value={`${slaRate}%`}
              sub={`${summary.resolvedWithinSLA} dari ${summary.total} tiket`}
              color="bg-teal-600" bgColor="bg-teal-50 dark:bg-teal-900/20" borderColor="border-teal-200 dark:border-teal-800" />
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="card p-5 animate-pulse">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-3" />
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : null}

        {/* ── Middle row: SLA gauge + Category bars ── */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* SLA Performance */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                <Award className="w-4 h-4 text-teal-500" /> Performa SLA
              </h3>
              <div className="flex items-center gap-4">
                {/* Circle gauge */}
                <div className="relative w-24 h-24 flex-shrink-0">
                  <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none"
                      className="stroke-gray-100 dark:stroke-gray-700" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.9" fill="none"
                      stroke={slaRate >= 80 ? '#10B981' : slaRate >= 60 ? '#F59E0B' : '#EF4444'}
                      strokeWidth="3" strokeDasharray={`${slaRate} ${100 - slaRate}`}
                      strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-bold text-gray-900 dark:text-white">{slaRate}%</span>
                    <span className="text-xs text-gray-400">SLA</span>
                  </div>
                </div>
                <div className="flex-1 space-y-3">
                  {[
                    { label: 'Selesai tepat waktu', val: summary.resolvedWithinSLA, color: 'bg-emerald-500' },
                    { label: 'SLA Breached',         val: summary.slaBreached,        color: 'bg-rose-500' },
                    { label: 'Masih berjalan',       val: Math.max(0, summary.total - summary.resolvedWithinSLA - summary.slaBreached), color: 'bg-blue-500' },
                  ].map(row => (
                    <div key={row.label} className="flex items-center gap-2 text-xs">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${row.color}`} />
                      <span className="flex-1 text-gray-600 dark:text-gray-400">{row.label}</span>
                      <span className="font-semibold text-gray-800 dark:text-gray-200">{row.val}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Priority breakdown */}
              <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700 grid grid-cols-4 gap-2 text-center text-xs">
                {[
                  { label: 'Low',      val: summary.byPriority?.LOW || 0,      cls: 'text-emerald-600' },
                  { label: 'Medium',   val: summary.byPriority?.MEDIUM || 0,   cls: 'text-blue-600' },
                  { label: 'High',     val: summary.byPriority?.HIGH || 0,     cls: 'text-amber-600' },
                  { label: 'Critical', val: summary.byPriority?.CRITICAL || 0, cls: 'text-rose-600' },
                ].map(p => (
                  <div key={p.label}>
                    <p className={`text-lg font-bold ${p.cls}`}>{p.val}</p>
                    <p className="text-gray-400">{p.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Category breakdown */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-violet-500" /> Distribusi Kategori
              </h3>
              {categoryEntries.length > 0 ? (
                <div className="space-y-3">
                  {categoryEntries.map(([name, count], i) => (
                    <CategoryBar key={name} name={name} count={count} total={summary.total} color={CAT_COLORS[i % CAT_COLORS.length]} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">Tidak ada data kategori</p>
              )}
            </div>
          </div>
        )}

        {/* ── Signature preview / setup ── */}
        <div className="card">
          <button
            onClick={() => setShowSignaturePreview(v => !v)}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors rounded-xl"
          >
            <div className="flex items-center gap-2">
              <PenLine className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-semibold text-gray-800 dark:text-white">Pengaturan Tanda Tangan Laporan</span>
              <span className="text-xs text-gray-400 ml-2">— akan muncul di halaman tanda tangan PDF &amp; Excel</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showSignaturePreview ? 'rotate-180' : ''}`} />
          </button>

          {showSignaturePreview && (
            <div className="border-t border-gray-100 dark:border-gray-700 p-5 space-y-5">
              {/* Branch context notice */}
              {!effectiveBranchId && isAdmin && (
                <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Pilih cabang di filter atas untuk memuat & menyimpan tanda tangan spesifik cabang tersebut.
                  </p>
                </div>
              )}
              {effectiveBranchId && activeBranchData && (
                <div className="flex items-center gap-2 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg px-4 py-3">
                  <MapPin className="w-4 h-4 text-primary-500 flex-shrink-0" />
                  <p className="text-xs text-primary-700 dark:text-primary-400">
                    Tanda tangan untuk <strong>{activeBranchData.name}</strong> ({activeBranchData.code}).
                    Setiap cabang memiliki nama tanda tangan yang berbeda.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  <input className="input" placeholder="Nama manager..." value={sigApprover} onChange={e => setSigApprover(e.target.value)} />
                </div>
              </div>

              {/* Preview */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-dashed border-gray-200 dark:border-gray-700">
                <p className="text-xs text-center text-gray-500 mb-4 uppercase tracking-widest font-medium">Preview Halaman Tanda Tangan</p>
                <div className="flex items-start justify-around gap-4 px-4">
                  <SignatureBlock title="Dibuat Oleh" role="Staff IT" name={sigCreator || '( ________________ )'} />
                  <SignatureBlock title="Diperiksa Oleh" role="Kepala IT" name={sigChecker || '( ________________ )'} />
                  <SignatureBlock title="Disetujui Oleh" role="Manager" name={sigApprover || '( ________________ )'} />
                </div>
                <p className="text-xs text-center text-gray-400 mt-4">
                  Jakarta, {formatDate(new Date().toISOString())}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Save signatures */}
                <button
                  onClick={handleSaveSignatures}
                  disabled={savingSig}
                  className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {savingSig
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
                    : <><Save className="w-4 h-4" /> Simpan Nama TTD</>
                  }
                </button>

                {/* Export buttons */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleExport('excel')}
                    disabled={exporting !== null}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    {exporting === 'excel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                    Export Excel dengan TTD
                  </button>
                  <button
                    onClick={() => setPdfPreviewOpen(true)}
                    disabled={exporting !== null}
                    className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    Preview PDF
                  </button>
                  <button
                    onClick={() => handleExport('pdf')}
                    disabled={exporting !== null}
                    className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    {exporting === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    Export PDF dengan TTD
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Data table ── */}
        <div className="card overflow-hidden">
          <div className="card-header flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Detail Data Tiket
              </h3>
              <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs font-medium px-2 py-0.5 rounded-full">
                {tickets.length} records
              </span>
            </div>
          </div>

          {isLoading ? <TableSkeleton rows={10} cols={9} /> : (
            <>
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>No. Tiket</th>
                      <th>Judul</th>
                      <th>Status</th>
                      <th>Prioritas</th>
                      <th>Kategori</th>
                      <th>Pelapor</th>
                      <th>Teknisi</th>
                      <th>SLA</th>
                      <th>Tanggal Buat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTickets.map(ticket => (
                      <tr key={ticket.id}>
                        <td>
                          <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                            {ticket.ticketNo}
                          </span>
                        </td>
                        <td>
                          <p className="font-medium max-w-xs truncate text-gray-900 dark:text-white">{ticket.title}</p>
                          {ticket.description && (
                            <p className="text-xs text-gray-400 truncate max-w-xs">{ticket.description}</p>
                          )}
                        </td>
                        <td><StatusBadge status={ticket.status} /></td>
                        <td><PriorityBadge priority={ticket.priority} /></td>
                        <td>
                          <span className="text-xs bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 px-2 py-0.5 rounded-full">
                            {ticket.category?.name || ticket.category || '-'}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center text-xs font-bold text-primary-600 flex-shrink-0">
                              {ticket.creator?.name?.charAt(0)}
                            </div>
                            <span className="text-xs text-gray-600 dark:text-gray-400">{ticket.creator?.name}</span>
                          </div>
                        </td>
                        <td className="text-xs text-gray-500">{ticket.assignee?.name || <span className="text-gray-300">—</span>}</td>
                        <td><SLABadge slaBreached={ticket.slaBreached} slaDeadline={ticket.slaDeadline} /></td>
                        <td className="text-xs text-gray-400 whitespace-nowrap">{formatDateTime(ticket.createdAt)}</td>
                      </tr>
                    ))}
                    {tickets.length === 0 && (
                      <tr>
                        <td colSpan={9} className="text-center py-12">
                          <BarChart3 className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                          <p className="text-sm text-gray-400">Tidak ada data tiket untuk periode ini</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {tickets.length > PAGE_SIZE && (
                <Pagination
                  pagination={{ total: tickets.length, page, limit: PAGE_SIZE, totalPages: Math.ceil(tickets.length / PAGE_SIZE) }}
                  onPageChange={setPage}
                />
              )}
            </>
          )}
        </div>

      </div>

      <PDFPreviewModal
        isOpen={pdfPreviewOpen}
        onClose={() => setPdfPreviewOpen(false)}
        fetchFn={previewFetchFn}
        filename={`laporan-IT-${filters.dateFrom}-sd-${filters.dateTo}.pdf`}
        title={`Preview Laporan — ${filters.dateFrom} s/d ${filters.dateTo}`}
      />
    </DashboardLayout>
  );
}
