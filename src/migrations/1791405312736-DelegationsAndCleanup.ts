import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds approval delegations and removes features the product no longer uses:
 * chat, document requests / certificates, password auth columns and employee
 * HR data (cin, salaries).
 *
 * down() recreates the dropped tables and columns empty: their data is lost.
 * Restored NOT NULL columns get placeholders (cin = 'RESTORED-<id>', salaries 0).
 */
export class DelegationsAndCleanup1791405312736 implements MigrationInterface {
  name = 'DelegationsAndCleanup1791405312736';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- delegations -------------------------------------------------------
    await queryRunner.query(
      `CREATE TABLE "delegations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "start_date" date NOT NULL, "end_date" date, "cancelled_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "delegator_id" uuid NOT NULL, "delegate_id" uuid NOT NULL, CONSTRAINT "CHK_delegations_date_order" CHECK ("end_date" IS NULL OR "end_date" >= "start_date"), CONSTRAINT "CHK_delegations_not_self" CHECK ("delegator_id" <> "delegate_id"), CONSTRAINT "PK_01f9fbbc9b3bf52236a4e951b19" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_delegations_delegate_start" ON "delegations" ("delegate_id", "start_date") `,
    );
    await queryRunner.query(
      `ALTER TABLE "delegations" ADD CONSTRAINT "FK_65cb96f7573dd182ad4ec259f9a" FOREIGN KEY ("delegator_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "delegations" ADD CONSTRAINT "FK_343ec2641e2831522ca623b7d80" FOREIGN KEY ("delegate_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // --- chat --------------------------------------------------------------
    await queryRunner.query(`DROP TABLE "chat_messages"`);

    // --- document requests -------------------------------------------------
    await queryRunner.query(`DROP TABLE "document_requests"`);
    await queryRunner.query(
      `DROP TYPE "public"."document_requests_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."document_requests_type_enum"`);

    // --- employee HR data --------------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "employees" DROP CONSTRAINT "UQ_293102cdbbf0c9dc68fcc046ce7"`,
    );
    await queryRunner.query(`ALTER TABLE "employees" DROP COLUMN "cin"`);
    await queryRunner.query(`ALTER TABLE "employees" DROP COLUMN "net_salary"`);
    await queryRunner.query(
      `ALTER TABLE "employees" DROP COLUMN "gross_salary"`,
    );

    // --- password auth -----------------------------------------------------
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "password"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "refresh_token"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // --- password auth -----------------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "users" ADD "refresh_token" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "password" character varying`,
    );

    // --- employee HR data --------------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "gross_salary" numeric(10,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "net_salary" numeric(10,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ALTER COLUMN "gross_salary" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ALTER COLUMN "net_salary" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "cin" character varying`,
    );
    await queryRunner.query(
      `UPDATE "employees" SET "cin" = 'RESTORED-' || "id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ALTER COLUMN "cin" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD CONSTRAINT "UQ_293102cdbbf0c9dc68fcc046ce7" UNIQUE ("cin")`,
    );

    // --- document requests -------------------------------------------------
    await queryRunner.query(
      `CREATE TYPE "public"."document_requests_type_enum" AS ENUM('WORK_CERTIFICATE', 'SALARY_CERTIFICATE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."document_requests_status_enum" AS ENUM('PENDING', 'GENERATED', 'DOWNLOADABLE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "document_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" "public"."document_requests_type_enum" NOT NULL, "status" "public"."document_requests_status_enum" NOT NULL DEFAULT 'PENDING', "file_path" character varying(500), "signed_path" character varying(500), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "employeeId" uuid, CONSTRAINT "PK_43076ee267e48f196b68ce008e6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_requests" ADD CONSTRAINT "FK_52e5fceb51c914ea5e8860551b8" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // --- chat --------------------------------------------------------------
    await queryRunner.query(
      `CREATE TABLE "chat_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "message" text NOT NULL, "read" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "from_user_id" uuid, "to_user_id" uuid, CONSTRAINT "PK_40c55ee0e571e268b0d3cd37d10" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_messages" ADD CONSTRAINT "FK_1e8bd5b24094f06ddd54bef5969" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_messages" ADD CONSTRAINT "FK_00b328e367feb5c2b0287f365f5" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    // --- delegations -------------------------------------------------------
    await queryRunner.query(`DROP TABLE "delegations"`);
  }
}
