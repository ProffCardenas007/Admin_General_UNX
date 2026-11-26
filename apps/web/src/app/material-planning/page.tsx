"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredRole, getStoredToken } from "../../lib/api";
import { EMPTY_FILTERS, type ItemFilters } from "./materialMath";
import ProjectionTab from "./ProjectionTab";
import RetiredTab from "./RetiredTab";
import ScheduleTab from "./ScheduleTab";
import SuppliesTab from "./SuppliesTab";
import { Segmented } from "./parts";
import type { Program } from "./types";
import { useMaterialPlanning } from "./useMaterialPlanning";

type Tab = "projection" | "paa" | "exani" | "piense" | "supplies" | "retired";

const TAB_PROGRAM: Partial<Record<Tab, Program>> = { paa: "PAA", exani: "EXANI", piense: "PIENSE" };

export default function MaterialPlanningPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("projection");
  const [program, setProgram] = useState<Program>("PAA");
  const [filters, setFilters] = useState<ItemFilters>(EMPTY_FILTERS);
  const planning = useMaterialPlanning();

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace("/");
      return;
    }
    if (getStoredRole() !== "manager") {
      router.replace("/tasks");
      return;
    }
  }, [router]);

  const openProjectionForCourse = (programToOpen: Program, courseKey: string) => {
    setProgram(programToOpen);
    setFilters({ ...EMPTY_FILTERS, courseKey });
    setTab("projection");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 md:px-8 md:py-10">
      <section className="glass-panel fade-up p-6 md:p-8">
        <p className="font-mono text-xs uppercase tracking-widest text-[var(--ink-muted)]">Planeación de material</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Proyección y programación de material</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--ink-muted)]">
          Controla inventario, pedidos de impresión y qué grupo recibe cada material. Los cambios se guardan al instante.
        </p>
        <div className="mt-5">
          <Segmented
            label="Sección"
            value={tab}
            onChange={setTab}
            options={[
              { value: "projection", label: "Proyección" },
              { value: "paa", label: "Programación PAA" },
              { value: "exani", label: "Programación EXANI II" },
              { value: "piense", label: "Programación PIENSE II" },
              { value: "supplies", label: "Insumos" },
              { value: "retired", label: "Material retirado" },
            ]}
          />
        </div>
        {planning.error ? (
          <p role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-[var(--danger)]">
            <span>{planning.error}</span>
            <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => planning.setError("")}>
              Cerrar
            </button>
          </p>
        ) : null}
      </section>

      {planning.loading ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <div className="ui-skeleton h-24" />
          <div className="ui-skeleton h-64" />
        </div>
      ) : tab === "projection" ? (
        <ProjectionTab
          data={planning.data}
          program={program}
          onProgramChange={(next) => {
            setProgram(next);
            setFilters(EMPTY_FILTERS);
          }}
          filters={filters}
          onFiltersChange={setFilters}
          actions={planning}
        />
      ) : tab === "retired" ? (
        <RetiredTab data={planning.data} actions={planning} />
      ) : tab === "supplies" ? (
        <SuppliesTab data={planning.data} actions={planning} />
      ) : (
        <ScheduleTab
          data={planning.data}
          program={TAB_PROGRAM[tab] ?? "PAA"}
          actions={planning}
          onOpenProjection={(courseKey) => openProjectionForCourse(TAB_PROGRAM[tab] ?? "PAA", courseKey)}
        />
      )}
    </main>
  );
}
