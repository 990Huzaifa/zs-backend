import { MigrationInterface, QueryRunner } from "typeorm";

export class Transporter1789896026991 implements MigrationInterface {
    name = 'Transporter1789896026991'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "transporters" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "fullName" character varying(255) NOT NULL, "email" character varying(255), "phoneNumber" character varying(255) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_5787cc5a5140546b50bcd2474fe" UNIQUE ("phoneNumber"), CONSTRAINT "PK_1b0de838b56b2ebc51699cf2879" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "transporters"`);
    }

}
