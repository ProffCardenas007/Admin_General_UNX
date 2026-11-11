"use client";

import axios from "axios";
import { useState } from "react";
import { API_URL, authHeaders } from "../../lib/api";
import { extractErrorMessage } from "../../lib/http";
import type { ProjectRow, TaskRow } from "./types";

type Props = {
  projects: ProjectRow[];
  projectLabel: (projectId: string) => string;
  onClose: () => void;
  onCreated: (task: TaskRow) => void;
};

const todayKey = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

/**
 * Registro de una actividad que nadie asignó. Se crea como "Administrativo" y
 * queda pendiente: no cuenta en reportes hasta que gerencia la apruebe.
 */
export default function SelfReportModal({ projects, projectLabel, onClose, onCreated }: Props) {
  const selectable = projects.filter((project) => project.status !== "cancelled" && project.status !== "done");
  const [projectId, setProjectId] = useState(selectable[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [workDate, setWorkDate] = useState(todayKey());
  const [hours, setHours] = useState("1");
  const [status, setStatus] = useState<"done" | "todo">("done");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const today = todayKey();
  const hoursValue = Number(hours);
  const futureDone = status === "done" && workDate > today;
  const valid =
    projectId && title.trim() && description.trim() && workDate && hoursValue >= 0.25 && hoursValue <= 80 && !futureDone;

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    setError("");
    try {
      const response = await axios.post<TaskRow>(
        `${API_URL}/tasks/self-report`,
        { projectId, title: title.trim(), description: description.trim(), workDate, estimatedHours: hoursValue, status },
        { headers: authHeaders() },
      );
      onCreated(response.data);
    } catch (caughtError) {
      setError(extractErrorMessage(caughtError, "No se pudo registrar la actividad."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-semibold">Registrar actividad</h2>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Para trabajo que hiciste y nadie te asignó. Se registra como <strong>Administrativo</strong> y queda{" "}
          <strong>pendiente de aprobación</strong>: gerencia le asignará la categoría correcta o la rechazará. Mientras
          tanto no cuenta en tus reportes.
        </p>

        <div className="mt-5 space-y-4">
          <label className="block text-sm">
            <span className="font-semibold">Proyecto</span>
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="ui-control mt-1">
              {selectable.map((project) => (
                <option key={project.id} value={project.id}>
                  {projectLabel(project.id)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-semibold">¿Qué hiciste?</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={220}
              placeholder="Ej. Revisión de exámenes de práctica"
              className="ui-control mt-1"
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold">Detalle</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Quién te lo pidió, qué entregaste, dónde quedó el material…"
              className="ui-control mt-1"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-semibold">Fecha</span>
              <input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} className="ui-control mt-1" />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Horas</span>
              <input
                type="number"
                min={0.25}
                max={80}
                step={0.25}
                value={hours}
                onChange={(event) => setHours(event.target.value)}
                className="ui-control mt-1"
              />
            </label>
          </div>
          <fieldset className="text-sm">
            <legend className="font-semibold">Estado</legend>
            <div className="mt-1 flex gap-4">
              <label className="flex items-center gap-2">
                <input type="radio" checked={status === "done"} onChange={() => setStatus("done")} />
                Ya la terminé
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={status === "todo"} onChange={() => setStatus("todo")} />
                La voy a hacer
              </label>
            </div>
          </fieldset>
          {futureDone ? (
            <p className="text-xs text-[var(--danger)]">Una actividad terminada no puede tener fecha futura.</p>
          ) : null}
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="ui-btn ui-btn-secondary ui-btn-sm">
            Cancelar
          </button>
          <button type="button" onClick={() => void submit()} disabled={saving || !valid} className="ui-btn ui-btn-primary ui-btn-sm">
            {saving ? "Enviando..." : "Enviar a aprobación"}
          </button>
        </div>
      </div>
    </div>
  );
}
