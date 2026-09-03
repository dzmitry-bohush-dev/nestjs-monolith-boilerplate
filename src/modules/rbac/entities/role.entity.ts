import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Unique } from 'typeorm';
import { BaseEntity } from '@/shared/entities/base.entity';

@Entity('roles')
@Unique(['name'])
export class Role extends BaseEntity {
  @ApiProperty()
  @Column()
  name!: string;

  @ApiProperty({ required: false })
  @Column({ nullable: true })
  description?: string;
}
