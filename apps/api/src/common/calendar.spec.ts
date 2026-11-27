import { calendarOf } from './calendar';

describe('calendarOf', () => {
  it.each([
    ['2026-06-01', '2027A'],
    ['2026-11-30', '2027A'],
    ['2026-12-01', '2027B'],
    ['2027-05-31', '2027B'],
    ['2027-06-01', '2028A'],
  ])('%s pertenece a %s', (date, calendar) => {
    expect(calendarOf(date)).toBe(calendar);
  });
});
