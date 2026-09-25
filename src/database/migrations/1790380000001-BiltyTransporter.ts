import { MigrationInterface, QueryRunner } from 'typeorm';

export class BiltyTransporter1790380000001 implements MigrationInterface {
  name = 'BiltyTransporter1790380000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bilty" ADD "transporterId" uuid`,
    );

    // Best-effort backfill: match free-text transporter name to companyName
    await queryRunner.query(`
      UPDATE "bilty" AS b
      SET "transporterId" = t.id
      FROM "transporters" AS t
      WHERE b."transporterId" IS NULL
        AND b."transaportorName" IS NOT NULL
        AND LOWER(TRIM(b."transaportorName")) = LOWER(TRIM(t."companyName"))
    `);

    await queryRunner.query(
      `ALTER TABLE "bilty" ALTER COLUMN "transporterId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "bilty" ADD CONSTRAINT "FK_bilty_transporterId" FOREIGN KEY ("transporterId") REFERENCES "transporters"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `UPDATE "bilty" SET "transaportorName" = COALESCE("transaportorName", '')`,
    );
    await queryRunner.query(
      `ALTER TABLE "bilty" ALTER COLUMN "transaportorName" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bilty" ALTER COLUMN "transaportorName" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "bilty" DROP CONSTRAINT "FK_bilty_transporterId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bilty" DROP COLUMN "transporterId"`,
    );
  }
}
