import { MigrationInterface, QueryRunner } from 'typeorm';

const ACCOUNT = 'oussama.ouafidi@m2partnersglobal.com';
/** Rejected requests stored before Moroccan holidays were counted. */
const STALE_DAYS = [
  { start: '2026-08-01', end: '2026-08-21', stored: 15, correct: 12 },
  { start: '2026-07-04', end: '2026-08-09', stored: 25, correct: 24 },
];
const OVERLAP_NOTE =
  'Cancelled by data correction: these dates are already covered by an approved request.';

/**
 * HR portal contract fixes:
 * - employees.country_code becomes mandatory. Missing values are backfilled
 *   with 'MA', the only country the app supported before the redesign.
 * - The one account whose vacation_total had been set to 50 by a direct
 *   database edit (no code path or audit entry) returns to the default of 18.
 * - That account's approved 2026-06-27..06-30 request lies inside its approved
 *   2026-06-29..07-15 request, so 2 days were counted twice. It predates the
 *   overlap check and is cancelled.
 * - Two of its rejected requests get their working days recounted, as they
 *   now appear in History. They never affected the allowance.
 * - leave_requests.created_at becomes timestamptz, like the newer tables. Without
 *   a zone it was read back shifted on any server not running in UTC. Existing
 *   values were written by a UTC database session.
 *
 * The account fixes match on the exact old values, so they do nothing on a
 * database without this data. down() cannot tell backfilled countries from
 * real ones, so it only drops the constraint.
 */
export class ContractDataFixes1791500000000 implements MigrationInterface {
  name = 'ContractDataFixes1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "employees" SET "country_code" = 'MA' WHERE "country_code" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ALTER COLUMN "country_code" SET NOT NULL`,
    );

    await queryRunner.query(
      `UPDATE "leave_allowances" a SET "vacation_total" = 18
       FROM "employees" e JOIN "users" u ON u."id" = e."user_id"
       WHERE a."employeeId" = e."id" AND u."email" = $1
         AND a."year" = 2026 AND a."vacation_total" = 50`,
      [ACCOUNT],
    );
    await queryRunner.query(
      `UPDATE "leave_requests" l
       SET "status" = 'CANCELLED', "admin_reason" = $2
       FROM "employees" e JOIN "users" u ON u."id" = e."user_id"
       WHERE l."employeeId" = e."id" AND u."email" = $1
         AND l."status" = 'APPROVED'
         AND l."start_date" = '2026-06-27' AND l."end_date" = '2026-06-30'`,
      [ACCOUNT, OVERLAP_NOTE],
    );
    for (const { start, end, stored, correct } of STALE_DAYS) {
      await this.setDays(queryRunner, start, end, stored, correct);
    }
    await queryRunner.query(
      `ALTER TABLE "leave_requests" ALTER COLUMN "created_at" TYPE TIMESTAMP WITH TIME ZONE USING "created_at" AT TIME ZONE 'UTC'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "leave_requests" ALTER COLUMN "created_at" TYPE TIMESTAMP USING "created_at" AT TIME ZONE 'UTC'`,
    );
    for (const { start, end, stored, correct } of STALE_DAYS) {
      await this.setDays(queryRunner, start, end, correct, stored);
    }
    await queryRunner.query(
      `UPDATE "leave_requests"
       SET "status" = 'APPROVED', "admin_reason" = NULL
       WHERE "admin_reason" = $1`,
      [OVERLAP_NOTE],
    );
    await queryRunner.query(
      `UPDATE "leave_allowances" a SET "vacation_total" = 50
       FROM "employees" e JOIN "users" u ON u."id" = e."user_id"
       WHERE a."employeeId" = e."id" AND u."email" = $1 AND a."year" = 2026`,
      [ACCOUNT],
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ALTER COLUMN "country_code" DROP NOT NULL`,
    );
  }

  private async setDays(
    queryRunner: QueryRunner,
    start: string,
    end: string,
    from: number,
    to: number,
  ): Promise<void> {
    await queryRunner.query(
      `UPDATE "leave_requests" l SET "days" = $5
       FROM "employees" e JOIN "users" u ON u."id" = e."user_id"
       WHERE l."employeeId" = e."id" AND u."email" = $1
         AND l."status" = 'REJECTED' AND l."days" = $4
         AND l."start_date" = $2 AND l."end_date" = $3`,
      [ACCOUNT, start, end, from, to],
    );
  }
}
