import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLogService } from '@/core/audit-log/audit-log.service';
import { AuditLog } from '@/core/audit-log/entities/audit-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
