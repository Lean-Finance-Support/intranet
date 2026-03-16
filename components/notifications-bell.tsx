"use client";

import { useState, useEffect, useRef } from "react";
import type { Notification } from "@/lib/types/notifications";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/actions/notifications";

interface NotificationsBellProps {
  /** Link prefix for navigation (e.g. "" for prod, "/admin" or "/app" for local) */
  linkPrefix?: string;
  /** Color variant: "light" for white icon (admin), "dark" for navy icon (client) */
  variant?: "light" | "dark";
}

export default function NotificationsBell({
  linkPrefix = "",
  variant = "dark",
}: NotificationsBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    getNotifications()
      .then(setNotifications)
      .finally(() => setLoading(false));
  }, []);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleMarkRead(id: string) {
    await markNotificationRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

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
    return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  }

  const iconColor = variant === "light" ? "text-white/80 hover:text-white" : "text-text-muted hover:text-brand-navy";
  const badgeBg = variant === "light" ? "bg-red-500" : "bg-red-500";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`relative p-2 rounded-full transition-colors ${iconColor}`}
        aria-label="Notificaciones"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {!loading && unreadCount > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 ${badgeBg} text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1`}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="font-medium text-sm text-brand-navy">
              Notificaciones
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-brand-teal hover:text-brand-teal/80 transition-colors"
              >
                Marcar todas como leídas
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <svg
                  className="w-8 h-8 text-gray-300 mx-auto mb-2"
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
                <p className="text-sm text-text-muted">
                  No tienes notificaciones
                </p>
              </div>
            ) : (
              notifications.map((n) => {
                const linkHref = n.link
                  ? `${linkPrefix}${n.link}`
                  : undefined;

                const content = (
                  <div
                    className={`px-4 py-3 border-b border-gray-50 transition-colors ${
                      n.is_read
                        ? "bg-white"
                        : "bg-blue-50/50"
                    } ${linkHref ? "hover:bg-gray-50 cursor-pointer" : ""}`}
                    onClick={() => {
                      if (!n.is_read) handleMarkRead(n.id);
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {!n.is_read && (
                        <div className="w-2 h-2 bg-brand-teal rounded-full mt-1.5 flex-shrink-0" />
                      )}
                      <div className={n.is_read ? "pl-5" : ""}>
                        <p className="text-sm font-medium text-text-body leading-snug">
                          {n.title}
                        </p>
                        {n.message && (
                          <p className="text-xs text-text-muted mt-0.5 line-clamp-2">
                            {n.message}
                          </p>
                        )}
                        <p className="text-xs text-text-muted/70 mt-1">
                          {formatTime(n.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                );

                if (linkHref) {
                  return (
                    <a key={n.id} href={linkHref} className="block">
                      {content}
                    </a>
                  );
                }
                return <div key={n.id}>{content}</div>;
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
