"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import NotificationsDrawer from "@/components/notifications-drawer";

// ---- Icons ----
function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  );
}
function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
}
function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  );
}
function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
  );
}
function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}
function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}
function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}
function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}
function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
// ---- Nav Item ----
function NavItem({
  icon,
  label,
  href,
  onClick,
  active,
  collapsed,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  collapsed: boolean;
  badge?: number;
}) {
  const className = `
    relative flex items-center gap-3 px-3 py-2.5 rounded-lg w-full
    transition-all duration-150 group/item cursor-pointer
    ${active
      ? "bg-white/10 text-white border-l-2 border-brand-teal pl-[10px]"
      : "text-white/60 hover:bg-white/5 hover:text-white border-l-2 border-transparent pl-[10px]"
    }
  `;
  const content = (
    <>
      <span className="flex-shrink-0 w-5 h-5 relative">
        {icon}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-brand-teal text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span className={`text-sm font-semibold whitespace-nowrap transition-all duration-200 ${collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"}`}>
        {label}
      </span>
      {collapsed && (
        <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md bg-gray-900 text-white text-xs whitespace-nowrap opacity-0 group-hover/item:opacity-100 transition-opacity duration-150 delay-150 pointer-events-none z-[100]">
          {label}{badge !== undefined && badge > 0 ? ` (${badge})` : ""}
        </span>
      )}
    </>
  );
  if (href) {
    return <Link href={href} className={className}>{content}</Link>;
  }
  return <button type="button" onClick={onClick} className={className}>{content}</button>;
}

// ---- Props ----
export interface AdminSidebarProfile {
  full_name: string | null;
  email: string | null;
}


function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  );
}

interface AdminSidebarProps {
  profile: AdminSidebarProfile;
  hasTaxModels: boolean;
  hasEnisaDocs: boolean;
  loginPath: string;
  linkPrefix: string;
  unreadCount: number;
}

