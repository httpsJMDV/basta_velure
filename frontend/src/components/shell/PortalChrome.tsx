// The dark sidebar and top bar of the admin console, as reusable pieces, so the logistics hub and the courier station
// wear the same chrome as the admin dashboard. The look is copied from pages/admin/AdminLayout.tsx on purpose: change
// the two together.
import { Link } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, LogOut, Menu, MessageSquare, PanelLeft, Search, X } from 'lucide-react';
import LovedItLogo from '../LovedItLogo';

export const SHELL_BG: React.CSSProperties = { background: '#111111' };

export interface ShellNavItem {
  icon: React.ElementType;
  label: string;
  to: string;
  /** A count shown as a pill (hidden at 0). */
  badge?: number;
}

export interface ShellNavGroup {
  heading: string;
  items: ShellNavItem[];
}

export interface ShellUser {
  name: string;
  email?: string | null;
  initials: string;
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function ShellSidebar({
  brandTo,
  roleBadge,
  tagline,
  nav,
  collapsed,
  isActive,
  onNavigate,
  profile,
  user,
  onLogout,
  navLabel,
}: {
  brandTo: string;
  /** The small red tag next to the name, such as "Logistics". */
  roleBadge: string;
  tagline: string;
  nav: ShellNavGroup[];
  collapsed: boolean;
  isActive: (to: string) => boolean;
  onNavigate?: () => void;
  /** An optional card between the brand and the navigation (the hub's name and status). */
  profile?: ReactNode;
  user: ShellUser;
  onLogout: () => void;
  navLabel: string;
}) {
  return (
    <div className="flex flex-col h-full" style={SHELL_BG}>
      {/* Brand */}
      <div className={`border-b border-white/10 shrink-0 ${collapsed ? 'px-0 py-3 flex justify-center' : 'px-4 py-3'}`}>
        <Link to={brandTo} onClick={onNavigate} className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
          <div className="w-7 h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center p-0.5 shrink-0 shadow-xs hover:scale-105 transition-transform">
            <LovedItLogo variant="dark" type="icon" size="custom" showText={false} imgClassName="w-5 h-5 object-contain" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-white font-black text-[14px] tracking-tight leading-none">Loved-IT</span>
                <span className="text-[8.5px] font-black uppercase tracking-wider bg-brand-red text-white px-1.5 py-0.5 rounded">{roleBadge}</span>
              </div>
              <p className="text-white/40 text-[9.5px] uppercase tracking-[0.08em] font-semibold mt-0.5">{tagline}</p>
            </div>
          )}
        </Link>
      </div>

      {!collapsed && profile}

