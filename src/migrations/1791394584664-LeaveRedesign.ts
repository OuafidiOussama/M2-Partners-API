import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * UI redesign: employee profile fields, derived leave allowances,
 * per-country holidays, profile change requests and company documents.
 *
 * Data handling:
 * - employees.first_name / last_name are split from full_name on the first
 *   space (full_name is kept and maintained by the entity).
 * - leave_balances is renamed to leave_allowances. The stored "remaining"
 *   counters (vacation_days / sick_days) are replaced by totals (18 / 2);
 *   taken days are derived from approved leave_requests from now on.
 *   down() rebuilds the remaining counters from totals minus approved days.
 * - existing holidays are assigned country_code 'MA'.
 */
export class LeaveRedesign1791394584664 implements MigrationInterface {
  name = 'LeaveRedesign1791394584664';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- employees -------------------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "first_name" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "last_name" character varying`,
    );
    await queryRunner.query(`
      UPDATE "employees" SET
        "first_name" = split_part(btrim("full_name"), ' ', 1),
        "last_name" = CASE
          WHEN position(' ' IN btrim("full_name")) > 0
            THEN btrim(substr(btrim("full_name"), position(' ' IN btrim("full_name")) + 1))
          ELSE ''
        END
    `);
    await queryRunner.query(
      `ALTER TABLE "employees" ALTER COLUMN "first_name" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ALTER COLUMN "last_name" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "job_title" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "avatar_url" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "mobile" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "country_code" character(2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "emergency_contact_name" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "emergency_contact_phone" character varying`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."employees_contract_type_enum" AS ENUM('FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'INTERN')`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "contract_type" "public"."employees_contract_type_enum" NOT NULL DEFAULT 'FULL_TIME'`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "work_hours" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "office" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "department" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "is_active" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "line_manager_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD CONSTRAINT "FK_fb63e0af5f730a46e0c5ce976a8" FOREIGN KEY ("line_manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // --- leave_balances -> leave_allowances ------------------------------
    await queryRunner.query(
      `ALTER TABLE "leave_balances" RENAME TO "leave_allowances"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_allowances" RENAME CONSTRAINT "PK_a1d90dff48fb2bfd23a7163d077" TO "PK_0f7eaefebeaa0568d857c42a9b9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_allowances" RENAME CONSTRAINT "UQ_f1fedd0a999de17654876d50260" TO "UQ_e86f8ca4ff68e1accb537bde936"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_allowances" RENAME CONSTRAINT "FK_1e0df1791c9344d4bdde694be60" TO "FK_b1c3522f7a2d52759f179d7cb70"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_allowances" ADD "vacation_total" integer NOT NULL DEFAULT '18'`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_allowances" ADD "sick_total" integer NOT NULL DEFAULT '2'`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_allowances" DROP COLUMN "vacation_days"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_allowances" DROP COLUMN "sick_days"`,
    );

