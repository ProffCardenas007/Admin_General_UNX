"use client";

import { useState } from "react";
import axios from "axios";
import { API_URL, authHeaders } from "../../lib/api";
import { planningErrorMessage } from "./errors";
import type { PlanningNotify, TeacherImportResult } from "./types";

export default function ImportPanel({
  notify,
  reload,
}: {
  notify: PlanningNotify;
  reload: () => Promise<void>;
}) {
  const [planningFile, setPlanningFile] = useState<File | null>(null);
  const [importingTeachers, setImportingTeachers] = useState(false);
  const [teacherImportResult, setTeacherImportResult] = useState<TeacherImportResult | null>(null);

  const onImportTeachers = async () => {
    if (!planningFile) {
      notify.error("Selecciona el archivo de programación en formato XLSX o XLSM.");
      return;
    }

    notify.clear();
    setTeacherImportResult(null);
    setImportingTeachers(true);

    try {
      const formData = new FormData();
      formData.append("file", planningFile);
      const response = await axios.post<TeacherImportResult>(
        `${API_URL}/imports/class-planning`,
        formData,
        { headers: authHeaders() },
      );
      setTeacherImportResult(response.data);
      notify.info(
        `Importación terminada: ${response.data.createdSessions} sesiones creadas, ${response.data.updatedSessions} actualizadas y ${response.data.unchangedSessions} sin cambios.`,
      );
      await reload();
    } catch (error) {
      notify.error(
        planningErrorMessage(
          error,
          "No se pudo leer el archivo de programación.",
          "No tienes permisos de gerencia para importar profesores.",
        ),
      );
    } finally {
      setImportingTeachers(false);
    }
  };

  return (
      <section className="glass-panel fade-up p-4 md:p-5" style={{ animationDelay: "60ms" }}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
              Importar programación
            </p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Sincroniza profesores, disponibilidad, cursos y sesiones programadas del archivo de Excel.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <input
              type="file"
              accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12"
              onChange={(event) => {
                setPlanningFile(event.target.files?.[0] ?? null);
                setTeacherImportResult(null);
              }}
              className="ui-control min-w-0 flex-1 text-sm lg:w-[360px]"
            />
            <button
              type="button"
              onClick={() => void onImportTeachers()}
              disabled={!planningFile || importingTeachers}
              className="ui-btn ui-btn-primary h-10 shrink-0 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {importingTeachers ? "Leyendo y programando..." : "Importar y programar"}
            </button>
          </div>
        </div>

        {teacherImportResult ? (
          <div className="mt-3 border-t border-white/10 pt-3">
            <div className="grid gap-2 sm:grid-cols-5">
              <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-[var(--ink-soft)]">
                Filas: <span className="font-semibold text-[var(--foreground)]">{teacherImportResult.totalRows}</span>
              </p>
              <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-[var(--ink-soft)]">
                Usuarios actualizados: <span className="font-semibold text-[var(--foreground)]">{teacherImportResult.updatedUsers}</span>
              </p>
              <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-[var(--ink-soft)]">
                Disponibilidades: <span className="font-semibold text-[var(--foreground)]">{teacherImportResult.availabilityProfiles}</span>
              </p>
              <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-[var(--ink-soft)]">
                Sin cambios: <span className="font-semibold text-[var(--foreground)]">{teacherImportResult.unchangedRows}</span>
              </p>
              <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-[var(--ink-soft)]">
                Sin cuenta: <span className="font-semibold text-[var(--foreground)]">{teacherImportResult.skippedRows}</span>
              </p>
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-[var(--ink-soft)]">
                Cursos nuevos: <span className="font-semibold text-[var(--foreground)]">{teacherImportResult.createdCourses ?? 0}</span>
              </p>
              <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-[var(--ink-soft)]">
                Sesiones nuevas: <span className="font-semibold text-[var(--foreground)]">{teacherImportResult.createdSessions ?? 0}</span>
              </p>
              <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-[var(--ink-soft)]">
                Sesiones actualizadas: <span className="font-semibold text-[var(--foreground)]">{teacherImportResult.updatedSessions ?? 0}</span>
              </p>
              <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-[var(--ink-soft)]">
                Sesiones sin cambios: <span className="font-semibold text-[var(--foreground)]">{teacherImportResult.unchangedSessions ?? 0}</span>
              </p>
            </div>

            {teacherImportResult.scheduleWarnings?.length > 0 ? (
              <p className="mt-2 text-xs text-amber-700">
                {teacherImportResult.scheduleWarnings.length} asignaciones requieren revisión. Primera: {teacherImportResult.scheduleWarnings[0]}
              </p>
            ) : null}

            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="text-[var(--ink-muted)]">
                  <tr>
                    <th className="px-2 py-1.5 font-semibold">Profesor</th>
                    <th className="px-2 py-1.5 font-semibold">Correo</th>
                    <th className="px-2 py-1.5 font-semibold">Materia</th>
                    <th className="px-2 py-1.5 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {teacherImportResult.rows.map((row, index) => (
                    <tr key={`${row.fullName}-${index}`} className="border-t border-white/8 text-[var(--ink-soft)]">
                      <td className={`px-2 py-1.5 ${row.matched ? "text-[var(--foreground)]" : "text-[var(--danger)]"}`}>
                        {row.fullName}
                      </td>
                      <td className="px-2 py-1.5 font-mono">
                        {row.email && !row.email.endsWith("@profesores.unx.mx") ? row.email : "N/A"}
                      </td>
                      <td className="px-2 py-1.5">{row.subjects.join(", ")}</td>
                      <td className="px-2 py-1.5">
                        {!row.matched ? "Sin cuenta" : row.changed ? "Actualizado" : "Sin cambios"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-[var(--ink-muted)]">
                Las filas marcadas &quot;Profesor N/A&quot; no tienen usuario registrado en la plataforma; créalos desde Usuarios y vuelve a importar para vincularlos.
              </p>
            </div>

            {teacherImportResult.errors.length > 0 ? (
              <p className="mt-3 text-xs text-[var(--danger)]">
                {teacherImportResult.failedRows} filas no se importaron. Primera incidencia: fila {teacherImportResult.errors[0].rowNumber}, {teacherImportResult.errors[0].message}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
  );
}
