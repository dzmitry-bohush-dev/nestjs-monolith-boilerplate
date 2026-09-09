import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1788938296983 implements MigrationInterface {
  name = 'Migration1788938296983';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "status" character varying NOT NULL DEFAULT 'ACTIVE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "deleted_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_users_status" ON "users" ("status")`,
    );

    await queryRunner.query(
      `CREATE TABLE "pending_user_deletions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "reason" character varying, "confirmation_method" character varying NOT NULL DEFAULT 'otp', "code_hash" character varying NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "attempt_count" integer NOT NULL DEFAULT '0', "max_attempts" integer NOT NULL, "status" character varying NOT NULL DEFAULT 'PENDING', "last_sent_at" TIMESTAMP WITH TIME ZONE NOT NULL, "confirmed_at" TIMESTAMP WITH TIME ZONE, "ip_address" character varying, "user_agent" character varying, CONSTRAINT "PK_1b683966c6ae0a18a207970a094" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8171b22a44e29dbfd181799614" ON "pending_user_deletions" ("userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "pending_user_deletions" ADD CONSTRAINT "FK_8171b22a44e29dbfd181799614b" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_pending_user_deletions_active_user" ON "pending_user_deletions" ("userId") WHERE "status" = 'PENDING'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."UQ_pending_user_deletions_active_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pending_user_deletions" DROP CONSTRAINT "FK_8171b22a44e29dbfd181799614b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8171b22a44e29dbfd181799614"`,
    );
    await queryRunner.query(`DROP TABLE "pending_user_deletions"`);

    await queryRunner.query(`DROP INDEX "public"."IDX_users_status"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "status"`);
  }
}
