export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? 'America/Mexico_City';

/** Calendar day (YYYY-MM-DD) in the app timezone, not UTC. */
export function todayKey(now: Date = new Date(), timeZone = APP_TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
