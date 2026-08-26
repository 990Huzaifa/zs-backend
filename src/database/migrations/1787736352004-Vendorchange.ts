import { MigrationInterface, QueryRunner } from "typeorm";

export class Vendorchange1787736352004 implements MigrationInterface {
    name = 'Vendorchange1787736352004'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vendors" ALTER COLUMN "email" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vendors" ALTER COLUMN "email" SET NOT NULL`);
    }

}
