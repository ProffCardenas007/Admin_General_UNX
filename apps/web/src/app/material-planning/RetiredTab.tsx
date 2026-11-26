"use client";

import { useMemo, useState } from "react";
import {
  compareNatural,
  DISPOSITION_LABELS,
  DISPOSITIONS,
  PROGRAM_LABELS,
  PROGRAMS,
  summarizeRetired,
  type DispositionFilter,
} from "./materialMath";
import { EmptyState, formatNumber, KpiCard, NumberCell, Segmented } from "./parts";
import type { Disposition, MaterialPlanningData, Program } from "./types";
import type { useMaterialPlanning } from "./useMaterialPlanning";

type Actions = Pick<ReturnType<typeof useMaterialPlanning>, "updateItem">;

const DISPOSITION_STYLES: Record<Disposition | "pendiente", string> = {
  pendiente: "border-amber-200 bg-amber-50 text-amber-800",
  conservar: "border-sky-200 bg-sky-50 text-sky-800",
  reutilizar: "border-emerald-200 bg-emerald-50 text-emerald-700",
  donar: "border-violet-200 bg-violet-50 text-violet-700",
  reciclar: "border-slate-200 bg-slate-100 text-slate-600",
};

/**
 * Material que ya no se usará: sale de la proyección y se queda aquí con sus
 * existencias, para decidir qué hacer con él (conservar, reutilizar, donar o reciclar).
 */
export default function RetiredTab({ data, actions }: { data: MaterialPlanningData; actions: Actions }) {
  const [program, setProgram] = useState<Program | "">("");
  const [disposition, setDisposition] = useState<DispositionFilter>("");
  const [search, setSearch] = useState("");

  const retired = useMemo(() => data.items.filter((item) => item.doNotUse), [data.items]);
  const totals = useMemo(() => summarizeRetired(retired), [retired]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return retired
      .filter((item) => !program || item.program === program)
      .filter((item) => (disposition === "" ? true : disposition === "pendiente" ? !item.disposition : item.disposition === disposition))
      .filter((item) => !query || [item.kind, item.version, item.module, item.notes].filter(Boolean).join(" ").toLowerCase().includes(query))
      .sort(
        (a, b) =>
          a.program.localeCompare(b.program) || a.kind.localeCompare(b.kind, "es") || compareNatural(a.module, b.module),
      );
  }, [retired, program, disposition, search]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Materiales retirados" value={totals.items} hint="ya no se usarán" />
        <KpiCard label="Piezas en almacén" value={formatNumber(totals.pieces)} hint="de material retirado" />
        <KpiCard
          label="Por decidir"
          value={totals.pending}
          hint={totals.pending ? `${formatNumber(totals.pendingPieces)} piezas sin destino` : "todo tiene destino"}
          tone={totals.pending ? "warn" : "good"}
          onClick={() => setDisposition(disposition === "pendiente" ? "" : "pendiente")}
          active={disposition === "pendiente"}
        />
        <KpiCard label="Con destino" value={totals.items - totals.pending} hint="conservar, reutilizar, donar o reciclar" />
      </div>

      <div className="glass-panel flex flex-wrap items-end gap-3 p-4">
        <label className="flex min-w-[220px] flex-[2] flex-col gap-1 text-xs font-semibold text-[var(--ink-muted)]">
          Buscar
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Material, versión, módulo o nota"
            className="ui-control min-h-[40px] py-1.5 text-sm font-normal text-[var(--foreground)]"
          />
        </label>
        <label className="flex min-w-[150px] flex-1 flex-col gap-1 text-xs font-semibold text-[var(--ink-muted)]">
          Programa
          <select value={program} onChange={(event) => setProgram(event.target.value as Program | "")} className="ui-control min-h-[40px] py-1.5 text-sm">
            <option value="">Todos</option>
            {PROGRAMS.map((value) => (
              <option key={value} value={value}>
                {PROGRAM_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1 text-xs font-semibold text-[var(--ink-muted)]">
          Destino
          <Segmented
            label="Destino"
            value={disposition}
            onChange={setDisposition}
            options={[
              { value: "", label: "Todos" },
              { value: "pendiente", label: "Por decidir" },
              ...DISPOSITIONS.map((value) => ({ value, label: DISPOSITION_LABELS[value] })),
            ]}
          />
        </div>
      </div>

      {retired.length === 0 ? (
        <EmptyState>
          Todavía no hay material retirado. En Proyección, usa el botón “No se usará” de un material para moverlo aquí.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState>No hay material retirado con esos filtros.</EmptyState>
      ) : (
        <section className="glass-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="ui-table min-w-[820px]">
              <thead>
                <tr className="text-xs">
                  <th>Programa</th>
                  <th>Material</th>
                  <th>Módulo</th>
                  <th>Versión</th>
                  <th className="text-right">En almacén</th>
                  <th>Qué se hará con él</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td className="text-xs text-[var(--ink-muted)]">{PROGRAM_LABELS[item.program]}</td>
                    <td className="font-medium">
                      {item.kind}
                      {item.notes ? (
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{item.notes}</span>
                      ) : null}
                    </td>
                    <td>{item.module ?? "—"}</td>
                    <td className="text-[var(--ink-muted)]">{item.version ?? "—"}</td>
                    <td className="text-right">
                      <NumberCell
                        value={item.available}
                        label={`Existencias de ${item.kind} ${item.module ?? ""}`}
                        onCommit={(value) => actions.updateItem(item.id, { available: value })}
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`Destino de ${item.kind} ${item.module ?? ""}`}
                        value={item.disposition ?? ""}
                        onChange={(event) => actions.updateItem(item.id, { disposition: (event.target.value || null) as Disposition | null })}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${DISPOSITION_STYLES[item.disposition ?? "pendiente"]}`}
                      >
                        <option value="">Por decidir</option>
                        {DISPOSITIONS.map((value) => (
                          <option key={value} value={value}>
                            {DISPOSITION_LABELS[value]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="ui-btn ui-btn-secondary ui-btn-sm"
                        onClick={() => actions.updateItem(item.id, { doNotUse: false })}
                      >
                        Volver a usar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
