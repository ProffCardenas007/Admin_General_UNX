"use client";

type Option = { value: string; label: string };

function FilterSelect({
  label,
  allLabel,
  options,
  value,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  allLabel: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-[var(--ink-muted)]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        title={hint}
        className="min-w-0 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--foreground)] disabled:opacity-60"
      >
        <option value="">{disabled && hint ? hint : allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Una sola barra de filtros para gerencia y líderes. */
export default function TaskFilterBar(props: {
  search: string;
  onSearch: (value: string) => void;
  specialties: Option[];
  specialty: string;
  onSpecialty: (value: string) => void;
  /** null: el rol no filtra por academia. */
  academies: Option[] | null;
  academy: string;
  onAcademy: (value: string) => void;
  projects: Option[];
  projectId: string;
  onProject: (value: string) => void;
  people: Option[];
  assigneeId: string;
  onAssignee: (value: string) => void;
  /** Nombre de la persona filtrada cuando no está en la lista. */
  assigneeFallbackLabel: string;
  onClear: () => void;
}) {
  const people =
    props.assigneeId && !props.people.some((person) => person.value === props.assigneeId)
      ? [{ value: props.assigneeId, label: props.assigneeFallbackLabel }, ...props.people]
      : props.people;
  const hasFilters = Boolean(
    props.search || props.specialty || props.academy || props.projectId || props.assigneeId,
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={props.search}
          onChange={(event) => props.onSearch(event.target.value)}
          placeholder="Buscar tarea por título o código"
          aria-label="Buscar tarea"
          className="ui-control min-w-[220px] flex-1"
        />
        {hasFilters ? (
          <button type="button" onClick={props.onClear} className="ui-btn ui-btn-secondary ui-btn-sm">
            Limpiar filtros
          </button>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FilterSelect
          label="Especialidad"
          allLabel="Todas"
          options={props.specialties}
          value={props.specialty}
          onChange={props.onSpecialty}
        />
        {props.academies ? (
          <FilterSelect
            label="Academia"
            allLabel="Todas"
            options={props.academies}
            value={props.academy}
            onChange={props.onAcademy}
            disabled={!props.specialty}
            hint={props.specialty ? undefined : "Elige especialidad"}
          />
        ) : null}
        <FilterSelect
          label="Proyecto"
          allLabel="Todos"
          options={props.projects}
          value={props.projectId}
          onChange={props.onProject}
        />
        <FilterSelect
          label="Persona"
          allLabel="Todas"
          options={people}
          value={props.assigneeId}
          onChange={props.onAssignee}
          disabled={people.length === 0}
          hint={people.length === 0 ? "Elige proyecto" : undefined}
        />
      </div>
    </div>
  );
}
