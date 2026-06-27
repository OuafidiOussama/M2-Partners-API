import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCancelledLeaveStatus1775240785235 implements MigrationInterface {
  name = 'AddCancelledLeaveStatus1775240785235';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."leave_requests_status_enum" ADD VALUE IF NOT EXISTS 'CANCELLED'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres does not support removing enum values directly.
    // To roll back: recreate the enum without CANCELLED and cast the column.
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
        ALTER COLUMN "status" TYPE character varying
        USING status::text
    `);
    await queryRunner.query(`DROP TYPE "public"."leave_requests_status_enum"`);
    await queryRunner.query(`
      CREATE TYPE "public"."leave_requests_status_enum"
        AS ENUM('PENDING', 'APPROVED', 'REJECTED')
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
        ALTER COLUMN "status" TYPE "public"."leave_requests_status_enum"
        USING status::"public"."leave_requests_status_enum"
    `);
  }
}
