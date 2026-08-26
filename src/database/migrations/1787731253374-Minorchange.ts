import { MigrationInterface, QueryRunner } from "typeorm";

export class Minorchange1787731253374 implements MigrationInterface {
    name = 'Minorchange1787731253374'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "states" DROP CONSTRAINT "FK_76ac7edf8f44e80dff569db7321"`);
        await queryRunner.query(`ALTER TABLE "countries" DROP CONSTRAINT "PK_b2d7006793e8697ab3ae2deff18"`);
        await queryRunner.query(`ALTER TABLE "countries" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "countries" ADD "id" SERIAL NOT NULL`);
        await queryRunner.query(`ALTER TABLE "countries" ADD CONSTRAINT "PK_b2d7006793e8697ab3ae2deff18" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "vendors" DROP CONSTRAINT "FK_36f5bc4e81cc0bf030b5aa96906"`);
        await queryRunner.query(`ALTER TABLE "cities" DROP CONSTRAINT "FK_ded8a17cd090922d5bac8a2361f"`);
        await queryRunner.query(`ALTER TABLE "states" DROP CONSTRAINT "PK_09ab30ca0975c02656483265f4f"`);
        await queryRunner.query(`ALTER TABLE "states" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "states" ADD "id" SERIAL NOT NULL`);
        await queryRunner.query(`ALTER TABLE "states" ADD CONSTRAINT "PK_09ab30ca0975c02656483265f4f" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "states" DROP COLUMN "countryId"`);
        await queryRunner.query(`ALTER TABLE "states" ADD "countryId" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "cities" DROP COLUMN "stateId"`);
        await queryRunner.query(`ALTER TABLE "cities" ADD "stateId" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN "stateId"`);
        await queryRunner.query(`ALTER TABLE "vendors" ADD "stateId" integer`);
        await queryRunner.query(`ALTER TABLE "states" ADD CONSTRAINT "FK_76ac7edf8f44e80dff569db7321" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cities" ADD CONSTRAINT "FK_ded8a17cd090922d5bac8a2361f" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vendors" ADD CONSTRAINT "FK_36f5bc4e81cc0bf030b5aa96906" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vendors" DROP CONSTRAINT "FK_36f5bc4e81cc0bf030b5aa96906"`);
        await queryRunner.query(`ALTER TABLE "cities" DROP CONSTRAINT "FK_ded8a17cd090922d5bac8a2361f"`);
        await queryRunner.query(`ALTER TABLE "states" DROP CONSTRAINT "FK_76ac7edf8f44e80dff569db7321"`);
        await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN "stateId"`);
        await queryRunner.query(`ALTER TABLE "vendors" ADD "stateId" uuid`);
        await queryRunner.query(`ALTER TABLE "cities" DROP COLUMN "stateId"`);
        await queryRunner.query(`ALTER TABLE "cities" ADD "stateId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "states" DROP COLUMN "countryId"`);
        await queryRunner.query(`ALTER TABLE "states" ADD "countryId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "states" DROP CONSTRAINT "PK_09ab30ca0975c02656483265f4f"`);
        await queryRunner.query(`ALTER TABLE "states" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "states" ADD "id" uuid NOT NULL DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "states" ADD CONSTRAINT "PK_09ab30ca0975c02656483265f4f" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "cities" ADD CONSTRAINT "FK_ded8a17cd090922d5bac8a2361f" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "vendors" ADD CONSTRAINT "FK_36f5bc4e81cc0bf030b5aa96906" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "countries" DROP CONSTRAINT "PK_b2d7006793e8697ab3ae2deff18"`);
        await queryRunner.query(`ALTER TABLE "countries" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "countries" ADD "id" uuid NOT NULL DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "countries" ADD CONSTRAINT "PK_b2d7006793e8697ab3ae2deff18" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "states" ADD CONSTRAINT "FK_76ac7edf8f44e80dff569db7321" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
