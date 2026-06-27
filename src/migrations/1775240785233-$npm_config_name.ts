import { MigrationInterface, QueryRunner } from "typeorm";

export class  $npmConfigName1775240785233 implements MigrationInterface {
    name = ' $npmConfigName1775240785233'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."leave_requests_type_enum" AS ENUM('VACATION', 'SICK')`);
        await queryRunner.query(`CREATE TYPE "public"."leave_requests_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`);
        await queryRunner.query(`CREATE TABLE "leave_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" "public"."leave_requests_type_enum" NOT NULL, "start_date" date NOT NULL, "end_date" date NOT NULL, "days" integer NOT NULL, "status" "public"."leave_requests_status_enum" NOT NULL DEFAULT 'PENDING', "reason" text, "admin_reason" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "employeeId" uuid, CONSTRAINT "PK_d3abcf9a16cef1450129e06fa9f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "leave_balances" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "year" integer NOT NULL, "vacation_days" integer NOT NULL DEFAULT '18', "sick_days" integer NOT NULL DEFAULT '3', "employeeId" uuid, CONSTRAINT "UQ_f1fedd0a999de17654876d50260" UNIQUE ("employeeId", "year"), CONSTRAINT "PK_a1d90dff48fb2bfd23a7163d077" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."document_requests_type_enum" AS ENUM('WORK_CERTIFICATE', 'SALARY_CERTIFICATE')`);
        await queryRunner.query(`CREATE TYPE "public"."document_requests_status_enum" AS ENUM('PENDING', 'GENERATED', 'DOWNLOADABLE')`);
        await queryRunner.query(`CREATE TABLE "document_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" "public"."document_requests_type_enum" NOT NULL, "status" "public"."document_requests_status_enum" NOT NULL DEFAULT 'PENDING', "file_path" character varying(500), "signed_path" character varying(500), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "employeeId" uuid, CONSTRAINT "PK_43076ee267e48f196b68ce008e6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "employees" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "full_name" character varying NOT NULL, "cin" character varying NOT NULL, "start_date" date NOT NULL, "net_salary" numeric(10,2) NOT NULL, "gross_salary" numeric(10,2) NOT NULL, "user_id" uuid, CONSTRAINT "UQ_293102cdbbf0c9dc68fcc046ce7" UNIQUE ("cin"), CONSTRAINT "REL_2d83c53c3e553a48dadb9722e3" UNIQUE ("user_id"), CONSTRAINT "PK_b9535a98350d5b26e7eb0c26af4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('EMPLOYEE', 'ADMIN')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "password" character varying NOT NULL, "refresh_token" character varying, "role" "public"."users_role_enum" NOT NULL DEFAULT 'EMPLOYEE', "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "holidays" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "date" date NOT NULL, "label" character varying NOT NULL, CONSTRAINT "UQ_40dfddee0c0d7125c767d8962b1" UNIQUE ("date"), CONSTRAINT "PK_3646bdd4c3817d954d830881dfe" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "chat_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "message" text NOT NULL, "read" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "from_user_id" uuid, "to_user_id" uuid, CONSTRAINT "PK_40c55ee0e571e268b0d3cd37d10" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "event_type" character varying(100) NOT NULL, "target_id" uuid, "target_type" character varying(50), "metadata" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "actor_id" uuid, CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "leave_requests" ADD CONSTRAINT "FK_4eda1468756ca831495e308e407" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "leave_balances" ADD CONSTRAINT "FK_1e0df1791c9344d4bdde694be60" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "document_requests" ADD CONSTRAINT "FK_52e5fceb51c914ea5e8860551b8" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "employees" ADD CONSTRAINT "FK_2d83c53c3e553a48dadb9722e38" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_messages" ADD CONSTRAINT "FK_1e8bd5b24094f06ddd54bef5969" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_messages" ADD CONSTRAINT "FK_00b328e367feb5c2b0287f365f5" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_177183f29f438c488b5e8510cdb" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_177183f29f438c488b5e8510cdb"`);
        await queryRunner.query(`ALTER TABLE "chat_messages" DROP CONSTRAINT "FK_00b328e367feb5c2b0287f365f5"`);
        await queryRunner.query(`ALTER TABLE "chat_messages" DROP CONSTRAINT "FK_1e8bd5b24094f06ddd54bef5969"`);
        await queryRunner.query(`ALTER TABLE "employees" DROP CONSTRAINT "FK_2d83c53c3e553a48dadb9722e38"`);
        await queryRunner.query(`ALTER TABLE "document_requests" DROP CONSTRAINT "FK_52e5fceb51c914ea5e8860551b8"`);
        await queryRunner.query(`ALTER TABLE "leave_balances" DROP CONSTRAINT "FK_1e0df1791c9344d4bdde694be60"`);
        await queryRunner.query(`ALTER TABLE "leave_requests" DROP CONSTRAINT "FK_4eda1468756ca831495e308e407"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
        await queryRunner.query(`DROP TABLE "chat_messages"`);
        await queryRunner.query(`DROP TABLE "holidays"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`DROP TABLE "employees"`);
        await queryRunner.query(`DROP TABLE "document_requests"`);
        await queryRunner.query(`DROP TYPE "public"."document_requests_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."document_requests_type_enum"`);
        await queryRunner.query(`DROP TABLE "leave_balances"`);
        await queryRunner.query(`DROP TABLE "leave_requests"`);
        await queryRunner.query(`DROP TYPE "public"."leave_requests_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."leave_requests_type_enum"`);
    }

}
