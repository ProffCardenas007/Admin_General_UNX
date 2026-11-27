"use client";

import { Fragment, useMemo, useState } from "react";
import {
  computeSupplyControl,
  computeSupplyMetrics,
  MOVEMENT_LABELS,
  PROGRAM_LABELS,
  type SupplyControlStatus,
} from "./materialMath";
import { EmptyState, formatNumber, KpiCard, NumberCell, Segmented, TextCell } from "./parts";
import type { MaterialPlanningData, MovementType, Supply, SupplyMovement } from "./types";
import type { useMaterialPlanning } from "./useMaterialPlanning";
import { sortByLabel } from "../../lib/sort";

type Actions = Pick<
  ReturnType<typeof useMaterialPlanning>,
  "createSupply" | "updateSupply" | "removeSupply" | "updateKit" | "createMovement" | "removeMovement"
>;

const STATUS_LABELS: Record<SupplyControlStatus, string> = {
  comprar: "Comprar",
  sin_dato: "Falta contar",
  cubierto: "Cubierto",
  sin_uso: "Sin paquete",
};

const STATUS_STYLES: Record<SupplyControlStatus, string> = {
  comprar: "border-red-200 bg-red-50 text-[var(--danger)]",
  sin_dato: "border-amber-200 bg-amber-50 text-amber-700",
  cubierto: "border-emerald-200 bg-emerald-50 text-emerald-700",
  sin_uso: "border-slate-200 bg-slate-100 text-slate-600",
};

const CYCLE_KEY = "material-planning.supplies-since";
const inputClass = "ui-control min-h-[40px] py-1.5 text-sm font-normal text-[var(--foreground)]";
const labelClass = "flex flex-col gap-1 text-xs font-semibold text-[var(--ink-muted)]";

const money = (value: number) => value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
/** Fecha local en AAAA-MM-DD (toISOString daría el día en UTC). */
const today = () => new Date().toLocaleDateString("en-CA");
const shortDate = (value: string) => value.split("-").reverse().join("/");
const signed = (movement: SupplyMovement) => {
  const value = movement.type === "delivery" || movement.type === "exit" ? -movement.quantity : movement.quantity;
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
};

type Draft = { type: MovementType; supplyId: string; quantity: string };

