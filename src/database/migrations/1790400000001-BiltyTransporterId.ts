import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds optional bilty.transporterId (nullable FK → transporters).
 * Matches current entity: `@Column({ type: 'uuid', nullable: true })`.
 */
export class BiltyTransporterId1790400000001 implements MigrationInterface {
  name = 'BiltyTransporterId1790400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('bilty');
    const col = table?.findColumnByName('transporterId');

    if (!col) {
      await queryRunner.query(
        `ALTER TABLE "bilty" ADD "transporterId" uuid`,
      );
      await queryRunner.query(
        `ALTER TABLE "bilty" ADD CONSTRAINT "FK_bilty_transporterId" FOREIGN KEY ("transporterId") REFERENCES "transporters"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
      );
      return;
    }

    // Legacy 179038 may have set NOT NULL — align with nullable entity
    if (!col.isNullable) {
      await queryRunner.query(
        `ALTER TABLE "bilty" ALTER COLUMN "transporterId" DROP NOT NULL`,
      );
    }

    const hasFk = table?.foreignKeys.some(
      (fk) =>
        fk.columnNames.length === 1 &&
        fk.columnNames[0] === 'transporterId',
    );
    if (!hasFk) {
      await queryRunner.query(
        `ALTER TABLE "bilty" ADD CONSTRAINT "FK_bilty_transporterId" FOREIGN KEY ("transporterId") REFERENCES "transporters"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bilty" DROP CONSTRAINT IF EXISTS "FK_bilty_transporterId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bilty" DROP COLUMN IF EXISTS "transporterId"`,
    );
  }
}
