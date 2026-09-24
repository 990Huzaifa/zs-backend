import { MigrationInterface, QueryRunner } from 'typeorm';

export class Broker1790310000001 implements MigrationInterface {
  name = 'Broker1790310000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."brokers_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`,
    );

    await queryRunner.query(`
      CREATE TABLE "brokers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "companyName" character varying(255) NOT NULL,
        "ownerName" character varying(255) NOT NULL,
        "email" character varying(255),
        "ntn" character varying(255),
        "address" character varying(255),
        "lat" character varying(255),
        "lng" character varying(255),
        "stateId" integer NOT NULL,
        "cityId" integer NOT NULL,
        "zipCode" character varying,
        "avatar" character varying(255),
        "status" "public"."brokers_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_brokers" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `ALTER TABLE "brokers" ADD CONSTRAINT "FK_brokers_stateId" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "brokers" ADD CONSTRAINT "FK_brokers_cityId" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`
      CREATE TABLE "broker_contacts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "brokerId" uuid NOT NULL,
        "name" character varying NOT NULL,
        "designation" character varying NOT NULL,
        "address" character varying,
        "email" character varying,
        "phone" character varying NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_broker_contacts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "broker_contacts" ADD CONSTRAINT "FK_broker_contacts_brokerId" FOREIGN KEY ("brokerId") REFERENCES "brokers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`
      CREATE TABLE "broker_documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "brokerId" uuid NOT NULL,
        "name" character varying,
        "file" character varying,
        "validity" date,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_broker_documents" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "broker_documents" ADD CONSTRAINT "FK_broker_documents_brokerId" FOREIGN KEY ("brokerId") REFERENCES "brokers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "broker_documents" DROP CONSTRAINT "FK_broker_documents_brokerId"`,
    );
    await queryRunner.query(`DROP TABLE "broker_documents"`);

    await queryRunner.query(
      `ALTER TABLE "broker_contacts" DROP CONSTRAINT "FK_broker_contacts_brokerId"`,
    );
    await queryRunner.query(`DROP TABLE "broker_contacts"`);

    await queryRunner.query(
      `ALTER TABLE "brokers" DROP CONSTRAINT "FK_brokers_cityId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "brokers" DROP CONSTRAINT "FK_brokers_stateId"`,
    );
    await queryRunner.query(`DROP TABLE "brokers"`);
    await queryRunner.query(`DROP TYPE "public"."brokers_status_enum"`);
  }
}
