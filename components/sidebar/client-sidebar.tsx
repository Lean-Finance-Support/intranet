"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setActiveCompany } from "@/app/app/select-company/actions";
import NotificationsDrawer from "@/components/notifications-drawer";
import { useUnreadNotifications } from "@/lib/hooks/use-unread-notifications";

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

// ---- Icons extra ----
function ChevronUpDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
    </svg>
  );
}
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

// ---- Props ----
export interface ClientSidebarProfile {
  full_name: string | null;
  email: string | null;
}

export interface SidebarCompany {
  id: string;
  legal_name: string;
  company_name: string | null;
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  );
}

interface ClientSidebarProps {
  profile: ClientSidebarProfile;
  hasTaxModels: boolean;
  hasEnisaDocs: boolean;
  loginPath: string;
  linkPrefix: string;
  userId: string;
  unreadCount: number;
  companies: SidebarCompany[];
  activeCompany: SidebarCompany | null;
}

// ---- Main Component ----
export default function ClientSidebar({ profile, hasTaxModels, hasEnisaDocs, loginPath, linkPrefix, userId, unreadCount: initialUnreadCount, companies, activeCompany }: ClientSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [companySwitcherOpen, setCompanySwitcherOpen] = useState(false);
  const [switchingCompany, setSwitchingCompany] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const unreadCount = useUnreadNotifications(userId, initialUnreadCount);

  async function handleSwitchCompany(companyId: string) {
    setSwitchingCompany(true);
    setCompanySwitcherOpen(false);
    try {
      await setActiveCompany(companyId);
      // Full reload para asegurar que todas las vistas del portal se actualizan con la nueva empresa
      window.location.reload();
    } catch {
      setSwitchingCompany(false);
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem("client-sidebar-collapsed");
    if (stored !== null) setCollapsed(stored === "true");
  }, []);

  useEffect(() => {
    localStorage.setItem("client-sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  async function handleLogout() {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    document.cookie = "x-user-role=; path=/; max-age=0";
    document.cookie = "x-active-company-id=; path=/; max-age=0";
    window.location.href = loginPath;
  }

  const dashHref = `${linkPrefix}/dashboard`;
  const modelosHref = `${linkPrefix}/modelos`;
  const enisaHref = `${linkPrefix}/enisa`;
  const empresaHref = `${linkPrefix}/empresa`;

  function handleNotifClick() {
    setMobileOpen(false);
    setDrawerOpen((v) => !v);
  }

  function isActive(href: string) {
    const path = pathname ?? "";
    if (href === dashHref) return path === dashHref || path === "/app/dashboard";
    return path === href || path.startsWith(href + "/") || path === href.replace(linkPrefix, "");
  }

  const initials = profile.full_name
    ? profile.full_name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : (profile.email?.[0] ?? "?").toUpperCase();

  const switcherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setCompanySwitcherOpen(false);
      }
    }
    if (companySwitcherOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [companySwitcherOpen]);

  const hasMultipleCompanies = companies.length > 1;
  const activeLabel = activeCompany
    ? (activeCompany.company_name || activeCompany.legal_name)
    : "Sin empresa";

  const companySwitcher = activeCompany && (
    <div ref={switcherRef} className="relative px-2 py-3 border-b border-white/10 flex-shrink-0">
      <button
        onClick={() => hasMultipleCompanies && setCompanySwitcherOpen((v) => !v)}
        className={`
          flex items-center gap-3 w-full px-2 py-2 rounded-lg transition-colors
          ${hasMultipleCompanies ? "hover:bg-white/10 cursor-pointer" : "cursor-default"}
          ${collapsed ? "justify-center" : ""}
        `}
      >
        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
          <BuildingIcon className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-semibold text-white truncate">{activeLabel}</p>
              {hasMultipleCompanies && (
                <p className="text-[10px] text-white/50">{companies.length} empresas</p>
              )}
            </div>
            {hasMultipleCompanies && (
              <ChevronUpDownIcon className="w-4 h-4 text-white/60 flex-shrink-0" />
            )}
          </>
        )}
      </button>
      {companySwitcherOpen && !collapsed && (
        <div className="absolute left-2 right-2 top-full mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-50 py-1 max-h-60 overflow-y-auto">
          {companies.map((company) => {
            const isActive = company.id === activeCompany.id;
            const label = company.company_name || company.legal_name;
            return (
              <button
                key={company.id}
                disabled={isActive || switchingCompany}
                onClick={() => handleSwitchCompany(company.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors
                  ${isActive ? "bg-brand-teal/5" : "hover:bg-gray-50 cursor-pointer"}
                  disabled:cursor-default
                `}
              >
                <div className="w-7 h-7 rounded-md bg-brand-teal/10 flex items-center justify-center flex-shrink-0">
                  <BuildingIcon className="w-3.5 h-3.5 text-brand-teal" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-brand-navy truncate">{label}</p>
                  {company.company_name && (
                    <p className="text-[10px] text-text-muted truncate">{company.legal_name}</p>
                  )}
                </div>
                {isActive && <CheckIcon className="w-4 h-4 text-brand-teal flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

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
      <NavItem icon={<BuildingIcon className="w-5 h-5" />} label="Mi empresa" href={empresaHref} active={isActive(empresaHref)} collapsed={collapsed} />
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
              <p className="text-[10px] text-white/50 truncate">Portal de clientes</p>
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
            <p className="text-[10px] text-white/50 truncate leading-tight">Portal de clientes</p>
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
        {companySwitcher}
        {navItems}
        {userSection}
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed top-0 left-0 right-0 bottom-14 z-40 flex justify-end lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="relative w-64 h-full flex flex-col bg-brand-navy border-l border-white/10 animate-slide-in-right">
            {activeCompany && (
              <div className="px-2 py-3 border-b border-white/10">
                {hasMultipleCompanies ? (
                  <div className="space-y-1">
                    {companies.map((company) => {
                      const isActive = company.id === activeCompany.id;
                      const label = company.company_name || company.legal_name;
                      return (
                        <button
                          key={company.id}
                          disabled={isActive || switchingCompany}
                          onClick={() => handleSwitchCompany(company.id)}
                          className={`
                            w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors
                            ${isActive ? "bg-white/10" : "hover:bg-white/5 cursor-pointer"}
                            disabled:cursor-default
                          `}
                        >
                          <div className="w-7 h-7 rounded-md bg-white/10 flex items-center justify-center flex-shrink-0">
                            <BuildingIcon className="w-3.5 h-3.5 text-white" />
                          </div>
                          <p className="text-xs font-medium text-white truncate flex-1">{label}</p>
                          {isActive && <CheckIcon className="w-4 h-4 text-brand-teal flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-2 py-2">
                    <div className="w-7 h-7 rounded-md bg-white/10 flex items-center justify-center flex-shrink-0">
                      <BuildingIcon className="w-3.5 h-3.5 text-white" />
                    </div>
                    <p className="text-xs font-semibold text-white truncate">{activeLabel}</p>
                  </div>
                )}
              </div>
            )}
            <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto" onClick={() => setMobileOpen(false)}>
              <NavItem icon={<HomeIcon className="w-5 h-5" />} label="Dashboard" href={dashHref} active={isActive(dashHref)} collapsed={false} />
              {hasTaxModels && (
                <NavItem icon={<DocumentIcon className="w-5 h-5" />} label="Modelos fiscales" href={modelosHref} active={isActive(modelosHref)} collapsed={false} />
              )}
              {hasEnisaDocs && (
                <NavItem icon={<FolderIcon className="w-5 h-5" />} label="Documentación ENISA" href={enisaHref} active={isActive(enisaHref)} collapsed={false} />
              )}
              <div className="my-2 border-t border-white/10 mx-2" />
              <NavItem icon={<BuildingIcon className="w-5 h-5" />} label="Mi empresa" href={empresaHref} active={isActive(empresaHref)} collapsed={false} />
            </nav>
          </div>
        </div>
      )}

      <NotificationsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        linkPrefix={linkPrefix}
      />
    </>
  );
}
