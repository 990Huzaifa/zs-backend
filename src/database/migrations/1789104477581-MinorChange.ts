import { MigrationInterface, QueryRunner } from "typeorm";

export class MinorChange1789104477581 implements MigrationInterface {
    name = 'MinorChange1789104477581'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."bilty_expenses_status_enum" AS ENUM('PENDING', 'PAID', 'CANCELLED')`);
        await queryRunner.query(`ALTER TABLE "bilty_expenses" ADD "status" "public"."bilty_expenses_status_enum" NOT NULL DEFAULT 'PENDING'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bilty_expenses" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."bilty_expenses_status_enum"`);
    }

}
