"use client";

import { Fragment, useMemo, useState } from "react";
import {
  compareNatural,
  computeItemMetrics,
  courseSummaries,
  EMPTY_FILTERS,
  filterItems,
  groupModality,
  groupName,
  STATUS_LABELS,
  summarize,
  uniqueSorted,
  VENUE_OPTIONS,
  type ItemFilters,
  type Modality,
} from "./materialMath";
import ImportPanel from "./ImportPanel";
import { EmptyState, formatNumber, KpiCard, NumberCell, Segmented, StatusPill, TextCell } from "./parts";
import type { MaterialGroup, MaterialItem, MaterialPlanningData, Program } from "./types";
import type { useMaterialPlanning } from "./useMaterialPlanning";
import { sortByLabel } from "../../lib/sort";

type Actions = Pick<
  ReturnType<typeof useMaterialPlanning>,
  "updateItem" | "bulkUpdateItems" | "setAssignment" | "updateGroup" | "createGroup" | "removeGroup" | "createItem" | "removeItem" | "importItems" | "readImportFile"
>;

type Props = {
  data: MaterialPlanningData;
  program: Program;
  onProgramChange: (program: Program) => void;
  filters: ItemFilters;
  onFiltersChange: (filters: ItemFilters) => void;
  actions: Actions;
};

const selectClass = "ui-control min-h-[40px] py-1.5 text-sm";

