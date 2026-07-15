"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { API_URL, authHeaders, getStoredRole, getStoredToken } from "../../lib/api";

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  readAt?: string;
};

export default function NotificationsPage() {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "unread" | "read">("all");
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/");
      return;
    }

    setRole(getStoredRole());
  }, [router]);

  const loadNotifications = async (status: "all" | "unread" | "read") => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/notifications`, {
        headers: authHeaders(),
        params: { status },
      });

      setNotifications(response.data as NotificationRow[]);
      setError("");
    } catch {
      setError("No se pudieron cargar las notificaciones.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNotifications(statusFilter);
  }, [statusFilter]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.isRead).length,
    [notifications],
  );

  const markRead = async (notificationId: string) => {
    try {
      await axios.patch(`${API_URL}/notifications/${notificationId}/read`, {}, { headers: authHeaders() });
      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId
            ? { ...item, isRead: true, readAt: new Date().toISOString() }
            : item,
        ),
      );
      setInfo("Notificacion marcada como leida.");
    } catch {
      setError("No se pudo marcar la notificacion.");
    }
  };

  const markAllRead = async () => {
    try {
      await axios.patch(`${API_URL}/notifications/read-all`, {}, { headers: authHeaders() });
      setNotifications((current) =>
        current.map((item) => ({ ...item, isRead: true, readAt: item.readAt ?? new Date().toISOString() })),
      );
      setInfo("Todas las notificaciones se marcaron como leidas.");
    } catch {
      setError("No se pudo marcar todo como leido.");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <section className="glass-panel fade-up p-6 md:p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">Sistema de proyectos</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Notificaciones</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-[var(--ink-muted)] md:text-base">
              Tareas subsecuentes que te han asignado.
            </p>
          </div>
          <button onClick={() => void markAllRead()} className="ui-btn ui-btn-primary">
            Marcar todo leído
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | "unread" | "read")}
            className="ui-control"
          >
            <option value="all">Todas</option>
            <option value="unread">No leidas</option>
            <option value="read">Leidas</option>
          </select>
          <p className="text-sm text-[var(--ink-muted)]">Pendientes: {unreadCount}</p>
        </div>

        {error ? <p className="mt-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">{error}</p> : null}
        {info ? <p className="mt-4 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/8 px-4 py-3 text-sm text-[var(--foreground)]">{info}</p> : null}
      </section>

      <section className="kpi-card fade-up overflow-hidden p-0">
        {loading ? (
          <div className="p-5">
            <div className="ui-skeleton h-6 w-56" />
          </div>
        ) : notifications.length === 0 ? (
          <p className="ui-empty m-4 px-4 py-3 text-sm">No hay notificaciones para este filtro.</p>
        ) : (
          <div className="divide-y divide-[var(--line)]/60">
            {notifications.map((notification) => (
              <article key={notification.id} className="p-4 md:p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-semibold">{notification.title}</p>
                    <p className="mt-1 text-sm text-[var(--foreground)]">{notification.message}</p>
                    <p className="mt-2 text-xs text-[var(--ink-muted)]">
                      {new Date(notification.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        notification.isRead
                          ? "border border-[var(--line)] bg-white text-[var(--ink-muted)]"
                          : "border border-amber-300 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {notification.isRead ? "Leida" : "Nueva"}
                    </span>
                    {!notification.isRead ? (
                      <button
                        onClick={() => void markRead(notification.id)}
                        className="ui-btn ui-btn-secondary ui-btn-sm"
                      >
                        Marcar leida
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
