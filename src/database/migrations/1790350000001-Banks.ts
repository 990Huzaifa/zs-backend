import { MigrationInterface, QueryRunner } from 'typeorm';

export class Banks1790350000001 implements MigrationInterface {
  name = 'Banks1790350000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "banks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "code" character varying NOT NULL,
        CONSTRAINT "UQ_banks_code" UNIQUE ("code"),
        CONSTRAINT "PK_banks" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "banks"`);
  }
}
