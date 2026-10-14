import { todayKey } from './dates';

describe('todayKey', () => {
  it('uses the app timezone instead of UTC', () => {
    // 2026-01-16 02:30 UTC is still Jan 15 evening in Mexico City (UTC-6).
    const instant = new Date('2026-01-16T02:30:00Z');
    expect(todayKey(instant, 'America/Mexico_City')).toBe('2026-01-15');
    expect(todayKey(instant, 'UTC')).toBe('2026-01-16');
  });
});
