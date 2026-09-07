import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1788783965201 implements MigrationInterface {
  name = 'Migration1788783965201';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "action_confirmation_settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "action" character varying NOT NULL, "enabled" boolean NOT NULL DEFAULT false, "confirmation_method" character varying NOT NULL DEFAULT 'otp', "updated_by_user_id" uuid, CONSTRAINT "UQ_745bc5a15134d302ebe98257069" UNIQUE ("action"), CONSTRAINT "PK_387d7646bda86339e10b4338fec" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "pending_login_attempts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "email" character varying NOT NULL, "confirmation_method" character varying NOT NULL DEFAULT 'otp', "code_hash" character varying NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "attempt_count" integer NOT NULL DEFAULT '0', "max_attempts" integer NOT NULL, "status" character varying NOT NULL DEFAULT 'PENDING', "last_sent_at" TIMESTAMP WITH TIME ZONE NOT NULL, "confirmed_at" TIMESTAMP WITH TIME ZONE, "ip_address" character varying, "user_agent" character varying, CONSTRAINT "PK_1876c31116ce922efe93ba1b7c0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_18b707c3c02d6780575a85c302" ON "pending_login_attempts" ("userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "pending_login_attempts" ADD CONSTRAINT "FK_18b707c3c02d6780575a85c302a" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `INSERT INTO "action_confirmation_settings" ("action", "enabled", "confirmation_method") VALUES ($1, $2, $3)`,
      ['auth.login', false, 'otp'],
    );

    const [role] = (await queryRunner.query(
      `SELECT "id" FROM "roles" WHERE "name" = $1`,
      ['admin'],
    )) as [{ id: string }];
    const [permission] = (await queryRunner.query(
      `INSERT INTO "permissions" ("name", "actions") VALUES ($1, $2) RETURNING "id"`,
      ['settings', ['read', 'update']],
    )) as [{ id: string }];
    await queryRunner.query(
      `INSERT INTO "grants" ("roleId", "permissionId", "actions") VALUES ($1, $2, NULL)`,
      [role.id, permission.id],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "grants" WHERE "roleId" IN (SELECT "id" FROM "roles" WHERE "name" = $1) AND "permissionId" IN (SELECT "id" FROM "permissions" WHERE "name" = $2)`,
      ['admin', 'settings'],
    );
    await queryRunner.query(`DELETE FROM "permissions" WHERE "name" = $1`, [
      'settings',
    ]);

    await queryRunner.query(
      `DELETE FROM "action_confirmation_settings" WHERE "action" = $1`,
      ['auth.login'],
    );

    await queryRunner.query(
      `ALTER TABLE "pending_login_attempts" DROP CONSTRAINT "FK_18b707c3c02d6780575a85c302a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_18b707c3c02d6780575a85c302"`,
    );
    await queryRunner.query(`DROP TABLE "pending_login_attempts"`);
    await queryRunner.query(`DROP TABLE "action_confirmation_settings"`);
  }
}
