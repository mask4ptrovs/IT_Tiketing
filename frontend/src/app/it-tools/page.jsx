'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { toolsAPI } from '../../lib/api';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';
import {
  Wifi, Shield, Globe, Calculator, Link2, Server,
  Play, Loader2, CheckCircle, XCircle, AlertCircle,
  ChevronDown, ChevronRight, Copy, RefreshCw,
} from 'lucide-react';

// ── helpers ───────────────────────────────────────────────────────────────────
const fmtBytes = (b) => {
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' GB';
  if (b >= 1048576)    return (b / 1048576).toFixed(1) + ' MB';
  if (b >= 1024)       return (b / 1024).toFixed(1) + ' KB';
  return b + ' B';
};
const fmtUptime = (s) => {
  const d = Math.floor(s / 86400), h = Math.floor((s%86400)/3600),
        m = Math.floor((s%3600)/60);
  return `${d}d ${h}h ${m}m`;
};
const copy = (t) => { navigator.clipboard?.writeText(t); toast.success('Disalin!'); };

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ ok, label }) {
  return ok
    ? <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"><CheckCircle className="w-3 h-3" />{label || 'OK'}</span>
    : <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"><XCircle className="w-3 h-3" />{label || 'Gagal'}</span>;
}

// ── Card wrapper ──────────────────────────────────────────────────────────────
function ToolCard({ icon: Icon, title, color, children }) {
  return (
    <div className="card overflow-hidden">
      <div className={cn('px-5 py-3 flex items-center gap-2 border-b border-gray-100 dark:border-gray-800', color)}>
        <Icon className="w-4 h-4" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Raw output box ────────────────────────────────────────────────────────────
function RawBox({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div className="mt-3">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Raw output
      </button>
      {open && (
        <pre className="mt-1.5 p-3 bg-gray-900 text-green-400 text-xs rounded-xl overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
          {text}
        </pre>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. PING
// ═══════════════════════════════════════════════════════════════════════════════
function PingTool() {
  const [host, setHost]   = useState('');
  const [count, setCount] = useState(4);
  const [result, setResult] = useState(null);

  const mut = useMutation({
    mutationFn: () => toolsAPI.ping({ host, count }),
    onSuccess: (r) => setResult(r.data.data),
    onError:   (e) => toast.error(e.response?.data?.message || 'Ping gagal'),
  });

  return (
    <ToolCard icon={Wifi} title="Ping" color="text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10">
      <div className="flex gap-2 flex-wrap">
        <input className="input flex-1 min-w-[200px]" placeholder="Host atau IP (misal: google.com / 8.8.8.8)"
          value={host} onChange={e => setHost(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && host && mut.mutate()} />
        <select className="input w-28" value={count} onChange={e => setCount(+e.target.value)}>
          {[2,4,6,8,10].map(n => <option key={n} value={n}>{n} paket</option>)}
        </select>
        <button onClick={() => host && mut.mutate()} disabled={!host || mut.isPending}
          className="btn-primary flex items-center gap-1.5">
          {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Ping
        </button>
      </div>

      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge ok={result.reachable} label={result.reachable ? 'Host Terjangkau' : 'Host Tidak Terjangkau'} />
            <span className="text-xs text-gray-500">Host: <strong className="text-gray-900 dark:text-white">{result.host}</strong></span>
            <span className="text-xs text-gray-500">Durasi: <strong className="text-gray-900 dark:text-white">{result.elapsed}ms</strong></span>
          </div>

          {result.times.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'Min',      val: result.min  != null ? result.min  + ' ms' : '-', color: 'text-green-600' },
                { label: 'Max',      val: result.max  != null ? result.max  + ' ms' : '-', color: 'text-red-500' },
                { label: 'Avg',      val: result.avg  != null ? result.avg  + ' ms' : '-', color: 'text-blue-600' },
                { label: 'Packet Loss', val: result.loss != null ? result.loss + '%' : '0%',   color: result.loss > 0 ? 'text-red-500' : 'text-green-600' },
              ].map(c => (
                <div key={c.label} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 text-center">
                  <p className={cn('text-lg font-bold', c.color)}>{c.val}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
                </div>
              ))}
            </div>
          )}

          {result.times.length > 0 && (
            <div className="flex items-end gap-1 h-12">
              {result.times.map((t, i) => {
                const maxT = Math.max(...result.times, 1);
                const h    = Math.max(8, Math.round((t / maxT) * 40));
                return (
                  <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
                    <div style={{ height: h }} className="w-full rounded-sm bg-blue-400 dark:bg-blue-500 transition-all" title={t + 'ms'} />
                    <span className="text-[9px] text-gray-400">{t}ms</span>
                  </div>
                );
              })}
            </div>
          )}

          <RawBox text={result.raw} />
        </div>
      )}
    </ToolCard>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. PORT SCANNER
// ═══════════════════════════════════════════════════════════════════════════════
const PRESET_PORTS = {
  'Web'       : '80,443,8080,8443',
  'Database'  : '3306,5432,1433,27017,6379',
  'Remote'    : '22,23,3389,5900',
  'Mail'      : '25,110,143,465,587,993,995',
  'Common'    : '21,22,23,25,53,80,110,143,443,3306,3389,5432,8080',
};

function PortScanner() {
  const [host, setHost]       = useState('');
  const [ports, setPorts]     = useState('80,443,22,3306,5432,3389,8080');
  const [timeout, setTimeout_] = useState(1500);
  const [result, setResult]   = useState(null);

  const mut = useMutation({
    mutationFn: () => toolsAPI.portScan({ host, ports, timeout }),
    onSuccess: (r) => setResult(r.data.data),
    onError:   (e) => toast.error(e.response?.data?.message || 'Scan gagal'),
  });

  const statusColor = { open: 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400',
                        closed: 'text-red-500 bg-red-50 dark:bg-red-900/20 dark:text-red-400',
                        filtered: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400' };

  return (
    <ToolCard icon={Shield} title="Port Scanner" color="text-purple-600 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-900/10">
      <div className="space-y-3">
        <input className="input w-full" placeholder="Host atau IP"
          value={host} onChange={e => setHost(e.target.value)} />

        <div className="flex flex-wrap gap-1.5">
          {Object.entries(PRESET_PORTS).map(([label, val]) => (
            <button key={label} onClick={() => setPorts(val)}
              className={cn('text-xs px-2.5 py-1 rounded-full border transition-colors',
                ports === val
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-purple-400')}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap">
          <input className="input flex-1 min-w-[200px] font-mono text-sm"
            placeholder="80,443,22 atau 8000-8100"
            value={ports} onChange={e => setPorts(e.target.value)} />
          <select className="input w-32" value={timeout} onChange={e => setTimeout_(+e.target.value)}>
            {[500,1000,1500,2000,3000].map(t => <option key={t} value={t}>{t}ms</option>)}
          </select>
          <button onClick={() => host && mut.mutate()} disabled={!host || mut.isPending}
            className="btn-primary flex items-center gap-1.5">
            {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Scan
          </button>
        </div>
      </div>

      {result && (
        <div className="mt-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-sm font-medium text-gray-900 dark:text-white">{result.host}</span>
            <span className="text-xs text-gray-500">{result.scanned} port dipindai</span>
            <span className="text-xs font-semibold text-green-600">{result.open} terbuka</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {result.results.map(r => (
              <div key={r.port} className={cn('flex items-center justify-between rounded-lg px-3 py-2 text-xs font-mono', statusColor[r.status])}>
                <span className="font-bold">{r.port}</span>
                <div className="text-right">
                  <p className="font-semibold capitalize">{r.status}</p>
                  {r.service && <p className="opacity-75">{r.service}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </ToolCard>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. DNS LOOKUP
// ═══════════════════════════════════════════════════════════════════════════════
function DnsLookup() {
  const [domain, setDomain]     = useState('');
  const [selTypes, setSelTypes] = useState(['A','AAAA','MX','NS','TXT']);
  const [result, setResult]     = useState(null);
  const ALL_TYPES = ['A','AAAA','MX','NS','TXT','CNAME','SOA'];

  const mut = useMutation({
    mutationFn: () => toolsAPI.dnsLookup({ domain, types: selTypes }),
    onSuccess: (r) => setResult(r.data.data),
    onError:   (e) => toast.error(e.response?.data?.message || 'DNS lookup gagal'),
  });

  const toggleType = (t) => setSelTypes(prev =>
    prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const renderRecord = (type, val) => {
    if (type === 'MX')  return val.map((r, i) => <div key={i} className="font-mono text-xs">{r.priority} → {r.exchange}</div>);
    if (type === 'SOA') return <div className="font-mono text-xs">{JSON.stringify(val)}</div>;
    if (Array.isArray(val)) return val.map((v, i) => (
      <div key={i} className="flex items-center gap-2">
        <span className="font-mono text-xs break-all">{String(v)}</span>
        <button onClick={() => copy(String(v))} className="text-gray-400 hover:text-gray-600"><Copy className="w-3 h-3" /></button>
      </div>
    ));
    return <span className="font-mono text-xs">{String(val)}</span>;
  };

  return (
    <ToolCard icon={Globe} title="DNS Lookup" color="text-teal-600 dark:text-teal-400 bg-teal-50/50 dark:bg-teal-900/10">
      <div className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          <input className="input flex-1 min-w-[200px]" placeholder="Domain (misal: google.com)"
            value={domain} onChange={e => setDomain(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && domain && mut.mutate()} />
          <button onClick={() => domain && mut.mutate()} disabled={!domain || mut.isPending}
            className="btn-primary flex items-center gap-1.5">
            {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Lookup
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_TYPES.map(t => (
            <button key={t} onClick={() => toggleType(t)}
              className={cn('text-xs px-2.5 py-1 rounded-full border transition-colors',
                selTypes.includes(t)
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-teal-400')}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {result && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{result.domain}</p>
          {Object.entries(result.results).map(([type, val]) => (
            <div key={type} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
              <span className="inline-block text-xs font-bold text-teal-600 dark:text-teal-400 mb-1.5 bg-teal-50 dark:bg-teal-900/30 px-2 py-0.5 rounded">{type}</span>
              <div className="space-y-0.5">{renderRecord(type, val)}</div>
            </div>
          ))}
          {Object.entries(result.errors).length > 0 && (
            <div className="text-xs text-gray-400 space-y-0.5">
              {Object.entries(result.errors).map(([t, e]) => (
                <div key={t}><span className="font-mono text-gray-500">{t}:</span> {e}</div>
              ))}
            </div>
          )}
          {Object.keys(result.reverseMap || {}).length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
              <span className="inline-block text-xs font-bold text-gray-500 mb-1.5">Reverse DNS</span>
              {Object.entries(result.reverseMap).map(([ip, hosts]) => (
                <div key={ip} className="text-xs font-mono">{ip} → {hosts ? hosts.join(', ') : '-'}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </ToolCard>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. SUBNET CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════════
function SubnetCalc() {
  const [cidr, setCidr]   = useState('192.168.1.0/24');
  const [result, setResult] = useState(null);

  const mut = useMutation({
    mutationFn: () => toolsAPI.subnetCalc({ cidr }),
    onSuccess: (r) => setResult(r.data.data),
    onError:   (e) => toast.error(e.response?.data?.message || 'Input tidak valid'),
  });

  const rows = result ? [
    ['Input',          result.input],
    ['Network',        result.network],
    ['Network Address',result.networkAddr],
    ['Broadcast',      result.broadcast],
    ['Subnet Mask',    result.subnetMask],
    ['Wildcard Mask',  result.wildcard],
    ['First Host',     result.firstHost],
    ['Last Host',      result.lastHost],
    ['Total Hosts',    result.totalHosts.toLocaleString()],
    ['Usable Hosts',   result.usableHosts.toLocaleString()],
    ['IP Class',       result.ipClass],
    ['Private IP',     result.isPrivate ? 'Ya' : 'Tidak'],
  ] : [];

  return (
    <ToolCard icon={Calculator} title="Subnet Calculator" color="text-orange-600 dark:text-orange-400 bg-orange-50/50 dark:bg-orange-900/10">
      <div className="flex gap-2 flex-wrap">
        <input className="input flex-1 font-mono" placeholder="CIDR (misal: 192.168.1.0/24)"
          value={cidr} onChange={e => setCidr(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && mut.mutate()} />
        <button onClick={() => mut.mutate()} disabled={mut.isPending}
          className="btn-primary flex items-center gap-1.5">
          {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
          Hitung
        </button>
      </div>

      {/* Quick presets */}
      <div className="flex flex-wrap gap-1.5 mt-2">
        {['10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','192.168.1.0/24','192.168.1.0/28'].map(p => (
          <button key={p} onClick={() => { setCidr(p); }}
            className="text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-500 hover:border-orange-400 hover:text-orange-600 font-mono transition-colors">
            {p}
          </button>
        ))}
      </div>

      {result && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
              <span className="text-xs text-gray-500">{k}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono font-semibold text-gray-900 dark:text-white">{v}</span>
                {(k.includes('Address') || k === 'Broadcast' || k.includes('Mask') || k.includes('Host') || k === 'Network') && (
                  <button onClick={() => copy(v)} className="text-gray-300 hover:text-gray-500"><Copy className="w-3 h-3" /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </ToolCard>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. HTTP CHECKER
// ═══════════════════════════════════════════════════════════════════════════════
function HttpChecker() {
  const [url, setUrl]     = useState('');
  const [result, setResult] = useState(null);

  const mut = useMutation({
    mutationFn: () => toolsAPI.httpCheck({ url }),
    onSuccess: (r) => setResult(r.data.data),
    onError:   (e) => toast.error(e.response?.data?.message || 'HTTP check gagal'),
  });

  const statusClass = (code) => {
    if (!code) return 'text-red-600';
    if (code < 300) return 'text-green-600';
    if (code < 400) return 'text-yellow-600';
    return 'text-red-600';
  };

  const speedLabel = (ms) => {
    if (!ms) return { label: '-', color: 'text-gray-400' };
    if (ms < 200)  return { label: 'Sangat Cepat', color: 'text-green-600' };
    if (ms < 500)  return { label: 'Cepat',        color: 'text-green-500' };
    if (ms < 1500) return { label: 'Normal',        color: 'text-yellow-600' };
    if (ms < 3000) return { label: 'Lambat',        color: 'text-orange-600' };
    return           { label: 'Sangat Lambat',      color: 'text-red-600' };
  };

  return (
    <ToolCard icon={Link2} title="HTTP Checker" color="text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/10">
      <div className="flex gap-2 flex-wrap">
        <input className="input flex-1 min-w-[240px]" placeholder="URL (misal: https://google.com)"
          value={url} onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && url && mut.mutate()} />
        <button onClick={() => url && mut.mutate()} disabled={!url || mut.isPending}
          className="btn-primary flex items-center gap-1.5">
          {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Cek
        </button>
      </div>

      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge ok={result.reachable} label={result.reachable ? 'Dapat Diakses' : 'Tidak Dapat Diakses'} />
            {result.statusCode && (
              <span className={cn('text-sm font-bold', statusClass(result.statusCode))}>
                HTTP {result.statusCode} {result.statusText}
              </span>
            )}
          </div>

          {result.reachable && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-indigo-600">{result.elapsed}ms</p>
                <p className="text-xs text-gray-500">Response Time</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 text-center">
                <p className={cn('text-sm font-bold', speedLabel(result.elapsed).color)}>
                  {speedLabel(result.elapsed).label}
                </p>
                <p className="text-xs text-gray-500">Kecepatan</p>
              </div>
              {result.server && (
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 text-center">
                  <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{result.server}</p>
                  <p className="text-xs text-gray-500">Server</p>
                </div>
              )}
            </div>
          )}

          {result.error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg p-3 text-sm text-red-600 dark:text-red-400">
              {result.error}
            </div>
          )}

          {[
            ['URL',          result.url],
            ['Content-Type', result.contentType],
            ['Powered By',   result.poweredBy],
            ['Redirect URL', result.redirectUrl],
          ].filter(([,v]) => v).map(([k, v]) => (
            <div key={k} className="flex items-start gap-2 text-xs">
              <span className="text-gray-400 w-28 flex-shrink-0">{k}:</span>
              <span className="font-mono text-gray-700 dark:text-gray-300 break-all">{v}</span>
            </div>
          ))}
        </div>
      )}
    </ToolCard>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. SERVER INFO
// ═══════════════════════════════════════════════════════════════════════════════
function ServerInfoPanel() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['server-info'],
    queryFn:  () => toolsAPI.serverInfo().then(r => r.data.data),
    staleTime: 30_000,
  });

  if (isLoading) return (
    <ToolCard icon={Server} title="Server Info" color="text-gray-600 dark:text-gray-400 bg-gray-50/50 dark:bg-gray-800/30">
      <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" />Memuat...</div>
    </ToolCard>
  );

  if (!data) return null;

  const memUsed  = data.totalMem - data.freeMem;
  const memPct   = Math.round((memUsed / data.totalMem) * 100);
  const loadAvg  = data.loadavg[0]?.toFixed(2) ?? '-';

  return (
    <ToolCard icon={Server} title="Server Info (Backend)" color="text-gray-600 dark:text-gray-400 bg-gray-50/50 dark:bg-gray-800/30">
      <div className="flex justify-end mb-2">
        <button onClick={() => refetch()} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {[
          { label: 'Hostname',   val: data.hostname },
          { label: 'Platform',   val: data.platform },
          { label: 'OS Release', val: data.release },
          { label: 'Node.js',    val: data.nodeVersion },
          { label: 'CPU',        val: `${data.cpus} core` },
          { label: 'Load Avg',   val: loadAvg },
          { label: 'Uptime',     val: fmtUptime(data.uptime) },
          { label: 'Total RAM',  val: fmtBytes(data.totalMem) },
          { label: 'Free RAM',   val: fmtBytes(data.freeMem) },
        ].map(({ label, val }) => (
          <div key={label} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5">
            <p className="text-xs text-gray-400">{label}</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{val}</p>
          </div>
        ))}
      </div>

      {/* RAM bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Memory Usage</span>
          <span>{memPct}% — {fmtBytes(memUsed)} / {fmtBytes(data.totalMem)}</span>
        </div>
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className={cn('h-full rounded-full transition-all', memPct > 80 ? 'bg-red-500' : memPct > 60 ? 'bg-yellow-500' : 'bg-green-500')}
            style={{ width: memPct + '%' }} />
        </div>
      </div>

      {/* Network interfaces */}
      {data.networks?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">Network Interfaces</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {data.networks.filter(n => n.family === 'IPv4').map((n, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
                <span className="text-xs text-gray-500">{n.iface}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-semibold text-gray-900 dark:text-white">{n.address}</span>
                  <button onClick={() => copy(n.address)} className="text-gray-300 hover:text-gray-500"><Copy className="w-3 h-3" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </ToolCard>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
const TABS = [
  { id: 'ping',    label: 'Ping',             icon: Wifi,       component: PingTool },
  { id: 'port',    label: 'Port Scanner',     icon: Shield,     component: PortScanner },
  { id: 'dns',     label: 'DNS Lookup',       icon: Globe,      component: DnsLookup },
  { id: 'subnet',  label: 'Subnet Calc',      icon: Calculator, component: SubnetCalc },
  { id: 'http',    label: 'HTTP Checker',     icon: Link2,      component: HttpChecker },
  { id: 'server',  label: 'Server Info',      icon: Server,     component: ServerInfoPanel },
];

export default function ITToolsPage() {
  const [activeTab, setActiveTab] = useState('ping');
  const active = TABS.find(t => t.id === activeTab);
  const ActiveComponent = active?.component;

  return (
    <DashboardLayout title="IT Network Tools">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <Wifi className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">IT Network Tools</h1>
            <p className="text-xs text-gray-500">Alat bantu diagnosa dan monitoring jaringan untuk teknisi IT</p>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex flex-wrap gap-1.5 bg-gray-100 dark:bg-gray-800/50 p-1.5 rounded-xl">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Active tool */}
        {ActiveComponent && <ActiveComponent />}

        {/* Footer note */}
        <p className="text-xs text-gray-400 text-center pt-2">
          Tools ini berjalan di sisi server backend. Hasil ping, port scan, dan DNS menggunakan jaringan server,
          bukan jaringan lokal browser.
        </p>
      </div>
    </DashboardLayout>
  );
}
