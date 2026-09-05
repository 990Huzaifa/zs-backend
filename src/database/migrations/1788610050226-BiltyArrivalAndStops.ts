import { MigrationInterface, QueryRunner } from "typeorm";

export class BiltyArrivalAndStops1788610050226 implements MigrationInterface {
    name = 'BiltyArrivalAndStops1788610050226'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bilty_loadings" DROP COLUMN "loadingTimeOut"`);
        await queryRunner.query(`ALTER TABLE "bilty_loadings" DROP COLUMN "loadingTimeIn"`);
        await queryRunner.query(`ALTER TABLE "bilty_loadings" DROP COLUMN "arrivalDate"`);
        await queryRunner.query(`ALTER TABLE "bilty_off_loadings" DROP COLUMN "offLoadingTimeIn"`);
        await queryRunner.query(`ALTER TABLE "bilty_off_loadings" DROP COLUMN "offLoadingTimeOut"`);
        await queryRunner.query(`ALTER TABLE "bilty_off_loadings" DROP COLUMN "offLoadingDate"`);
        await queryRunner.query(`ALTER TABLE "bilty_loadings" ADD "loadingArrivalDateTime" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "bilty_loadings" ADD "stopsContact" jsonb`);
        await queryRunner.query(`ALTER TABLE "bilty_off_loadings" ADD "offLoadingDateTime" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "bilty_off_loadings" ADD "offLoadingArrivalDateTime" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "bilty_off_loadings" ADD "stopsContact" jsonb`);
        await queryRunner.query(`CREATE TYPE "public"."trips_docstatus_enum" AS ENUM('PENDING', 'RECEIVED')`);
        await queryRunner.query(`ALTER TABLE "trips" ADD "docStatus" "public"."trips_docstatus_enum" NOT NULL DEFAULT 'PENDING'`);
        await queryRunner.query(`ALTER TYPE "public"."trips_status_enum" RENAME TO "trips_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."trips_status_enum" AS ENUM('PENDING', 'STARTED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED')`);
        await queryRunner.query(`ALTER TABLE "trips" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "trips" ALTER COLUMN "status" TYPE "public"."trips_status_enum" USING "status"::"text"::"public"."trips_status_enum"`);
        await queryRunner.query(`ALTER TABLE "trips" ALTER COLUMN "status" SET DEFAULT 'PENDING'`);
        await queryRunner.query(`DROP TYPE "public"."trips_status_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."trips_status_enum_old" AS ENUM('PENDING', 'STARTED', 'COMPLETED', 'CANCELLED')`);
        await queryRunner.query(`ALTER TABLE "trips" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "trips" ALTER COLUMN "status" TYPE "public"."trips_status_enum_old" USING "status"::"text"::"public"."trips_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "trips" ALTER COLUMN "status" SET DEFAULT 'PENDING'`);
        await queryRunner.query(`DROP TYPE "public"."trips_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."trips_status_enum_old" RENAME TO "trips_status_enum"`);
        await queryRunner.query(`ALTER TABLE "trips" DROP COLUMN "docStatus"`);
        await queryRunner.query(`DROP TYPE "public"."trips_docstatus_enum"`);
        await queryRunner.query(`ALTER TABLE "bilty_off_loadings" DROP COLUMN "stopsContact"`);
        await queryRunner.query(`ALTER TABLE "bilty_off_loadings" DROP COLUMN "offLoadingArrivalDateTime"`);
        await queryRunner.query(`ALTER TABLE "bilty_off_loadings" DROP COLUMN "offLoadingDateTime"`);
        await queryRunner.query(`ALTER TABLE "bilty_loadings" DROP COLUMN "stopsContact"`);
        await queryRunner.query(`ALTER TABLE "bilty_loadings" DROP COLUMN "loadingArrivalDateTime"`);
        await queryRunner.query(`ALTER TABLE "bilty_off_loadings" ADD "offLoadingDate" date NOT NULL`);
        await queryRunner.query(`ALTER TABLE "bilty_off_loadings" ADD "offLoadingTimeOut" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "bilty_off_loadings" ADD "offLoadingTimeIn" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "bilty_loadings" ADD "arrivalDate" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "bilty_loadings" ADD "loadingTimeIn" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "bilty_loadings" ADD "loadingTimeOut" TIMESTAMP`);
    }

}
