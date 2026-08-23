import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from '../database/entities/audit-log.entity';

type FindAuditFilters = {
  entityType?: string;
  from?: string;
  to?: string;
  search?: string;
  limit?: string;
};

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly auditLogsRepository: Repository<AuditLogEntity>,
  ) {}

  async findAll(filters: FindAuditFilters) {
    const qb = this.auditLogsRepository.createQueryBuilder('audit');

    if (filters.entityType) {
      qb.andWhere('audit.entity_type = :entityType', {
        entityType: filters.entityType,
      });
    }

    if (filters.from) {
      qb.andWhere('audit.created_at >= :from', {
        from: `${filters.from}T00:00:00.000Z`,
      });
    }

    if (filters.to) {
      qb.andWhere('audit.created_at <= :to', {
        to: `${filters.to}T23:59:59.999Z`,
      });
    }

    if (filters.search) {
      qb.andWhere(
        '(audit.actor_email ILIKE :search OR audit.entity_label ILIKE :search OR audit.action ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    const requestedLimit = Number(filters.limit ?? 100);
    const safeLimit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 500)
      : 100;

    qb.orderBy('audit.created_at', 'DESC');
    qb.limit(safeLimit);

    return qb.getMany();
  }
}
