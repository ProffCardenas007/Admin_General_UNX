"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { API_URL, authHeaders, getStoredEmail, getStoredRole, getStoredToken } from "../../lib/api";

type AuditChange = {
  before: unknown;
  after: unknown;
};

type AuditLogRow = {
  id: string;
  actorId: string;
  actorRole: "manager" | "lead" | "worker";
  actorEmail?: string;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  action: string;
  changesJson: Record<string, AuditChange>;
  createdAt: string;
};

const entityTypeLabels: Record<string, string> = {
  project: "Proyecto",
  task: "Tarea",
};

const fieldLabels: Record<string, string> = {
  name: "Nombre",
  status: "Estado",
  startDate: "Fecha inicio",
  endDate: "Fecha fin",
  title: "Titulo",
  description: "Descripcion",
  assigneeId: "Asignado",
  priority: "Prioridad",
  dueDate: "Fecha limite",
};

export default function HistoryPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<AuditLogRow[]>([]);

  const [entityType, setEntityType] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/");
      return;
    }

    const role = getStoredRole();
    if (role !== "manager") {
      router.replace("/dashboard");
      return;
    }

    setEmail(getStoredEmail());
  }, [router]);

  useEffect(() => {
    const loadAuditLogs = async () => {
      if (!email) {
        return;
      }

      setLoading(true);
      setError("");

      try {
        const response = await axios.get(`${API_URL}/audit-logs`, {
          headers: authHeaders(),
          params: {
            entityType: entityType || undefined,
            search: search.trim().length > 0 ? search.trim() : undefined,
            from: from || undefined,
            to: to || undefined,
            limit: 200,
          },
        });

        setLogs(response.data as AuditLogRow[]);
      } catch {
        setError("No se pudo cargar el historial de cambios.");
      } finally {
        setLoading(false);
      }
    };

    void loadAuditLogs();
  }, [email, entityType, search, from, to]);

  const rows = useMemo(() => logs, [logs]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <section className="glass-panel fade-up p-6 md:p-8">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
            Sistema de proyectos
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Historial gerencial</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-[var(--ink-muted)] md:text-base">
            Movimientos ejecutados en proyectos y tareas, con detalle de cambios antes/después.
          </p>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <select
            value={entityType}
            onChange={(event) => setEntityType(event.target.value)}
            className="ui-control"
          >
            <option value="">Todos los tipos</option>
            <option value="project">Proyecto</option>
            <option value="task">Tarea</option>
          </select>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="ui-control"
            placeholder="Buscar por actor, accion o etiqueta"
          />
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="ui-control"
          />
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="ui-control"
          />
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}
      </section>

      <section className="kpi-card fade-up overflow-hidden p-0">
        {loading ? (
          <div className="p-5">
            <div className="ui-skeleton h-6 w-48" />
          </div>
        ) : rows.length === 0 ? (
          <p className="ui-empty m-4 px-4 py-3 text-sm">No hay movimientos para los filtros seleccionados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ui-table min-w-full">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--background)]/70 text-left">
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Actor</th>
                  <th className="px-4 py-3 font-semibold">Tipo</th>
                  <th className="px-4 py-3 font-semibold">Registro</th>
                  <th className="px-4 py-3 font-semibold">Accion</th>
                  <th className="px-4 py-3 font-semibold">Cambios</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((log) => (
                  <tr key={log.id} className="border-b border-[var(--line)]/60 align-top">
                    <td className="px-4 py-3 text-xs">
                      {new Date(log.createdAt).toLocaleString("es-MX", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 text-xs">{log.actorEmail ?? log.actorId.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-xs">{entityTypeLabels[log.entityType] ?? log.entityType}</td>
                    <td className="px-4 py-3 text-xs">{log.entityLabel ?? log.entityId.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-xs font-semibold">{log.action}</td>
                    <td className="px-4 py-3 text-xs">
                      <div className="space-y-2">
                        {Object.entries(log.changesJson ?? {}).map(([field, diff]) => (
                          <div key={field} className="rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2">
                            <p className="font-semibold">{fieldLabels[field] ?? field}</p>
                            <p className="text-[var(--ink-muted)]">Antes: {String(diff.before ?? "-")}</p>
                            <p className="text-[var(--ink-muted)]">Despues: {String(diff.after ?? "-")}</p>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
