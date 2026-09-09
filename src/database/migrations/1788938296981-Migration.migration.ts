import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1788938296981 implements MigrationInterface {
  name = 'Migration1788938296981';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "first_name" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "last_name" character varying`,
    );

    await queryRunner.query(
      `CREATE TABLE "pending_email_changes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "newEmail" character varying NOT NULL, "confirmation_method" character varying NOT NULL DEFAULT 'otp', "code_hash" character varying NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "attempt_count" integer NOT NULL DEFAULT '0', "max_attempts" integer NOT NULL, "status" character varying NOT NULL DEFAULT 'PENDING', "last_sent_at" TIMESTAMP WITH TIME ZONE NOT NULL, "confirmed_at" TIMESTAMP WITH TIME ZONE, "ip_address" character varying, "user_agent" character varying, CONSTRAINT "PK_974a0acecd615af6eb2db57e170" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8352b514edf6ceadbcfc4cbaa4" ON "pending_email_changes" ("userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "pending_email_changes" ADD CONSTRAINT "FK_8352b514edf6ceadbcfc4cbaa4a" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_pending_email_changes_active_user" ON "pending_email_changes" ("userId") WHERE "status" = 'PENDING'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."UQ_pending_email_changes_active_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pending_email_changes" DROP CONSTRAINT "FK_8352b514edf6ceadbcfc4cbaa4a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8352b514edf6ceadbcfc4cbaa4"`,
    );
    await queryRunner.query(`DROP TABLE "pending_email_changes"`);

    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "last_name"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "first_name"`);
  }
}
