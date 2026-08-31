import { MigrationInterface, QueryRunner } from "typeorm";

export class TripDriver1788167680289 implements MigrationInterface {
    name = 'TripDriver1788167680289'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "trips" DROP CONSTRAINT "FK_fc5a8911f85074a660a4304baa1"`);
        await queryRunner.query(`CREATE TABLE "trip_drivers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tripId" uuid NOT NULL, "driverId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_fc7e42b9d2a4e21218d2441d88b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "trips" DROP COLUMN "driverId"`);
        await queryRunner.query(`ALTER TABLE "trip_drivers" ADD CONSTRAINT "FK_3d235569f32198a4001ff03bc77" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "trip_drivers" ADD CONSTRAINT "FK_2dab71c649fb6115244e60eddb4" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "trip_drivers" DROP CONSTRAINT "FK_2dab71c649fb6115244e60eddb4"`);
        await queryRunner.query(`ALTER TABLE "trip_drivers" DROP CONSTRAINT "FK_3d235569f32198a4001ff03bc77"`);
        await queryRunner.query(`ALTER TABLE "trips" ADD "driverId" uuid NOT NULL`);
        await queryRunner.query(`DROP TABLE "trip_drivers"`);
        await queryRunner.query(`ALTER TABLE "trips" ADD CONSTRAINT "FK_fc5a8911f85074a660a4304baa1" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

}
