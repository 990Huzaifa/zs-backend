import { MigrationInterface, QueryRunner } from "typeorm";

export class DBInit1787724816427 implements MigrationInterface {
    name = 'DBInit1787724816427'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "vendor_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "slug" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_3c891259bd2116a4472ca1ea177" UNIQUE ("slug"), CONSTRAINT "PK_fccd387a978fa4c884eac41aff4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."vendors_taxstatus_enum" AS ENUM('ACTIVE', 'NON_ACTIVE')`);
        await queryRunner.query(`CREATE TYPE "public"."vendors_status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'PENDING', 'BLOCKED')`);
        await queryRunner.query(`CREATE TABLE "vendors" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "email" character varying NOT NULL, "phone" character varying, "altPhone" character varying, "bankName" character varying, "bankAccountNumber" character varying, "taxStatus" "public"."vendors_taxstatus_enum" NOT NULL DEFAULT 'NON_ACTIVE', "status" "public"."vendors_status_enum" NOT NULL DEFAULT 'ACTIVE', "address" character varying, "city" character varying, "zipCode" character varying, "lat" character varying, "lng" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "vendorCategoryId" uuid, CONSTRAINT "UQ_3fe1343dbf2a7d9b7be1c27725a" UNIQUE ("email"), CONSTRAINT "PK_9c956c9797edfae5c6ddacc4e6e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "vehicle_sizes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "slug" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_54ae5e0383ea7c37f96f95c8bd3" UNIQUE ("slug"), CONSTRAINT "PK_9a6a7cdb06fd12e7965369a7534" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "vehicle_capacity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "slug" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_55a3a9906d8557f4ed96d00ccba" UNIQUE ("slug"), CONSTRAINT "PK_8b3925d7e5a1664a234bf401e67" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."vehicle_types_measurement_enum" AS ENUM('SIZE', 'CAPACITY')`);
        await queryRunner.query(`CREATE TABLE "vehicle_types" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "slug" character varying NOT NULL, "measurement" "public"."vehicle_types_measurement_enum" NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_99e5091a02c4225695f062d922a" UNIQUE ("slug"), CONSTRAINT "PK_73d1e40f4add7f4f6947acad3a8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."vehicles_ownership_enum" AS ENUM('CONTRACT_BASED', 'BANK_LEASE', 'OWN')`);
        await queryRunner.query(`CREATE TYPE "public"."vehicles_designation_enum" AS ENUM('DRIVER', 'OWNER', 'FORMEN', 'OFFICE_PERSON')`);
        await queryRunner.query(`CREATE TYPE "public"."vehicles_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TABLE "vehicles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ownership" "public"."vehicles_ownership_enum" NOT NULL, "ownerFirstName" character varying NOT NULL, "ownerLastName" character varying NOT NULL, "contactPersonName" character varying NOT NULL, "contactNo" character varying NOT NULL, "Designation" "public"."vehicles_designation_enum" NOT NULL, "regNo" character varying NOT NULL, "enginNo" character varying NOT NULL, "chassisNo" character varying NOT NULL, "status" "public"."vehicles_status_enum" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_18d8646b59304dce4af3a9e35b6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."vehicle_documents_doctype_enum" AS ENUM('CERTIFICATE_OF_FITNESS', 'TAX_CERTIFICATE', 'ROUTE_PERMIT', 'REGISTERATION')`);
        await queryRunner.query(`CREATE TABLE "vehicle_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying, "docType" "public"."vehicle_documents_doctype_enum" NOT NULL, "file" character varying NOT NULL, "validity" date NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_826557bd90f6c1a5c46bf9b9bdd" UNIQUE ("file"), CONSTRAINT "PK_d0cc0eb10dcf41a4f35575f5273" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."activities_actortype_enum" AS ENUM('admin', 'user', 'system')`);
        await queryRunner.query(`CREATE TABLE "activities" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actorType" "public"."activities_actortype_enum" NOT NULL, "adminId" uuid, "userId" uuid, "action" character varying NOT NULL, "entityType" character varying, "entityId" uuid, "description" text, "metadata" jsonb, "ip" character varying, "userAgent" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7f4004429f731ffb9c88eb486a8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."password_reset_tokens_type_enum" AS ENUM('forgotPassword', 'emailVerification')`);
        await queryRunner.query(`CREATE TABLE "password_reset_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "codeHash" character varying NOT NULL, "type" "public"."password_reset_tokens_type_enum" NOT NULL DEFAULT 'forgotPassword', "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "usedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d16bebd73e844c48bca50ff8d3d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "permissions" ("id" SERIAL NOT NULL, "code" character varying NOT NULL, "name" character varying NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_8dad765629e83229da6feda1c1d" UNIQUE ("code"), CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying NOT NULL, "name" character varying NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_f6d54f95c31b73fb1bdd8e91d0c" UNIQUE ("code"), CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."drivers_drivertype_enum" AS ENUM('HELPER', 'FIRST_DRIVER', 'SECOND_DRIVER')`);
        await queryRunner.query(`CREATE TYPE "public"."drivers_licensetype_enum" AS ENUM('HTV', 'LTV')`);
        await queryRunner.query(`CREATE TABLE "drivers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "driverType" "public"."drivers_drivertype_enum" NOT NULL, "fatherName" character varying NOT NULL, "phone" character varying, "altPhone" character varying, "licenseNo" character varying, "licenseType" "public"."drivers_licensetype_enum" NOT NULL, "currentAddress" character varying, "permenantAddress" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "REL_57d866371f392f459cd9ee46f6" UNIQUE ("userId"), CONSTRAINT "PK_92ab3fb69e566d3eb0cae896047" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."driver_documents_doctype_enum" AS ENUM('LICENSE', 'CNIC', 'OTHER')`);
        await queryRunner.query(`CREATE TABLE "driver_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying, "docType" "public"."driver_documents_doctype_enum" NOT NULL, "file" character varying NOT NULL, "validity" date NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_c85bd4070a3b910a4f7a2d358ce" UNIQUE ("file"), CONSTRAINT "PK_31c28b4e8f55a5d411597d45ab2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."users_profiletype_enum" AS ENUM('USER', 'DRIVER', 'BROKER', 'COMPANY_USER')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying NOT NULL, "roleId" uuid NOT NULL, "profileType" "public"."users_profiletype_enum" NOT NULL, "name" character varying NOT NULL, "email" character varying, "password" character varying, "phone" character varying, "avatar" character varying, "deviceId" character varying, "fcmToken" character varying, "ip" character varying, "appVersion" character varying, "isEmailVerified" boolean NOT NULL DEFAULT false, "lastLoginAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_1f7a2b11e29b1422a2622beab36" UNIQUE ("code"), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."user_auth_providers_provider_enum" AS ENUM('google', 'apple')`);
        await queryRunner.query(`CREATE TABLE "user_auth_providers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "provider" "public"."user_auth_providers_provider_enum" NOT NULL, "providerUserId" character varying NOT NULL, "providerEmail" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_9a2b64c1c8cb8cb3876debf7c8c" UNIQUE ("provider", "providerUserId"), CONSTRAINT "PK_e3b60f30b8112ac5bb474a2fe4b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "client_types" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "slug" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_f3be96bb5ad04e47048e6abfcca" UNIQUE ("slug"), CONSTRAINT "PK_85832ef63aa395263d0b72b1ea1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "clients" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "companyName" character varying NOT NULL, "companyAddress" character varying NOT NULL, "postalCode" character varying NOT NULL, "city" character varying NOT NULL, "email" character varying NOT NULL, "ntn" character varying NOT NULL, "saleTaxNo" character varying NOT NULL, "phone" character varying, "saleTaxType" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_b48860677afe62cd96e12659482" UNIQUE ("email"), CONSTRAINT "UQ_558417033b71312cd8c9800a19e" UNIQUE ("ntn"), CONSTRAINT "UQ_bc83e13a7c995cc0db9e2544da5" UNIQUE ("saleTaxNo"), CONSTRAINT "PK_f1ab7cf3a5714dbc6bb4e1c28a4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "client_contacts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "designation" character varying NOT NULL, "address" character varying, "email" character varying, "phone" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "clientId" uuid, CONSTRAINT "UQ_8fab1b66b48db678e6602d3517f" UNIQUE ("email"), CONSTRAINT "PK_1d0ab11dc872cb18d4850c970a5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."client_pickup_locations_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TABLE "client_pickup_locations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "address" character varying NOT NULL, "lat" character varying, "lng" character varying, "contactPersonName" character varying, "contactPersonPhone" character varying, "status" "public"."client_pickup_locations_status_enum" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "clientId" uuid, CONSTRAINT "PK_a463b88ecf810c2509ea46cedf0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."client_dropoff_locations_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TABLE "client_dropoff_locations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "address" character varying NOT NULL, "lat" character varying, "lng" character varying, "contactPersonName" character varying, "contactPersonPhone" character varying, "status" "public"."client_dropoff_locations_status_enum" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "clientId" uuid, CONSTRAINT "PK_1aad127465b58855b0d8980ccc7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."chart_of_accounts_accountkind_enum" AS ENUM('SYSTEM', 'BUSINESS', 'PARTY_RECEIVABLE', 'PARTY_PAYABLE', 'EMPLOYEE_SALARY_PAYABLE')`);
        await queryRunner.query(`CREATE TABLE "chart_of_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid, "accountKind" "public"."chart_of_accounts_accountkind_enum" NOT NULL DEFAULT 'SYSTEM', "name" character varying NOT NULL, "code" character varying NOT NULL, "parentCode" character varying, "isPostable" boolean NOT NULL DEFAULT true, "level1" integer NOT NULL DEFAULT '0', "level2" integer NOT NULL DEFAULT '0', "level3" integer NOT NULL DEFAULT '0', "level4" integer NOT NULL DEFAULT '0', "level5" integer NOT NULL DEFAULT '0', "level6" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "PK_467c08a2efc78393c647da32bac" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "rolePermissions" ("roleId" uuid NOT NULL, "permissionId" integer NOT NULL, CONSTRAINT "PK_9e7ab7e8aec914fa1886f6fa632" PRIMARY KEY ("roleId", "permissionId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b20f4ad2fcaa0d311f92516267" ON "rolePermissions" ("roleId") `);
        await queryRunner.query(`CREATE INDEX "IDX_5cb213a16a7b5204c8aff88151" ON "rolePermissions" ("permissionId") `);
        await queryRunner.query(`ALTER TABLE "vendors" ADD CONSTRAINT "FK_b55979789c2bef95f6c6aba05d3" FOREIGN KEY ("vendorCategoryId") REFERENCES "vendor_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "activities" ADD CONSTRAINT "FK_5a2cfe6f705df945b20c1b22c71" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "FK_d6a19d4b4f6c62dcd29daa497e2" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "drivers" ADD CONSTRAINT "FK_57d866371f392f459cd9ee46f6a" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_368e146b785b574f42ae9e53d5e" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_auth_providers" ADD CONSTRAINT "FK_344bc2c598846ecf8f58274fdaa" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "client_contacts" ADD CONSTRAINT "FK_b12571ed31604ee44ce5bc8c893" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "client_pickup_locations" ADD CONSTRAINT "FK_50e9a60a9984d4835c7f499ad40" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "client_dropoff_locations" ADD CONSTRAINT "FK_6fec362e56443e90cb701c916e1" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "FK_85b4c4945ad7b7657ec17e52103" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "rolePermissions" ADD CONSTRAINT "FK_b20f4ad2fcaa0d311f925162675" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "rolePermissions" ADD CONSTRAINT "FK_5cb213a16a7b5204c8aff881518" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "rolePermissions" DROP CONSTRAINT "FK_5cb213a16a7b5204c8aff881518"`);
        await queryRunner.query(`ALTER TABLE "rolePermissions" DROP CONSTRAINT "FK_b20f4ad2fcaa0d311f925162675"`);
        await queryRunner.query(`ALTER TABLE "chart_of_accounts" DROP CONSTRAINT "FK_85b4c4945ad7b7657ec17e52103"`);
        await queryRunner.query(`ALTER TABLE "client_dropoff_locations" DROP CONSTRAINT "FK_6fec362e56443e90cb701c916e1"`);
        await queryRunner.query(`ALTER TABLE "client_pickup_locations" DROP CONSTRAINT "FK_50e9a60a9984d4835c7f499ad40"`);
        await queryRunner.query(`ALTER TABLE "client_contacts" DROP CONSTRAINT "FK_b12571ed31604ee44ce5bc8c893"`);
        await queryRunner.query(`ALTER TABLE "user_auth_providers" DROP CONSTRAINT "FK_344bc2c598846ecf8f58274fdaa"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_368e146b785b574f42ae9e53d5e"`);
        await queryRunner.query(`ALTER TABLE "drivers" DROP CONSTRAINT "FK_57d866371f392f459cd9ee46f6a"`);
        await queryRunner.query(`ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "FK_d6a19d4b4f6c62dcd29daa497e2"`);
        await queryRunner.query(`ALTER TABLE "activities" DROP CONSTRAINT "FK_5a2cfe6f705df945b20c1b22c71"`);
        await queryRunner.query(`ALTER TABLE "vendors" DROP CONSTRAINT "FK_b55979789c2bef95f6c6aba05d3"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5cb213a16a7b5204c8aff88151"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b20f4ad2fcaa0d311f92516267"`);
        await queryRunner.query(`DROP TABLE "rolePermissions"`);
        await queryRunner.query(`DROP TABLE "chart_of_accounts"`);
        await queryRunner.query(`DROP TYPE "public"."chart_of_accounts_accountkind_enum"`);
        await queryRunner.query(`DROP TABLE "client_dropoff_locations"`);
        await queryRunner.query(`DROP TYPE "public"."client_dropoff_locations_status_enum"`);
        await queryRunner.query(`DROP TABLE "client_pickup_locations"`);
        await queryRunner.query(`DROP TYPE "public"."client_pickup_locations_status_enum"`);
        await queryRunner.query(`DROP TABLE "client_contacts"`);
        await queryRunner.query(`DROP TABLE "clients"`);
        await queryRunner.query(`DROP TABLE "client_types"`);
        await queryRunner.query(`DROP TABLE "user_auth_providers"`);
        await queryRunner.query(`DROP TYPE "public"."user_auth_providers_provider_enum"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_profiletype_enum"`);
        await queryRunner.query(`DROP TABLE "driver_documents"`);
        await queryRunner.query(`DROP TYPE "public"."driver_documents_doctype_enum"`);
        await queryRunner.query(`DROP TABLE "drivers"`);
        await queryRunner.query(`DROP TYPE "public"."drivers_licensetype_enum"`);
        await queryRunner.query(`DROP TYPE "public"."drivers_drivertype_enum"`);
        await queryRunner.query(`DROP TABLE "roles"`);
        await queryRunner.query(`DROP TABLE "permissions"`);
        await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
        await queryRunner.query(`DROP TYPE "public"."password_reset_tokens_type_enum"`);
        await queryRunner.query(`DROP TABLE "activities"`);
        await queryRunner.query(`DROP TYPE "public"."activities_actortype_enum"`);
        await queryRunner.query(`DROP TABLE "vehicle_documents"`);
        await queryRunner.query(`DROP TYPE "public"."vehicle_documents_doctype_enum"`);
        await queryRunner.query(`DROP TABLE "vehicles"`);
        await queryRunner.query(`DROP TYPE "public"."vehicles_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."vehicles_designation_enum"`);
        await queryRunner.query(`DROP TYPE "public"."vehicles_ownership_enum"`);
        await queryRunner.query(`DROP TABLE "vehicle_types"`);
        await queryRunner.query(`DROP TYPE "public"."vehicle_types_measurement_enum"`);
        await queryRunner.query(`DROP TABLE "vehicle_capacity"`);
        await queryRunner.query(`DROP TABLE "vehicle_sizes"`);
        await queryRunner.query(`DROP TABLE "vendors"`);
        await queryRunner.query(`DROP TYPE "public"."vendors_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."vendors_taxstatus_enum"`);
        await queryRunner.query(`DROP TABLE "vendor_categories"`);
    }

}