export default function ProjectionTab({ data, program, onProgramChange, filters, onFiltersChange, actions }: Props) {
  const [view, setView] = useState<"list" | "matrix">("list");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [collapsedKinds, setCollapsedKinds] = useState<Set<string>>(new Set());
  const [showGroups, setShowGroups] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const groups = useMemo(() => data.groups.filter((group) => group.program === program), [data.groups, program]);
  const items = useMemo(() => data.items.filter((item) => item.program === program), [data.items, program]);
  const groupsById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const courses = useMemo(() => courseSummaries(groups), [groups]);

  const kinds = useMemo(() => uniqueSorted(items.map((item) => item.kind)), [items]);
  const versions = useMemo(() => uniqueSorted(items.map((item) => item.version)), [items]);
  const venues = useMemo(() => uniqueSorted(groups.map((group) => group.venue)), [groups]);

  const visible = useMemo(() => filterItems(items, groups, filters), [items, groups, filters]);
  const totals = useMemo(() => summarize(items, groups), [items, groups]);

  const sections = useMemo(() => {
    const byKind = new Map<string, MaterialItem[]>();
    for (const item of visible) {
      const list = byKind.get(item.kind) ?? [];
      list.push(item);
      byKind.set(item.kind, list);
    }
    return [...byKind.entries()];
  }, [visible]);

  const set = <K extends keyof ItemFilters>(key: K, value: ItemFilters[K]) => onFiltersChange({ ...filters, [key]: value });
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  const toggleKind = (kind: string) =>
    setCollapsedKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  const changeProgram = (next: Program) => {
    setExpanded(null);
    onProgramChange(next);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ── Barra superior ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Programa"
          value={program}
          onChange={changeProgram}
          options={[
            { value: "PAA", label: "PAA" },
            { value: "EXANI", label: "EXANI II" },
            { value: "PIENSE", label: "PIENSE II" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Vista"
            value={view}
            onChange={setView}
            options={[
              { value: "list", label: "Lista" },
              { value: "matrix", label: "Matriz" },
            ]}
          />
          <button type="button" className="ui-btn ui-btn-secondary" onClick={() => setShowGroups((open) => !open)}>
            {showGroups ? "Ocultar grupos" : "Grupos y alumnos"}
          </button>
          <button type="button" className="ui-btn ui-btn-secondary" onClick={() => setShowImport((open) => !open)}>
            {showImport ? "Cerrar importación" : "Importar"}
          </button>
          <button type="button" className="ui-btn ui-btn-primary" onClick={() => setShowNew((open) => !open)}>
            + Material
          </button>
        </div>
      </div>

      {showImport ? (
        <ImportPanel
          program={program}
          items={data.items}
          supplies={data.supplies}
          onReadFile={actions.readImportFile}
          onImport={(input) => actions.importItems({ program, ...input })}
          onClose={() => setShowImport(false)}
        />
      ) : null}

      {showNew ? (
        <NewItemForm
          program={program}
          kinds={kinds}
          onCreate={async (input) => {
            const ok = await actions.createItem({ program, ...input });
            if (ok) setShowNew(false);
          }}
          onCancel={() => setShowNew(false)}
        />
      ) : null}

      {showGroups ? (
        <GroupsPanel
          program={program}
          groups={groups}
          onUpdate={actions.updateGroup}
          onCreate={actions.createGroup}
          onRemove={actions.removeGroup}
        />
      ) : null}

      {/* ── Resumen ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard
          label="No alcanza hoy"
          value={groups.some((group) => group.enrolled !== null) ? totals.shortToday : "—"}
          hint={groups.some((group) => group.enrolled !== null) ? "materiales cortos para los inscritos" : "captura inscritos en “Grupos y alumnos”"}
          tone={totals.shortToday ? "warn" : "default"}
        />
        <KpiCard
          label="Faltará"
          value={totals.needAttention}
          hint={totals.needAttention ? `de ${totals.items} materiales activos` : "todo cubierto"}
          tone={totals.needAttention ? "warn" : "good"}
          onClick={() => set("status", filters.status === "faltante" ? "" : "faltante")}
          active={filters.status === "faltante"}
        />
        <KpiCard label="En impresión" value={formatNumber(totals.toPrint)} hint="piezas en pedidos capturados" />
        <KpiCard
          label="Falta pedir"
          value={formatNumber(totals.shortage)}
          hint="piezas"
          tone={totals.shortage ? "warn" : "good"}
        />
        <KpiCard
          label="Revisados"
          value={`${totals.reviewed}/${totals.items}`}
          hint={totals.items ? `${Math.round((totals.reviewed / totals.items) * 100)}% completado` : undefined}
          tone={totals.items > 0 && totals.reviewed === totals.items ? "good" : "default"}
        />
      </div>

      {/* ── Filtros ── */}
      <section className="glass-panel flex flex-col gap-3 p-4" aria-label="Filtros">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[220px] flex-[2] flex-col gap-1 text-xs font-semibold text-[var(--ink-muted)]">
            Buscar
            <input
              type="search"
              value={filters.search}
              onChange={(event) => set("search", event.target.value)}
              placeholder="Nombre, versión, módulo o nota…"
              className="ui-control min-h-[40px] py-1.5 text-sm font-normal text-[var(--foreground)]"
            />
          </label>
          <FilterSelect label="Material" value={filters.kind} onChange={(value) => set("kind", value)} options={kinds} />
          <FilterSelect label="Versión" value={filters.version} onChange={(value) => set("version", value)} options={versions} />
          <label className="flex min-w-[150px] flex-1 flex-col gap-1 text-xs font-semibold text-[var(--ink-muted)]">
            Curso
            <select value={filters.courseKey} onChange={(event) => set("courseKey", event.target.value)} className={selectClass}>
              <option value="">Todos</option>
              {sortByLabel(courses, (course) => course.label).map((course) => (
                <option key={course.key} value={course.key}>
                  {course.label}
                </option>
              ))}
            </select>
          </label>
          {venues.length > 0 ? (
            <FilterSelect label="Sede" value={filters.venue} onChange={(value) => set("venue", value)} options={venues} />
          ) : null}
          <label className="flex min-w-[150px] flex-1 flex-col gap-1 text-xs font-semibold text-[var(--ink-muted)]">
            Estado
            <select
              value={filters.status}
              onChange={(event) => set("status", event.target.value as ItemFilters["status"])}
              className={selectClass}
            >
              <option value="">Todos</option>
              {sortByLabel<[string, string]>(
                [["faltante", "Con faltante"], ...Object.entries(STATUS_LABELS)],
                ([, label]) => label,
              ).map(([status, label]) => (
                <option key={status} value={status}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={filters.onlyUnreviewed} onChange={(event) => set("onlyUnreviewed", event.target.checked)} />
            Solo sin revisar
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={filters.showDoNotUse} onChange={(event) => set("showDoNotUse", event.target.checked)} />
            Mostrar “No usar”
          </label>
          <span className="font-mono text-xs text-[var(--ink-muted)]">
            {visible.length} de {items.length} materiales
          </span>
          {hasFilters ? (
            <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => onFiltersChange(EMPTY_FILTERS)}>
              Limpiar filtros
            </button>
          ) : null}
          {visible.length > 0 ? (
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                className="ui-btn ui-btn-secondary ui-btn-sm"
                onClick={() => actions.bulkUpdateItems(visible.map((item) => item.id), { reviewed: true })}
                title="Marca como revisados todos los materiales que ves ahora"
              >
                Marcar {visible.length} como revisados
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {/* ── Contenido ── */}
      {visible.length === 0 ? (
        <EmptyState>No hay materiales con esos filtros.</EmptyState>
      ) : view === "list" ? (
        <div className="flex flex-col gap-4">
          {sections.map(([kind, list]) => {
            const collapsed = collapsedKinds.has(kind);
            const attention = list.filter((item) => {
              const status = computeItemMetrics(item, groupsById).status;
              return status === "sin_pedido" || status === "insuficiente";
            }).length;
            return (
              <section key={kind} className="glass-panel overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleKind(kind)}
                  aria-expanded={!collapsed}
                  className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left"
                >
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="text-[var(--ink-muted)]">{collapsed ? "▸" : "▾"}</span>
                    <span className="font-semibold">{kind}</span>
                    <span className="font-mono text-xs text-[var(--ink-muted)]">{list.length}</span>
                  </span>
                  {attention > 0 ? (
                    <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-[var(--danger)]">
                      {attention} con faltante
                    </span>
                  ) : (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      Todo cubierto
                    </span>
                  )}
                </button>
                {collapsed ? null : (
                  <div className="overflow-x-auto border-t border-[var(--line)]">
                    <table className="ui-table min-w-[1180px]">
                      <thead>
                        <tr className="text-xs">
                          <th>Módulo</th>
                          <th>Versión</th>
                          <th className="text-right">Disponible</th>
                          <th className="text-right">Inscritos</th>
                          <th className="text-right">Libre hoy</th>
                          <th className="text-right">Proyección</th>
                          <th className="text-right">A imprimir</th>
                          <th className="text-right">Final</th>
                          <th className="text-right">Falta pedir</th>
                          <th>Estado</th>
                          <th className="text-center">Revisado</th>
                          <th className="text-center">Retirar</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((item) => {
                          const metrics = computeItemMetrics(item, groupsById);
                          const open = expanded === item.id;
                          return (
                            <Fragment key={item.id}>
                              <tr className={item.doNotUse ? "opacity-55" : undefined}>
                                <td className="font-medium">
                                  <div className="flex items-center gap-1">
                                    <TextCell
                                      value={item.module ?? ""}
                                      label={`Módulo de ${item.kind}`}
                                      className="min-w-[90px]"
                                      onCommit={(value) => actions.updateItem(item.id, { module: value })}
                                    />
                                    {item.notes ? (
                                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                        {item.notes}
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="text-[var(--ink-muted)]">
                                  <TextCell
                                    value={item.version ?? ""}
                                    label={`Versión de ${item.kind} ${item.module ?? ""}`}
                                    className="min-w-[70px]"
                                    onCommit={(value) => actions.updateItem(item.id, { version: value })}
                                  />
                                </td>
                                <td className="text-right">
                                  <NumberCell
                                    value={item.available}
                                    label={`Disponible de ${item.kind} ${item.module ?? ""}`}
                                    onCommit={(value) => actions.updateItem(item.id, { available: value })}
                                  />
                                </td>
                                <td className="text-right tabular-nums text-[var(--ink-muted)]">
                                  {metrics.enrolled === null ? "—" : formatNumber(metrics.enrolled)}
                                </td>
                                <td className={`text-right font-semibold tabular-nums ${(metrics.freeToday ?? 0) < 0 ? "text-[var(--danger)]" : ""}`}>
                                  {metrics.freeToday === null ? "—" : formatNumber(metrics.freeToday)}
                                </td>
                                <td className="text-right tabular-nums text-[var(--ink-muted)]">
                                  {formatNumber(metrics.required)}
                                  {metrics.overEnrolled ? (
                                    <span className="block text-[10px] font-semibold text-amber-700" title="Hay grupos con más inscritos que proyectados; Final usa los inscritos.">
                                      se usa {formatNumber(metrics.demand)}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="text-right">
                                  <NumberCell
                                    value={item.printQty}
                                    label={`Cantidad a imprimir de ${item.kind} ${item.module ?? ""}`}
                                    onCommit={(value) => actions.updateItem(item.id, { printQty: value })}
                                  />
                                </td>
                                <td className={`text-right font-semibold tabular-nums ${metrics.projected < 0 ? "text-[var(--danger)]" : "text-emerald-700"}`}>
                                  {formatNumber(metrics.projected)}
                                </td>
                                <td className="text-right tabular-nums">{metrics.toOrder ? formatNumber(metrics.toOrder) : "—"}</td>
                                <td>
                                  <StatusPill status={metrics.status} />
                                </td>
                                <td className="text-center">
                                  <input
                                    type="checkbox"
                                    checked={item.reviewed}
                                    aria-label={`Revisado: ${item.kind} ${item.module ?? ""}`}
                                    onChange={(event) => actions.updateItem(item.id, { reviewed: event.target.checked })}
                                  />
                                </td>
                                <td className="text-center">
                                  <button
                                    type="button"
                                    className={`h-7 w-7 rounded-full text-lg leading-none text-[var(--ink-muted)] hover:bg-white ${
                                      item.doNotUse ? "hover:text-[var(--accent)]" : "hover:text-[var(--danger)]"
                                    }`}
                                    aria-label={`${item.doNotUse ? "Volver a usar" : "No se usará"}: ${item.kind} ${item.module ?? ""}`}
                                    title={item.doNotUse ? "Volver a usar: regresa a la proyección" : "No se usará: lo manda a Material retirado (se puede regresar)"}
                                    onClick={() => actions.updateItem(item.id, { doNotUse: !item.doNotUse })}
                                  >
                                    {item.doNotUse ? "↺" : "×"}
                                  </button>
                                </td>
                                <td className="text-right">
                                  <button
                                    type="button"
                                    className="ui-btn ui-btn-secondary ui-btn-sm whitespace-nowrap"
                                    aria-expanded={open}
                                    onClick={() => setExpanded(open ? null : item.id)}
                                  >
                                    {item.groupIds.length} grupos {open ? "▴" : "▾"}
                                  </button>
                                </td>
                              </tr>
                              {open ? (
                                <tr>
                                  <td colSpan={13} className="bg-white/60">
                                    <ItemDetail
                                      item={item}
                                      groups={groups}
                                      onToggle={(groupId, assigned) => actions.setAssignment([item.id], groupId, assigned)}
                                      kinds={kinds}
                                      onUpdate={(patch) => actions.updateItem(item.id, patch)}
                                      onRemove={() => {
                                        if (window.confirm(`¿Eliminar ${item.kind} ${item.module ?? ""}?`)) {
                                          setExpanded(null);
                                          void actions.removeItem(item.id);
                                        }
                                      }}
                                    />
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <MatrixView
          items={[...visible].sort((a, b) => a.position - b.position)}
          groups={groups.filter(
            (group) => (!filters.courseKey || group.courseKey === filters.courseKey) && (!filters.venue || (group.venue ?? "") === filters.venue),
          )}
          onToggle={actions.setAssignment}
        />
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="flex min-w-[150px] flex-1 flex-col gap-1 text-xs font-semibold text-[var(--ink-muted)]">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className={selectClass}>
        <option value="">Todos</option>
        {[...options].sort(compareNatural).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Detalle de un material: a qué grupos llega, notas y acciones. */
function ItemDetail({
  item,
  groups,
  onToggle,
  kinds,
  onUpdate,
  onRemove,
}: {
  item: MaterialItem;
  groups: MaterialGroup[];
  onToggle: (groupId: string, assigned: boolean) => void;
  kinds: string[];
  onUpdate: (patch: { notes?: string | null; doNotUse?: boolean; version?: string | null; kind?: string }) => void;
  onRemove: () => void;
}) {
  const [notes, setNotes] = useState(item.notes ?? "");
  const [kind, setKind] = useState(item.kind);
  const byVenue = useMemo(() => {
    const map = new Map<string, MaterialGroup[]>();
    for (const group of groups) {
      const key = group.venue ?? "Cursos";
      map.set(key, [...(map.get(key) ?? []), group]);
    }
    return [...map.entries()];
  }, [groups]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">Quién recibe este material</p>
        <div className="flex flex-col gap-3">
          {byVenue.map(([venue, venueGroups]) => (
            <div key={venue} className="flex flex-wrap items-center gap-2">
              <span className="w-40 shrink-0 text-xs font-semibold text-[var(--ink-muted)]">{venue}</span>
              {venueGroups.map((group) => {
                const on = item.groupIds.includes(group.id);
                return (
                  <button
                    key={group.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onToggle(group.id, !on)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      on
                        ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                        : "border-[var(--line)] bg-white text-[var(--ink-muted)] hover:border-[var(--accent)]"
                    } ${group.counts ? "" : "border-dashed"}`}
                    title={`${groupName(group)} · ${group.students} alumnos${group.counts ? "" : " (no cuenta en la proyección)"}`}
                  >
                    {group.courseLabel} <span className="opacity-70">{group.students}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs font-semibold text-[var(--ink-muted)]">
          Tipo de material
          <input
            list="material-kinds-edit"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            onBlur={() => {
              const next = kind.trim();
              if (!next) setKind(item.kind);
              else if (next !== item.kind) onUpdate({ kind: next });
            }}
            maxLength={120}
            className="ui-control min-h-[40px] py-1.5 text-sm font-normal text-[var(--foreground)]"
          />
          <datalist id="material-kinds-edit">
            {kinds.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <label className="flex min-w-[260px] flex-1 flex-col gap-1 text-xs font-semibold text-[var(--ink-muted)]">
          Nota
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => notes !== (item.notes ?? "") && onUpdate({ notes: notes.trim() || null })}
            placeholder="Ej. NO USAR, reimpresión pendiente…"
            maxLength={200}
            className="ui-control min-h-[40px] py-1.5 text-sm font-normal text-[var(--foreground)]"
          />
        </label>
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => onUpdate({ doNotUse: !item.doNotUse })}>
          {item.doNotUse ? "Volver a usar" : "Retirar de uso"}
        </button>
        <button type="button" className="ui-btn ui-btn-danger ui-btn-sm" onClick={onRemove}>
          Eliminar
        </button>
      </div>
    </div>
  );
}

/** Matriz material × grupo: el equivalente al bloque de checks del Excel. */
function MatrixView({
  items,
  groups,
  onToggle,
}: {
  items: MaterialItem[];
  groups: MaterialGroup[];
  onToggle: (itemIds: string[], groupId: string, assigned: boolean) => void;
}) {
  return (
    <section className="glass-panel overflow-hidden">
      <p className="border-b border-[var(--line)] px-5 py-3 text-xs text-[var(--ink-muted)]">
        Marca qué grupos reciben cada material. Usa el check del encabezado para asignar a un grupo todos los materiales visibles.
      </p>
      <div className="max-h-[70vh] overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 min-w-[240px] border-b border-r border-[var(--line)] bg-[#f6f8ff] px-3 py-2 text-left">
                Material
              </th>
              {groups.map((group) => {
                const all = items.length > 0 && items.every((item) => item.groupIds.includes(group.id));
                return (
                  <th
                    key={group.id}
                    className="sticky top-0 z-10 min-w-[88px] border-b border-[var(--line)] bg-[#f6f8ff] px-2 py-2 text-center align-bottom"
                  >
                    <span className="block text-xs font-semibold leading-tight">{group.courseLabel}</span>
                    <span className="block text-[10px] font-normal text-[var(--ink-muted)]">{group.venue ?? " "}</span>
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={all}
                      aria-label={`Asignar todos los materiales visibles a ${groupName(group)}`}
                      onChange={(event) =>
                        onToggle(
                          items.map((item) => item.id),
                          group.id,
                          event.target.checked,
                        )
                      }
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className={item.doNotUse ? "opacity-55" : "hover:bg-white/70"}>
                <td className="sticky left-0 z-10 border-b border-r border-[var(--line)] bg-[#fbfcff] px-3 py-1.5">
                  <span className="font-medium">{item.kind}</span>{" "}
                  <span className="text-[var(--ink-muted)]">
                    {[item.version, item.module].filter(Boolean).join(" · ")}
                  </span>
                </td>
                {groups.map((group) => (
                  <td key={group.id} className="border-b border-[var(--line)]/60 text-center">
                    <input
                      type="checkbox"
                      checked={item.groupIds.includes(group.id)}
                      aria-label={`${item.kind} ${item.module ?? ""} para ${groupName(group)}`}
                      onChange={(event) => onToggle([item.id], group.id, event.target.checked)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type GroupPatch = Partial<Pick<MaterialGroup, "students" | "enrolled" | "counts" | "venue" | "courseLabel">>;

/** Lista cerrada de sedes. Si un grupo trae una sede fuera de la lista, se conserva visible para poder corregirla. */
function VenueSelect({
  value,
  onChange,
  label,
  className = "",
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  label: string;
  className?: string;
}) {
  const known = (VENUE_OPTIONS as readonly string[]).includes(value ?? "");
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || null)}
      className={`rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs ${className}`}
    >
      <option value="">Sin sede</option>
      {VENUE_OPTIONS.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
      {value && !known ? <option value={value}>{value} (corregir)</option> : null}
    </select>
  );
}

function GroupCard({
  group,
  onUpdate,
  onRemove,
}: {
  group: MaterialGroup;
  onUpdate: (id: string, patch: GroupPatch) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className={`flex flex-col gap-1 rounded-xl border border-[var(--line)] bg-white px-3 py-2 ${group.counts ? "" : "opacity-70"}`}>
      <div className="flex items-center justify-between gap-2">
        <TextCell
          value={group.courseLabel}
          label={`Nombre del curso de ${groupName(group)}`}
          required
          className="font-semibold"
          onCommit={(value) => onUpdate(group.id, { courseLabel: value })}
        />
        <button
          type="button"
          aria-label={`Eliminar grupo ${groupName(group)}`}
          title="Eliminar grupo"
          className="shrink-0 rounded-full px-2 text-lg leading-none text-[var(--ink-muted)] hover:text-[var(--danger)]"
          onClick={() => {
            if (window.confirm(`¿Eliminar el grupo "${groupName(group)}"? Se quitará de todos los materiales que lo reciben.`)) {
              onRemove(group.id);
            }
          }}
        >
          ×
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <VenueSelect
          value={group.venue}
          label={`Sede de ${groupName(group)}`}
          onChange={(venue) => onUpdate(group.id, { venue })}
        />
        <div className="flex shrink-0 items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-[var(--ink-muted)]">
            <input type="checkbox" checked={group.counts} onChange={(event) => onUpdate(group.id, { counts: event.target.checked })} />
            Cuenta
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--ink-muted)]">
        <label className="flex items-center gap-1">
          Proyectados
          <NumberCell
            value={group.students}
            label={`Alumnos proyectados de ${groupName(group)}`}
            width="w-16"
            onCommit={(value) => onUpdate(group.id, { students: value ?? 0 })}
          />
        </label>
        <label className="flex items-center gap-1">
          Inscritos
          <NumberCell
            value={group.enrolled}
            label={`Inscritos de ${groupName(group)}`}
            width="w-16"
            onCommit={(value) => onUpdate(group.id, { enrolled: value })}
          />
        </label>
        {group.enrolled !== null && group.students > 0 ? (
          <span className={group.enrolled > group.students ? "font-semibold text-amber-700" : ""}>
            {Math.round((group.enrolled / group.students) * 100)}%
          </span>
        ) : null}
      </div>
    </div>
  );
}

function GroupsPanel({
  program,
  groups,
  onUpdate,
  onCreate,
  onRemove,
}: {
  program: Program;
  groups: MaterialGroup[];
  onUpdate: (id: string, patch: GroupPatch) => void;
  onCreate: (input: { program: Program; courseLabel: string; venue?: string; students?: number; counts?: boolean }) => Promise<boolean>;
  onRemove: (id: string) => void;
}) {
  const courseNames = uniqueSorted(groups.map((group) => group.courseLabel));
  const [modality, setModality] = useState<Modality | "all">("all");
  const [adding, setAdding] = useState(false);
  const [course, setCourse] = useState("");
  const [venue, setVenue] = useState("");
  const [students, setStudents] = useState("");
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => {
    const result = { all: 0, presencial: 0, virtual: 0, none: 0 };
    for (const group of groups) {
      if (!group.counts) continue;
      result.all += group.students;
      const m = groupModality(group);
      result[m ?? "none"] += group.students;
    }
    return result;
  }, [groups]);

  const sections = useMemo(() => {
    const defs: Array<{ key: string; title: string; match: (group: MaterialGroup) => boolean; students: number }> = [
      { key: "presencial", title: "Presencial", match: (group) => groupModality(group) === "presencial", students: totals.presencial },
      { key: "virtual", title: "Virtual", match: (group) => groupModality(group) === "virtual", students: totals.virtual },
      { key: "none", title: "Sin sede", match: (group) => groupModality(group) === null, students: totals.none },
    ];
    return defs
      .filter((def) => modality === "all" || def.key === modality)
      .map((def) => ({ ...def, groups: groups.filter(def.match) }))
      .filter((def) => def.groups.length > 0);
  }, [groups, modality, totals]);

  const enrolledTotal = groups.reduce((sum, group) => sum + (group.counts ? (group.enrolled ?? 0) : 0), 0);
  const hasModalities = groups.some((group) => groupModality(group) !== null);

  const submit = async () => {
    if (!course.trim() || saving) return;
    setSaving(true);
    const ok = await onCreate({
      program,
      courseLabel: course.trim(),
      venue: venue || undefined,
      students: students === "" ? 0 : Math.max(0, Math.round(Number(students))),
    });
    setSaving(false);
    if (ok) {
      setCourse("");
      setVenue("");
      setStudents("");
      setAdding(false);
    }
  };

  return (
    <section className="glass-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Grupos y alumnos</h2>
          <p className="max-w-2xl text-xs text-[var(--ink-muted)]">
            “Proyectados” define cuánto imprimir; “Inscritos” define cuánto material queda libre hoy. Edita nombre, sede y cantidades directamente;
            desactiva “Cuenta” para dejar un grupo fuera de la proyección. Renombrar un curso lo cambia en todas sus sedes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-mono text-sm">
            Inscritos: <strong>{formatNumber(enrolledTotal)}</strong> de {formatNumber(totals.all)}
          </p>
          {hasModalities ? (
            <Segmented
              label="Modalidad"
              value={modality}
              onChange={setModality}
              options={[
                { value: "all", label: `Todos · ${formatNumber(totals.all)}` },
                { value: "presencial", label: `Presencial · ${formatNumber(totals.presencial)}` },
                { value: "virtual", label: `Virtual · ${formatNumber(totals.virtual)}` },
              ]}
            />
          ) : (
            <p className="font-mono text-sm">
              Total que cuenta: <strong>{formatNumber(totals.all)}</strong>
            </p>
          )}
          <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => setAdding((open) => !open)}>
            {adding ? "Cancelar" : "+ Grupo"}
          </button>
        </div>
      </div>

      {adding ? (
        <form
          className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--line)] bg-white/70 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="flex min-w-[200px] flex-[2] flex-col gap-1 text-xs font-semibold text-[var(--ink-muted)]">
            Curso
            <input
              list="material-course-names"
              value={course}
              onChange={(event) => setCourse(event.target.value)}
              placeholder="Elige uno existente o escribe uno nuevo"
              required
              maxLength={80}
              autoFocus
              className="ui-control min-h-[40px] py-1.5 text-sm font-normal text-[var(--foreground)]"
            />
            <datalist id="material-course-names">
              {courseNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs font-semibold text-[var(--ink-muted)]">
            Sede
            <select
              value={venue}
              onChange={(event) => setVenue(event.target.value)}
              className="ui-control min-h-[40px] py-1.5 text-sm font-normal text-[var(--foreground)]"
            >
              <option value="">Sin sede</option>
              {VENUE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="flex w-28 flex-col gap-1 text-xs font-semibold text-[var(--ink-muted)]">
            Alumnos
            <input
              type="number"
              min={0}
              value={students}
              onChange={(event) => setStudents(event.target.value)}
              className="ui-control min-h-[40px] py-1.5 text-sm font-normal text-[var(--foreground)]"
            />
          </label>
          <button type="submit" className="ui-btn ui-btn-primary" disabled={saving || !course.trim()}>
            {saving ? "Guardando…" : "Agregar grupo"}
          </button>
          {courseNames.some((name) => name.toLowerCase() === course.trim().toLowerCase()) ? (
            <p className="w-full text-xs text-[var(--ink-muted)]">
              Ya existe ese curso: el grupo nuevo se suma a él y comparte su paquete y calendario.
            </p>
          ) : course.trim() ? (
            <p className="w-full text-xs text-[var(--ink-muted)]">
              Curso nuevo: empieza sin paquete ni calendario. Los materiales se le asignan desde la Proyección.
            </p>
          ) : null}
        </form>
      ) : null}

      <div className="mt-4 flex flex-col gap-5">
        {sections.length === 0 ? <EmptyState>No hay grupos en esta modalidad.</EmptyState> : null}
        {sections.map((section) => (
          <div key={section.key}>
            {hasModalities ? (
              <div className="mb-2 flex items-baseline gap-3 border-b border-[var(--line)] pb-1">
                <h3 className="text-sm font-semibold">{section.title}</h3>
                <span className="font-mono text-xs text-[var(--ink-muted)]">
                  {section.groups.length} grupos · {formatNumber(section.students)} alumnos
                </span>
              </div>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {section.groups.map((group) => (
                <GroupCard key={group.id} group={group} onUpdate={onUpdate} onRemove={onRemove} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function NewItemForm({
  program,
  kinds,
  onCreate,
  onCancel,
}: {
  program: Program;
  kinds: string[];
  onCreate: (input: { kind: string; version?: string; module?: string; available?: number }) => Promise<void>;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState("");
  const [version, setVersion] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [available, setAvailable] = useState("");

  return (
    <form
      className="glass-panel flex flex-wrap items-end gap-3 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!kind.trim()) return;
        void onCreate({
          kind: kind.trim(),
          version: version.trim() || undefined,
          module: moduleName.trim() || undefined,
          available: available === "" ? undefined : Math.max(0, Number(available)),
        });
      }}
    >
      <label className="flex min-w-[220px] flex-[2] flex-col gap-1 text-xs font-semibold text-[var(--ink-muted)]">
        Material ({program})
        <input
          list="material-kinds"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          placeholder="Ej. M. Clase Matemáticas"
          required
          maxLength={120}
          className="ui-control min-h-[40px] py-1.5 text-sm font-normal text-[var(--foreground)]"
        />
        <datalist id="material-kinds">
          {kinds.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>
      <label className="flex w-36 flex-col gap-1 text-xs font-semibold text-[var(--ink-muted)]">
        Versión
        <input value={version} onChange={(event) => setVersion(event.target.value)} maxLength={80} className="ui-control min-h-[40px] py-1.5 text-sm font-normal text-[var(--foreground)]" />
      </label>
      <label className="flex w-36 flex-col gap-1 text-xs font-semibold text-[var(--ink-muted)]">
        Módulo
        <input value={moduleName} onChange={(event) => setModuleName(event.target.value)} maxLength={120} className="ui-control min-h-[40px] py-1.5 text-sm font-normal text-[var(--foreground)]" />
      </label>
      <label className="flex w-32 flex-col gap-1 text-xs font-semibold text-[var(--ink-muted)]">
        Disponible
        <input type="number" min={0} value={available} onChange={(event) => setAvailable(event.target.value)} className="ui-control min-h-[40px] py-1.5 text-sm font-normal text-[var(--foreground)]" />
      </label>
      <button type="submit" className="ui-btn ui-btn-primary">Agregar</button>
      <button type="button" className="ui-btn ui-btn-secondary" onClick={onCancel}>Cancelar</button>
    </form>
  );
}
