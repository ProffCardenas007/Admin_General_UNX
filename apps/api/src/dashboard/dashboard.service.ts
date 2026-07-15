import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ProjectEntity } from '../database/entities/project.entity';
import { TaskEntity } from '../database/entities/task.entity';
import { TaskUpdateEntity } from '../database/entities/task-update.entity';
import { ProjectScope, normalizeLeadSpecialties } from '../common/specialties';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectsRepository: Repository<ProjectEntity>,
    @InjectRepository(TaskEntity)
    private readonly tasksRepository: Repository<TaskEntity>,
    @InjectRepository(TaskUpdateEntity)
    private readonly taskUpdatesRepository: Repository<TaskUpdateEntity>,
  ) {}

  private rethrowSchemaMismatch(error: unknown, operation: string): never {
    if (error instanceof QueryFailedError) {
      const dbError = error as QueryFailedError & {
        code?: string;
        message?: string;
      };

      if (dbError.code === '42703') {
        this.logger.error(
          `Dashboard schema mismatch during ${operation}: ${dbError.message ?? 'missing column'}`,
        );
        throw new ServiceUnavailableException(
          'Database schema is outdated. Run "npm run migrate:created-by:ownership", "npm run migrate:task-parent-links", and "npm run migrate:task-chains" in apps/api and retry.',
        );
      }
    }

    throw error;
  }

  async getSummary(
    filters: { from?: string; to?: string; projectId?: string },
    actor: {
      id: string;
      role: 'manager' | 'lead' | 'worker';
      specialty?: ProjectScope | null;
      specialties?: ProjectScope[] | null;
    },
  ) {
    try {
      const from = this.normalizeDateFilter(filters.from, 'from');
      const to = this.normalizeDateFilter(filters.to, 'to');
      const projectId = this.normalizeProjectIdFilter(filters.projectId);
      const leadSpecialties = normalizeLeadSpecialties(
        actor.specialties ?? actor.specialty,
      );

    const activeProjectsQb = this.projectsRepository
      .createQueryBuilder('project')
      .where('project.status = :status', { status: 'active' });

    if (actor.role === 'worker') {
      activeProjectsQb
        .innerJoin(
          TaskEntity,
          'task_scope',
          'task_scope.project_id = project.id AND task_scope.assignee_id = :actorId',
          { actorId: actor.id },
        )
        .distinct(true);
    } else if (actor.role === 'lead') {
      if (leadSpecialties.length === 0) {
        throw new ForbiddenException('Lead specialty is required');
      }

      activeProjectsQb.andWhere('project.scope IN (:...scopes)', {
        scopes: leadSpecialties,
      });
    }

    if (projectId) {
      activeProjectsQb.andWhere('project.id = :projectId', {
        projectId,
      });
    }
    const activeProjects = await activeProjectsQb.getCount();

    const tasksQb = this.tasksRepository.createQueryBuilder('task');
    if (actor.role === 'lead') {
      if (leadSpecialties.length === 0) {
        throw new ForbiddenException('Lead specialty is required');
      }

      tasksQb.innerJoin(
        ProjectEntity,
        'project_scope',
        'project_scope.id = task.project_id',
      );
      tasksQb.andWhere('project_scope.scope IN (:...scopes)', {
        scopes: leadSpecialties,
      });
    }
    if (projectId) {
      tasksQb.andWhere('task.project_id = :projectId', { projectId });
    }
    if (actor.role === 'worker') {
      tasksQb.andWhere('task.assignee_id = :actorId', { actorId: actor.id });
    }
    const tasks = await tasksQb.getMany();
    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((task) => task.status === 'done').length;
    const blockedTasks = tasks.filter(
      (task) => task.status === 'blocked',
    ).length;

    const today = new Date();
    const overdueTasks = tasks.filter(
      (task) =>
        task.status !== 'done' &&
        task.dueDate &&
        new Date(task.dueDate) < today,
    ).length;

    const hoursQb = this.taskUpdatesRepository
      .createQueryBuilder('update')
      .select('COALESCE(SUM(update.worked_hours), 0)', 'hoursWorked')
      .innerJoin(TaskEntity, 'task', 'task.id = update.task_id');

    if (projectId) {
      hoursQb.andWhere('task.project_id = :projectId', { projectId });
    }
    if (from) {
      hoursQb.andWhere('update.update_date >= :from', { from });
    }
    if (to) {
      hoursQb.andWhere('update.update_date <= :to', { to });
    }
    if (actor.role === 'worker') {
      hoursQb.andWhere('update.user_id = :actorId', { actorId: actor.id });
    }
    const hoursResult = await hoursQb.getRawOne<{ hoursWorked: string }>();

      return {
        activeProjects,
        completionRate:
          totalTasks === 0
            ? 0
            : Number(((doneTasks / totalTasks) * 100).toFixed(2)),
        overdueTasks,
        blockedTasks,
        hoursWorked: Number(hoursResult?.hoursWorked ?? 0),
      };
    } catch (error) {
      this.rethrowSchemaMismatch(error, 'getSummary');
    }
  }

  async getWorkload(
    filters: { projectId?: string },
    actor: {
      id: string;
      role: 'manager' | 'lead' | 'worker';
      specialty?: ProjectScope | null;
      specialties?: ProjectScope[] | null;
    },
  ) {
    try {
      const projectId = this.normalizeProjectIdFilter(filters.projectId);
      const leadSpecialties = normalizeLeadSpecialties(
        actor.specialties ?? actor.specialty,
      );

    const qb = this.tasksRepository
      .createQueryBuilder('task')
      .select('task.assignee_id', 'userId')
      .addSelect('COALESCE(SUM(task.estimated_hours), 0)', 'hoursWorked')
      .addSelect('COUNT(task.id)', 'tasksCount')
      .where('task.assignee_id IS NOT NULL')
      .groupBy('task.assignee_id')
      .orderBy('"hoursWorked"', 'DESC');

    if (actor.role === 'lead') {
      if (leadSpecialties.length === 0) {
        throw new ForbiddenException('Lead specialty is required');
      }

      qb.innerJoin(
        ProjectEntity,
        'project_scope',
        'project_scope.id = task.project_id',
      );
      qb.andWhere('project_scope.scope IN (:...scopes)', {
        scopes: leadSpecialties,
      });
    }

    if (projectId) {
      qb.andWhere('task.project_id = :projectId', { projectId });
    }
    if (actor.role === 'worker') {
      qb.andWhere('task.assignee_id = :actorId', { actorId: actor.id });
    }

      return qb.getRawMany<{
        userId: string;
        hoursWorked: string;
        tasksCount: string;
      }>();
    } catch (error) {
      this.rethrowSchemaMismatch(error, 'getWorkload');
    }
  }

  async getTrends(
    filters: { from?: string; to?: string; projectId?: string },
    actor: {
      id: string;
      role: 'manager' | 'lead' | 'worker';
      specialty?: ProjectScope | null;
      specialties?: ProjectScope[] | null;
    },
  ) {
    try {
      const from = this.normalizeDateFilter(filters.from, 'from');
      const to = this.normalizeDateFilter(filters.to, 'to');
      const projectId = this.normalizeProjectIdFilter(filters.projectId);
      const leadSpecialties = normalizeLeadSpecialties(
        actor.specialties ?? actor.specialty,
      );
      const weekStartExpression = "DATE_TRUNC('week', task.created_at::date)";

    const qb = this.tasksRepository
      .createQueryBuilder('task')
      .select(weekStartExpression, 'weekStart')
      .addSelect('COALESCE(SUM(task.estimated_hours), 0)', 'hoursWorked')
      .addSelect('COUNT(task.id)', 'tasksCount')
      .where('task.assignee_id IS NOT NULL')
      .groupBy(weekStartExpression)
      .orderBy('"weekStart"', 'ASC');

    if (actor.role === 'lead') {
      if (leadSpecialties.length === 0) {
        throw new ForbiddenException('Lead specialty is required');
      }

      qb.innerJoin(
        ProjectEntity,
        'project_scope',
        'project_scope.id = task.project_id',
      );
      qb.andWhere('project_scope.scope IN (:...scopes)', {
        scopes: leadSpecialties,
      });
    }

    if (projectId) {
      qb.andWhere('task.project_id = :projectId', { projectId });
    }
    if (from) {
      qb.andWhere('task.created_at::date >= :from', { from });
    }
    if (to) {
      qb.andWhere('task.created_at::date <= :to', { to });
    }
    if (actor.role === 'worker') {
      qb.andWhere('task.assignee_id = :actorId', { actorId: actor.id });
    }

      return qb.getRawMany<{
        weekStart: string;
        hoursWorked: string;
        tasksCount: string;
      }>();
    } catch (error) {
      this.rethrowSchemaMismatch(error, 'getTrends');
    }
  }

  private normalizeDateFilter(
    value: string | undefined,
    fieldName: 'from' | 'to',
  ) {
    if (!value || value.trim().length === 0) {
      return undefined;
    }

    const normalized = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw new BadRequestException(
        `Invalid ${fieldName} date. Use YYYY-MM-DD format`,
      );
    }

    return normalized;
  }

  private normalizeProjectIdFilter(value: string | undefined) {
    if (
      !value ||
      value.trim().length === 0 ||
      value.trim().toLowerCase() === 'all'
    ) {
      return undefined;
    }

    const normalized = value.trim();
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        normalized,
      )
    ) {
      throw new BadRequestException(
        'Invalid projectId filter. Use a UUID or all',
      );
    }

    return normalized;
  }
}
