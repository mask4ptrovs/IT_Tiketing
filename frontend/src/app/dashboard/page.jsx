'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Ticket, CheckCircle, Clock, AlertTriangle,
  TrendingUp, TrendingDown, Users, BarChart2, GitBranch, Building2,
} from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { DashboardSkeleton } from '../../components/ui/Skeleton';
import { formatDateTime, timeAgo } from '../../lib/utils';
import { StatusBadge, PriorityBadge } from '../../components/ui/Badge';
import { dashboardAPI, branchAPI } from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import Link from 'next/link';

const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280'];

function StatCard({ title, value, icon: Icon, color, subValue, trend, trendValue }) {
  return (
    <div className="stat-card">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{value ?? 0}</p>
        {trendValue !== undefined && (
          <div className={`flex items-center gap-1 mt-1 text-xs ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            <span>{Math.abs(trendValue)}% vs bulan lalu</span>
          </div>
        )}
        {subValue && <p className="text-xs text-gray-400 mt-0.5">{subValue}</p>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [selectedBranchId, setSelectedBranchId] = useState('');

  // Load branch list for admin filter
  const { data: branchesData } = useQuery({
    queryKey: ['branches-list'],
    queryFn: () => branchAPI.list({ limit: 100 }).then(r => r.data.data || []),
    enabled: user?.role === 'ADMIN',
  });
  const branches = branchesData || [];

  const queryParams = user?.role === 'ADMIN' && selectedBranchId ? { branchId: selectedBranchId } : {};

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', selectedBranchId],
    queryFn: () => dashboardAPI.stats(queryParams).then(r => r.data.data),
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <DashboardLayout title="Dashboard">
        <DashboardSkeleton />
      </DashboardLayout>
    );
  }

  const { stats, monthlyData, categoryDistribution, priorityDistribution, recentTickets, technicianStats, departmentStats } = data || {};

  return (
    <DashboardLayout title="Dashboard">
      <div className="space-y-6">
        {/* Welcome */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Selamat Datang, {user?.name?.split(' ')[0]} 👋
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              {user?.branch && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800">
                  <Building2 className="w-3 h-3" />
                  {user.branch.isHeadOffice ? '★ ' : ''}{user.branch.name}
                  <span className="text-primary-400">· {user.branch.code}</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Admin: branch filter selector */}
            {user?.role === 'ADMIN' && branches.length > 0 && (
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-gray-400" />
                <select
                  value={selectedBranchId}
                  onChange={e => setSelectedBranchId(e.target.value)}
                  className="input-field text-sm py-1.5 pl-2 pr-8 min-w-[160px]"
                >
                  <option value="">Semua Cabang</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.isHeadOffice ? '★ ' : ''}{b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {user?.role !== 'USER' && (
              <Link href="/tickets?status=OPEN" className="btn-primary hidden sm:flex">
                <Ticket className="w-4 h-4" /> Lihat Tiket Masuk
              </Link>
            )}
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Tiket" value={stats?.totalTickets} icon={Ticket} color="bg-primary-600"
            trendValue={stats?.growthRate} trend={stats?.growthRate} />
          <StatCard title="Open" value={stats?.openTickets} icon={Clock} color="bg-blue-500"
            subValue="Menunggu ditangani" />
          <StatCard title="On Progress" value={stats?.onProgressTickets} icon={BarChart2} color="bg-amber-500"
            subValue="Sedang dikerjakan" />
          <StatCard title="Selesai" value={stats?.resolvedTickets} icon={CheckCircle} color="bg-emerald-500"
            subValue="Resolved / Closed" />
        </div>

        {/* SLA & Critical */}
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-4 border-l-4 border-l-red-500">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">SLA Breached</p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400">{stats?.slaBreachedTickets ?? 0}</p>
              </div>
            </div>
          </div>
          <div className="card p-4 border-l-4 border-l-amber-500">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Bulan Ini</p>
                <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{stats?.thisMonthTickets ?? 0} tiket</p>
              </div>
            </div>
          </div>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Monthly trend */}
          <div className="lg:col-span-2 card p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Tren Tiket (12 Bulan)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={monthlyData || []}>
                <defs>
                  <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.07} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: '0.75rem', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="created" stroke="#6366f1" fill="url(#colorCreated)" name="Dibuat" strokeWidth={2} />
                <Area type="monotone" dataKey="resolved" stroke="#10b981" fill="url(#colorResolved)" name="Selesai" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Category pie */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Kategori Masalah</h3>
            {categoryDistribution?.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={categoryDistribution} dataKey="count" nameKey="category" cx="50%" cy="50%" outerRadius={80} paddingAngle={3}>
                      {categoryDistribution.map((entry, index) => (
                        <Cell key={index} fill={entry.color || COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, n) => [v, n]} contentStyle={{ borderRadius: '0.75rem', fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2">
                  {categoryDistribution.slice(0, 5).map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: item.color || COLORS[i % COLORS.length] }} />
                        <span className="text-gray-600 dark:text-gray-400">{item.category}</span>
                      </div>
                      <span className="font-semibold text-gray-900 dark:text-white">{item.count}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data</div>
            )}
          </div>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent tickets */}
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Tiket Terbaru</h3>
              <Link href="/tickets" className="text-xs text-primary-600 hover:text-primary-700 font-medium">Lihat semua →</Link>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {recentTickets?.length > 0 ? recentTickets.map(ticket => (
                <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="flex items-start gap-3 px-6 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: ticket.category?.color || '#6366f1' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{ticket.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">#{ticket.ticketNo} · {timeAgo(ticket.createdAt)}</p>
                  </div>
                  <StatusBadge status={ticket.status} />
                </Link>
              )) : (
                <p className="text-center text-sm text-gray-400 py-8">Belum ada tiket</p>
              )}
            </div>
          </div>

          {/* Technician stats (admin only) or Priority bar (all) */}
          {user?.role === 'ADMIN' && technicianStats?.length > 0 ? (
            <div className="card">
              <div className="card-header">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Performa Teknisi</h3>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {technicianStats.map(tech => (
                  <div key={tech.id} className="flex items-center gap-3 px-6 py-3">
                    <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-primary-600 text-xs font-bold">{tech.name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{tech.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: tech.totalAssigned > 0 ? `${(tech.resolved / tech.totalAssigned) * 100}%` : '0%' }}
                          />
                        </div>
                        <span className="text-xs text-gray-400">
                          {tech.resolved}/{tech.totalAssigned}
                        </span>
                      </div>
                    </div>
                    {tech.slaBreached > 0 && (
                      <span className="badge badge-red text-xs">{tech.slaBreached} SLA</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="card p-6">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Distribusi Prioritas (Active)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={priorityDistribution || []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.07} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="priority" tick={{ fontSize: 11 }} width={70} />
                  <Tooltip contentStyle={{ borderRadius: '0.75rem', fontSize: 12 }} />
                  <Bar dataKey="count" fill="#6366f1" radius={[0, 6, 6, 0]} name="Tiket">
                    {(priorityDistribution || []).map((entry, i) => {
                      const colors = { LOW: '#10b981', MEDIUM: '#3b82f6', HIGH: '#f59e0b', CRITICAL: '#ef4444' };
                      return <Cell key={i} fill={colors[entry.priority] || '#6366f1'} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
