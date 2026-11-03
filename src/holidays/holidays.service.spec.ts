import { FindOperator, Repository } from 'typeorm';
import { HolidaysService } from './holidays.service';
import { Holiday } from './holiday.entity';
import { AuditService } from '../audit/audit.service';

const HOLIDAYS: Holiday[] = [
  { id: '1', date: '2026-07-01', label: 'Canada Day', country_code: 'CA' },
  { id: '2', date: '2026-07-30', label: 'Throne Day', country_code: 'MA' },
  {
    id: '3',
    date: '2026-08-31',
    label: 'Summer bank holiday',
    country_code: 'GB',
  },
];

/** Minimal in-memory stand-in for Repository.find with equality filters. */
function makeRepo() {
  return {
    find: jest.fn(
      ({ where }: { where: Record<string, unknown> }): Promise<Holiday[]> =>
        Promise.resolve(
          HOLIDAYS.filter((h) =>
            Object.entries(where).every(([key, value]) => {
              const actual = h[key as keyof Holiday];
              if (value instanceof FindOperator && value.type === 'between') {
                const [from, to] = value.value as unknown as string[];
                return actual >= from && actual <= to;
              }
              return actual === value;
            }),
          ),
        ),
    ),
  };
}

function setup() {
  const repo = makeRepo();
  const service = new HolidaysService(
    repo as unknown as Repository<Holiday>,
    { log: jest.fn() } as unknown as AuditService,
  );
  return { service, repo };
}

describe('HolidaysService', () => {
  describe('getAllDates', () => {
    it("returns only the given country's holidays", async () => {
      const { service } = setup();
      const dates = await service.getAllDates('CA');
      expect(dates).toEqual([new Date('2026-07-01')]);
    });
  });

  describe('findByYearAndCountry', () => {
    it('filters by country and by the calendar year', async () => {
      const { service, repo } = setup();

      await expect(service.findByYearAndCountry(2026, 'MA')).resolves.toEqual([
        HOLIDAYS[1],
      ]);
      await expect(service.findByYearAndCountry(2025, 'MA')).resolves.toEqual(
        [],
      );
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ order: { date: 'ASC' } }),
      );
    });
  });
});
