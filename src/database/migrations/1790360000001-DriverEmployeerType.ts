import { MigrationInterface, QueryRunner } from 'typeorm';

export class DriverEmployeerType1790360000001 implements MigrationInterface {
  name = 'DriverEmployeerType1790360000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."drivers_employeertype_enum" AS ENUM('OWN', 'OTHER')`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" ADD "employeerType" "public"."drivers_employeertype_enum" NOT NULL DEFAULT 'OWN'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "drivers" DROP COLUMN "employeerType"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."drivers_employeertype_enum"`,
    );
  }
}
