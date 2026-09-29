import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drivers use `users.avatar` (linked via userId).
 * Copy any existing driver avatars onto the user row, then drop drivers.avatar.
 */
export class DropDriverAvatar1790550000001 implements MigrationInterface {
  name = 'DropDriverAvatar1790550000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users" u
      SET "avatar" = d."avatar"
      FROM "drivers" d
      WHERE d."userId" = u."id"
        AND d."avatar" IS NOT NULL
        AND (u."avatar" IS NULL OR u."avatar" = '')
    `);

    await queryRunner.query(`ALTER TABLE "drivers" DROP COLUMN "avatar"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "drivers" ADD "avatar" character varying`,
    );

    await queryRunner.query(`
      UPDATE "drivers" d
      SET "avatar" = u."avatar"
      FROM "users" u
      WHERE d."userId" = u."id"
        AND u."avatar" IS NOT NULL
    `);
  }
}
