/**
 * Calendarios escolares: dos por año.
 *  - "A": de junio a noviembre; lleva el año siguiente (jun–nov 2026 = 2027A).
 *  - "B": de diciembre a mayo; lleva el año en que termina (dic 2026–may 2027 = 2027B).
 */
export function calendarOf(date: string) {
  const [year, month] = date.slice(0, 10).split('-').map(Number);
  if (month >= 6 && month <= 11) return `${year + 1}A`;
  return `${month === 12 ? year + 1 : year}B`;
}

export const CALENDAR_PATTERN = /^20\d{2}[AB]$/;

export function currentCalendar(now: Date = new Date()) {
  // Fecha de México: en UTC el cambio de calendario se adelantaría unas horas.
  return calendarOf(now.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }));
}
