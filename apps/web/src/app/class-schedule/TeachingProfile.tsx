"use client";

export type Teaching = {
  subjects: string[];
  programs: string[];
  modalities: string[];
  venues: string[];
};

export const EMPTY_TEACHING: Teaching = { subjects: [], programs: [], modalities: [], venues: [] };

// Deben coincidir con TEACHING_OPTIONS del API.
const FIELDS: Array<{ key: keyof Teaching; label: string; options: string[] }> = [
  { key: "subjects", label: "Materia", options: ["Español", "Matemáticas"] },
  { key: "programs", label: "Tipo de curso", options: ["EXANI II", "PAA"] },
  { key: "modalities", label: "Modalidad", options: ["Presencial", "Virtual"] },
  { key: "venues", label: "Sede", options: ["López Cotilla", "Medicina"] },
];

/** Qué puede dar un profesor. Se puede marcar más de una opción por campo. */
export default function TeachingProfile({
  value,
  onChange,
  disabled = false,
}: {
  value: Teaching;
  onChange: (next: Teaching) => void;
  disabled?: boolean;
}) {
  const toggle = (key: keyof Teaching, option: string) => {
    const current = value[key];
    onChange({
      ...value,
      [key]: current.includes(option) ? current.filter((item) => item !== option) : [...current, option],
    });
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {FIELDS.map((field) => (
        <fieldset key={field.key} disabled={disabled} className="disabled:opacity-60">
          <legend className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
            {field.label}
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {field.options.map((option) => {
              const on = value[field.key].includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(field.key, option)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    on
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-[var(--line)] bg-white text-[var(--ink-muted)] hover:border-[var(--accent)]"
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
