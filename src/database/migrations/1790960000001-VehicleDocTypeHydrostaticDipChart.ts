import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add HYDROSTATIC_REPORT and DIP_CHART to vehicle_documents.docType enum.
 */
export class VehicleDocTypeHydrostaticDipChart1790960000001
  implements MigrationInterface
{
  name = 'VehicleDocTypeHydrostaticDipChart1790960000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."vehicle_documents_doctype_enum" ADD VALUE IF NOT EXISTS 'HYDROSTATIC_REPORT'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."vehicle_documents_doctype_enum" ADD VALUE IF NOT EXISTS 'DIP_CHART'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "vehicle_documents" SET "docType" = 'OTHER' WHERE "docType" IN ('HYDROSTATIC_REPORT', 'DIP_CHART')`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."vehicle_documents_doctype_enum" RENAME TO "vehicle_documents_doctype_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vehicle_documents_doctype_enum" AS ENUM('INSURANCE_CERTIFICATE', 'REGISTRATION_CARD', 'REGISTRATION_BOOK', 'CERTIFICATE_OF_FITNESS', 'TAX_CERTIFICATE', 'ROUTE_PERMIT', 'REGISTERATION', 'POLICE_VERIFICATION', 'TRACKER_CERTIFICATE', 'THIRD_PARTY_CERTIFICATE', 'OTHER')`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicle_documents" ALTER COLUMN "docType" TYPE "public"."vehicle_documents_doctype_enum" USING "docType"::"text"::"public"."vehicle_documents_doctype_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."vehicle_documents_doctype_enum_old"`,
    );
  }
}
