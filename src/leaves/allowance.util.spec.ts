import { computeBucket, LeaveUsage, requestableDays } from './allowance.util';
import { LeaveType } from '../common/enums/leave-type.enum';
import { LeaveStatus } from '../common/enums/leave-status.enum';

const { VACATION, SICK } = LeaveType;
const { APPROVED, PENDING, REJECTED, CANCELLED } = LeaveStatus;

describe('computeBucket', () => {
  const requests: LeaveUsage[] = [
    { type: VACATION, status: APPROVED, days: 5 },
    { type: VACATION, status: APPROVED, days: 2 },
    { type: VACATION, status: PENDING, days: 3 },
    { type: VACATION, status: REJECTED, days: 4 },
    { type: VACATION, status: CANCELLED, days: 1 },
    { type: SICK, status: APPROVED, days: 1 },
  ];

  it('sums approved days as taken and pending days as pending', () => {
    expect(computeBucket(18, requests, VACATION)).toEqual({
      total: 18,
      taken: 7,
      pending: 3,
      remaining: 11,
    });
  });

  it('only counts requests of the requested type', () => {
    expect(computeBucket(2, requests, SICK)).toEqual({
      total: 2,
      taken: 1,
      pending: 0,
      remaining: 1,
    });
  });

  it('reports negative remaining when the allowance is exceeded', () => {
    const sick: LeaveUsage[] = [
      { type: SICK, status: APPROVED, days: 1 },
      { type: SICK, status: APPROVED, days: 1 },
      { type: SICK, status: APPROVED, days: 1 },
    ];
    expect(computeBucket(2, sick, SICK)).toEqual({
      total: 2,
      taken: 3,
      pending: 0,
      remaining: -1,
    });
  });

  it('returns the full total when nothing was requested', () => {
    expect(computeBucket(18, [], VACATION)).toEqual({
      total: 18,
      taken: 0,
      pending: 0,
      remaining: 18,
    });
  });
});

describe('requestableDays', () => {
  it('subtracts pending days from remaining', () => {
    expect(
      requestableDays({ total: 18, taken: 7, pending: 3, remaining: 11 }),
    ).toBe(8);
  });

  it('is never negative', () => {
    expect(
      requestableDays({ total: 18, taken: 17, pending: 5, remaining: 1 }),
    ).toBe(0);
    expect(
      requestableDays({ total: 18, taken: 21, pending: 0, remaining: -3 }),
    ).toBe(0);
  });
});
