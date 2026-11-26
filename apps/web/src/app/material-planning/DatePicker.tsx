"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatDateLong, localToday } from "./materialMath";

const POPOVER_WIDTH = 288;
const POPOVER_HEIGHT = 390;

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const WEEKDAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

const pad = (value: number) => String(value).padStart(2, "0");
const toIso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

function parse(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
/** Posición del día 1 en una semana que empieza en lunes (0 = lunes). */
const firstOffset = (year: number, month: number) => (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;

type Props = {
  value: string | null;
  /** Se llama solo al pulsar "Aceptar". */
  onConfirm: (value: string) => void;
  label: string;
  placeholder?: string;
  /** "field" = campo con borde; "link" = texto subrayable (para filas compactas). */
  variant?: "field" | "link";
  format?: (iso: string) => string;
};

/**
 * Calendario en español. A diferencia del selector nativo del navegador (que usa el
 * idioma del navegador y confirma al tocar un día), aquí elegir un día solo lo marca;
 * la fecha se guarda hasta pulsar "Aceptar".
 */
export default function DatePicker({
  value,
  onConfirm,
  label,
  placeholder = "Elegir fecha",
  variant = "field",
  format = formatDateLong,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(value);
  const [view, setView] = useState(() => parse(value ?? localToday()));
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const today = localToday();

  /**
   * El calendario se dibuja en un portal (fuera de los paneles con desenfoque, que crean su
   * propia capa y lo taparían) y se coloca junto al botón, dentro de la pantalla.
   */
  const place = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= POPOVER_HEIGHT + 8 ? rect.bottom + 8 : Math.max(8, rect.top - POPOVER_HEIGHT - 8);
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - POPOVER_WIDTH - 8));
    setPosition({ top, left });
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onReposition = () => place();
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const openPicker = () => {
    setDraft(value);
    setView(parse(value ?? today));
    place();
    setOpen(true);
  };

  const moveMonth = (delta: number) =>
    setView((current) => {
      const index = current.year * 12 + (current.month - 1) + delta;
      return { year: Math.floor(index / 12), month: (index % 12) + 1, day: 1 };
    });

  const blanks = firstOffset(view.year, view.month);
  const total = daysInMonth(view.year, view.month);
  const canConfirm = draft !== null && draft !== value;

  const triggerClass =
    variant === "link"
      ? "font-mono text-sm hover:underline"
      : "ui-control inline-flex min-h-[40px] items-center gap-2 py-1.5 text-left text-sm";

  return (
    <div className="inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPicker())}
        className={triggerClass}
      >
        {variant === "field" ? <span aria-hidden="true">📅</span> : null}
        <span className={value ? "" : "text-[var(--ink-muted)]"}>{value ? format(value) : placeholder}</span>
      </button>

      {open
        ? createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={label}
          style={{ position: "fixed", top: position.top, left: position.left, width: POPOVER_WIDTH, zIndex: 1000 }}
          className="rounded-2xl border border-[var(--line)] bg-white p-3 shadow-2xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="flex">
              <button type="button" aria-label="Año anterior" className="rounded-lg px-2 py-1 hover:bg-slate-100" onClick={() => moveMonth(-12)}>
                «
              </button>
              <button type="button" aria-label="Mes anterior" className="rounded-lg px-2 py-1 hover:bg-slate-100" onClick={() => moveMonth(-1)}>
                ‹
              </button>
            </div>
            <p className="text-sm font-semibold capitalize" aria-live="polite">
              {MONTHS[view.month - 1]} {view.year}
            </p>
            <div className="flex">
              <button type="button" aria-label="Mes siguiente" className="rounded-lg px-2 py-1 hover:bg-slate-100" onClick={() => moveMonth(1)}>
                ›
              </button>
              <button type="button" aria-label="Año siguiente" className="rounded-lg px-2 py-1 hover:bg-slate-100" onClick={() => moveMonth(12)}>
                »
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] font-semibold text-[var(--ink-muted)]">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday} className="py-1">
                {weekday}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: blanks }, (_, index) => (
              <span key={`blank-${index}`} />
            ))}
            {Array.from({ length: total }, (_, index) => {
              const day = index + 1;
              const iso = toIso(view.year, view.month, day);
              const selected = iso === draft;
              return (
                <button
                  key={iso}
                  type="button"
                  aria-label={formatDateLong(iso)}
                  aria-pressed={selected}
                  onClick={() => setDraft(iso)}
                  className={`h-9 rounded-lg text-sm tabular-nums transition ${
                    selected
                      ? "bg-[var(--accent)] font-semibold text-white"
                      : iso === today
                        ? "border border-[var(--accent)] font-semibold text-[var(--accent)] hover:bg-slate-100"
                        : "hover:bg-slate-100"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <p className="mt-3 min-h-[1.25rem] text-center text-xs text-[var(--ink-muted)]">
            {draft ? formatDateLong(draft) : "Elige un día"}
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-primary ui-btn-sm disabled:opacity-50"
              disabled={!canConfirm}
              onClick={() => {
                if (draft) onConfirm(draft);
                setOpen(false);
              }}
            >
              Aceptar
            </button>
          </div>
        </div>,
            document.body,
          )
        : null}
    </div>
  );
}
