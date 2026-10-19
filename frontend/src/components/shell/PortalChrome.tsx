// The sidebar and top bar of the portals, as reusable pieces. The dark look is the admin console's (copied from
// pages/admin/AdminLayout.tsx on purpose: change the two together), worn by the courier station; the light look is the
// seller portal's (pages/seller/SellerLayout.tsx), worn by the logistics hub.
import { Link } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, LogOut, Menu, MessageSquare, PanelLeft, Search, X } from 'lucide-react';
import LovedItLogo from '../LovedItLogo';
import NotificationBell from '../notifications/NotificationBell';

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

/** The sidebar's two looks: the admin console's dark one, and the seller portal's white one. */
const SIDEBAR_THEMES = {
  dark: {
    root: '',
    rule: 'border-white/10',
    logoTile: 'bg-white/10 border border-white/20',
    logoVariant: 'dark' as const,
    brand: 'text-white',
    tagline: 'text-white/40',
    heading: 'text-gray-500',
    item: 'rounded-lg',
    itemOn: 'bg-brand-red text-white',
    itemOff: 'text-gray-400 hover:text-white hover:bg-white/[0.06]',
    iconOn: '',
    iconOff: '',
    badge: 'bg-white text-brand-red',
    userCard: 'hover:bg-white/[0.04]',
    userName: 'text-white',
    userEmail: 'text-white/40',
    logout: 'bg-red-500/15 text-white/60 hover:bg-red-500/35 hover:text-white',
  },
  light: {
    root: 'bg-white border-r border-gray-200',
    rule: 'border-gray-100',
    logoTile: 'bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/80',
    logoVariant: 'light' as const,
    brand: 'text-gray-900',
    tagline: 'text-gray-400',
    heading: 'text-gray-400',
    item: 'rounded-xl',
    itemOn: 'bg-red-50 text-brand-red font-semibold',
    itemOff: 'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
    iconOn: 'text-brand-red',
    iconOff: 'text-gray-500 group-hover:text-gray-700',
    badge: 'bg-brand-red text-white',
    userCard: 'hover:bg-gray-50',
    userName: 'text-gray-800',
    userEmail: 'text-gray-400',
    logout: 'text-gray-400 hover:text-red-600 hover:bg-red-50',
  },
};