      <nav aria-label={navLabel} className="flex-1 px-2 py-2 space-y-3 overflow-y-auto overflow-x-hidden" style={{ scrollbarWidth: 'none' }}>
        {nav.map((group) => (
          <div key={group.heading}>
            {!collapsed && (
              <p className="text-gray-500 text-[10px] font-bold uppercase tracking-[0.1em] px-3 mb-1">{group.heading}</p>
            )}
            {collapsed && <div className="my-1 mx-2 border-t border-white/10" />}
            {group.items.map(({ icon: Icon, label, to, badge }) => {
              const active = isActive(to);
              return (
                <Link
                  key={to}
                  to={to}
                  onClick={onNavigate}
                  title={collapsed ? label : undefined}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'relative flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 mb-0.5 group',
                    collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red',
                    active ? 'bg-brand-red text-white' : 'text-gray-400 hover:text-white hover:bg-white/[0.06]',
                  ].join(' ')}
                >
                  <Icon className="w-[17px] h-[17px] shrink-0" aria-hidden="true" />
                  {!collapsed && <span className="flex-1 truncate">{label}</span>}
                  {!collapsed && badge !== undefined && badge > 0 && (
                    <span className="min-w-[16px] h-[16px] px-1 bg-white text-brand-red text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                      <span aria-hidden="true">{badge > 99 ? '99+' : badge}</span>
                      <span className="sr-only">{badge} waiting</span>
                    </span>
                  )}
                  {collapsed && badge !== undefined && badge > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-brand-red rounded-full" aria-hidden="true" />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User card */}
      <div className={`border-t border-white/10 shrink-0 ${collapsed ? 'px-2 py-3' : 'px-3 py-3'}`}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-red to-brand-red-dark flex items-center justify-center text-white text-[11px] font-bold">
              {user.initials}
            </div>
            <button
              onClick={onLogout}
              title="Log out"
              aria-label="Log out"
              className="w-8 h-8 rounded-lg bg-red-500/15 text-white/60 hover:bg-red-500/35 hover:text-white transition-all flex items-center justify-center"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/[0.04] transition-colors">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-red to-brand-red-dark flex items-center justify-center text-white text-[11px] font-bold shrink-0">
              {user.initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-[12px] font-semibold truncate leading-tight">{user.name}</p>
              <p className="text-white/40 text-[10px] truncate">{user.email}</p>
            </div>
            <button
              onClick={onLogout}
              title="Log out"
              aria-label="Log out"
              className="w-7 h-7 rounded-lg bg-red-500/15 text-white/60 hover:bg-red-500/35 hover:text-white transition-all flex items-center justify-center shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface ShellSearchItem {
  label: string;
  to: string;
  group: string;
  icon: React.ElementType;
}

function ShellSearchBar({ items, placeholder }: { items: ShellSearchItem[]; placeholder: string }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return items.slice(0, 6);
    const q = query.toLowerCase();
    return items.filter((i) => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q));
  }, [query, items]);

  useEffect(() => { setSelectedIndex(0); }, [filtered]);

  // Ctrl+K / Cmd+K focuses the search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, []);

  const select = (to: string) => {
    navigate(to);
    setIsOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const n = filtered.length || 1;
    if (e.key === 'ArrowDown') { e.preventDefault(); setIsOpen(true); setSelectedIndex((p) => (p + 1) % n); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIsOpen(true); setSelectedIndex((p) => (p - 1 + n) % n); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[selectedIndex]) select(filtered[selectedIndex].to); }
    else if (e.key === 'Escape') { setIsOpen(false); inputRef.current?.blur(); }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-sm mx-auto hidden md:block">
      <div className={`flex items-center gap-2 bg-white/[0.06] hover:bg-white/[0.09] border ${
        isOpen ? 'border-brand-red/60 ring-2 ring-brand-red/20 bg-white/[0.09]' : 'border-white/[0.08]'
      } rounded-xl px-3 py-1.5 transition-all`}>
        <Search className="w-4 h-4 text-white/40 shrink-0" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={onKeyDown}
          aria-label={placeholder}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-xs text-white placeholder-white/40 outline-none"
        />
        {query ? (
          <button type="button" aria-label="Clear search" onClick={() => { setQuery(''); inputRef.current?.focus(); }} className="p-0.5 text-white/40 hover:text-white rounded">
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        ) : (
          <span className="text-[10px] text-white/30 font-mono border border-white/10 rounded px-1.5 py-0.5 shrink-0">Ctrl K</span>
        )}
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="max-h-72 overflow-y-auto p-1.5 space-y-0.5" style={{ scrollbarWidth: 'none' }}>
            {filtered.length > 0 ? (
              filtered.map((item, idx) => {
                const Icon = item.icon;
                const selected = idx === selectedIndex;
                return (
                  <button
                    key={item.to}
                    type="button"
                    onClick={() => select(item.to)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors ${
                      selected ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${selected ? 'bg-brand-red text-white' : 'bg-white/5 text-white/60'}`}>
                        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                      </div>
                      <span className="text-xs font-medium truncate">{item.label}</span>
                    </div>
                    <span className="text-[10px] text-white/30 uppercase tracking-wider font-semibold shrink-0 ml-2">{item.group}</span>
                  </button>
                );
              })
            ) : (
              <div className="py-6 text-center text-xs text-white/40">No matching pages for "{query}"</div>
            )}
          </div>
          <div className="px-3 py-1.5 bg-black/30 border-t border-white/5 flex items-center justify-between text-[10px] text-white/30">
            <span>↑↓ to navigate</span>
            <span>↵ to select</span>
            <span>esc to dismiss</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Top bar ──────────────────────────────────────────────────────────────────

export interface ShellAlert {
  icon: React.ElementType;
  /** Tailwind classes for the little icon tile, for example "bg-rose-500/20 text-rose-300". */
  tone: string;
  title: string;
  detail: string;
  to: string;
}

export interface ShellMenuLink {
  icon: React.ElementType;
  label: string;
  to: string;
}

export function ShellTopBar({
  rootLabel,
  pageLabel,
  roleLabel,
  user,
  searchItems,
  searchPlaceholder = 'Search pages...',
  alerts,
  messages,
  menuLinks,
  leading,
  onToggleSidebar,
  onOpenMobile,
  onLogout,
}: {
  rootLabel: string;
  pageLabel: string;
  /** The small caption above the user's name, such as "Hub manager". */
  roleLabel: string;
  user: ShellUser;
  searchItems?: ShellSearchItem[];
  searchPlaceholder?: string;
  alerts: ShellAlert[];
  /** The messages shortcut, with its unread count. */
  messages?: { to: string; unread: number };
  menuLinks?: ShellMenuLink[];
  /** Something to show before the breadcrumb, such as the logo on a phone. */
  leading?: ReactNode;
  /** The collapse button (desktop). Leave out when the sidebar cannot collapse. */
  onToggleSidebar?: () => void;
  /** The menu button (phone). Leave out when the portal has its own phone navigation. */
  onOpenMobile?: () => void;
  onLogout: () => void;
}) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Close either popover on an outside click or Escape.
  useEffect(() => {
    if (!notifOpen && !userMenuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
        setUserMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setNotifOpen(false); setUserMenuOpen(false); }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [notifOpen, userMenuOpen]);

  const totalAlerts = alerts.length;

  return (
    <div ref={barRef} className="h-14 shrink-0 flex items-center gap-3 px-4 sm:px-5 border-b border-white/10 sticky top-0 z-20 print:hidden" style={SHELL_BG}>
      {leading}
      {onToggleSidebar && (
        <button
          onClick={onToggleSidebar}
          aria-label="Collapse or expand the sidebar"
          className="hidden lg:flex w-8 h-8 items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        >
          <PanelLeft className="w-[18px] h-[18px]" aria-hidden="true" />
        </button>
      )}
      {onOpenMobile && (
        <button
          onClick={onOpenMobile}
          aria-label="Open the menu"
          className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        >
          <Menu className="w-[18px] h-[18px]" aria-hidden="true" />
        </button>
      )}

      {/* Breadcrumb + page title */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-white/30 text-[13px] truncate hidden sm:block">{rootLabel}</span>
        <ChevronRight className="w-3 h-3 text-white/20 shrink-0 hidden sm:block" aria-hidden="true" />
        <span className="text-white font-bold text-[15px] sm:text-[16px] truncate">{pageLabel}</span>
      </div>

      {searchItems && searchItems.length > 0 && <ShellSearchBar items={searchItems} placeholder={searchPlaceholder} />}

      <div className="ml-auto flex items-center gap-1.5 shrink-0 relative">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setNotifOpen((v) => !v); setUserMenuOpen(false); }}
            aria-label={totalAlerts > 0 ? `Notifications, ${totalAlerts} need attention` : 'Notifications'}
            aria-expanded={notifOpen}
            className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors relative"
            title="Notifications"
          >
            <Bell className="w-[17px] h-[17px]" aria-hidden="true" />
            {totalAlerts > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-brand-red rounded-full ring-2 ring-[#111111]" aria-hidden="true" />}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-11 w-[min(20rem,calc(100vw-2rem))] bg-[#1c1c1c] border border-white/10 rounded-2xl shadow-2xl p-4 z-50">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <span className="text-xs font-bold text-white">Notifications</span>
                <span className="text-[10px] bg-brand-red/20 text-red-300 font-bold px-2 py-0.5 rounded-full border border-brand-red/30">
                  {totalAlerts} Action{totalAlerts === 1 ? '' : 's'}
                </span>
              </div>
              <div className="py-2 space-y-2 max-h-64 overflow-y-auto">
                {alerts.map(({ icon: Icon, tone, title, detail, to }) => (
                  <Link key={to + title} to={to} onClick={() => setNotifOpen(false)} className="flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-white/5 transition-colors">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${tone}`}>
                      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white leading-tight">{title}</p>
                      <p className="text-[10px] text-white/50">{detail}</p>
                    </div>
                  </Link>
                ))}
                {totalAlerts === 0 && <p className="text-center py-6 text-xs text-white/40">Nothing needs your attention</p>}
              </div>
            </div>
          )}
        </div>

        {messages && (
          <Link
            to={messages.to}
            className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors relative"
            title="Messages"
            aria-label={messages.unread > 0 ? `Messages, ${messages.unread} unread` : 'Messages'}
          >
            <MessageSquare className="w-[17px] h-[17px]" aria-hidden="true" />
            {messages.unread > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[15px] h-[15px] px-0.5 bg-brand-red text-white text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-[#111111]" aria-hidden="true">
                {messages.unread > 9 ? '9+' : messages.unread}
              </span>
            )}
          </Link>
        )}

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => { setUserMenuOpen((v) => !v); setNotifOpen(false); }}
            aria-expanded={userMenuOpen}
            aria-label="Account menu"
            className="flex items-center gap-2.5 ml-1 pl-3 border-l border-white/10 hover:opacity-90 transition-opacity"
          >
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-white/25 uppercase tracking-widest leading-none">{roleLabel}</p>
              <p className="text-[13px] font-semibold text-white/85 leading-tight mt-0.5 truncate max-w-[140px]">{user.name}</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-red to-brand-red-dark flex items-center justify-center text-white text-[11px] font-bold shrink-0 ring-2 ring-white/10">
              {user.initials}
            </div>
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-11 w-56 bg-[#1c1c1c] border border-white/10 rounded-2xl shadow-2xl p-2 z-50">
              <div className="px-3 py-2 border-b border-white/10 mb-1">
                <p className="text-xs font-bold text-white truncate">{user.name}</p>
                <p className="text-[10px] text-white/40 truncate">{user.email}</p>
              </div>
              {menuLinks?.map(({ icon: Icon, label, to }) => (
                <Link key={to} to={to} onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-white/70 hover:text-white hover:bg-white/5 rounded-xl transition-colors">
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" /> {label}
                </Link>
              ))}
              <button
                onClick={() => { setUserMenuOpen(false); onLogout(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors mt-1 border-t border-white/10"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" /> Log Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