    // --- leave_requests --------------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "leave_requests" ADD "reviewed_by" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_requests" ADD "reviewed_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_requests" ADD CONSTRAINT "FK_2f7a4220ff516ce48bdd91ce23d" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // --- holidays --------------------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "holidays" ADD "country_code" character(2) NOT NULL DEFAULT 'MA'`,
    );
    await queryRunner.query(
      `ALTER TABLE "holidays" ALTER COLUMN "country_code" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "holidays" DROP CONSTRAINT "UQ_40dfddee0c0d7125c767d8962b1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "holidays" ADD CONSTRAINT "UQ_c3b382db4e8ecbc611ac10652af" UNIQUE ("date", "country_code")`,
    );

    // --- profile_change_requests -----------------------------------------
    await queryRunner.query(
      `CREATE TYPE "public"."profile_change_requests_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "profile_change_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "first_name" character varying NOT NULL, "last_name" character varying NOT NULL, "mobile" character varying NOT NULL, "emergency_contact_name" character varying NOT NULL, "emergency_contact_phone" character varying NOT NULL, "status" "public"."profile_change_requests_status_enum" NOT NULL DEFAULT 'PENDING', "admin_reason" text, "reviewed_by" uuid, "reviewed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "employee_id" uuid NOT NULL, CONSTRAINT "PK_3bd64a0a33aaa5c526259a9fb43" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_change_requests" ADD CONSTRAINT "FK_93ea114d9ec390e24a54e6083a1" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_change_requests" ADD CONSTRAINT "FK_355afa21d68c8a34b5a22f3a3da" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_profile_change_requests_one_pending" ON "profile_change_requests" ("employee_id") WHERE "status" = 'PENDING'`,
    );

    // --- company_documents -----------------------------------------------
    await queryRunner.query(
      `CREATE TYPE "public"."company_documents_category_enum" AS ENUM('GUIDE', 'CONTRACT', 'POLICY')`,
    );
    await queryRunner.query(
      `CREATE TABLE "company_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "category" "public"."company_documents_category_enum" NOT NULL, "title" character varying NOT NULL, "file_name" character varying NOT NULL, "storage_key" character varying NOT NULL, "mime_type" character varying NOT NULL, "sort_order" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_df54bfe584d2de1b722f3072629" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "company_documents"`);
    await queryRunner.query(
      `DROP TYPE "public"."company_documents_category_enum"`,
    );
    await queryRunner.query(`DROP TABLE "profile_change_requests"`);
    await queryRunner.query(
      `DROP TYPE "public"."profile_change_requests_status_enum"`,
    );

    // The old schema allowed one holiday per date: keep one row per date
    // (preferring MA) before restoring unique(date).
    await queryRunner.query(
      `ALTER TABLE "holidays" DROP CONSTRAINT "UQ_c3b382db4e8ecbc611ac10652af"`,
    );
    await queryRunner.query(`
      DELETE FROM "holidays" WHERE "id" IN (
        SELECT "id" FROM (
          SELECT "id", row_number() OVER (
            PARTITION BY "date" ORDER BY ("country_code" = 'MA') DESC, "id"
          ) AS rn
          FROM "holidays"
        ) ranked
        WHERE ranked.rn > 1
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "holidays" ADD CONSTRAINT "UQ_40dfddee0c0d7125c767d8962b1" UNIQUE ("date")`,
    );
    await queryRunner.query(
      `ALTER TABLE "holidays" DROP COLUMN "country_code"`,
    );

    await queryRunner.query(
      `ALTER TABLE "leave_requests" DROP CONSTRAINT "FK_2f7a4220ff516ce48bdd91ce23d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_requests" DROP COLUMN "reviewed_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_requests" DROP COLUMN "reviewed_by"`,
    );

    // Rebuild the stored "remaining" counters from totals minus approved days.
    await queryRunner.query(
      `ALTER TABLE "leave_allowances" ADD "vacation_days" integer NOT NULL DEFAULT '18'`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_allowances" ADD "sick_days" integer NOT NULL DEFAULT '3'`,
    );
    await queryRunner.query(`
      UPDATE "leave_allowances" a SET
        "vacation_days" = a."vacation_total" - COALESCE((
          SELECT SUM(lr."days") FROM "leave_requests" lr
          WHERE lr."employeeId" = a."employeeId" AND lr."type" = 'VACATION'
            AND lr."status" = 'APPROVED'
            AND EXTRACT(YEAR FROM lr."start_date") = a."year"), 0),
        "sick_days" = a."sick_total" - COALESCE((
          SELECT SUM(lr."days") FROM "leave_requests" lr
          WHERE lr."employeeId" = a."employeeId" AND lr."type" = 'SICK'
            AND lr."status" = 'APPROVED'
            AND EXTRACT(YEAR FROM lr."start_date") = a."year"), 0)
    `);
    await queryRunner.query(
      `ALTER TABLE "leave_allowances" DROP COLUMN "sick_total"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_allowances" DROP COLUMN "vacation_total"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_allowances" RENAME CONSTRAINT "FK_b1c3522f7a2d52759f179d7cb70" TO "FK_1e0df1791c9344d4bdde694be60"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_allowances" RENAME CONSTRAINT "UQ_e86f8ca4ff68e1accb537bde936" TO "UQ_f1fedd0a999de17654876d50260"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_allowances" RENAME CONSTRAINT "PK_0f7eaefebeaa0568d857c42a9b9" TO "PK_a1d90dff48fb2bfd23a7163d077"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_allowances" RENAME TO "leave_balances"`,
    );

    // employees: full_name was kept up to date, so the split columns can go.
    await queryRunner.query(
      `ALTER TABLE "employees" DROP CONSTRAINT "FK_fb63e0af5f730a46e0c5ce976a8"`,
    );
    for (const column of [
      'line_manager_id',
      'is_active',
      'department',
      'office',
      'work_hours',
      'contract_type',
      'emergency_contact_phone',
      'emergency_contact_name',
      'country_code',
      'mobile',
      'avatar_url',
      'job_title',
      'last_name',
      'first_name',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "employees" DROP COLUMN "${column}"`,
      );
    }
    await queryRunner.query(
      `DROP TYPE "public"."employees_contract_type_enum"`,
    );
  }
}
