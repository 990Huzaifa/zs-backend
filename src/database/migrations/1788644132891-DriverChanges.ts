import { MigrationInterface, QueryRunner } from "typeorm";

export class DriverChanges1788644132891 implements MigrationInterface {
    name = 'DriverChanges1788644132891'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "drivers" ADD "licenseOnlineVerification" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "drivers" ADD "licenseValidity" date`);
        await queryRunner.query(`ALTER TABLE "drivers" ADD "emergencyContactPhone" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "drivers" DROP COLUMN "emergencyContactPhone"`);
        await queryRunner.query(`ALTER TABLE "drivers" DROP COLUMN "licenseValidity"`);
        await queryRunner.query(`ALTER TABLE "drivers" DROP COLUMN "licenseOnlineVerification"`);
    }

}
