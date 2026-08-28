import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@/shared/entities/base.entity';

@Entity('audit_logs')
export class AuditLog extends BaseEntity {
  @Column({ name: 'event_type', type: 'varchar' })
  eventType!: string;

  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  email!: string | null;

  @Column({ name: 'ip_address', type: 'varchar', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;
}
