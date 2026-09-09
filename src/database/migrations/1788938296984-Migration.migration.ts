import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1788938296984 implements MigrationInterface {
  name = 'Migration1788938296984';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "permissions" SET "actions" = array_append("actions", 'delete') WHERE "name" = 'users' AND NOT ('delete' = ANY("actions"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "permissions" SET "actions" = array_remove("actions", 'delete') WHERE "name" = 'users'`,
    );
  }
}
