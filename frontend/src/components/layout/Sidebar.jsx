'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard, Ticket, Users, Building2,
  Tag, Bell, BarChart3, Settings, LogOut, Monitor,
  ChevronLeft, Menu, Shield, SlidersHorizontal, GitBranch, MapPin, Package, ShoppingCart, Wrench,
  FileText, FilePlus2, FileCheck2, Receipt, ChevronDown, ChevronRight, FolderOpen,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuthStore, useUIStore } from '../../lib/store';
import { authAPI, settingAPI } from '../../lib/api';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';

const DRAFT_FORM_PATHS = ['/purchase-orders', '/vendor-po', '/internal-po', '/selisih-po', '/tanda-terima'];

const navItems = [
  {
    group: 'Main',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['USER', 'IT_STAFF', 'ADMIN'] },
      { href: '/tickets', label: 'My Tickets', icon: Ticket, roles: ['USER'] },
      { href: '/tickets', label: 'Semua Tiket', icon: Ticket, roles: ['IT_STAFF', 'ADMIN'] },
    ],
  },
  {
    group: 'Management',
    items: [
      { href: '/reports', label: 'Laporan', icon: BarChart3, roles: ['IT_STAFF', 'ADMIN'] },
      { href: '/assets', label: 'Inventaris IT', icon: Package, roles: ['IT_STAFF', 'ADMIN'] },
      { href: '/it-tools', label: 'IT Network Tools', icon: Wrench, roles: ['IT_STAFF', 'ADMIN'] },
      { href: '/admin/users', label: 'Kelola User', icon: Users, roles: ['ADMIN'] },
      { href: '/admin/departments', label: 'Departemen', icon: Building2, roles: ['ADMIN'] },
      { href: '/admin/categories', label: 'Kategori', icon: Tag, roles: ['ADMIN'] },
      { href: '/admin/branches', label: 'Cabang', icon: GitBranch, roles: ['ADMIN'] },
      { href: '/admin/settings', label: 'Pengaturan', icon: SlidersHorizontal, roles: ['ADMIN'] },
    ],
  },
  {
    group: 'Account',
    items: [
      { href: '/notifications', label: 'Notifikasi', icon: Bell, roles: ['USER', 'IT_STAFF', 'ADMIN'] },
      { href: '/profile', label: 'Profil', icon: Settings, roles: ['USER', 'IT_STAFF', 'ADMIN'] },
    ],
  },
];

