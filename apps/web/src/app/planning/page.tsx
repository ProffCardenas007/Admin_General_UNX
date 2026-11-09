"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  API_URL,
  authHeaders,
  getStoredRole,
  getStoredSpecialties,
  getStoredToken,
} from "../../lib/api";
import { extractErrorMessage } from "../../lib/http";
import type { PlanSummary } from "./types";

type SpecialtyOption = {
  code: string;
  name: string;
  isActive: boolean;
};

const statusOptions = [
  { value: "planned", label: "Planificado" },
  { value: "active", label: "Activo" },
  { value: "on_hold", label: "En pausa" },
  { value: "done", label: "Finalizado" },
  { value: "cancelled", label: "Cancelado" },
] as const;

export default function PlanningPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [role, setRole] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [specialtyOptions, setSpecialtyOptions] = useState<SpecialtyOption[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [scope, setScope] = useState("");
  const [status, setStatus] = useState<(typeof statusOptions)[number]["value"]>("active");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [template, setTemplate] = useState<"blank" | "manual">("manual");
  const [topics, setTopics] = useState(12);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const headers = authHeaders();
      const [plansResponse, specialtiesResponse] = await Promise.all([
        axios.get<PlanSummary[]>(`${API_URL}/work-plans`, { headers }),
        axios.get<SpecialtyOption[]>(`${API_URL}/specialties`, { headers }),
      ]);
      setPlans(plansResponse.data);
      setSpecialtyOptions(specialtiesResponse.data.filter((item) => item.isActive));
      setError("");
    } catch (caught) {
      setError(extractErrorMessage(caught, "No se pudieron cargar los planes"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace("/");
      return;
    }
    const storedRole = getStoredRole();
    if (storedRole === "worker") {
      router.replace("/tasks");
      return;
    }
    const storedSpecialties = getStoredSpecialties();
    setRole(storedRole);
    setSpecialties(storedSpecialties);
    if (storedRole === "lead" && storedSpecialties.length > 0) {
      setScope(storedSpecialties[0]);
    }
    void load();
  }, [load, router]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedCode = code.trim();
    const trimmedName = name.trim();
    if (!trimmedCode || !trimmedName || !scope) {
      setError("Academia, nombre y especialidad son obligatorios.");
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      setError("La fecha de término no puede ser anterior a la fecha de inicio.");
      return;
    }

    setCreating(true);
    setError("");

    try {
      const headers = authHeaders();
      const projectResponse = await axios.post<{ id: string }>(
        `${API_URL}/projects`,
        {
          code: trimmedCode,
          name: trimmedName,
          scope,
          status,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        },
        { headers },
      );

      try {
        const { data } = await axios.post<{ id: string }>(
          `${API_URL}/work-plans`,
          {
            name: trimmedName,
            projectId: projectResponse.data.id,
            template,
            topics: template === "manual" ? topics : undefined,
          },
          { headers },
        );
        router.push(`/planning/${data.id}`);
      } catch (caught) {
        try {
          await axios.delete(`${API_URL}/projects/${projectResponse.data.id}`, { headers });
        } catch (cleanupError) {
          const cleanupMessage = extractErrorMessage(
            cleanupError,
            "tampoco se pudo revertir el proyecto",
          );
          setError(
            `El proyecto "${trimmedName}" fue creado, pero no se pudo crear su plan; ${cleanupMessage}.`,
          );
          setCreating(false);
          return;
        }

        setError(extractErrorMessage(caught, "No se pudo crear el plan; el proyecto fue revertido"));
        setCreating(false);
      }
    } catch (caught) {
      setError(extractErrorMessage(caught, "No se pudo crear el proyecto"));
      setCreating(false);
    }
  };

  const availableSpecialties =
    role === "lead"
      ? specialtyOptions.filter((item) => specialties.includes(item.code))
      : specialtyOptions;

  const canCreate =
    !creating &&
    Boolean(code.trim()) &&
    Boolean(name.trim()) &&
    Boolean(scope) &&
    !(startDate && endDate && startDate > endDate);

  const projectCodeLabel = role === "manager" || role === "lead" ? "Academia" : "Código";

  const projectFields = (
    <>
      <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-sm">
        {projectCodeLabel}
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Ej. MC"
          maxLength={40}
          required
          className="rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        />
      </label>
      <label className="flex min-w-[240px] flex-[2] flex-col gap-1 text-sm">
        Nombre del proyecto
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ej. MC Aritmética V2"
          maxLength={160}
          required
          className="rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        />
      </label>
      <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-sm">
        Especialidad
        <select
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          required
          className="rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        >
          <option value="">Selecciona una especialidad</option>
          {availableSpecialties.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-[150px] flex-col gap-1 text-sm">
        Estado
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as typeof status)}
          className="rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Fecha de inicio
        <input
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          className="rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Fecha de término
        <input
          type="date"
          value={endDate}
          min={startDate || undefined}
          onChange={(event) => setEndDate(event.target.value)}
          className="rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        />
      </label>
    </>
  );

  const remove = async (plan: PlanSummary) => {
    if (!window.confirm(`¿Eliminar el plan "${plan.name}"? Las tareas ya asignadas no se borran.`)) return;
    try {
      await axios.delete(`${API_URL}/work-plans/${plan.id}`, { headers: authHeaders() });
      setPlans((current) => current.filter((p) => p.id !== plan.id));
    } catch (caught) {
      setError(extractErrorMessage(caught, "No se pudo eliminar el plan"));
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <section className="glass-panel fade-up p-6 md:p-8">
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--ink-muted)]">Planeación</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Planes de trabajo</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--ink-muted)]">
          Planea todo lo que hay que producir antes de asignarlo. Crea un proyecto, ábrelo y arma su cuadrícula de etapas y
          temas; solo se crean tareas cuando tú asignas.
        </p>

        <form onSubmit={create} className="mt-6 flex flex-wrap items-end gap-3">
          {projectFields}
          <label className="flex flex-col gap-1 text-sm">
            Plantilla
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value as "blank" | "manual")}
              className="rounded-lg border border-[var(--line)] bg-white px-3 py-2"
            >
              <option value="manual">Manual de clase</option>
              <option value="blank">En blanco</option>
            </select>
          </label>
          {template === "manual" && (
            <label className="flex flex-col gap-1 text-sm">
              Temas
              <input
                type="number"
                min={1}
                max={60}
                value={topics}
                onChange={(e) => setTopics(Math.min(60, Math.max(1, Number(e.target.value) || 1)))}
                className="w-24 rounded-lg border border-[var(--line)] bg-white px-3 py-2"
              />
            </label>
          )}
          <button
            type="submit"
            disabled={!canCreate}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {creating ? "Creando proyecto y plan…" : "Crear proyecto y plan"}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading && <p className="text-sm text-[var(--ink-muted)]">Cargando…</p>}
        {!loading && plans.length === 0 && (
          <p className="text-sm text-[var(--ink-muted)]">Aún no tienes planes. Crea el primero arriba.</p>
        )}
        {plans.map((plan) => (
          <article key={plan.id} className="glass-panel fade-up flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/planning/${plan.id}`} className="text-lg font-semibold tracking-tight hover:underline">
                {plan.name}
              </Link>
              <button
                type="button"
                onClick={() => remove(plan)}
                className="text-xs text-[var(--ink-muted)] hover:text-[var(--danger)]"
                aria-label={`Eliminar ${plan.name}`}
              >
                Eliminar
              </button>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-emerald-500" style={{ width: `${plan.progress.percent}%` }} />
            </div>
            <p className="font-mono text-xs text-[var(--ink-muted)]">
              {plan.progress.percent}% listo · {plan.progress.unassigned} por asignar ·{" "}
              {plan.progress.assigned + plan.progress.inProgress} en marcha · {plan.progress.done} listas
            </p>
            <Link
              href={`/planning/${plan.id}`}
              className="mt-auto self-start rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-white"
            >
              Abrir plan
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
