import { MigrationInterface, QueryRunner } from 'typeorm';

export class MaintenanceVouchers1790440000001 implements MigrationInterface {
  name = 'MaintenanceVouchers1790440000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."maintenance_vouchers_paymentmethod_enum" AS ENUM('CASH', 'CHEQUE', 'TRANSFER', 'ONLINE', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."maintenance_vouchers_status_enum" AS ENUM('PENDING', 'PAID', 'CANCELLED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "maintenance_vouchers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "voucherNumber" character varying NOT NULL,
        "purchaseOrderId" uuid NOT NULL,
        "vendorId" uuid NOT NULL,
        "assetAccId" uuid NOT NULL,
        "paymentMethod" "public"."maintenance_vouchers_paymentmethod_enum" NOT NULL,
        "chequeNumber" character varying,
        "chequeDate" date,
        "chequeBank" character varying,
        "paymentDate" date NOT NULL,
        "paymentAmount" numeric(20,2) NOT NULL,
        "remarks" text,
        "proofImages" jsonb,
        "createdBy" uuid,
        "status" "public"."maintenance_vouchers_status_enum" NOT NULL DEFAULT 'PENDING',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_maintenance_vouchers_voucherNumber" UNIQUE ("voucherNumber"),
        CONSTRAINT "PK_maintenance_vouchers" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "maintenance_vouchers" ADD CONSTRAINT "FK_maintenance_vouchers_purchaseOrderId" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "maintenance_vouchers" ADD CONSTRAINT "FK_maintenance_vouchers_vendorId" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "maintenance_vouchers" ADD CONSTRAINT "FK_maintenance_vouchers_assetAccId" FOREIGN KEY ("assetAccId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "maintenance_vouchers" ADD CONSTRAINT "FK_maintenance_vouchers_createdBy" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TYPE "public"."transactions_referencetype_enum" ADD VALUE IF NOT EXISTS 'MAINTENANCE_VOUCHER_ASSET'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."transactions_referencetype_enum" ADD VALUE IF NOT EXISTS 'MAINTENANCE_VOUCHER_VENDOR'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "maintenance_vouchers" DROP CONSTRAINT "FK_maintenance_vouchers_createdBy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "maintenance_vouchers" DROP CONSTRAINT "FK_maintenance_vouchers_assetAccId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "maintenance_vouchers" DROP CONSTRAINT "FK_maintenance_vouchers_vendorId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "maintenance_vouchers" DROP CONSTRAINT "FK_maintenance_vouchers_purchaseOrderId"`,
    );
    await queryRunner.query(`DROP TABLE "maintenance_vouchers"`);
    await queryRunner.query(
      `DROP TYPE "public"."maintenance_vouchers_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."maintenance_vouchers_paymentmethod_enum"`,
    );
  }
}
