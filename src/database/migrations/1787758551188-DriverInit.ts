import { MigrationInterface, QueryRunner } from "typeorm";

export class DriverInit1787758551188 implements MigrationInterface {
    name = 'DriverInit1787758551188'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "activities" ADD "actorName" character varying`);
        await queryRunner.query(`CREATE TYPE "public"."activities_usertype_enum" AS ENUM('ADMIN', 'FACTORY', 'BROKER', 'DRIVER')`);
        await queryRunner.query(`ALTER TABLE "activities" ADD "userType" "public"."activities_usertype_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."activities_module_enum" AS ENUM('USERS_ACCESS', 'FINANCE', 'BILLING', 'TRIPS', 'MARKETPLACE')`);
        await queryRunner.query(`ALTER TABLE "activities" ADD "module" "public"."activities_module_enum"`);
        await queryRunner.query(`ALTER TABLE "activities" ADD "record" character varying`);
        await queryRunner.query(`CREATE TYPE "public"."drivers_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`ALTER TABLE "drivers" ADD "status" "public"."drivers_status_enum" NOT NULL DEFAULT 'ACTIVE'`);
        await queryRunner.query(`ALTER TABLE "driver_documents" ADD "driverId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "activities" DROP COLUMN "action"`);
        await queryRunner.query(`CREATE TYPE "public"."activities_action_enum" AS ENUM('LOGIN', 'VIEW', 'APPROVE', 'ISSUE', 'POST', 'CREATE', 'SETTLE', 'UPDATE', 'DELETE')`);
        await queryRunner.query(`ALTER TABLE "activities" ADD "action" "public"."activities_action_enum" NOT NULL`);
        await queryRunner.query(`ALTER TABLE "driver_documents" ADD CONSTRAINT "FK_22eb4a151d293e1bdff7a4dcc5a" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "driver_documents" DROP CONSTRAINT "FK_22eb4a151d293e1bdff7a4dcc5a"`);
        await queryRunner.query(`ALTER TABLE "activities" DROP COLUMN "action"`);
        await queryRunner.query(`DROP TYPE "public"."activities_action_enum"`);
        await queryRunner.query(`ALTER TABLE "activities" ADD "action" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "driver_documents" DROP COLUMN "driverId"`);
        await queryRunner.query(`ALTER TABLE "drivers" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."drivers_status_enum"`);
        await queryRunner.query(`ALTER TABLE "activities" DROP COLUMN "record"`);
        await queryRunner.query(`ALTER TABLE "activities" DROP COLUMN "module"`);
        await queryRunner.query(`DROP TYPE "public"."activities_module_enum"`);
        await queryRunner.query(`ALTER TABLE "activities" DROP COLUMN "userType"`);
        await queryRunner.query(`DROP TYPE "public"."activities_usertype_enum"`);
        await queryRunner.query(`ALTER TABLE "activities" DROP COLUMN "actorName"`);
    }

}
