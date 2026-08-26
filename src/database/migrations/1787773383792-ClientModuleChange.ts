import { MigrationInterface, QueryRunner } from "typeorm";

export class ClientModuleChange1787773383792 implements MigrationInterface {
    name = 'ClientModuleChange1787773383792'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "clients" RENAME COLUMN "city" TO "cityId"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "cityId"`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "cityId" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "clients" ADD CONSTRAINT "FK_171d9491df6bc1c86b2b887f4b7" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "clients" DROP CONSTRAINT "FK_171d9491df6bc1c86b2b887f4b7"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "cityId"`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "cityId" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "clients" RENAME COLUMN "cityId" TO "city"`);
    }

}
