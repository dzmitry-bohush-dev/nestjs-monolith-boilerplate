import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1788427300000 implements MigrationInterface {
  name = 'Migration1788427300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [role] = (await queryRunner.query(
      `INSERT INTO "roles" ("name", "description") VALUES ($1, $2) RETURNING "id"`,
      ['admin', 'Full administrative access, including RBAC management'],
    )) as [{ id: string }];
    const [permission] = (await queryRunner.query(
      `INSERT INTO "permissions" ("name", "actions") VALUES ($1, $2) RETURNING "id"`,
      ['rbac', ['create', 'read', 'update', 'delete']],
    )) as [{ id: string }];
    await queryRunner.query(
      `INSERT INTO "grants" ("roleId", "permissionId", "actions") VALUES ($1, $2, NULL)`,
      [role.id, permission.id],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "grants" WHERE "roleId" IN (SELECT "id" FROM "roles" WHERE "name" = $1) AND "permissionId" IN (SELECT "id" FROM "permissions" WHERE "name" = $2)`,
      ['admin', 'rbac'],
    );
    await queryRunner.query(`DELETE FROM "permissions" WHERE "name" = $1`, [
      'rbac',
    ]);
    await queryRunner.query(`DELETE FROM "roles" WHERE "name" = $1`, ['admin']);
  }
}
