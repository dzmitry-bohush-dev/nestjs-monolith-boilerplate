import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '@/shared/entities/base.entity';
import { User } from '@/modules/users/entities/user.entity';
import { Role } from './role.entity';

@Entity('users_roles')
@Unique(['userId', 'roleId'])
export class UserRole extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column()
  userId!: string;

  @ApiProperty({ format: 'uuid' })
  @Column()
  roleId!: string;

  @ApiProperty({ type: () => User, required: false })
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @ApiProperty({ type: () => Role, required: false })
  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roleId' })
  role?: Role;
}
