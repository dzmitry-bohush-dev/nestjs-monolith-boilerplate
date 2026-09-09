import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1788938296982 implements MigrationInterface {
  name = 'Migration1788938296982';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "permissions" SET "actions" = array_append("actions", 'update') WHERE "name" = 'users' AND NOT ('update' = ANY("actions"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "permissions" SET "actions" = array_remove("actions", 'update') WHERE "name" = 'users'`,
    );
  }
}
