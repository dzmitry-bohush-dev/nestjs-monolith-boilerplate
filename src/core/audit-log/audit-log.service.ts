import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FastifyRequest } from 'fastify';
import { Repository } from 'typeorm';

import { AuditLog } from '@/core/audit-log/entities/audit-log.entity';

export interface RecordAuditEventParams {
  eventType: string;
  userId?: string;
  email?: string;
  request?: FastifyRequest;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  record(params: RecordAuditEventParams): Promise<AuditLog> {
    const { eventType, userId, email, request, metadata } = params;

    const auditLog = this.auditLogRepository.create({
      eventType,
      userId: userId ?? null,
      email: email ?? null,
      ipAddress: request?.ip ?? null,
      userAgent: this.normalizeUserAgent(request?.headers['user-agent']),
      metadata: metadata ?? null,
    });

    return this.auditLogRepository.save(auditLog);
  }

  private normalizeUserAgent(
    value: string | string[] | undefined,
  ): string | null {
    if (!value) {
      return null;
    }

    return Array.isArray(value) ? (value[0] ?? null) : value;
  }
}
