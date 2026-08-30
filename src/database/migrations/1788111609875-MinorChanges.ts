import { MigrationInterface, QueryRunner } from "typeorm";

export class MinorChanges1788111609875 implements MigrationInterface {
    name = 'MinorChanges1788111609875'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vehicle_documents" ALTER COLUMN "file" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "vehicle_documents" DROP CONSTRAINT "UQ_826557bd90f6c1a5c46bf9b9bdd"`);
        await queryRunner.query(`ALTER TABLE "vehicle_documents" ALTER COLUMN "validity" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vehicle_documents" ALTER COLUMN "validity" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "vehicle_documents" ADD CONSTRAINT "UQ_826557bd90f6c1a5c46bf9b9bdd" UNIQUE ("file")`);
        await queryRunner.query(`ALTER TABLE "vehicle_documents" ALTER COLUMN "file" SET NOT NULL`);
    }

}
