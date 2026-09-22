import { MigrationInterface, QueryRunner } from 'typeorm';

export class TripDocuments1789941000001 implements MigrationInterface {
  name = 'TripDocuments1789941000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "trip_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tripId" uuid NOT NULL, "name" character varying, "file" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_trip_documents_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_documents" ADD CONSTRAINT "FK_trip_documents_tripId" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "trip_documents" DROP CONSTRAINT "FK_trip_documents_tripId"`,
    );
    await queryRunner.query(`DROP TABLE "trip_documents"`);
  }
}
