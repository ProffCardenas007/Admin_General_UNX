"use client";

import { useState, type ReactNode } from "react";
import { STATUS_LABELS, type MaterialStatus } from "./materialMath";

export const STATUS_STYLES: Record<MaterialStatus, string> = {
  cubierto: "border-emerald-200 bg-emerald-50 text-emerald-700",
  insuficiente: "border-amber-200 bg-amber-50 text-amber-700",
  sin_pedido: "border-red-200 bg-red-50 text-[var(--danger)]",
  sin_grupos: "border-slate-200 bg-slate-100 text-slate-600",
  no_usar: "border-slate-200 bg-slate-100 text-slate-500",
};

export function StatusPill({ status }: { status: MaterialStatus }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  tone = "default",
  onClick,
  active,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "warn" | "good";
  onClick?: () => void;
  active?: boolean;
}) {
  const color = tone === "warn" ? "text-[var(--danger)]" : tone === "good" ? "text-emerald-700" : "text-[var(--foreground)]";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`kpi-card p-4 text-left ${onClick ? "transition hover:-translate-y-0.5" : ""} ${
        active ? "ring-2 ring-[var(--accent)]" : ""
      }`}
    >
      <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{hint}</p> : null}
    </Tag>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-full border border-[var(--line)] bg-white p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            value === option.value
              ? "bg-[var(--accent)] text-white shadow-sm"
              : "text-[var(--ink-muted)] hover:text-[var(--foreground)]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Campo numérico que guarda al salir del campo o con Enter. Vacío = sin dato. */
export function NumberCell({
  value,
  onCommit,
  label,
  placeholder = "—",
  width = "w-20",
}: {
  value: number | null;
  onCommit: (value: number | null) => void;
  label: string;
  placeholder?: string;
  width?: string;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const [seen, setSeen] = useState(value);

  // Si el valor cambia desde fuera (recarga, guardado), el borrador lo sigue.
  if (seen !== value) {
    setSeen(value);
    setDraft(value === null ? "" : String(value));
  }

  const commit = () => {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : Math.max(0, Math.round(Number(trimmed)));
    if (next !== null && Number.isNaN(next)) {
      setDraft(value === null ? "" : String(value));
      return;
    }
    if (next !== value) onCommit(next);
  };

  return (
    <input
      type="number"
      min={0}
      inputMode="numeric"
      aria-label={label}
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(value === null ? "" : String(value));
          event.currentTarget.blur();
        }
      }}
      className={`${width} rounded-lg border border-transparent bg-transparent px-2 py-1 text-right tabular-nums hover:border-[var(--line)] focus:border-[var(--accent)] focus:bg-white focus:outline-none`}
    />
  );
}

/** Texto editable en línea: guarda al salir del campo o con Enter; Escape cancela. */
export function TextCell({
  value,
  onCommit,
  label,
  placeholder = "—",
  className = "",
  required = false,
}: {
  value: string;
  onCommit: (value: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  const commit = () => {
    const next = draft.trim();
    if (required && !next) {
      setDraft(value);
      return;
    }
    if (next !== value) onCommit(next);
  };
  return (
    <input
      type="text"
      aria-label={label}
      value={draft}
      placeholder={placeholder}
      maxLength={80}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      className={`w-full rounded-lg border border-transparent bg-transparent px-2 py-1 hover:border-[var(--line)] focus:border-[var(--accent)] focus:bg-white focus:outline-none ${className}`}
    />
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="ui-empty p-8 text-center text-sm">{children}</div>;
}

export function formatNumber(value: number) {
  return value.toLocaleString("es-MX");
}
