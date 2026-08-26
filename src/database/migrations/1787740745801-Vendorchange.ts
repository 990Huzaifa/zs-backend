import { MigrationInterface, QueryRunner } from "typeorm";

export class Vendorchange1787740745801 implements MigrationInterface {
    name = 'Vendorchange1787740745801'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vehicles" DROP CONSTRAINT "FK_vehicles_vehicleTypeId"`);
        await queryRunner.query(`ALTER TABLE "vehicles" DROP CONSTRAINT "FK_vehicles_vehicleSizeId"`);
        await queryRunner.query(`ALTER TABLE "vehicles" DROP CONSTRAINT "FK_vehicles_vehicleCapacityId"`);
        await queryRunner.query(`ALTER TABLE "vehicles" ADD CONSTRAINT "FK_72d0f0ecfc71ee89771f3de60dc" FOREIGN KEY ("vehicleTypeId") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vehicles" ADD CONSTRAINT "FK_3410bb8c8a1aa18800ceb8c62d9" FOREIGN KEY ("vehicleSizeId") REFERENCES "vehicle_sizes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vehicles" ADD CONSTRAINT "FK_ba32fc3371aa1b8dee6f52373fb" FOREIGN KEY ("vehicleCapacityId") REFERENCES "vehicle_capacity"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vehicles" DROP CONSTRAINT "FK_ba32fc3371aa1b8dee6f52373fb"`);
        await queryRunner.query(`ALTER TABLE "vehicles" DROP CONSTRAINT "FK_3410bb8c8a1aa18800ceb8c62d9"`);
        await queryRunner.query(`ALTER TABLE "vehicles" DROP CONSTRAINT "FK_72d0f0ecfc71ee89771f3de60dc"`);
        await queryRunner.query(`ALTER TABLE "vehicles" ADD CONSTRAINT "FK_vehicles_vehicleCapacityId" FOREIGN KEY ("vehicleCapacityId") REFERENCES "vehicle_capacity"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vehicles" ADD CONSTRAINT "FK_vehicles_vehicleSizeId" FOREIGN KEY ("vehicleSizeId") REFERENCES "vehicle_sizes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vehicles" ADD CONSTRAINT "FK_vehicles_vehicleTypeId" FOREIGN KEY ("vehicleTypeId") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

}
