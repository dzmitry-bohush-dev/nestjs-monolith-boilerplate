import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1788867305251 implements MigrationInterface {
  name = 'Migration1788867305251';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "photo" character varying`,
    );

    const [role] = (await queryRunner.query(
      `SELECT "id" FROM "roles" WHERE "name" = $1`,
      ['admin'],
    )) as [{ id: string }];
    const [permission] = (await queryRunner.query(
      `INSERT INTO "permissions" ("name", "actions") VALUES ($1, $2) RETURNING "id"`,
      ['users', ['read']],
    )) as [{ id: string }];
    await queryRunner.query(
      `INSERT INTO "grants" ("roleId", "permissionId", "actions") VALUES ($1, $2, NULL)`,
      [role.id, permission.id],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "grants" WHERE "roleId" IN (SELECT "id" FROM "roles" WHERE "name" = $1) AND "permissionId" IN (SELECT "id" FROM "permissions" WHERE "name" = $2)`,
      ['admin', 'users'],
    );
    await queryRunner.query(`DELETE FROM "permissions" WHERE "name" = $1`, [
      'users',
    ]);

    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "photo"`);
  }
}
