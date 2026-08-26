import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropClientTypes1787764000000 implements MigrationInterface {
  name = 'DropClientTypes1787764000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "client_types"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "client_types" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "slug" character varying NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_f3be96bb5ad04e47048e6abfcca" UNIQUE ("slug"),
        CONSTRAINT "PK_85832ef63aa395263d0b72b1ea1" PRIMARY KEY ("id")
      )
    `);
  }
}
