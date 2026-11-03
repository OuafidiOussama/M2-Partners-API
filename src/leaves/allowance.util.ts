import { LeaveType } from '../common/enums/leave-type.enum';
import { LeaveStatus } from '../common/enums/leave-status.enum';

export interface AllowanceBucket {
  total: number;
  taken: number;
  pending: number;
  remaining: number;
}

export interface LeaveAllowanceView {
  year: number;
  vacation: AllowanceBucket;
  sick: AllowanceBucket;
}

/** Minimal request shape needed to compute usage. */
export interface LeaveUsage {
  type: LeaveType;
  status: LeaveStatus;
  days: number;
}

/**
 * taken     = days of APPROVED requests of the type
 * pending   = days of PENDING requests of the type
 * remaining = total - taken (negative once the allowance is exceeded; pending
 *             is not subtracted, the UI does that itself)
 * Callers pass each request's days within the allowance year.
 */
export function computeBucket(
  total: number,
  requests: LeaveUsage[],
  type: LeaveType,
): AllowanceBucket {
  let taken = 0;
  let pending = 0;
  for (const r of requests) {
    if (r.type !== type) continue;
    if (r.status === LeaveStatus.APPROVED) taken += r.days;
    else if (r.status === LeaveStatus.PENDING) pending += r.days;
  }
  return { total, taken, pending, remaining: total - taken };
}

/** Vacation days that can still be requested: remaining minus already-pending. */
export function requestableDays(bucket: AllowanceBucket): number {
  return Math.max(0, bucket.remaining - bucket.pending);
}
