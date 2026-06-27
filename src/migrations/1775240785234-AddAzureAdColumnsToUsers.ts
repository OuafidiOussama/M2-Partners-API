import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAzureAdColumnsToUsers1775240785234 implements MigrationInterface {
  name = 'AddAzureAdColumnsToUsers1775240785234';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "azure_oid" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "azure_email" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_users_azure_oid" UNIQUE ("azure_oid")`,
    );
    // password column is now nullable (users authenticate via Azure AD)
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "password" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_users_azure_oid"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "azure_email"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "azure_oid"`);
  }
}
