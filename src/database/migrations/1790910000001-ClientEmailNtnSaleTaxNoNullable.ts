import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Make client email, ntn, and saleTaxNo nullable (optional).
 * Converts existing empty-string placeholders to NULL.
 * Unique constraints remain; PostgreSQL allows multiple NULLs.
 */
export class ClientEmailNtnSaleTaxNoNullable1790910000001
  implements MigrationInterface
{
  name = 'ClientEmailNtnSaleTaxNoNullable1790910000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "clients" ALTER COLUMN "email" DROP NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "clients" SET "email" = NULL WHERE "email" = ''`,
    );

    await queryRunner.query(
      `ALTER TABLE "clients" ALTER COLUMN "ntn" DROP NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "clients" SET "ntn" = NULL WHERE "ntn" = ''`,
    );

    await queryRunner.query(
      `ALTER TABLE "clients" ALTER COLUMN "saleTaxNo" DROP NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "clients" SET "saleTaxNo" = NULL WHERE "saleTaxNo" = ''`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "clients" SET "email" = '' WHERE "email" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "clients" ALTER COLUMN "email" SET NOT NULL`,
    );

    await queryRunner.query(
      `UPDATE "clients" SET "ntn" = '' WHERE "ntn" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "clients" ALTER COLUMN "ntn" SET NOT NULL`,
    );

    await queryRunner.query(
      `UPDATE "clients" SET "saleTaxNo" = '' WHERE "saleTaxNo" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "clients" ALTER COLUMN "saleTaxNo" SET NOT NULL`,
    );
  }
}
