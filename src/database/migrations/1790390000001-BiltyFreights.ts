import { MigrationInterface, QueryRunner } from 'typeorm';

export class BiltyFreights1790390000001 implements MigrationInterface {
  name = 'BiltyFreights1790390000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove bilty expenses
    await queryRunner.query(
      `ALTER TABLE "bilty_expenses" DROP CONSTRAINT IF EXISTS "FK_db4aa8117e6fe6f47b07f0cccad"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bilty_expenses" DROP CONSTRAINT IF EXISTS "FK_2beddbb8cd4aa7f960c743bd139"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "bilty_expenses"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."bilty_expenses_status_enum"`,
    );

    // Freight voucher enums
    await queryRunner.query(
      `CREATE TYPE "public"."bilty_freights_vouchertype_enum" AS ENUM('PAYABLE', 'RECEIVABLE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bilty_freights_paymentmethod_enum" AS ENUM('CASH', 'CHEQUE', 'TRANSFER', 'ONLINE', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bilty_freights_status_enum" AS ENUM('PENDING', 'PAID', 'CANCELLED')`,
    );

    await queryRunner.query(`
      CREATE TABLE "bilty_freights" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "voucherNumber" character varying NOT NULL,
        "biltyId" uuid NOT NULL,
        "brokerId" uuid NOT NULL,
        "assetAccId" uuid NOT NULL,
        "voucherType" "public"."bilty_freights_vouchertype_enum" NOT NULL,
        "paymentMethod" "public"."bilty_freights_paymentmethod_enum" NOT NULL,
        "chequeNumber" character varying,
        "chequeDate" date,
        "chequeBank" character varying,
        "paymentDate" date NOT NULL,
        "paymentAmount" numeric(20,2) NOT NULL,
        "remarks" text,
        "proofImages" jsonb,
        "createdBy" uuid,
        "status" "public"."bilty_freights_status_enum" NOT NULL DEFAULT 'PENDING',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_bilty_freights_voucherNumber" UNIQUE ("voucherNumber"),
        CONSTRAINT "PK_bilty_freights" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `ALTER TABLE "bilty_freights" ADD CONSTRAINT "FK_bilty_freights_biltyId" FOREIGN KEY ("biltyId") REFERENCES "bilty"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bilty_freights" ADD CONSTRAINT "FK_bilty_freights_brokerId" FOREIGN KEY ("brokerId") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bilty_freights" ADD CONSTRAINT "FK_bilty_freights_assetAccId" FOREIGN KEY ("assetAccId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bilty_freights" ADD CONSTRAINT "FK_bilty_freights_createdBy" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TYPE "public"."transactions_referencetype_enum" ADD VALUE IF NOT EXISTS 'BILTY_FREIGHT_ASSET'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."transactions_referencetype_enum" ADD VALUE IF NOT EXISTS 'BILTY_FREIGHT_BROKER'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bilty_freights" DROP CONSTRAINT "FK_bilty_freights_createdBy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bilty_freights" DROP CONSTRAINT "FK_bilty_freights_assetAccId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bilty_freights" DROP CONSTRAINT "FK_bilty_freights_brokerId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bilty_freights" DROP CONSTRAINT "FK_bilty_freights_biltyId"`,
    );
    await queryRunner.query(`DROP TABLE "bilty_freights"`);
    await queryRunner.query(
      `DROP TYPE "public"."bilty_freights_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."bilty_freights_paymentmethod_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."bilty_freights_vouchertype_enum"`,
    );

    // Restore bilty_expenses (without historical data)
    await queryRunner.query(
      `CREATE TYPE "public"."bilty_expenses_status_enum" AS ENUM('PENDING', 'PAID', 'CANCELLED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "bilty_expenses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "biltyId" uuid NOT NULL,
        "expenseAccId" uuid NOT NULL,
        "amount" numeric(10,2) NOT NULL,
        "description" character varying,
        "status" "public"."bilty_expenses_status_enum" NOT NULL DEFAULT 'PENDING',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_d73acbc9b758630987d38ec96b2" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "bilty_expenses" ADD CONSTRAINT "FK_2beddbb8cd4aa7f960c743bd139" FOREIGN KEY ("biltyId") REFERENCES "bilty"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bilty_expenses" ADD CONSTRAINT "FK_db4aa8117e6fe6f47b07f0cccad" FOREIGN KEY ("expenseAccId") REFERENCES "chart_of_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
