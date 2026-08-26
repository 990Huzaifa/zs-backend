import { MigrationInterface, QueryRunner } from "typeorm";

export class ClientModuleChange1787775698244 implements MigrationInterface {
    name = 'ClientModuleChange1787775698244'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "client_contacts" DROP CONSTRAINT "FK_b12571ed31604ee44ce5bc8c893"`);
        await queryRunner.query(`ALTER TABLE "client_contacts" ALTER COLUMN "clientId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "client_contacts" DROP CONSTRAINT "UQ_8fab1b66b48db678e6602d3517f"`);
        await queryRunner.query(`ALTER TABLE "client_pickup_locations" DROP CONSTRAINT "FK_50e9a60a9984d4835c7f499ad40"`);
        await queryRunner.query(`ALTER TABLE "client_pickup_locations" ALTER COLUMN "clientId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "client_dropoff_locations" DROP CONSTRAINT "FK_6fec362e56443e90cb701c916e1"`);
        await queryRunner.query(`ALTER TABLE "client_dropoff_locations" ALTER COLUMN "clientId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "client_contacts" ADD CONSTRAINT "FK_b12571ed31604ee44ce5bc8c893" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "client_pickup_locations" ADD CONSTRAINT "FK_50e9a60a9984d4835c7f499ad40" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "client_dropoff_locations" ADD CONSTRAINT "FK_6fec362e56443e90cb701c916e1" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "client_dropoff_locations" DROP CONSTRAINT "FK_6fec362e56443e90cb701c916e1"`);
        await queryRunner.query(`ALTER TABLE "client_pickup_locations" DROP CONSTRAINT "FK_50e9a60a9984d4835c7f499ad40"`);
        await queryRunner.query(`ALTER TABLE "client_contacts" DROP CONSTRAINT "FK_b12571ed31604ee44ce5bc8c893"`);
        await queryRunner.query(`ALTER TABLE "client_dropoff_locations" ALTER COLUMN "clientId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "client_dropoff_locations" ADD CONSTRAINT "FK_6fec362e56443e90cb701c916e1" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "client_pickup_locations" ALTER COLUMN "clientId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "client_pickup_locations" ADD CONSTRAINT "FK_50e9a60a9984d4835c7f499ad40" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "client_contacts" ADD CONSTRAINT "UQ_8fab1b66b48db678e6602d3517f" UNIQUE ("email")`);
        await queryRunner.query(`ALTER TABLE "client_contacts" ALTER COLUMN "clientId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "client_contacts" ADD CONSTRAINT "FK_b12571ed31604ee44ce5bc8c893" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