// ---- Main Component ----
export default function AdminSidebar({ profile, hasTaxModels, hasEnisaDocs, loginPath, linkPrefix, unreadCount: initialUnreadCount }: AdminSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [liveUnreadCount, setLiveUnreadCount] = useState(initialUnreadCount);
  const unreadCount = liveUnreadCount;
  const handleUnreadCountChange = useCallback((count: number) => setLiveUnreadCount(count), []);
  useEffect(() => {
    const stored = localStorage.getItem("admin-sidebar-collapsed");
    if (stored !== null) setCollapsed(stored === "true");
  }, []);

  useEffect(() => {
    localStorage.setItem("admin-sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  async function handleLogout() {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    document.cookie = "x-user-role=; path=/; max-age=0";
    window.location.href = loginPath;
  }

  const dashHref = `${linkPrefix}/dashboard`;
  const modelosHref = `${linkPrefix}/modelos`;
  const enisaHref = `${linkPrefix}/enisa`;
  const deptHref = `${linkPrefix}/departamento`;
  const clientesHref = `${linkPrefix}/clientes`;

  const isActive = (href: string) => {
    const path = pathname ?? "";
    if (href === dashHref) return path === dashHref || path === "/admin/dashboard";
    return path === href || path.startsWith(href + "/") || path === href.replace(linkPrefix, "");
  };

  const initials = profile.full_name
    ? profile.full_name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : (profile.email?.[0] ?? "?").toUpperCase();

  const isDeptActive = isActive(deptHref);

  function handleNotifClick() {
    setMobileOpen(false);
    setDrawerOpen(true);
  }

  const navItems = (
    <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto overflow-x-hidden">
      <NavItem icon={<HomeIcon className="w-5 h-5" />} label="Dashboard" href={dashHref} active={isActive(dashHref)} collapsed={collapsed} />
      {hasTaxModels && (
        <NavItem icon={<DocumentIcon className="w-5 h-5" />} label="Modelos fiscales" href={modelosHref} active={isActive(modelosHref)} collapsed={collapsed} />
      )}
      {hasEnisaDocs && (
        <NavItem icon={<FolderIcon className="w-5 h-5" />} label="Documentación ENISA" href={enisaHref} active={isActive(enisaHref)} collapsed={collapsed} />
      )}
      <div className={`my-2 border-t border-white/10 ${collapsed ? "mx-1" : "mx-2"}`} />
      <NavItem icon={<UsersIcon className="w-5 h-5" />} label="Mi departamento" href={deptHref} active={isDeptActive} collapsed={collapsed} />
      <NavItem icon={<BuildingIcon className="w-5 h-5" />} label="Clientes" href={clientesHref} active={isActive(clientesHref)} collapsed={collapsed} />
      <NavItem icon={<BellIcon className="w-5 h-5" />} label="Notificaciones" onClick={handleNotifClick} collapsed={collapsed} badge={unreadCount} />
    </nav>
  );

  const userSection = (
    <div className="border-t border-white/10 px-2 py-3 flex-shrink-0">
      <div className={`flex items-center gap-3 px-2 py-2 ${collapsed ? "justify-center" : ""}`}>
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 text-white text-xs font-semibold">
          {initials}
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{profile.full_name ?? profile.email ?? "Usuario"}</p>
              <p className="text-[10px] text-white/50 truncate">Portal de empleados</p>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              title="Cerrar sesión"
              className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors text-white/50 hover:text-red-400 flex-shrink-0 cursor-pointer disabled:opacity-50"
            >
              <LogoutIcon className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
      {collapsed && (
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          title="Cerrar sesión"
          className="w-full mt-1 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors text-white/50 hover:text-red-400 cursor-pointer disabled:opacity-50"
        >
          <LogoutIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile bottom bar: user+logout (left) | notifications + hamburger (right) */}
      <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden h-14 bg-brand-navy border-t border-white/10 shadow-[0_-2px_8px_rgba(0,0,0,0.15)] flex items-center justify-between px-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 text-white text-xs font-semibold">
            {initials}
          </div>
          <div className="min-w-0 max-w-[110px]">
            <p className="text-xs font-medium text-white truncate leading-tight">{profile.full_name ?? profile.email ?? "Usuario"}</p>
            <p className="text-[10px] text-white/50 truncate leading-tight">Portal de empleados</p>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            aria-label="Cerrar sesión"
            className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-red-400 cursor-pointer disabled:opacity-50 flex-shrink-0 transition-colors"
          >
            <LogoutIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleNotifClick}
            aria-label="Notificaciones"
            className="relative w-10 h-10 rounded-lg flex items-center justify-center transition-colors cursor-pointer bg-white/10 hover:bg-white/15 text-white/80 hover:text-white"
          >
            <BellIcon className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-brand-teal text-white text-[9px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
            className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/15 flex items-center justify-center text-white transition-colors"
          >
            {mobileOpen ? <XIcon className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className={`hidden lg:flex flex-col h-full flex-shrink-0 bg-brand-navy border-r border-white/10 transition-all duration-300 ease-in-out ${collapsed ? "w-16" : "w-64"}`}>
        {/* Collapse button */}
        <div className="flex items-center justify-end px-3 py-3 border-b border-white/10 flex-shrink-0">
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors text-white/60 hover:text-white"
            title={collapsed ? "Expandir" : "Colapsar"}
          >
            <ChevronLeftIcon className={`w-4 h-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`} />
          </button>
        </div>
        {navItems}
        {userSection}
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed top-0 left-0 right-0 bottom-14 z-40 flex lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="relative w-64 h-full flex flex-col bg-brand-navy border-r border-white/10 animate-slide-in-right">
            <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
              <NavItem icon={<HomeIcon className="w-5 h-5" />} label="Dashboard" href={dashHref} active={isActive(dashHref)} collapsed={false} />
              {hasTaxModels && (
                <NavItem icon={<DocumentIcon className="w-5 h-5" />} label="Modelos fiscales" href={modelosHref} active={isActive(modelosHref)} collapsed={false} />
              )}
              {hasEnisaDocs && (
                <NavItem icon={<FolderIcon className="w-5 h-5" />} label="Doc. ENISA" href={enisaHref} active={isActive(enisaHref)} collapsed={false} />
              )}
              <div className="my-2 border-t border-white/10 mx-2" />
              <NavItem icon={<UsersIcon className="w-5 h-5" />} label="Mi departamento" href={deptHref} active={isDeptActive} collapsed={false} />
              <NavItem icon={<BuildingIcon className="w-5 h-5" />} label="Clientes" href={clientesHref} active={isActive(clientesHref)} collapsed={false} />
              <NavItem icon={<BellIcon className="w-5 h-5" />} label="Notificaciones" onClick={handleNotifClick} collapsed={false} badge={unreadCount} />
            </nav>
          </div>
        </div>
      )}

      <NotificationsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        linkPrefix={linkPrefix}
        onUnreadCountChange={handleUnreadCountChange}
      />
    </>
  );
}
