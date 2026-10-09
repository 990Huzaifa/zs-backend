import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Flip assignment ownership: drivers←vehicles → vehicles→drivers.
 * Creates assigned_drivers, copies rows from assigned_vehicles
 * (driverType taken from drivers.driverType), then drops assigned_vehicles.
 */
export class AssignedDrivers1790930000001 implements MigrationInterface {
  name = 'AssignedDrivers1790930000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."assigned_drivers_status_enum" AS ENUM('PENDING', 'ASSIGNED', 'UNASSIGNED')`,
    );

    await queryRunner.query(`
      CREATE TABLE "assigned_drivers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "driverId" uuid NOT NULL,
        "driverType" "public"."drivers_drivertype_enum" NOT NULL DEFAULT '1ST_DRIVER',
        "vehicleId" uuid NOT NULL,
        "assignedDate" character varying,
        "status" "public"."assigned_drivers_status_enum" NOT NULL DEFAULT 'PENDING',
        "name" character varying,
        "phone" character varying,
        "address" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_assigned_drivers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_assigned_drivers_driver" FOREIGN KEY ("driverId")
          REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_assigned_drivers_vehicle" FOREIGN KEY ("vehicleId")
          REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      INSERT INTO "assigned_drivers" (
        "id",
        "driverId",
        "driverType",
        "vehicleId",
        "assignedDate",
        "status",
        "name",
        "phone",
        "address",
        "createdAt",
        "updatedAt"
      )
      SELECT
        av."id",
        av."driverId",
        d."driverType",
        av."vehicleId",
        av."assignedDate",
        av."status"::text::"public"."assigned_drivers_status_enum",
        av."name",
        av."phone",
        av."address",
        av."createdAt",
        av."updatedAt"
      FROM "assigned_vehicles" av
      INNER JOIN "drivers" d ON d."id" = av."driverId"
    `);

    await queryRunner.query(
      `ALTER TABLE "assigned_vehicles" DROP CONSTRAINT "FK_e928dbbe4359198aa686744bed6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assigned_vehicles" DROP CONSTRAINT "FK_13f98e64dcd8b57e3550a226efc"`,
    );
    await queryRunner.query(`DROP TABLE "assigned_vehicles"`);
    await queryRunner.query(
      `DROP TYPE "public"."assigned_vehicles_status_enum"`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_assigned_drivers_vehicleId" ON "assigned_drivers" ("vehicleId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_assigned_drivers_driverId" ON "assigned_drivers" ("driverId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_assigned_drivers_driverId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_assigned_drivers_vehicleId"`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."assigned_vehicles_status_enum" AS ENUM('PENDING', 'ASSIGNED', 'UNASSIGNED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "assigned_vehicles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "driverId" uuid NOT NULL,
        "vehicleId" uuid NOT NULL,
        "assignedDate" character varying,
        "status" "public"."assigned_vehicles_status_enum" NOT NULL DEFAULT 'PENDING',
        "name" character varying,
        "phone" character varying,
        "address" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_daec125155825c7dbfa49f646c6" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "assigned_vehicles" (
        "id",
        "driverId",
        "vehicleId",
        "assignedDate",
        "status",
        "name",
        "phone",
        "address",
        "createdAt",
        "updatedAt"
      )
      SELECT
        ad."id",
        ad."driverId",
        ad."vehicleId",
        ad."assignedDate",
        ad."status"::text::"public"."assigned_vehicles_status_enum",
        ad."name",
        ad."phone",
        ad."address",
        ad."createdAt",
        ad."updatedAt"
      FROM "assigned_drivers" ad
    `);

    await queryRunner.query(
      `ALTER TABLE "assigned_vehicles" ADD CONSTRAINT "FK_13f98e64dcd8b57e3550a226efc" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "assigned_vehicles" ADD CONSTRAINT "FK_e928dbbe4359198aa686744bed6" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`DROP TABLE "assigned_drivers"`);
    await queryRunner.query(
      `DROP TYPE "public"."assigned_drivers_status_enum"`,
    );
  }
}
