import { MigrationInterface, QueryRunner } from 'typeorm';

/** Teams and their many-to-many membership. Names are unique ignoring case. */
export class Teams1793672787050 implements MigrationInterface {
  name = 'Teams1793672787050';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "teams" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7e5523774a38b08a6236d322403" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_teams_name_lower" ON "teams" (LOWER("name"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "team_members" ("team_id" uuid NOT NULL, "employee_id" uuid NOT NULL, CONSTRAINT "PK_5f7ad9a25854961eb94989aa80c" PRIMARY KEY ("team_id", "employee_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fdad7d5768277e60c40e01cdce" ON "team_members" ("team_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_aba48de73c7fc9c20fbcfebf57" ON "team_members" ("employee_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "team_members" ADD CONSTRAINT "FK_fdad7d5768277e60c40e01cdcea" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "team_members" ADD CONSTRAINT "FK_aba48de73c7fc9c20fbcfebf57f" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "team_members" DROP CONSTRAINT "FK_aba48de73c7fc9c20fbcfebf57f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "team_members" DROP CONSTRAINT "FK_fdad7d5768277e60c40e01cdcea"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_aba48de73c7fc9c20fbcfebf57"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fdad7d5768277e60c40e01cdce"`,
    );
    await queryRunner.query(`DROP TABLE "team_members"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_teams_name_lower"`);
    await queryRunner.query(`DROP TABLE "teams"`);
  }
}
