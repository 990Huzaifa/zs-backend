import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInBilty1788458419302 implements MigrationInterface {
    name = 'AddInBilty1788458419302'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bilty" ADD "vehicleRegistrationNumber" character varying`);
        await queryRunner.query(`ALTER TABLE "bilty" DROP CONSTRAINT "FK_3def0448cde28ec1cbaf0e324b8"`);
        await queryRunner.query(`ALTER TABLE "bilty" ALTER COLUMN "vehicleId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "bilty" ADD CONSTRAINT "FK_3def0448cde28ec1cbaf0e324b8" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bilty" DROP CONSTRAINT "FK_3def0448cde28ec1cbaf0e324b8"`);
        await queryRunner.query(`ALTER TABLE "bilty" ALTER COLUMN "vehicleId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "bilty" ADD CONSTRAINT "FK_3def0448cde28ec1cbaf0e324b8" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bilty" DROP COLUMN "vehicleRegistrationNumber"`);
    }

}
