import { MigrationInterface, QueryRunner } from 'typeorm';

export class TransporterExpand1790300000001 implements MigrationInterface {
  name = 'TransporterExpand1790300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."transporters_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`,
    );

    await queryRunner.query(
      `ALTER TABLE "transporters" DROP CONSTRAINT IF EXISTS "UQ_5787cc5a5140546b50bcd2474fe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" DROP COLUMN IF EXISTS "fullName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" DROP COLUMN IF EXISTS "phoneNumber"`,
    );

    await queryRunner.query(
      `ALTER TABLE "transporters" ADD "companyName" character varying(255) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" ADD "ownerName" character varying(255) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" ADD "ntn" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" ADD "address" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" ADD "lat" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" ADD "lng" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" ADD "stateId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" ADD "cityId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" ADD "zipCode" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" ADD "avatar" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" ADD "status" "public"."transporters_status_enum" NOT NULL DEFAULT 'ACTIVE'`,
    );

    // Backfill required FKs from first available city when legacy rows exist
    await queryRunner.query(`
      UPDATE "transporters" t
      SET
        "stateId" = c."stateId",
        "cityId" = c."id"
      FROM (
        SELECT "id", "stateId"
        FROM "cities"
        ORDER BY "id" ASC
        LIMIT 1
      ) c
      WHERE t."stateId" IS NULL OR t."cityId" IS NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "transporters" ALTER COLUMN "stateId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" ALTER COLUMN "cityId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" ALTER COLUMN "companyName" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" ALTER COLUMN "ownerName" DROP DEFAULT`,
    );

    await queryRunner.query(
      `ALTER TABLE "transporters" ADD CONSTRAINT "FK_transporters_stateId" FOREIGN KEY ("stateId") REFERENCES "states"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" ADD CONSTRAINT "FK_transporters_cityId" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`
      CREATE TABLE "transporter_contacts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "transporterId" uuid NOT NULL,
        "name" character varying NOT NULL,
        "designation" character varying NOT NULL,
        "address" character varying,
        "email" character varying,
        "phone" character varying NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transporter_contacts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "transporter_contacts" ADD CONSTRAINT "FK_transporter_contacts_transporterId" FOREIGN KEY ("transporterId") REFERENCES "transporters"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`
      CREATE TABLE "transporter_documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "transporterId" uuid NOT NULL,
        "name" character varying,
        "file" character varying,
        "validity" date,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transporter_documents" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "transporter_documents" ADD CONSTRAINT "FK_transporter_documents_transporterId" FOREIGN KEY ("transporterId") REFERENCES "transporters"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transporter_documents" DROP CONSTRAINT "FK_transporter_documents_transporterId"`,
    );
    await queryRunner.query(`DROP TABLE "transporter_documents"`);

    await queryRunner.query(
      `ALTER TABLE "transporter_contacts" DROP CONSTRAINT "FK_transporter_contacts_transporterId"`,
    );
    await queryRunner.query(`DROP TABLE "transporter_contacts"`);

    await queryRunner.query(
      `ALTER TABLE "transporters" DROP CONSTRAINT "FK_transporters_cityId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" DROP CONSTRAINT "FK_transporters_stateId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "transporters" DROP COLUMN "status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" DROP COLUMN "avatar"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" DROP COLUMN "zipCode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" DROP COLUMN "cityId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" DROP COLUMN "stateId"`,
    );
    await queryRunner.query(`ALTER TABLE "transporters" DROP COLUMN "lng"`);
    await queryRunner.query(`ALTER TABLE "transporters" DROP COLUMN "lat"`);
    await queryRunner.query(
      `ALTER TABLE "transporters" DROP COLUMN "address"`,
    );
    await queryRunner.query(`ALTER TABLE "transporters" DROP COLUMN "ntn"`);
    await queryRunner.query(
      `ALTER TABLE "transporters" DROP COLUMN "ownerName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" DROP COLUMN "companyName"`,
    );

    await queryRunner.query(`DROP TYPE "public"."transporters_status_enum"`);

    await queryRunner.query(
      `ALTER TABLE "transporters" ADD "fullName" character varying(255) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" ADD "phoneNumber" character varying(255) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" ALTER COLUMN "fullName" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" ALTER COLUMN "phoneNumber" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "transporters" ADD CONSTRAINT "UQ_5787cc5a5140546b50bcd2474fe" UNIQUE ("phoneNumber")`,
    );
  }
}
