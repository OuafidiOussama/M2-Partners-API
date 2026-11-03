import { todayIso } from './date.util';

describe('todayIso', () => {
  // 01:30 UTC on Nov 4: still Nov 3 in Toronto, already Nov 4 in London.
  const lateEvening = new Date('2026-11-04T01:30:00Z');

  it("uses the employee's own date", () => {
    expect(todayIso(lateEvening, 'CA')).toBe('2026-11-03');
    expect(todayIso(lateEvening, 'GB')).toBe('2026-11-04');
    expect(todayIso(lateEvening, 'MA')).toBe('2026-11-04');
  });

  it('falls back to the server date for other countries', () => {
    const local = new Date(2026, 10, 3, 12);
    expect(todayIso(local, 'FR')).toBe('2026-11-03');
    expect(todayIso(local)).toBe('2026-11-03');
  });
});