function downloadCsv(rows: SupplyMovement[], names: Map<string, string>) {
  // El apóstrofo evita que Excel ejecute como fórmula un texto capturado.
  const cell = (value: string | number) => {
    const text = String(value);
    const safe = typeof value === "string" && /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines = [
    ["Fecha", "Insumo", "Movimiento", "Cantidad", "Destino / motivo", "Costo unitario", "Total", "Registró"],
    ...rows.map((row) => [
      row.movementDate,
      names.get(row.supplyId) ?? "",
      MOVEMENT_LABELS[row.type],
      row.type === "delivery" || row.type === "exit" ? -row.quantity : row.quantity,
      row.detail ?? "",
      row.unitCost ?? "",
      row.unitCost === null ? "" : Math.round(row.unitCost * row.quantity * 100) / 100,
      row.createdBy ?? "",
    ]),
  ];
  // La marca BOM hace que Excel lea bien los acentos.
  const blob = new Blob(["﻿" + lines.map((line) => line.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `movimientos-insumos-${today()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Control de compras y salidas de papelería y artículos de paquete: existencias,
 * lo que piden los paquetes de cada curso, lo entregado y lo que falta comprar.
 */
export default function SuppliesTab({ data, actions }: { data: MaterialPlanningData; actions: Actions }) {
  const [view, setView] = useState<"stock" | "movements">("stock");
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyToBuy, setOnlyToBuy] = useState(false);
  const [typeFilter, setTypeFilter] = useState<MovementType | "">("");
  // Esta pestaña solo se monta en el cliente, después de cargar los datos.
  const [since, setSince] = useState(() => (typeof window === "undefined" ? "" : (window.localStorage.getItem(CYCLE_KEY) ?? "")));

  const changeSince = (value: string) => {
    setSince(value);
    window.localStorage.setItem(CYCLE_KEY, value);
  };

  const metrics = useMemo(() => computeSupplyMetrics(data.supplies, data.kits, data.groups), [data.supplies, data.kits, data.groups]);

  const control = useMemo(
    () =>
      new Map(
        data.supplies.map((supply) => [
          supply.id,
          computeSupplyControl(
            supply,
            metrics.get(supply.id)?.required ?? 0,
            data.kits.some((kit) => kit.supplyId === supply.id),
            data.supplyMovements,
            since,
          ),
        ]),
      ),
    [data.supplies, data.kits, data.supplyMovements, metrics, since],
  );

  const names = useMemo(() => new Map(data.supplies.map((supply) => [supply.id, supply.name])), [data.supplies]);
  const needle = search.trim().toLowerCase();

  const visible = data.supplies.filter(
    (supply) => supply.name.toLowerCase().includes(needle) && (!onlyToBuy || control.get(supply.id)?.status === "comprar"),
  );
  const history = data.supplyMovements.filter(
    (movement) =>
      (!since || movement.movementDate >= since) &&
      (!typeFilter || movement.type === typeFilter) &&
      (names.get(movement.supplyId) ?? "").toLowerCase().includes(needle),
  );

  const totals = useMemo(() => {
    const result = { toBuy: 0, pieces: 0, cost: 0, withoutCost: 0, entries: 0, exits: 0 };
    for (const row of control.values()) {
      result.entries += row.entries;
      result.exits += row.exits;
      if (row.toBuy <= 0) continue;
      result.toBuy += 1;
      result.pieces += row.toBuy;
      if (row.lastCost === null) result.withoutCost += 1;
      else result.cost += row.toBuy * row.lastCost;
    }
    return result;
  }, [control]);

  // Renglones de paquete que todavía no se comparan contra ningún insumo (uno por programa + nombre).
  const unlinked = useMemo(() => {
    const seen = new Map<string, { id: string; program: keyof typeof PROGRAM_LABELS; item: string; courses: number }>();
    for (const kit of data.kits) {
      if (kit.supplyId || kit.qty <= 0) continue;
      const key = `${kit.program}|${kit.item.toLowerCase()}`;
      const entry = seen.get(key);
      if (entry) entry.courses += 1;
      else seen.set(key, { id: kit.id, program: kit.program, item: kit.item, courses: 1 });
    }
    return [...seen.values()];
  }, [data.kits]);

  const openDraft = (type: MovementType, supplyId = "", quantity = "") => {
    setShowNew(false);
    setDraft({ type, supplyId, quantity });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Por comprar"
          value={formatNumber(totals.pieces)}
          hint={totals.toBuy ? `piezas de ${totals.toBuy} ${totals.toBuy === 1 ? "insumo" : "insumos"}` : "todo cubierto"}
          tone={totals.toBuy ? "warn" : "good"}
          onClick={() => {
            setView("stock");
            setOnlyToBuy((value) => !value);
          }}
          active={onlyToBuy}
        />
        <KpiCard
          label="Costo estimado"
          value={totals.cost ? money(totals.cost) : "—"}
          hint={totals.withoutCost ? `${totals.withoutCost} sin precio de compra` : "con el último precio pagado"}
        />
        <KpiCard label="Entradas" value={formatNumber(totals.entries)} hint={since ? `desde ${shortDate(since)}` : "piezas, todo el historial"} />
        <KpiCard label="Salidas" value={formatNumber(totals.exits)} hint={since ? `desde ${shortDate(since)}` : "piezas, todo el historial"} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Vista de insumos"
          value={view}
          onChange={setView}
          options={[
            { value: "stock", label: "Inventario" },
            { value: "movements", label: "Movimientos" },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ui-btn ui-btn-primary" disabled={!data.supplies.length} onClick={() => openDraft("entry")}>
            + Entrada
          </button>
          <button type="button" className="ui-btn ui-btn-secondary" disabled={!data.supplies.length} onClick={() => openDraft("delivery")}>
            − Salida
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-secondary"
            onClick={() => {
              setDraft(null);
              setShowNew((value) => !value);
            }}
          >
            + Insumo
          </button>
        </div>
      </div>

      {draft ? (
        <MovementForm
          key={`${draft.type}-${draft.supplyId}`}
          initial={draft}
          supplies={data.supplies}
          onSave={actions.createMovement}
          onClose={() => setDraft(null)}
        />
      ) : null}

      {showNew ? <NewSupplyForm onCreate={actions.createSupply} onClose={() => setShowNew(false)} /> : null}

      <section className="glass-panel flex flex-wrap items-end gap-3 p-4" aria-label="Filtros de insumos">
        <label className={`${labelClass} min-w-[200px] flex-1`}>
          Buscar insumo
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Ciclo desde
          <input type="date" value={since} onChange={(event) => changeSince(event.target.value)} className={inputClass} />
        </label>
        {view === "movements" ? (
          <>
            <label className={labelClass}>
              Movimiento
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as MovementType | "")} className={inputClass}>
                <option value="">Todos</option>
                {sortByLabel((Object.keys(MOVEMENT_LABELS) as MovementType[]), (type) => MOVEMENT_LABELS[type]).map((type) => (
                  <option key={type} value={type}>
                    {MOVEMENT_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="ui-btn ui-btn-secondary" disabled={!history.length} onClick={() => downloadCsv(history, names)}>
              Descargar CSV
            </button>
          </>
        ) : (
          <label className="flex min-h-[40px] items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyToBuy} onChange={(event) => setOnlyToBuy(event.target.checked)} />
            Solo por comprar
          </label>
        )}
        <p className="basis-full text-xs text-[var(--ink-muted)]">
          Por comprar = lo que piden los paquetes y no se ha entregado + mínimo − disponible. Al empezar un ciclo nuevo, pon su fecha
          en “Ciclo desde” para que las entregas anteriores no cuenten.
        </p>
      </section>

      {view === "movements" ? (
        history.length === 0 ? (
          <EmptyState>No hay movimientos. Registra una entrada o una salida con los botones de arriba.</EmptyState>
        ) : (
          <MovementsTable rows={history} names={names} onRemove={actions.removeMovement} />
        )
      ) : data.supplies.length === 0 ? (
        <EmptyState>Todavía no hay insumos. Agrégalos con “+ Insumo” o impórtalos desde Excel (Programa = Insumo).</EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState>No hay insumos con esos filtros.</EmptyState>
      ) : (
        <section className="glass-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="ui-table min-w-[960px]">
              <thead>
                <tr className="text-xs">
                  <th>Insumo</th>
                  <th className="text-right">Entradas</th>
                  <th className="text-right">Salidas</th>
                  <th className="text-right">Disponible</th>
                  <th className="text-right">Requiere</th>
                  <th className="text-right">Por entregar</th>
                  <th className="text-right">Mínimo</th>
                  <th className="text-right">Por comprar</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((supply) => {
                  const row = control.get(supply.id)!;
                  const usage = metrics.get(supply.id)?.usage ?? [];
                  const open = openId === supply.id;
                  return (
                    <Fragment key={supply.id}>
                      <tr>
                        <td className="min-w-[260px] font-medium">
                          <TextCell
                            value={supply.name}
                            label={`Nombre del insumo ${supply.name}`}
                            required
                            onCommit={(value) => actions.updateSupply(supply.id, { name: value })}
                          />
                        </td>
                        <td className="text-right tabular-nums text-emerald-700">{row.entries ? `+${formatNumber(row.entries)}` : "—"}</td>
                        <td className="text-right tabular-nums text-[var(--ink-muted)]">{row.exits ? `−${formatNumber(row.exits)}` : "—"}</td>
                        <td className="text-right font-semibold tabular-nums">
                          {supply.available === null ? "—" : formatNumber(supply.available)}
                        </td>
                        <td className="text-right tabular-nums text-[var(--ink-muted)]">{formatNumber(metrics.get(supply.id)?.required ?? 0)}</td>
                        <td className="text-right tabular-nums">{formatNumber(row.pending)}</td>
                        <td className="text-right">
                          <NumberCell
                            value={supply.minStock}
                            label={`Mínimo de ${supply.name}`}
                            width="w-20"
                            onCommit={(value) => actions.updateSupply(supply.id, { minStock: value })}
                          />
                        </td>
                        <td className={`text-right tabular-nums ${row.toBuy ? "font-semibold text-[var(--danger)]" : "text-[var(--ink-muted)]"}`}>
                          {row.toBuy ? formatNumber(row.toBuy) : "—"}
                        </td>
                        <td>
                          <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[row.status]}`}>
                            {STATUS_LABELS[row.status]}
                          </span>
                        </td>
                        <td className="whitespace-nowrap text-right">
                          <button
                            type="button"
                            className="ui-btn ui-btn-secondary ui-btn-sm"
                            aria-label={`Registrar entrada de ${supply.name}`}
                            title="Registrar entrada (compra)"
                            onClick={() => openDraft("entry", supply.id, row.toBuy ? String(row.toBuy) : "")}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="ui-btn ui-btn-secondary ui-btn-sm ml-1"
                            aria-label={`Registrar salida de ${supply.name}`}
                            title="Registrar salida"
                            onClick={() => openDraft("delivery", supply.id)}
                          >
                            −
                          </button>
                          <button
                            type="button"
                            className="ui-btn ui-btn-secondary ui-btn-sm ml-1"
                            aria-expanded={open}
                            aria-label={`Detalle de ${supply.name}`}
                            onClick={() => setOpenId(open ? null : supply.id)}
                          >
                            {open ? "▴" : "▾"}
                          </button>
                        </td>
                      </tr>
                      {open ? (
                        <tr>
                          <td colSpan={10} className="bg-white/60">
                            <div className="flex flex-col gap-3 p-4 text-sm">
                              {usage.length > 0 ? (
                                <ul className="flex flex-col gap-1">
                                  {usage.map((use) => (
                                    <li key={`${use.program}-${use.courseKey}-${use.item}`} className="flex flex-wrap justify-between gap-2">
                                      <span>
                                        <span className="font-medium">{use.courseLabel}</span>{" "}
                                        <span className="text-xs text-[var(--ink-muted)]">{PROGRAM_LABELS[use.program]}</span>
                                      </span>
                                      <span className="tabular-nums text-[var(--ink-muted)]">
                                        {use.perStudent} × {formatNumber(use.students)} alumnos ={" "}
                                        <span className="font-semibold text-[var(--foreground)]">{formatNumber(use.total)}</span>
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-[var(--ink-muted)]">Ningún paquete lo usa todavía. Vincula un renglón de paquete abajo.</p>
                              )}
                              <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
                                <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => openDraft("adjust", supply.id)}>
                                  Ajustar por conteo físico
                                </button>
                                <button
                                  type="button"
                                  className="ui-btn ui-btn-danger ui-btn-sm"
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `¿Eliminar el insumo “${supply.name}”? Se borra su historial de movimientos y los paquetes quedan sin vincular.`,
                                      )
                                    ) {
                                      void actions.removeSupply(supply.id);
                                    }
                                  }}
                                >
                                  Eliminar insumo
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {view === "stock" && unlinked.length > 0 && data.supplies.length > 0 ? (
        <section className="glass-panel p-5">
          <h2 className="font-semibold">Renglones de paquete sin insumo ({unlinked.length})</h2>
          <p className="text-xs text-[var(--ink-muted)]">
            Elige a qué insumo corresponde cada uno y se compara contra las existencias. Vale para ese renglón en todos los
            cursos del programa. Lo que no sea un insumo (p. ej. hojas) puedes dejarlo sin vincular.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {unlinked.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{row.item}</span>{" "}
                  <span className="text-xs text-[var(--ink-muted)]">
                    {PROGRAM_LABELS[row.program]} · {row.courses} {row.courses === 1 ? "curso" : "cursos"}
                  </span>
                </span>
                <select
                  aria-label={`Insumo de ${row.item}`}
                  value=""
                  onChange={(event) => event.target.value && void actions.updateKit(row.id, { supplyId: event.target.value })}
                  className="ui-control min-h-[36px] w-56 py-1 text-sm"
                >
                  <option value="">Vincular con…</option>
                  {sortByLabel(data.supplies, (supply) => supply.name).map((supply) => (
                    <option key={supply.id} value={supply.id}>
                      {supply.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function MovementForm({
  initial,
  supplies,
  onSave,
  onClose,
}: {
  initial: Draft;
  supplies: Supply[];
  onSave: Actions["createMovement"];
  onClose: () => void;
}) {
  const [type, setType] = useState<MovementType>(initial.type);
  const [supplyId, setSupplyId] = useState(initial.supplyId);
  const [quantity, setQuantity] = useState(initial.quantity);
  const [date, setDate] = useState(today);
  const [detail, setDetail] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);

  const supply = supplies.find((row) => row.id === supplyId);
  const isOut = type === "delivery" || type === "exit";
  const title = type === "entry" ? "Registrar entrada" : type === "adjust" ? "Conteo físico" : "Registrar salida";

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    const failure = await onSave(supplyId, {
      type,
      quantity: Math.round(Number(quantity)),
      movementDate: date,
      detail: type === "entry" ? undefined : detail.trim() || undefined,
      unitCost: type === "entry" && unitCost !== "" ? Math.round(Number(unitCost) * 100) / 100 : undefined,
    });
    setSaving(false);
    if (failure) setProblem(failure);
    else onClose();
  };

  return (
    <form
      className="glass-panel flex flex-wrap items-end gap-3 border-2 border-[var(--accent)] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h2 className="basis-full font-semibold">{title}</h2>
      {isOut ? (
        <label className={labelClass}>
          Tipo de salida
          <select value={type} onChange={(event) => setType(event.target.value as MovementType)} className={inputClass}>
            <option value="delivery">{MOVEMENT_LABELS.delivery}</option>
            <option value="exit">Otra salida (merma, uso interno)</option>
          </select>
        </label>
      ) : null}
      <label className={`${labelClass} min-w-[200px] flex-1`}>
        Insumo
        <select value={supplyId} onChange={(event) => setSupplyId(event.target.value)} required className={inputClass}>
          <option value="">Elige uno…</option>
          {sortByLabel(supplies, (row) => row.name).map((row) => (
            <option key={row.id} value={row.id}>
              {row.name} ({row.available === null ? "sin contar" : formatNumber(row.available)})
            </option>
          ))}
        </select>
      </label>
      <label className={`${labelClass} w-32`}>
        {type === "adjust" ? "Piezas que hay" : "Cantidad"}
        <input
          type="number"
          min={type === "adjust" ? 0 : 1}
          max={isOut ? (supply?.available ?? 0) : undefined}
          step={1}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          required
          autoFocus
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Fecha
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required className={inputClass} />
      </label>
      {type === "entry" ? (
        <label className={`${labelClass} w-36`}>
          Costo por pieza
          <input type="number" min={0} step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} className={inputClass} />
        </label>
      ) : (
        <label className={`${labelClass} min-w-[200px] flex-1`}>
          {type === "delivery" ? "Curso, sede o quién recibe" : "Motivo"}
          <input value={detail} onChange={(event) => setDetail(event.target.value)} maxLength={200} className={inputClass} />
        </label>
      )}
      <button type="submit" className="ui-btn ui-btn-primary" disabled={saving}>
        {saving ? "Guardando…" : "Guardar"}
      </button>
      <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose}>
        Cancelar
      </button>
      {problem ? (
        <p role="alert" className="basis-full text-sm text-[var(--danger)]">
          {problem}
        </p>
      ) : null}
    </form>
  );
}

function NewSupplyForm({ onCreate, onClose }: { onCreate: Actions["createSupply"]; onClose: () => void }) {
  const [name, setName] = useState("");
  const [available, setAvailable] = useState("");

  return (
    <form
      className="glass-panel flex flex-wrap items-end gap-3 p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        const ok = await onCreate({
          name: trimmed,
          available: available === "" ? undefined : Math.max(0, Math.round(Number(available))),
        });
        if (ok) onClose();
      }}
    >
      <label className={`${labelClass} min-w-[220px] flex-[2]`}>
        Nuevo insumo
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Ej. Lápiz" required autoFocus className={inputClass} />
      </label>
      <label className={`${labelClass} w-44`}>
        Existencia inicial
        <input type="number" min={0} value={available} onChange={(event) => setAvailable(event.target.value)} className={inputClass} />
      </label>
      <button type="submit" className="ui-btn ui-btn-primary" disabled={!name.trim()}>
        Agregar
      </button>
      <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose}>
        Cancelar
      </button>
      <p className="basis-full text-xs text-[var(--ink-muted)]">
        También puedes cargar existencias desde Proyección → Importar, con filas de Programa = Insumo.
      </p>
    </form>
  );
}

function MovementsTable({
  rows,
  names,
  onRemove,
}: {
  rows: SupplyMovement[];
  names: Map<string, string>;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="glass-panel overflow-hidden">
      <div className="max-h-[70vh] overflow-auto">
        <table className="ui-table min-w-[920px]">
          <thead>
            <tr className="text-xs">
              <th>Fecha</th>
              <th>Insumo</th>
              <th>Movimiento</th>
              <th className="text-right">Cantidad</th>
              <th>Destino / motivo</th>
              <th className="text-right">Total</th>
              <th>Registró</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap tabular-nums">{shortDate(row.movementDate)}</td>
                <td className="font-medium">{names.get(row.supplyId)}</td>
                <td className="whitespace-nowrap">{MOVEMENT_LABELS[row.type]}</td>
                <td className="text-right font-semibold tabular-nums">{signed(row)}</td>
                <td>{row.detail ?? "—"}</td>
                <td className="whitespace-nowrap text-right tabular-nums" title={row.unitCost === null ? undefined : `${money(row.unitCost)} por pieza`}>
                  {row.unitCost === null ? "—" : money(row.unitCost * row.quantity)}
                </td>
                <td className="text-xs text-[var(--ink-muted)]">{row.createdBy ?? "—"}</td>
                <td className="text-right">
                  <button
                    type="button"
                    className="ui-btn ui-btn-secondary ui-btn-sm"
                    onClick={() => {
                      if (window.confirm(`¿Anular este movimiento de ${names.get(row.supplyId)} (${signed(row)})? Las existencias se corrigen.`)) {
                        onRemove(row.id);
                      }
                    }}
                  >
                    Anular
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
