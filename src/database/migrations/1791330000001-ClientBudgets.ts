import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * client_budgets — trip expense budget per client (+ optional vehicle scope).
 */
export class ClientBudgets1791330000001 implements MigrationInterface {
  name = 'ClientBudgets1791330000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "client_budgets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "clientId" uuid NOT NULL,
        "vehicleTypeId" uuid,
        "vehicleSizeId" uuid,
        "vehicleCapacityId" uuid,
        "routes" jsonb,
        "oneSideTotalKm" numeric(12,3),
        "returnKm" numeric(12,3),
        "includeReturn" boolean NOT NULL DEFAULT false,
        "allowExcessKm" numeric(12,3),
        "totalKm" numeric(12,3),
        "perLtrKmAverage" numeric(12,3),
        "fuelLtr" numeric(12,3),
        "description" character varying,
        "loadingUnloading" numeric(12,2),
        "foodPerDay" numeric(12,2),
        "noOfDays" numeric(12,2),
        "totalFoodCash" numeric(12,2),
        "tollTaxPerStation" numeric(12,2),
        "totalTollTaxStations" numeric(12,2),
        "totalTollTax" numeric(12,2),
        "policeChallan" numeric(12,2),
        "challan" numeric(12,2),
        "greasingAirCheckup" numeric(12,2),
        "vehicleService" numeric(12,2),
        "tyrePunctureEtc" numeric(12,2),
        "maintenance" numeric(12,2),
        "other" numeric(12,2),
        "total" numeric(12,2),
        "driverReward" numeric(12,2),
        "driverRewardCondition" character varying,
        "finalTotal" numeric(12,2),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_client_budgets" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "client_budgets"
        DROP CONSTRAINT IF EXISTS "FK_client_budgets_clientId"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_budgets"
        ADD CONSTRAINT "FK_client_budgets_clientId"
        FOREIGN KEY ("clientId") REFERENCES "clients"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "client_budgets"
        DROP CONSTRAINT IF EXISTS "FK_client_budgets_vehicleTypeId"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_budgets"
        ADD CONSTRAINT "FK_client_budgets_vehicleTypeId"
        FOREIGN KEY ("vehicleTypeId") REFERENCES "vehicle_types"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "client_budgets"
        DROP CONSTRAINT IF EXISTS "FK_client_budgets_vehicleSizeId"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_budgets"
        ADD CONSTRAINT "FK_client_budgets_vehicleSizeId"
        FOREIGN KEY ("vehicleSizeId") REFERENCES "vehicle_sizes"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "client_budgets"
        DROP CONSTRAINT IF EXISTS "FK_client_budgets_vehicleCapacityId"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_budgets"
        ADD CONSTRAINT "FK_client_budgets_vehicleCapacityId"
        FOREIGN KEY ("vehicleCapacityId") REFERENCES "vehicle_capacity"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_client_budgets_clientId"
        ON "client_budgets" ("clientId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_client_budgets_vehicleTypeId"
        ON "client_budgets" ("vehicleTypeId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_client_budgets_vehicleTypeId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_client_budgets_clientId"`);
    await queryRunner.query(`
      ALTER TABLE "client_budgets"
        DROP CONSTRAINT IF EXISTS "FK_client_budgets_vehicleCapacityId"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_budgets"
        DROP CONSTRAINT IF EXISTS "FK_client_budgets_vehicleSizeId"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_budgets"
        DROP CONSTRAINT IF EXISTS "FK_client_budgets_vehicleTypeId"
    `);
    await queryRunner.query(`
      ALTER TABLE "client_budgets"
        DROP CONSTRAINT IF EXISTS "FK_client_budgets_clientId"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "client_budgets"`);
  }
}
