import { Column, Entity, Unique } from 'typeorm';
import { BaseEntity } from '@/shared/entities/base.entity';

@Entity('permissions')
@Unique(['name'])
export class Permission extends BaseEntity {
  @Column()
  name!: string;

  @Column('text', { array: true })
  actions!: string[];
}
