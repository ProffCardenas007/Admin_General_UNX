/**
 * Calendarios escolares: dos por año.
 *  - "A": de junio a noviembre; lleva el año siguiente (jun–nov 2026 = 2027A).
 *  - "B": de diciembre a mayo; lleva el año en que termina (dic 2026–may 2027 = 2027B).
 */
export function calendarOf(date: string) {
  const [year, month] = date.slice(0, 10).split("-").map(Number);
  if (month >= 6 && month <= 11) return `${year + 1}A`;
  return `${month === 12 ? year + 1 : year}B`;
}

export function currentCalendar(now: Date = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return calendarOf(`${now.getFullYear()}-${month}-01`);
}

export function nextCalendar(calendar: string) {
  const year = Number(calendar.slice(0, 4));
  return calendar.endsWith("A") ? `${year}B` : `${year + 1}A`;
}

export function previousCalendar(calendar: string) {
  const year = Number(calendar.slice(0, 4));
  return calendar.endsWith("B") ? `${year}A` : `${year - 1}B`;
}

export function calendarLabel(calendar: string) {
  const year = Number(calendar.slice(0, 4));
  return calendar.endsWith("A")
    ? `${calendar} (jun – nov ${year - 1})`
    : `${calendar} (dic ${year - 1} – may ${year})`;
}

/** El vigente, el siguiente y los que ya tengan algo guardado, en orden cronológico. */
export function calendarChoices(saved: string[] = [], now: Date = new Date()) {
  const current = currentCalendar(now);
  // Dentro de un mismo año de calendario va primero A (jun–nov) y luego B.
  return [...new Set([...saved, current, nextCalendar(current)])].sort();
}
