import { MigrationInterface, QueryRunner } from 'typeorm';

export class VendorBanks1790450000001 implements MigrationInterface {
  name = 'VendorBanks1790450000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "vendor_banks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "vendorId" uuid NOT NULL,
        "bankName" character varying,
        "accountHolderName" character varying,
        "bankAccountNumber" character varying,
        "bankIbanNumber" character varying,
        "bankSwiftCode" character varying,
        "bankRoutingNumber" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_vendor_banks" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "vendor_banks" ADD CONSTRAINT "FK_vendor_banks_vendorId" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Migrate existing inline bank fields into vendor_banks (one row per vendor with data)
    await queryRunner.query(`
      INSERT INTO "vendor_banks" ("vendorId", "bankName", "bankAccountNumber")
      SELECT "id", "bankName", "bankAccountNumber"
      FROM "vendors"
      WHERE ("bankName" IS NOT NULL AND TRIM("bankName") <> '')
         OR ("bankAccountNumber" IS NOT NULL AND TRIM("bankAccountNumber") <> '')
    `);

    await queryRunner.query(
      `ALTER TABLE "vendors" DROP COLUMN IF EXISTS "bankName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendors" DROP COLUMN IF EXISTS "bankAccountNumber"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "vendors" ADD "bankName" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "vendors" ADD "bankAccountNumber" character varying`,
    );

    // Restore first bank row per vendor (best-effort)
    await queryRunner.query(`
      UPDATE "vendors" v
      SET
        "bankName" = b."bankName",
        "bankAccountNumber" = b."bankAccountNumber"
      FROM (
        SELECT DISTINCT ON ("vendorId")
          "vendorId", "bankName", "bankAccountNumber"
        FROM "vendor_banks"
        ORDER BY "vendorId", "createdAt" ASC
      ) b
      WHERE v."id" = b."vendorId"
    `);

    await queryRunner.query(
      `ALTER TABLE "vendor_banks" DROP CONSTRAINT "FK_vendor_banks_vendorId"`,
    );
    await queryRunner.query(`DROP TABLE "vendor_banks"`);
  }
}
