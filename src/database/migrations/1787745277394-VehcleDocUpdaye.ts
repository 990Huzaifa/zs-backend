import { MigrationInterface, QueryRunner } from "typeorm";

export class VehcleDocUpdaye1787745277394 implements MigrationInterface {
    name = 'VehcleDocUpdaye1787745277394'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vehicle_documents" ADD "vehicleId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "vehicle_documents" ADD CONSTRAINT "FK_61c94219ae61c3752cf1e6582c7" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vehicle_documents" DROP CONSTRAINT "FK_61c94219ae61c3752cf1e6582c7"`);
        await queryRunner.query(`ALTER TABLE "vehicle_documents" DROP COLUMN "vehicleId"`);
    }

}
