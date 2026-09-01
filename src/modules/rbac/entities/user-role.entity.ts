import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '@/shared/entities/base.entity';
import { User } from '@/modules/users/entities/user.entity';
import { Role } from './role.entity';

@Entity('users_roles')
@Unique(['userId', 'roleId'])
export class UserRole extends BaseEntity {
  @Column()
  userId!: string;

  @Column()
  roleId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roleId' })
  role?: Role;
}
