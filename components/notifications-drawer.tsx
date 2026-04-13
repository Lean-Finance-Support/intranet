"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/actions/notifications";
import type { Notification } from "@/lib/types/notifications";

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return "Ahora";
  if (diffMins < 60) return `Hace ${diffMins}m`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays < 7) return `Hace ${diffDays}d`;
  return date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
}

function groupNotifications(notifications: Notification[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups: Record<string, Notification[]> = {
    hoy: [],
    ayer: [],
    semana: [],
    antes: [],
  };
  for (const n of notifications) {
    const d = new Date(n.created_at);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (day >= today) groups.hoy.push(n);
    else if (day >= yesterday) groups.ayer.push(n);
    else if (day >= weekAgo) groups.semana.push(n);
    else groups.antes.push(n);
  }

  return [
    { label: "Hoy", items: groups.hoy },
    { label: "Ayer", items: groups.ayer },
    { label: "Esta semana", items: groups.semana },
    { label: "Anteriores", items: groups.antes },
  ].filter((g) => g.items.length > 0);
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}

interface NotificationsDrawerProps {
  open: boolean;
  onClose: () => void;
  linkPrefix?: string;
  onUnreadCountChange?: (count: number) => void;
}

export default function NotificationsDrawer({
  open,
  onClose,
  linkPrefix = "",
  onUnreadCountChange,
}: NotificationsDrawerProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimating(true));
      });
      getNotifications()
        .then(setNotifications)
        .finally(() => setLoading(false));
    } else {
      setAnimating(false);
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  const handleMarkRead = useCallback(
    async (id: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      await markNotificationRead(id);
      router.refresh();
    },
    [router]
  );

  const handleMarkAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await markAllNotificationsRead();
    router.refresh();
  }, [router]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!visible) return null;

  const groups = groupNotifications(notifications);

  return (
    <div className="fixed top-0 left-0 right-0 bottom-14 lg:bottom-0 z-[60]">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
          animating ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={`absolute top-0 right-0 bottom-0 w-full max-w-md bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          animating ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-brand-teal text-xs font-medium mb-0.5">
              {unreadCount > 0 ? `${unreadCount} sin leer` : "Al dia"}
            </p>
            <h2 className="text-lg font-bold font-heading text-brand-navy tracking-tight">
              Notificaciones
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-brand-teal hover:text-brand-teal/80 font-medium transition-colors cursor-pointer"
              >
                Marcar todas
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors text-text-muted hover:text-text-body cursor-pointer"
              aria-label="Cerrar notificaciones"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-brand-teal/30 border-t-brand-teal rounded-full animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BellIcon className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-sm text-text-muted">Sin notificaciones</p>
            </div>
          ) : (
            <div className="space-y-5">
              {groups.map((group) => (
                <div key={group.label}>
                  <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2 px-1">
                    {group.label}
                  </p>
                  <div className="space-y-1.5">
                    {group.items.map((n) => {
                      const linkHref = n.link
                        ? `${linkPrefix}${n.link}`
                        : undefined;
                      const card = (
                        <div
                          onClick={() => {
                            if (!n.is_read) handleMarkRead(n.id);
                            if (linkHref) onClose();
                          }}
                          className={`rounded-xl px-4 py-3 transition-colors duration-200 ${
                            n.is_read
                              ? "bg-white border border-gray-100 shadow-sm"
                              : `bg-white border border-brand-teal/20 shadow-sm cursor-pointer hover:border-brand-teal/40 ${linkHref ? "hover:bg-gray-50" : ""}`
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            {!n.is_read && (
                              <div className="w-1.5 h-1.5 bg-brand-teal rounded-full mt-1.5 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-sm leading-snug ${n.is_read ? "text-text-body" : "font-medium text-brand-navy"}`}
                              >
                                {n.title}
                              </p>
                              {n.message && (
                                <p className="text-xs text-text-muted mt-0.5">
                                  {n.message}
                                </p>
                              )}
                              <div className="flex items-center justify-between mt-1.5">
                                <p className="text-[10px] text-text-muted/60">
                                  {formatTime(n.created_at)}
                                </p>
                                {linkHref && (
                                  <span className="text-[10px] text-brand-teal font-medium">
                                    Ver &rarr;
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                      if (linkHref) {
                        return (
                          <Link
                            key={n.id}
                            href={linkHref}
                            className="block"
                            onClick={onClose}
                          >
                            {card}
                          </Link>
                        );
                      }
                      return <div key={n.id}>{card}</div>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
