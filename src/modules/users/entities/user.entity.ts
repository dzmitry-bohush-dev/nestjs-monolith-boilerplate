import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@/shared/entities/base.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ unique: true })
  email!: string;

  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @Column({ type: 'varchar', nullable: true })
  photo!: string | null;
}
