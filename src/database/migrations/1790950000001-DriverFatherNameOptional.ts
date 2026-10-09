import { MigrationInterface, QueryRunner } from 'typeorm';

/** Make drivers.fatherName nullable (optional). Existing values kept. */
export class DriverFatherNameOptional1790950000001
  implements MigrationInterface
{
  name = 'DriverFatherNameOptional1790950000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "drivers" ALTER COLUMN "fatherName" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "drivers" SET "fatherName" = '' WHERE "fatherName" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" ALTER COLUMN "fatherName" SET NOT NULL`,
    );
  }
}
