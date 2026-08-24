import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ProjectEntity } from '../database/entities/project.entity';
import { TaskEntity } from '../database/entities/task.entity';
import { UserEntity } from '../database/entities/user.entity';
import { AuditLogEntity } from '../database/entities/audit-log.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectScope, normalizeLeadSpecialties } from '../common/specialties';
import { SpecialtyEntity } from '../database/entities/specialty.entity';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectsRepository: Repository<ProjectEntity>,
    @InjectRepository(TaskEntity)
    private readonly tasksRepository: Repository<TaskEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditLogsRepository: Repository<AuditLogEntity>,
    @InjectRepository(SpecialtyEntity)
    private readonly specialtiesRepository: Repository<SpecialtyEntity>,
  ) {}

  private async recordManagerAudit(input: {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    entityLabel: string;
    changes: Record<string, { before: unknown; after: unknown }>;
  }) {
    const actor = await this.usersRepository.findOne({
      where: { id: input.actorId },
    });

    const log = this.auditLogsRepository.create({
      actorId: input.actorId,
      actorRole: 'manager',
      actorEmail: actor?.email,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      entityLabel: input.entityLabel.slice(0, 220),
      changesJson: input.changes,
    });

    try {
      await this.auditLogsRepository.save(log);
    } catch (error) {
      this.logger.warn(
        `Audit log skipped for project action ${input.action} on ${input.entityId}`,
      );
    }
  }

  private async resolveLeadSpecialties(actor: {
    id: string;
    role: 'manager' | 'lead' | 'worker';
    specialty?: ProjectScope | null;
    specialties?: ProjectScope[] | null;
  }) {
    if (actor.role !== 'lead') {
      return [];
    }

    const actorSpecialties = normalizeLeadSpecialties(
      actor.specialties ?? actor.specialty,
    );
    if (actorSpecialties.length > 0) {
      return actorSpecialties;
    }

    const user = await this.usersRepository.findOne({
      where: { id: actor.id },
    });
    return normalizeLeadSpecialties(user?.specialties ?? user?.specialty);
  }

  async findAll(
    filters: { status?: string; search?: string },
    actor: {
      id: string;
      role: 'manager' | 'lead' | 'worker';
      specialty?: ProjectScope | null;
      specialties?: ProjectScope[] | null;
    },
  ) {
    const qb = this.projectsRepository.createQueryBuilder('project');
    const leadSpecialties = await this.resolveLeadSpecialties(actor);

    if (actor.role === 'lead') {
      qb.leftJoin(
        TaskEntity,
        'lead_task',
        'lead_task.project_id = project.id AND lead_task.assignee_id = :actorId',
        { actorId: actor.id },
      ).distinct(true);

      if (leadSpecialties.length === 0) {
        qb.andWhere('lead_task.id IS NOT NULL');
      } else {
        qb.andWhere(
          '(project.scope IN (:...scopes) OR lead_task.id IS NOT NULL)',
          { scopes: leadSpecialties },
        );
      }
    }

    if (actor.role === 'worker') {
      qb.innerJoin(
        TaskEntity,
        'task',
        'task.project_id = project.id AND task.assignee_id = :actorId',
        { actorId: actor.id },
      ).distinct(true);
    }

    if (filters.status) {
      qb.andWhere('project.status = :status', { status: filters.status });
    }
    if (filters.search) {
      qb.andWhere(
        '(project.name ILIKE :search OR project.code ILIKE :search)',
        {
          search: `%${filters.search}%`,
        },
      );
    }
    qb.orderBy('project.created_at', 'DESC');
    return qb.getMany();
  }

  create(
    dto: CreateProjectDto,
    actor: {
      id: string;
      role: 'manager' | 'lead' | 'worker';
      specialty?: ProjectScope | null;
      specialties?: ProjectScope[] | null;
    },
  ) {
    return this.createInternal(dto, actor);
  }

  private async createInternal(
    dto: CreateProjectDto,
    actor: {
      id: string;
      role: 'manager' | 'lead' | 'worker';
      specialty?: ProjectScope | null;
      specialties?: ProjectScope[] | null;
    },
  ) {
    const normalizedCode = dto.code.trim();
    const normalizedName = dto.name.trim();
    const resolvedScope = dto.scope ?? null;
    const leadSpecialties = await this.resolveLeadSpecialties(actor);

    if (actor.role === 'lead') {
      if (leadSpecialties.length === 0) {
        throw new BadRequestException('Lead specialty is required');
      }

      if (!resolvedScope) {
        throw new BadRequestException(
          'Project scope is required for lead users',
        );
      }

      if (!leadSpecialties.includes(resolvedScope)) {
        throw new ForbiddenException(
          'Leads can only create projects in their specialties',
        );
      }
    } else if (!resolvedScope) {
      throw new BadRequestException('Project scope is required');
    }

    const specialtyExists = await this.specialtiesRepository.exists({
      where: { code: resolvedScope ?? '', isActive: true },
    });
    if (!specialtyExists) {
      throw new BadRequestException('Project specialty does not exist');
    }

    const existingByNameAndScope = await this.projectsRepository
      .createQueryBuilder('project')
      .where('LOWER(TRIM(project.name)) = LOWER(TRIM(:name))', {
        name: normalizedName,
      })
      .andWhere('project.scope = :scope', { scope: resolvedScope })
      .getOne();

    if (existingByNameAndScope) {
      throw new ConflictException(
        'Project name already exists in this specialty',
      );
    }

    const project = this.projectsRepository.create({
      ...dto,
      code: normalizedCode,
      name: normalizedName,
      createdBy: actor.id,
      scope: resolvedScope,
      status: dto.status ?? 'planned',
    });

    try {
      return await this.projectsRepository.save(project);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const dbError = error as QueryFailedError & {
          code?: string;
          constraint?: string;
          detail?: string;
        };

        if (dbError.code === '23505') {
          if (dbError.constraint?.includes('projects_name')) {
            throw new ConflictException(
              'Project name already exists in this specialty',
            );
          }

          if (dbError.constraint?.includes('projects_code')) {
            throw new ConflictException('Project code already exists');
          }

          throw new ConflictException('Duplicate project data');
        }

        if (dbError.code === '23503') {
          if (dbError.constraint?.includes('owner_team_id')) {
            throw new BadRequestException('Owner team does not exist');
          }

          throw new BadRequestException('Related record not found');
        }

        if (dbError.code === '22P02') {
          throw new BadRequestException('Invalid project data format');
        }

        if (dbError.code === '23514') {
          throw new BadRequestException(
            'Project data violates database constraints',
          );
        }
      }

      throw error;
    }
  }

  async getProgress(
    projectId: string,
    actor: {
      id: string;
      role: 'manager' | 'lead' | 'worker';
      specialty?: ProjectScope | null;
      specialties?: ProjectScope[] | null;
    },
  ) {
    const leadSpecialties = await this.resolveLeadSpecialties(actor);
    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const tasksQb = this.tasksRepository
      .createQueryBuilder('task')
      .where('task.project_id = :projectId', { projectId });

    if (actor.role === 'worker') {
      tasksQb.andWhere('task.assignee_id = :actorId', { actorId: actor.id });
    }

    const tasks = await tasksQb.getMany();

    if (actor.role === 'lead') {
      if (leadSpecialties.length === 0) {
        throw new ForbiddenException('Lead specialty is required');
      }

      if (!project.scope || !leadSpecialties.includes(project.scope)) {
        throw new ForbiddenException(
          'Leads can only view progress for their specialties',
        );
      }
    }

    if (actor.role === 'worker' && tasks.length === 0) {
      throw new ForbiddenException(
        'Workers can only view progress of their assigned projects',
      );
    }

    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((task) => task.status === 'done').length;
    const overdueTasks = tasks.filter(
      (task) =>
        task.status !== 'done' &&
        task.dueDate &&
        new Date(task.dueDate) < new Date(),
    ).length;

    return {
      projectId: project.id,
      projectCode: project.code,
      totalTasks,
      doneTasks,
      completionRate:
        totalTasks === 0
          ? 0
          : Number(((doneTasks / totalTasks) * 100).toFixed(2)),
      overdueTasks,
    };
  }

  async remove(
    projectId: string,
    actor: {
      id: string;
      role: 'manager' | 'lead' | 'worker';
    },
  ) {
    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (actor.role === 'lead' && project.createdBy !== actor.id) {
      throw new ForbiddenException(
        'Leads can only delete projects created by themselves',
      );
    }

    await this.projectsRepository.delete({ id: projectId });
    return { deleted: true, projectId };
  }

  async update(
    projectId: string,
    dto: UpdateProjectDto,
    actor: {
      id: string;
      role: 'manager' | 'lead' | 'worker';
      specialty?: ProjectScope | null;
      specialties?: ProjectScope[] | null;
    },
  ) {
    const leadSpecialties = await this.resolveLeadSpecialties(actor);
    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (actor.role === 'lead') {
      if (leadSpecialties.length === 0) {
        throw new ForbiddenException('Lead specialty is required');
      }

      if (!project.scope || !leadSpecialties.includes(project.scope)) {
        throw new ForbiddenException(
          'Leads can only update projects within their specialties',
        );
      }
    }

    const before = {
      name: project.name,
      status: project.status,
      startDate: project.startDate ?? null,
      endDate: project.endDate ?? null,
    };

    if (dto.name !== undefined) {
      project.name = dto.name.trim();
    }

    if (dto.status !== undefined) {
      project.status = dto.status;
    }

    if (dto.startDate !== undefined) {
      project.startDate = dto.startDate;
    }

    if (dto.endDate !== undefined) {
      project.endDate = dto.endDate;
    }

    const savedProject = await this.projectsRepository.save(project);

    if (actor.role === 'manager') {
      const changes: Record<string, { before: unknown; after: unknown }> = {};

      if (dto.name !== undefined && before.name !== savedProject.name) {
        changes.name = { before: before.name, after: savedProject.name };
      }

      if (dto.status !== undefined && before.status !== savedProject.status) {
        changes.status = { before: before.status, after: savedProject.status };
      }

      const resolvedStartDate = savedProject.startDate ?? null;
      if (dto.startDate !== undefined && before.startDate !== resolvedStartDate) {
        changes.startDate = { before: before.startDate, after: resolvedStartDate };
      }

      const resolvedEndDate = savedProject.endDate ?? null;
      if (dto.endDate !== undefined && before.endDate !== resolvedEndDate) {
        changes.endDate = { before: before.endDate, after: resolvedEndDate };
      }

      if (Object.keys(changes).length > 0) {
        await this.recordManagerAudit({
          actorId: actor.id,
          action: 'project_updated',
          entityType: 'project',
          entityId: savedProject.id,
          entityLabel: `${savedProject.code} - ${savedProject.name}`,
          changes,
        });
      }
    }

    return savedProject;
  }
}
