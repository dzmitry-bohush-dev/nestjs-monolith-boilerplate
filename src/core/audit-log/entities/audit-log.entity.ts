import { Column, Entity } from 'typeorm';

import { BaseEntity } from '@/shared/entities/base.entity';

@Entity('audit_logs')
export class AuditLog extends BaseEntity {
  @Column({ name: 'event_type' })
  eventType!: string;

  @Column({ name: 'user_id', nullable: true })
  userId!: string | null;

  @Column({ nullable: true })
  email!: string | null;

  @Column({ name: 'ip_address', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;
}
