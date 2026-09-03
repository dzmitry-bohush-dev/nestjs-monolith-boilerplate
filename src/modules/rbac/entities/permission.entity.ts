import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Unique } from 'typeorm';
import { BaseEntity } from '@/shared/entities/base.entity';

@Entity('permissions')
@Unique(['name'])
export class Permission extends BaseEntity {
  @ApiProperty()
  @Column()
  name!: string;

  @ApiProperty({ type: [String] })
  @Column('text', { array: true })
  actions!: string[];
}
