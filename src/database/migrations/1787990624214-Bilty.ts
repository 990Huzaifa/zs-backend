import { MigrationInterface, QueryRunner } from "typeorm";

export class Bilty1787990624214 implements MigrationInterface {
    name = 'Bilty1787990624214'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."bilty_status_enum" AS ENUM('PENDING', 'APPROVED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "bilty" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying NOT NULL, "issueDate" date NOT NULL, "driverId" uuid NOT NULL, "vehicleId" uuid NOT NULL, "description" character varying NOT NULL, "refNumber" character varying, "totalWeight" character varying, "noOfPackages" character varying, "transaportorName" character varying, "transaportorPhone" character varying, "createdById" uuid, "status" "public"."bilty_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_8fc1b1af84e5b803bbeff160c6d" UNIQUE ("code"), CONSTRAINT "PK_0bb49702cdac2df281e0c6e42b9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "bilty_loadings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "biltyId" uuid NOT NULL, "clientId" uuid NOT NULL, "loadingDate" date NOT NULL, "arrivalDate" TIMESTAMP, "loadingTimeIn" TIMESTAMP, "loadingTimeOut" TIMESTAMP, "pickupLocationId" uuid NOT NULL, "loadingContactName" character varying, "loadingContactPhone" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_461155c0a89498f8258a95dc145" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "bilty_off_loadings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "biltyId" uuid NOT NULL, "clientId" uuid NOT NULL, "offLoadingDate" date NOT NULL, "offLoadingTimeIn" TIMESTAMP, "offLoadingTimeOut" TIMESTAMP, "dropoffLocationId" uuid NOT NULL, "offLoadingContactName" character varying, "offLoadingContactPhone" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3e54e7666e9ce12817a18f8f90f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "bilty" ADD CONSTRAINT "FK_4714bf1334171d614b4994838ed" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bilty" ADD CONSTRAINT "FK_3def0448cde28ec1cbaf0e324b8" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bilty" ADD CONSTRAINT "FK_2f7ee18c7effb6246bb3cd7be9c" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bilty_loadings" ADD CONSTRAINT "FK_299420563a84c75ef97430bc932" FOREIGN KEY ("biltyId") REFERENCES "bilty"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bilty_loadings" ADD CONSTRAINT "FK_f117e69619741c521dad1e0c2d9" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bilty_loadings" ADD CONSTRAINT "FK_deac0c1e55a2c1952f530bc60b0" FOREIGN KEY ("pickupLocationId") REFERENCES "client_pickup_locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bilty_off_loadings" ADD CONSTRAINT "FK_890084d07f09bed1d1b599221f8" FOREIGN KEY ("biltyId") REFERENCES "bilty"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bilty_off_loadings" ADD CONSTRAINT "FK_a0c7edfe585f525e0a4a409ef9e" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bilty_off_loadings" ADD CONSTRAINT "FK_ee0fc5c3a329d80937b2565753d" FOREIGN KEY ("dropoffLocationId") REFERENCES "client_dropoff_locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bilty_off_loadings" DROP CONSTRAINT "FK_ee0fc5c3a329d80937b2565753d"`);
        await queryRunner.query(`ALTER TABLE "bilty_off_loadings" DROP CONSTRAINT "FK_a0c7edfe585f525e0a4a409ef9e"`);
        await queryRunner.query(`ALTER TABLE "bilty_off_loadings" DROP CONSTRAINT "FK_890084d07f09bed1d1b599221f8"`);
        await queryRunner.query(`ALTER TABLE "bilty_loadings" DROP CONSTRAINT "FK_deac0c1e55a2c1952f530bc60b0"`);
        await queryRunner.query(`ALTER TABLE "bilty_loadings" DROP CONSTRAINT "FK_f117e69619741c521dad1e0c2d9"`);
        await queryRunner.query(`ALTER TABLE "bilty_loadings" DROP CONSTRAINT "FK_299420563a84c75ef97430bc932"`);
        await queryRunner.query(`ALTER TABLE "bilty" DROP CONSTRAINT "FK_2f7ee18c7effb6246bb3cd7be9c"`);
        await queryRunner.query(`ALTER TABLE "bilty" DROP CONSTRAINT "FK_3def0448cde28ec1cbaf0e324b8"`);
        await queryRunner.query(`ALTER TABLE "bilty" DROP CONSTRAINT "FK_4714bf1334171d614b4994838ed"`);
        await queryRunner.query(`DROP TABLE "bilty_off_loadings"`);
        await queryRunner.query(`DROP TABLE "bilty_loadings"`);
        await queryRunner.query(`DROP TABLE "bilty"`);
        await queryRunner.query(`DROP TYPE "public"."bilty_status_enum"`);
    }

}