export function ShellSidebar({
  theme = 'dark',
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
  /** The admin console's dark sidebar, or the seller portal's white one. */
  theme?: ShellTheme;
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
  const t = SIDEBAR_THEMES[theme];
  return (
    <div className={`flex flex-col h-full ${t.root}`} style={theme === 'dark' ? SHELL_BG : undefined}>
      {/* Brand */}
      <div className={`border-b shrink-0 ${t.rule} ${collapsed ? 'px-0 py-3 flex justify-center' : 'px-4 py-3'}`}>
        <Link to={brandTo} onClick={onNavigate} className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
          <div className={`w-7 h-7 rounded-full flex items-center justify-center p-0.5 shrink-0 shadow-xs hover:scale-105 transition-transform ${t.logoTile}`}>
            <LovedItLogo variant={t.logoVariant} type="icon" size="custom" showText={false} imgClassName="w-5 h-5 object-contain" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`font-black text-[14px] tracking-tight leading-none ${t.brand}`}>Loved-IT</span>
                <span className="text-[8.5px] font-black uppercase tracking-wider bg-brand-red text-white px-1.5 py-0.5 rounded">{roleBadge}</span>
              </div>
              <p className={`text-[9.5px] uppercase tracking-[0.08em] font-semibold mt-0.5 ${t.tagline}`}>{tagline}</p>
            </div>
          )}
        </Link>
      </div>

      {!collapsed && profile}

      <nav aria-label={navLabel} className="flex-1 px-2 py-2 space-y-3 overflow-y-auto overflow-x-hidden" style={{ scrollbarWidth: 'none' }}>
        {nav.map((group) => (
          <div key={group.heading}>
            {!collapsed && (
              <p className={`text-[10px] font-bold uppercase tracking-[0.1em] px-3 mb-1 ${t.heading}`}>{group.heading}</p>
            )}
            {collapsed && <div className={`my-1 mx-2 border-t ${t.rule}`} />}
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
                    'relative flex items-center gap-2.5 text-[13px] font-medium transition-all duration-150 mb-0.5 group',
                    t.item,
                    collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red',
                    active ? t.itemOn : t.itemOff,
                  ].join(' ')}
                >
                  <Icon className={`w-[17px] h-[17px] shrink-0 transition-colors ${active ? t.iconOn : t.iconOff}`} aria-hidden="true" />
                  {!collapsed && <span className="flex-1 truncate">{label}</span>}
                  {!collapsed && badge !== undefined && badge > 0 && (
                    <span className={`min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full flex items-center justify-center leading-none ${t.badge}`}>
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
      <div className={`border-t shrink-0 ${t.rule} ${collapsed ? 'px-2 py-3' : 'px-3 py-3'}`}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-red to-brand-red-dark flex items-center justify-center text-white text-[11px] font-bold">
              {user.initials}
            </div>
            <button
              onClick={onLogout}
              title="Log out"
              aria-label="Log out"
              className={`w-8 h-8 rounded-lg transition-all flex items-center justify-center ${t.logout}`}
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className={`flex items-center gap-3 px-2 py-2 rounded-xl transition-colors ${t.userCard}`}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-red to-brand-red-dark flex items-center justify-center text-white text-[11px] font-bold shrink-0">
              {user.initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[12px] font-semibold truncate leading-tight ${t.userName}`}>{user.name}</p>
              <p className={`text-[10px] truncate ${t.userEmail}`}>{user.email}</p>
            </div>
            <button
              onClick={onLogout}
              title="Log out"
              aria-label="Log out"
              className={`w-7 h-7 rounded-lg transition-all flex items-center justify-center shrink-0 ${t.logout}`}
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Themes ───────────────────────────────────────────────────────────────────

/** The top bar comes in the admin console's dark look and in the seller dashboard's light look. */
export type ShellTheme = 'dark' | 'light';

interface ThemeClasses {
  bar: string;
  iconButton: string;
  root: string;
  chevron: string;
  title: string;
  ring: string;
  panel: string;
  panelHead: string;
  panelTitle: string;
  panelCount: string;
  alertRow: string;
  alertTitle: string;
  alertDetail: string;
  empty: string;
  divider: string;
  userRole: string;
  userName: string;
  avatarRing: string;
  menuName: string;
  menuEmail: string;
  menuLink: string;
  logout: string;
  searchBox: string;
  searchBoxOpen: string;
  searchIcon: string;
  searchInput: string;
  searchHint: string;
  searchClear: string;
  searchPanel: string;
  searchRowOn: string;
  searchRowOff: string;
  searchTileOn: string;
  searchTileOff: string;
  searchGroup: string;
  searchFoot: string;
}

const THEMES: Record<ShellTheme, ThemeClasses> = {
  dark: {
    bar: 'border-b border-white/10',
    iconButton: 'text-gray-400 hover:text-white hover:bg-white/10',
    root: 'text-white/30',
    chevron: 'text-white/20',
    title: 'text-white',
    ring: 'ring-[#111111]',
    panel: 'bg-[#1c1c1c] border border-white/10',
    panelHead: 'border-b border-white/10',
    panelTitle: 'text-white',
    panelCount: 'bg-brand-red/20 text-red-300 border border-brand-red/30',
    alertRow: 'hover:bg-white/5',
    alertTitle: 'text-white',
    alertDetail: 'text-white/50',
    empty: 'text-white/40',
    divider: 'border-white/10',
    userRole: 'text-white/25',
    userName: 'text-white/85',
    avatarRing: 'ring-white/10',
    menuName: 'text-white',
    menuEmail: 'text-white/40',
    menuLink: 'text-white/70 hover:text-white hover:bg-white/5',
    logout: 'text-rose-400 hover:bg-rose-500/10',
    searchBox: 'bg-white/[0.06] hover:bg-white/[0.09] border border-white/[0.08]',
    searchBoxOpen: 'border border-brand-red/60 ring-2 ring-brand-red/20 bg-white/[0.09]',
    searchIcon: 'text-white/40',
    searchInput: 'text-white placeholder-white/40',
    searchHint: 'text-white/30 border-white/10',
    searchClear: 'text-white/40 hover:text-white',
    searchPanel: 'bg-[#1a1a1a] border border-white/10',
    searchRowOn: 'bg-white/10 text-white',
    searchRowOff: 'text-white/70 hover:bg-white/5 hover:text-white',
    searchTileOn: 'bg-brand-red text-white',
    searchTileOff: 'bg-white/5 text-white/60',
    searchGroup: 'text-white/30',
    searchFoot: 'bg-black/30 border-t border-white/5 text-white/30',
  },
  light: {
    bar: 'bg-white border-b border-gray-200 shadow-2xs',
    iconButton: 'text-gray-500 hover:text-gray-900 hover:bg-gray-100',
    root: 'text-gray-400',
    chevron: 'text-gray-300',
    title: 'text-gray-900',
    ring: 'ring-white',
    panel: 'bg-white border border-gray-200',
    panelHead: 'border-b border-gray-100',
    panelTitle: 'text-gray-900',
    panelCount: 'bg-red-50 text-brand-red border border-red-200',
    alertRow: 'hover:bg-gray-50',
    alertTitle: 'text-gray-800',
    alertDetail: 'text-gray-500',
    empty: 'text-gray-500',
    divider: 'border-gray-100',
    userRole: 'text-gray-400',
    userName: 'text-gray-800',
    avatarRing: 'ring-red-100',
    menuName: 'text-gray-900',
    menuEmail: 'text-gray-500',
    menuLink: 'text-gray-700 hover:text-gray-900 hover:bg-gray-50',
    logout: 'text-rose-600 hover:bg-rose-50',
    searchBox: 'bg-gray-50 hover:bg-gray-100/70 border border-gray-200',
    searchBoxOpen: 'border border-brand-red/60 ring-2 ring-brand-red/15 bg-white',
    searchIcon: 'text-gray-400',
    searchInput: 'text-gray-800 placeholder-gray-400',
    searchHint: 'text-gray-400 border-gray-200',
    searchClear: 'text-gray-400 hover:text-gray-700',
    searchPanel: 'bg-white border border-gray-200',
    searchRowOn: 'bg-gray-100 text-gray-900',
    searchRowOff: 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
    searchTileOn: 'bg-brand-red text-white',
    searchTileOff: 'bg-gray-100 text-gray-500',
    searchGroup: 'text-gray-400',
    searchFoot: 'bg-gray-50 border-t border-gray-100 text-gray-400',
  },
};

// ─── Search ───────────────────────────────────────────────────────────────────

export interface ShellSearchItem {
  label: string;
  to: string;
  group: string;
  icon: React.ElementType;
}

function ShellSearchBar({ items, placeholder, theme }: { items: ShellSearchItem[]; placeholder: string; theme: ShellTheme }) {
  const t = THEMES[theme];
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
      <div className={`flex items-center gap-2 rounded-xl px-3 py-1.5 transition-all ${isOpen ? t.searchBoxOpen : t.searchBox}`}>
        <Search className={`w-4 h-4 shrink-0 ${t.searchIcon}`} aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={onKeyDown}
          aria-label={placeholder}
          placeholder={placeholder}
          className={`flex-1 bg-transparent text-xs outline-none ${t.searchInput}`}
        />
        {query ? (
          <button type="button" aria-label="Clear search" onClick={() => { setQuery(''); inputRef.current?.focus(); }} className={`p-0.5 rounded ${t.searchClear}`}>
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        ) : (
          <span className={`text-[10px] font-mono border rounded px-1.5 py-0.5 shrink-0 ${t.searchHint}`}>Ctrl K</span>
        )}
      </div>

      {isOpen && (
        <div className={`absolute left-0 right-0 top-full mt-1.5 rounded-xl shadow-2xl overflow-hidden z-50 ${t.searchPanel}`}>
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
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors ${selected ? t.searchRowOn : t.searchRowOff}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${selected ? t.searchTileOn : t.searchTileOff}`}>
                        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                      </div>
                      <span className="text-xs font-medium truncate">{item.label}</span>
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider font-semibold shrink-0 ml-2 ${t.searchGroup}`}>{item.group}</span>
                  </button>
                );
              })
            ) : (
              <div className={`py-6 text-center text-xs ${t.empty}`}>No matching pages for "{query}"</div>
            )}
          </div>
          <div className={`px-3 py-1.5 flex items-center justify-between text-[10px] ${t.searchFoot}`}>
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
  theme = 'dark',
  rootLabel,
  pageLabel,
  roleLabel,
  user,
  searchItems,
  searchPlaceholder = 'Search pages...',
  alerts,
  alertsTitle = 'Notifications',
  messages,
  actions,
  menuLinks,
  leading,
  onToggleSidebar,
  onOpenMobile,
  onLogout,
}: {
  /** The admin console's dark bar, or the seller dashboard's light bar. */
  theme?: ShellTheme;
  rootLabel: string;
  pageLabel: string;
  /** The small caption under (dark) or over (light) the user's name, such as "Hub manager". */
  roleLabel: string;
  user: ShellUser;
  searchItems?: ShellSearchItem[];
  searchPlaceholder?: string;
  alerts: ShellAlert[];
  alertsTitle?: string;
  /** The messages shortcut, with its unread count. */
  messages?: { to: string; unread: number };
  /** Extra buttons before the messages shortcut (such as "View Shop"). */
  actions?: ReactNode;
  menuLinks?: ShellMenuLink[];
  /** Something to show before the breadcrumb, such as the logo on a phone. */
  leading?: ReactNode;
  /** The collapse button (desktop). Leave out when the sidebar cannot collapse. */
  onToggleSidebar?: () => void;
  /** The menu button (phone). Leave out when the portal has its own phone navigation. */
  onOpenMobile?: () => void;
  onLogout: () => void;
}) {
  const t = THEMES[theme];
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Close either popover on an outside click or Escape.
  useEffect(() => {
    if (!userMenuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [userMenuOpen]);

  const totalAlerts = alerts.length;
  const iconBtn = `w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg transition-colors relative ${t.iconButton}`;
  const messagesLink = messages ? (
<Link
            to={messages.to}
            className={iconBtn}
            title="Messages"
            aria-label={messages.unread > 0 ? `Messages, ${messages.unread} unread` : 'Messages'}
          >
            <MessageSquare className="w-[17px] h-[17px]" aria-hidden="true" />
            {messages.unread > 0 && (
              <span className={`absolute top-0.5 right-0.5 min-w-[15px] h-[15px] px-0.5 bg-brand-red text-white text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ${t.ring}`} aria-hidden="true">
                {messages.unread > 9 ? '9+' : messages.unread}
              </span>
            )}
          </Link>
  ) : null;

  return (
    <div
      ref={barRef}
      className={`h-14 shrink-0 flex items-center gap-3 px-4 sm:px-5 sticky top-0 z-20 print:hidden ${t.bar}`}
      style={theme === 'dark' ? SHELL_BG : undefined}
    >
      {leading}
      {onToggleSidebar && (
        <button
          onClick={onToggleSidebar}
          aria-label="Collapse or expand the sidebar"
          className={`hidden lg:flex w-8 h-8 items-center justify-center rounded-lg transition-colors shrink-0 ${t.iconButton}`}
        >
          <PanelLeft className="w-[18px] h-[18px]" aria-hidden="true" />
        </button>
      )}
      {onOpenMobile && (
        <button
          onClick={onOpenMobile}
          aria-label="Open the menu"
          className={`lg:hidden w-9 h-9 flex items-center justify-center rounded-lg transition-colors shrink-0 ${t.iconButton}`}
        >
          <Menu className="w-[18px] h-[18px]" aria-hidden="true" />
        </button>
      )}

      {/* Breadcrumb + page title */}
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-[13px] truncate hidden sm:block ${t.root}`}>{rootLabel}</span>
        <ChevronRight className={`w-3 h-3 shrink-0 hidden sm:block ${t.chevron}`} aria-hidden="true" />
        <span className={`font-bold text-[15px] sm:text-[16px] truncate ${t.title}`}>{pageLabel}</span>
      </div>

      {searchItems && searchItems.length > 0 && <ShellSearchBar items={searchItems} placeholder={searchPlaceholder} theme={theme} />}

      <div className="ml-auto flex items-center gap-1.5 shrink-0 relative">
        {actions}

        {theme === 'light' && messagesLink}

        {/* Notifications: the inbox (every order and shipment change) and what needs attention right now */}
        <NotificationBell
          variant={theme === 'dark' ? 'dark' : 'light'}
          attention={totalAlerts}
          extra={totalAlerts > 0 ? (
            <div className="border-t border-stone-100 px-3 py-2.5 bg-stone-50/60">
              <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">{alertsTitle}</p>
              <div className="space-y-1">
                {alerts.map(({ icon: Icon, tone, title, detail, to }) => (
                  <Link key={to + title} to={to} className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-white transition-colors">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${tone}`}>
                      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold leading-tight text-stone-900">{title}</p>
                      <p className="text-[11px] text-stone-500">{detail}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        />

        {theme === 'dark' && messagesLink}

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            aria-expanded={userMenuOpen}
            aria-label="Account menu"
            className={`flex items-center gap-2.5 ml-1 pl-3 border-l hover:opacity-90 transition-opacity ${t.divider}`}
          >
            <div className="text-right hidden sm:block">
              {theme === 'dark' ? (
                <>
                  <p className={`text-[10px] uppercase tracking-widest leading-none ${t.userRole}`}>{roleLabel}</p>
                  <p className={`text-[13px] font-semibold leading-tight mt-0.5 truncate max-w-[140px] ${t.userName}`}>{user.name}</p>
                </>
              ) : (
                <>
                  <p className={`text-[12px] font-semibold leading-tight truncate max-w-[140px] ${t.userName}`}>{user.name}</p>
                  <p className={`text-[10px] truncate max-w-[140px] ${t.userRole}`}>{roleLabel}</p>
                </>
              )}
            </div>
            <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-brand-red to-brand-red-dark flex items-center justify-center text-white text-[11px] font-bold shrink-0 ring-2 ${t.avatarRing}`}>
              {user.initials}
            </div>
          </button>

          {userMenuOpen && (
            <div className={`absolute right-0 top-11 w-56 rounded-2xl shadow-2xl p-2 z-50 ${t.panel}`}>
              <div className={`px-3 py-2 mb-1 ${t.panelHead}`}>
                <p className={`text-xs font-bold truncate ${t.menuName}`}>{user.name}</p>
                <p className={`text-[10px] truncate ${t.menuEmail}`}>{user.email}</p>
              </div>
              {menuLinks?.map(({ icon: Icon, label, to }) => (
                <Link key={to} to={to} onClick={() => setUserMenuOpen(false)} className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-xl transition-colors ${t.menuLink}`}>
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" /> {label}
                </Link>
              ))}
              <button
                onClick={() => { setUserMenuOpen(false); onLogout(); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-xl transition-colors mt-1 border-t ${t.divider} ${t.logout}`}
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
