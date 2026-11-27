"use client";

import { calendarChoices, calendarLabel } from "../../lib/calendar";

export default function CalendarSelect({
  value,
  saved,
  onChange,
}: {
  value: string;
  saved?: string[];
  onChange: (calendar: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
      Calendario
      <select value={value} onChange={(event) => onChange(event.target.value)} className="ui-control min-w-[230px] normal-case">
        {calendarChoices([...(saved ?? []), value]).map((calendar) => (
          <option key={calendar} value={calendar}>
            {calendarLabel(calendar)}
          </option>
        ))}
      </select>
    </label>
  );
}
