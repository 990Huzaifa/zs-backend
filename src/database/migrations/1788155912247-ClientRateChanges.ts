import { MigrationInterface, QueryRunner } from "typeorm";

export class ClientRateChanges1788155912247 implements MigrationInterface {
    name = 'ClientRateChanges1788155912247'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "client_rates" DROP CONSTRAINT "FK_66fe1ca08d82662da21eed5cf01"`);
        await queryRunner.query(`ALTER TABLE "client_rates" DROP COLUMN "vehicleId"`);
        await queryRunner.query(`ALTER TABLE "client_rates" ADD "vehicleTypeId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "client_rates" ADD "vehicleSizeId" uuid`);
        await queryRunner.query(`ALTER TABLE "client_rates" ADD "vehicleCapacityId" uuid`);
        await queryRunner.query(`ALTER TABLE "client_rates" ADD CONSTRAINT "FK_aa1c8f72e49cd39f9d323c397f4" FOREIGN KEY ("vehicleTypeId") REFERENCES "vehicle_types"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "client_rates" ADD CONSTRAINT "FK_d812ef4a4dc12074aedb819a477" FOREIGN KEY ("vehicleSizeId") REFERENCES "vehicle_sizes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "client_rates" ADD CONSTRAINT "FK_a0ddb3d4076c697ce0fa5ff541b" FOREIGN KEY ("vehicleCapacityId") REFERENCES "vehicle_capacity"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "client_rates" DROP CONSTRAINT "FK_a0ddb3d4076c697ce0fa5ff541b"`);
        await queryRunner.query(`ALTER TABLE "client_rates" DROP CONSTRAINT "FK_d812ef4a4dc12074aedb819a477"`);
        await queryRunner.query(`ALTER TABLE "client_rates" DROP CONSTRAINT "FK_aa1c8f72e49cd39f9d323c397f4"`);
        await queryRunner.query(`ALTER TABLE "client_rates" DROP COLUMN "vehicleCapacityId"`);
        await queryRunner.query(`ALTER TABLE "client_rates" DROP COLUMN "vehicleSizeId"`);
        await queryRunner.query(`ALTER TABLE "client_rates" DROP COLUMN "vehicleTypeId"`);
        await queryRunner.query(`ALTER TABLE "client_rates" ADD "vehicleId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "client_rates" ADD CONSTRAINT "FK_66fe1ca08d82662da21eed5cf01" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

}
