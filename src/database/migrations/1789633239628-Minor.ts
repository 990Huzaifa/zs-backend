import { MigrationInterface, QueryRunner } from "typeorm";

export class Minor1789633239628 implements MigrationInterface {
    name = 'Minor1789633239628'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "trip_upcountry_loads" DROP COLUMN "netWeight"`);
        await queryRunner.query(`ALTER TABLE "trip_upcountry_loads" ADD "netWeight" character varying`);
        await queryRunner.query(`ALTER TABLE "trip_downcountry_loads" DROP COLUMN "netWeight"`);
        await queryRunner.query(`ALTER TABLE "trip_downcountry_loads" ADD "netWeight" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "trip_downcountry_loads" DROP COLUMN "netWeight"`);
        await queryRunner.query(`ALTER TABLE "trip_downcountry_loads" ADD "netWeight" numeric(12,3)`);
        await queryRunner.query(`ALTER TABLE "trip_upcountry_loads" DROP COLUMN "netWeight"`);
        await queryRunner.query(`ALTER TABLE "trip_upcountry_loads" ADD "netWeight" numeric(12,3)`);
    }

}
