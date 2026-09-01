import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '@/shared/entities/base.entity';
import { Role } from './role.entity';
import { Permission } from './permission.entity';

@Entity('grants')
@Unique(['roleId', 'permissionId'])
export class Grant extends BaseEntity {
  @Column()
  roleId!: string;

  @Column()
  permissionId!: string;

  @Column('text', { array: true, nullable: true })
  actions?: string[] | null;

  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roleId' })
  role?: Role;

  @ManyToOne(() => Permission, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permissionId' })
  permission?: Permission;
}
