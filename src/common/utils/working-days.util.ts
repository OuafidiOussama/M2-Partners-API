/**
 * Calculates the number of working days between two dates (inclusive).
 * Excludes weekends (Saturday, Sunday) and public holidays.
 *
 * This is the SINGLE SOURCE OF TRUTH for day counting — never duplicate this logic.
 */
export function calculateWorkingDays(
  start: Date,
  end: Date,
  holidays: Date[],
): number {
  const holidayTimes = new Set(
    holidays.map((h) => {
      const d = new Date(h);
      d.setUTCHours(0, 0, 0, 0);
      return d.getTime();
    }),
  );

  let count = 0;
  const current = new Date(start);
  current.setUTCHours(0, 0, 0, 0);

  const endNorm = new Date(end);
  endNorm.setUTCHours(0, 0, 0, 0);

  while (current <= endNorm) {
    const day = current.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = day === 0 || day === 6;
    const isHoliday = holidayTimes.has(current.getTime());

    if (!isWeekend && !isHoliday) {
      count++;
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return count;
}