const draftFormItems = [
  { href: '/purchase-orders', label: 'Purchase Request', icon: ShoppingCart },
  { href: '/vendor-po',       label: 'Surat PO Vendor',  icon: FileText },
  { href: '/internal-po',     label: 'PO Internal',      icon: FilePlus2 },
  { href: '/selisih-po',      label: 'PO Selisih',       icon: FileCheck2 },
  { href: '/tanda-terima',    label: 'Tanda Terima',     icon: Receipt },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout: storeLogout } = useAuthStore();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const isDraftActive = DRAFT_FORM_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
  const [draftOpen, setDraftOpen] = useState(isDraftActive);

  const { data: settings } = useQuery({
    queryKey: ['company-settings'],
    queryFn: () => settingAPI.get().then(r => r.data.data),
    staleTime: 5 * 60 * 1000,
  });

  const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5000';
  const logoUrl = settings?.companyLogo ? `${API_URL}${settings.companyLogo}` : null;

  const handleLogout = async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      await authAPI.logout({ refreshToken });
    } catch {}
    storeLogout();
    router.push('/auth/login');
    toast.success('Berhasil logout');
  };

  const filteredNav = navItems.map(group => ({
    ...group,
    items: group.items.filter(item =>
      !user || item.roles.includes(user.role)
    ),
  })).filter(group => group.items.length > 0);

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-30 h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all duration-300 flex flex-col',
          sidebarOpen ? 'w-64' : 'w-0 lg:w-16 overflow-hidden',
        )}
      >
        {/* Logo / Company branding */}
        <div className="border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3 px-4 py-4 min-h-[64px]">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo"
                className="w-8 h-8 rounded-lg object-contain flex-shrink-0 bg-white"
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
                {settings?.companyName ? (
                  <span className="text-white font-bold text-xs">
                    {settings.companyName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                ) : (
                  <Monitor className="w-4 h-4 text-white" />
                )}
              </div>
            )}
            {sidebarOpen && (
              <div className="overflow-hidden">
                <p className="font-bold text-gray-900 dark:text-white text-sm leading-none truncate">
                  {settings?.companyName || 'IT Support'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                  {settings?.companyTagline || 'Ticketing System'}
                </p>
              </div>
            )}
          </div>

          {/* Branch indicator strip */}
          {user?.branch && (
            <div className={cn(
              'px-3 pb-2.5',
              !sidebarOpen && 'flex justify-center pb-2'
            )}>
              {sidebarOpen ? (
                <div className="flex items-center gap-1.5 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800/50 rounded-lg px-2.5 py-1.5">
                  <MapPin className="w-3 h-3 text-primary-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-primary-700 dark:text-primary-300 truncate leading-none">
                      {user.branch.isHeadOffice && <span className="mr-0.5">★</span>}
                      {user.branch.name}
                    </p>
                    {user.branch.city && (
                      <p className="text-[10px] text-primary-400 dark:text-primary-500 mt-0.5 truncate leading-none">
                        {user.branch.city} · {user.branch.code}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  title={user.branch.name}
                  className="w-8 h-8 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800/50 rounded-lg flex items-center justify-center"
                >
                  <span className="text-[9px] font-bold text-primary-600 dark:text-primary-400 leading-none">
                    {user.branch.code?.slice(0, 3)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
          {filteredNav.map((group) => (
            <div key={group.group}>
              {sidebarOpen && (
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wider mb-2 px-2">
                  {group.group}
                </p>
              )}
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        className={cn(
                          'sidebar-item',
                          isActive ? 'sidebar-item-active' : 'sidebar-item-inactive',
                          !sidebarOpen && 'justify-center px-2'
                        )}
                        title={!sidebarOpen ? item.label : undefined}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        {sidebarOpen && <span>{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
                {/* ── Draf Form submenu — injected after Main group ── */}
                {group.group === 'Main' && (
                  <li>
                    {/* Submenu toggle button */}
                    <button
                      onClick={() => sidebarOpen && setDraftOpen(o => !o)}
                      className={cn(
                        'sidebar-item w-full',
                        isDraftActive ? 'sidebar-item-active' : 'sidebar-item-inactive',
                        !sidebarOpen && 'justify-center px-2'
                      )}
                      title={!sidebarOpen ? 'Draf Form' : undefined}
                    >
                      <FolderOpen className="w-4 h-4 flex-shrink-0" />
                      {sidebarOpen && (
                        <>
                          <span className="flex-1 text-left">Draf Form</span>
                          {draftOpen
                            ? <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                            : <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
                        </>
                      )}
                    </button>
                    {/* Submenu items */}
                    {sidebarOpen && draftOpen && (
                      <ul className="mt-1 ml-4 pl-3 border-l-2 border-gray-100 dark:border-gray-800 space-y-0.5">
                        {draftFormItems.map(item => {
                          const Icon = item.icon;
                          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                          return (
                            <li key={item.href}>
                              <Link
                                href={item.href}
                                className={cn(
                                  'sidebar-item text-[13px]',
                                  isActive ? 'sidebar-item-active' : 'sidebar-item-inactive',
                                )}
                              >
                                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                                <span>{item.label}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                )}
              </ul>
            </div>
          ))}
        </nav>

        {/* User & logout */}
        {user && (
          <div className="border-t border-gray-200 dark:border-gray-800 p-3">
            {sidebarOpen ? (
              <div className="flex items-center gap-3 px-2 py-2">
                <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-600 dark:text-primary-400 font-semibold text-sm">
                    {user.name?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={cn(
                      'text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide',
                      user.role === 'ADMIN' && 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
                      user.role === 'IT_STAFF' && 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
                      user.role === 'USER' && 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
                    )}>
                      {user.role === 'IT_STAFF' ? 'IT Staff' : user.role === 'ADMIN' ? 'Admin' : 'User'}
                    </span>
                    {user.branch && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[90px]">
                        {user.branch.code}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleLogout}
                className="w-full flex justify-center p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
