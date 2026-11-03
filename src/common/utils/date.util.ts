import { applyDecorators } from '@nestjs/common';
import { IsISO8601, Matches } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = '$property must be a valid date in the format YYYY-MM-DD';

const COUNTRY_TIME_ZONES: Record<string, string> = {
  CA: 'America/Toronto',
  GB: 'Europe/London',
  MA: 'Africa/Casablanca',
};

/**
 * Today's date ('YYYY-MM-DD') where the employee is, so "today" is not rejected
 * as past or future because of the server's own zone. Without a known country,
 * falls back to the server's local time zone.
 */
export function todayIso(
  now: Date = new Date(),
  countryCode?: string | null,
): string {
  const timeZone = countryCode ? COUNTRY_TIME_ZONES[countryCode] : undefined;
  if (timeZone) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parses a 'YYYY-MM-DD' string as UTC midnight (what calculateWorkingDays expects). */
export function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

/** Validates a real calendar date in strict 'YYYY-MM-DD' form. */
export function IsIsoDate(): PropertyDecorator {
  return applyDecorators(
    Matches(ISO_DATE, { message: DATE_MESSAGE }),
    IsISO8601({ strict: true }, { message: DATE_MESSAGE }),
  );
}
