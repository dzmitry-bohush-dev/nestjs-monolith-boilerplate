import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '@/shared/entities/base.entity';
import { Role } from './role.entity';
import { Permission } from './permission.entity';

@Entity('grants')
@Unique(['roleId', 'permissionId'])
export class Grant extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column()
  roleId!: string;

  @ApiProperty({ format: 'uuid' })
  @Column()
  permissionId!: string;

  @ApiProperty({ type: [String], required: false, nullable: true })
  @Column('text', { array: true, nullable: true })
  actions?: string[] | null;

  @ApiProperty({ type: () => Role, required: false })
  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roleId' })
  role?: Role;

  @ApiProperty({ type: () => Permission, required: false })
  @ManyToOne(() => Permission, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permissionId' })
  permission?: Permission;
}
