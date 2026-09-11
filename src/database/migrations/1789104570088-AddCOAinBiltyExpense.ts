import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCOAinBiltyExpense1789104570088 implements MigrationInterface {
    name = 'AddCOAinBiltyExpense1789104570088'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bilty_expenses" ADD "expenseAccId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "bilty_expenses" ADD CONSTRAINT "FK_db4aa8117e6fe6f47b07f0cccad" FOREIGN KEY ("expenseAccId") REFERENCES "chart_of_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bilty_expenses" DROP CONSTRAINT "FK_db4aa8117e6fe6f47b07f0cccad"`);
        await queryRunner.query(`ALTER TABLE "bilty_expenses" DROP COLUMN "expenseAccId"`);
    }

}
