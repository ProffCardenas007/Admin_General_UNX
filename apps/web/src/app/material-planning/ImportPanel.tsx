"use client";

import { useMemo, useRef, useState } from "react";
import { formatNumber, Segmented } from "./parts";
import { parseImportText, previewImport, PROGRAM_LABELS, type ImportRow } from "./materialMath";
import type { MaterialItem, Program, Supply } from "./types";

const TEMPLATE = "Material\tVersión\tMódulo\tDisponible\tA imprimir";

type Props = {
  program: Program;
  items: MaterialItem[];
  supplies: Supply[];
  onReadFile: (file: File) => Promise<string | null>;
  onImport: (input: { mode: "replace" | "add"; rows: ImportRow[] }) => Promise<{ created: number; updated: number } | null>;
  onClose: () => void;
};

/**
 * Carga masiva: se copian filas desde Excel (o un CSV) y se pegan aquí. Antes de
 * guardar se ve qué se crea, qué se actualiza y qué filas tienen errores.
 */
export default function ImportPanel({ program, items, supplies, onReadFile, onImport, onClose }: Props) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"replace" | "add">("replace");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseImportText(text), [text]);
  const preview = useMemo(() => previewImport(parsed.rows, items, mode, program, supplies), [parsed.rows, items, mode, program, supplies]);
  const created = preview.filter((row) => row.action === "create").length;
  const updated = preview.filter((row) => row.action === "update").length;
  const same = preview.filter((row) => row.action === "same").length;

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setDone("");
    setBusy(true);
    // Excel lo lee el servidor; texto plano se lee aquí.
    const content = /\.(xlsx|xlsm)$/i.test(file.name) ? await onReadFile(file) : await file.text();
    setBusy(false);
    if (content !== null) setText(content);
  };

  const submit = async () => {
    setBusy(true);
    const result = await onImport({ mode, rows: parsed.rows });
    setBusy(false);
    if (result) {
      setText("");
      setDone(`Listo: ${result.created} materiales nuevos y ${result.updated} actualizados.`);
    }
  };

  return (
    <section className="glass-panel flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Importar materiales e inventario ({PROGRAM_LABELS[program]})</h2>
          <p className="max-w-2xl text-xs text-[var(--ink-muted)]">
            Sube la plantilla de Excel (hoja “Materiales”) o pega filas copiadas de Excel. Columnas: Programa (PAA, EXANI,
            PIENSE o Insumo), Material, Módulo, Versión, Disponible, A imprimir, No usar y Nota; con encabezados pueden ir en cualquier orden. Un renglón
            con el mismo programa + material + versión + módulo actualiza el que ya existe; si no existe, se crea. Disponible
            o A imprimir vacíos no cambian nada.
          </p>
        </div>
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={onClose}>
          Cerrar
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Qué hacer con el inventario"
          value={mode}
          onChange={setMode}
          options={[
            { value: "replace", label: "Reemplazar disponible" },
            { value: "add", label: "Sumar al disponible" },
          ]}
        />
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => fileRef.current?.click()}>
          Subir Excel o CSV
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xlsm,.csv,.tsv,.txt"
          className="hidden"
          onChange={(event) => {
            void readFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          className="ui-btn ui-btn-secondary ui-btn-sm"
          onClick={() => {
            setDone("");
            setText(TEMPLATE + "\n");
          }}
        >
          Poner encabezados
        </button>
      </div>

      <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--ink-muted)]">
        Filas a importar
        <textarea
          value={text}
          onChange={(event) => {
            setDone("");
            setText(event.target.value);
          }}
          rows={6}
          spellCheck={false}
          placeholder={`${TEMPLATE}\nM. Clase Matemáticas\tV2\t1\t1200\t300`}
          className="ui-control font-mono text-xs font-normal text-[var(--foreground)]"
        />
      </label>

      {done ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{done}</p> : null}

      {parsed.errors.length > 0 ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-[var(--danger)]">
          <p className="font-semibold">{parsed.errors.length} filas se omitirán:</p>
          <ul className="mt-1 list-disc pl-5">
            {parsed.errors.slice(0, 6).map((error) => (
              <li key={error.line}>
                Línea {error.line}: {error.message}
              </li>
            ))}
            {parsed.errors.length > 6 ? <li>y {parsed.errors.length - 6} más…</li> : null}
          </ul>
        </div>
      ) : null}

      {preview.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">{created} nuevos</span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">{updated} se actualizan</span>
            {same > 0 ? <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-slate-600">{same} sin cambios</span> : null}
          </div>
          <div className="max-h-72 overflow-auto rounded-xl border border-[var(--line)] bg-white">
            <table className="ui-table min-w-[640px] text-sm">
              <thead>
                <tr className="text-xs">
                  <th>Acción</th>
                  <th>Programa</th>
                  <th>Material</th>
                  <th>Versión</th>
                  <th>Módulo</th>
                  <th className="text-right">Disponible</th>
                  <th className="text-right">A imprimir</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, index) => (
                  <tr key={index}>
                    <td>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          row.action === "create"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : row.action === "update"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-slate-200 bg-slate-100 text-slate-600"
                        }`}
                      >
                        {row.action === "create" ? "Nuevo" : row.action === "update" ? "Actualiza" : "Igual"}
                      </span>
                    </td>
                    <td>{row.program === "INSUMO" ? "Insumo" : PROGRAM_LABELS[row.program]}</td>
                    <td>{row.kind}</td>
                    <td>{row.version ?? "—"}</td>
                    <td>{row.module ?? "—"}</td>
                    <td className="text-right tabular-nums">
                      {row.action === "update" && row.before !== row.after
                        ? `${formatNumber(row.before ?? 0)} → ${formatNumber(row.after ?? 0)}`
                        : row.after === null
                          ? "—"
                          : formatNumber(row.after)}
                    </td>
                    <td className="text-right tabular-nums">{row.printQty === undefined ? "—" : formatNumber(row.printQty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="ui-btn ui-btn-primary" disabled={busy} onClick={() => void submit()}>
              {busy ? "Importando…" : `Importar ${preview.length} filas`}
            </button>
            <button type="button" className="ui-btn ui-btn-secondary" disabled={busy} onClick={() => setText("")}>
              Limpiar
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
