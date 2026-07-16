import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { DataSource } from 'typeorm';
import { TaskEntity } from '../database/entities/task.entity';
import { NotificationEntity } from '../database/entities/notification.entity';
import { ProjectEntity } from '../database/entities/project.entity';
import { TaskUpdateEntity } from '../database/entities/task-update.entity';
import { UserEntity } from '../database/entities/user.entity';
import { AuditLogEntity } from '../database/entities/audit-log.entity';
import { TeamEntity } from '../database/entities/team.entity';
import { TeamMemberEntity } from '../database/entities/team-member.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { CreateTaskChainDto } from './dto/create-task-chain.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ProjectScope, normalizeLeadSpecialties } from '../common/specialties';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(TaskEntity)
    private readonly tasksRepository: Repository<TaskEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectsRepository: Repository<ProjectEntity>,
    @InjectRepository(NotificationEntity)
    private readonly notificationsRepository: Repository<NotificationEntity>,
    @InjectRepository(TaskUpdateEntity)
    private readonly taskUpdatesRepository: Repository<TaskUpdateEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditLogsRepository: Repository<AuditLogEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamsRepository: Repository<TeamEntity>,
    @InjectRepository(TeamMemberEntity)
    private readonly teamMembersRepository: Repository<TeamMemberEntity>,
  ) {}

  private async ensureTaskActivityTypeEnumReady() {
    await this.dataSource.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_enum e ON t.oid = e.enumtypid
          WHERE t.typname = 'task_activity_type'
            AND e.enumlabel = 'administrativo'
        ) THEN
          ALTER TYPE task_activity_type ADD VALUE 'administrativo';
        END IF;
      END
      $$;
    `);
  }

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
        `Audit log skipped for task action ${input.action} on ${input.entityId}`,
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
    filters: {
      projectId?: string;
      assigneeId?: string;
      status?: string;
      priority?: string;
      scope?: string;
    },
    actor: {
      id: string;
      role: 'manager' | 'lead' | 'worker';
      specialty?: ProjectScope | null;
      specialties?: ProjectScope[] | null;
    },
  ) {
    const qb = this.tasksRepository.createQueryBuilder('task');
    const leadSpecialties = await this.resolveLeadSpecialties(actor);

    if (filters.projectId) {
      qb.andWhere('task.project_id = :projectId', {
        projectId: filters.projectId,
      });
    }

    if (actor.role === 'worker') {
      qb.andWhere('task.assignee_id = :assigneeId', { assigneeId: actor.id });
    } else if (actor.role === 'lead') {
      const leadScope = filters.scope === 'assigned' ? 'assigned' : 'my';
      if (leadScope === 'assigned') {
        qb.innerJoin(
          ProjectEntity,
          'project_scope',
          'project_scope.id = task.project_id',
        );
        if (leadSpecialties.length === 0) {
          throw new ForbiddenException('Lead specialty is required');
        }

        qb.andWhere('project_scope.scope IN (:...scopes)', {
          scopes: leadSpecialties,
        });
        qb.andWhere('task.assignee_id != :actorId', { actorId: actor.id });
      } else {
        qb.andWhere('task.assignee_id = :assigneeId', { assigneeId: actor.id });
      }
    } else if (filters.assigneeId) {
      qb.andWhere('task.assignee_id = :assigneeId', {
        assigneeId: filters.assigneeId,
      });
    }
    if (filters.status) {
      qb.andWhere('task.status = :status', { status: filters.status });
    }
    if (filters.priority) {
      qb.andWhere('task.priority = :priority', { priority: filters.priority });
    }

    // Keep future chain steps hidden from every role until activation.
    qb.andWhere('(task.chain_id IS NULL OR task.status <> :hiddenChainStatus)', {
      hiddenChainStatus: 'blocked',
    });

    qb.orderBy('task.created_at', 'DESC');
    return qb.getMany();
  }

  private activityCodePrefix(activityType: CreateTaskDto['activityType']) {
    switch (activityType) {
      case 'revision':
        return 'REV';
      case 'edicion':
        return 'EDI';
      case 'creacion':
        return 'CRE';
      case 'presentaciones':
        return 'PRE';
      case 'grabacion':
        return 'GRA';
      case 'plataforma':
        return 'PLA';
      case 'administrativo':
        return 'ADM';
    }
  }

  private async buildGeneratedCode(
    projectId: string,
    activityType: CreateTaskDto['activityType'],
  ) {
    const prefix = this.activityCodePrefix(activityType);
    const rows = await this.tasksRepository
      .createQueryBuilder('task')
      .select('task.code', 'code')
      .where('task.project_id = :projectId', { projectId })
      .andWhere('task.code LIKE :pattern', { pattern: `${prefix}-%` })
      .getRawMany<{ code: string }>();

    const maxSequence = rows.reduce((currentMax, row) => {
      const rawCode = row?.code;
      if (!rawCode || !rawCode.startsWith(`${prefix}-`)) {
        return currentMax;
      }

      const suffix = rawCode.slice(prefix.length + 1);
      const parsed = Number.parseInt(suffix, 10);
      if (Number.isNaN(parsed)) {
        return currentMax;
      }

      return Math.max(currentMax, parsed);
    }, 0);

    return `${prefix}-${String(maxSequence + 1).padStart(3, '0')}`;
  }

  private isTaskCodeConflict(error: unknown) {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const dbError = error as QueryFailedError & {
      code?: string;
      constraint?: string;
      detail?: string;
    };

    return (
      dbError.code === '23505' &&
      (dbError.constraint === 'tasks_project_id_code_key' ||
        dbError.detail?.includes('(project_id, code)') ||
        false)
    );
  }

  private async createTaskWithGeneratedCode(
    input: {
      projectId: string;
      parentTaskId?: string;
      chainId?: string;
      chainOrder?: number;
      activityType: CreateTaskDto['activityType'];
      title: string;
      description?: string;
      assigneeId?: string;
      createdBy?: string;
      status: 'todo' | 'doing' | 'blocked' | 'done';
      priority: 'low' | 'medium' | 'high' | 'urgent';
      dueDate?: string;
      estimatedHours: string;
      activatedAt?: Date;
    },
    maxAttempts = 5,
  ) {
    await this.ensureTaskActivityTypeEnumReady();

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const generatedCode = await this.buildGeneratedCode(
        input.projectId,
        input.activityType,
      );

      const task = this.tasksRepository.create({
        ...input,
        code: generatedCode,
      });

      try {
        return await this.tasksRepository.save(task);
      } catch (error) {
        if (this.isTaskCodeConflict(error) && attempt < maxAttempts - 1) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException(
      'No se pudo generar un codigo unico para la tarea. Intenta nuevamente.',
    );
  }

  async createChain(
    dto: CreateTaskChainDto,
    actor: {
      id: string;
      role: 'manager' | 'lead' | 'worker';
      specialty?: ProjectScope | null;
      specialties?: ProjectScope[] | null;
    },
  ) {
    if (dto.steps.length < 2) {
      throw new BadRequestException(
        'A task chain requires at least 2 steps. Use regular task creation for a single task.',
      );
    }

    const leadSpecialties = await this.resolveLeadSpecialties(actor);
    const project = await this.projectsRepository.findOne({
      where: { id: dto.projectId },
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
          'Leads can only create tasks within their specialties',
        );
      }
    }

    const assigneeIds = dto.steps.map((step) => step.assigneeId);
    if (assigneeIds.some((id) => !id?.trim())) {
      throw new BadRequestException('Every task step must have an assignee');
    }

    const activeAssignees = await this.usersRepository.find({
      where: {
        id: In(assigneeIds),
        isActive: true,
      },
    });

    const activeAssigneeSet = new Set(activeAssignees.map((item) => item.id));
    const missingAssignee = assigneeIds.find((item) => !activeAssigneeSet.has(item));
    if (missingAssignee) {
      throw new BadRequestException('One or more assignees are invalid or inactive');
    }

    const chainId = randomUUID();
    const chainTasks: TaskEntity[] = [];

    for (let index = 0; index < dto.steps.length; index += 1) {
      const step = dto.steps[index];
      const isFirst = index === 0;
      const createdTask = await this.createTaskWithGeneratedCode({
        projectId: dto.projectId,
        chainId,
        chainOrder: index + 1,
        activityType: step.activityType,
        title: step.title.trim(),
        description: step.description.trim(),
        assigneeId: step.assigneeId,
        createdBy: actor.id,
        status: isFirst ? 'todo' : 'blocked',
        priority: step.priority ?? dto.priority ?? 'medium',
        dueDate: step.dueDate ?? dto.dueDate,
        estimatedHours: String(step.estimatedHours ?? 0),
        activatedAt: isFirst ? new Date() : undefined,
      });

      chainTasks.push(createdTask);
    }

    const firstTask = chainTasks[0];
    if (firstTask.assigneeId) {
      const firstNotification = this.notificationsRepository.create({
        userId: firstTask.assigneeId,
        taskId: firstTask.id,
        title: 'Nueva tarea de flujo asignada',
        message: `Se te asigno ${firstTask.title}. Es el primer paso de un flujo de ${chainTasks.length} tareas.`,
        isRead: false,
      });
      await this.notificationsRepository.save(firstNotification);
    }

    return {
      chainId,
      projectId: dto.projectId,
      totalSteps: chainTasks.length,
      tasks: chainTasks,
    };
  }

  async create(
    dto: CreateTaskDto,
    actor: {
      id: string;
      role: 'manager' | 'lead' | 'worker';
      specialty?: ProjectScope | null;
      specialties?: ProjectScope[] | null;
    },
  ) {
    const leadSpecialties = await this.resolveLeadSpecialties(actor);
    const project = await this.projectsRepository.findOne({
      where: { id: dto.projectId },
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
          'Leads can only create tasks within their specialties',
        );
      }
    }

    if (dto.teamId && dto.assigneeId) {
      throw new BadRequestException('Use assigneeId or teamId, not both');
    }

    if (dto.teamId && actor.role === 'worker') {
      throw new ForbiddenException(
        'Workers cannot assign tasks to complete teams',
      );
    }

    if (dto.teamId) {
      const team = await this.teamsRepository.findOne({ where: { id: dto.teamId } });
      if (!team) {
        throw new BadRequestException('Team not found');
      }

      const memberships = await this.teamMembersRepository.find({
        where: { teamId: dto.teamId },
      });
      const memberIds = memberships.map((item) => item.userId);

      if (memberIds.length === 0) {
        throw new BadRequestException('The selected team has no members');
      }

      const activeMembers = await this.usersRepository.find({
        where: {
          id: In(memberIds),
          isActive: true,
        },
      });

      if (activeMembers.length === 0) {
        throw new BadRequestException('The selected team has no active members');
      }

      const createdTasks: TaskEntity[] = [];
      for (const member of activeMembers) {
        const createdTask = await this.createTaskWithGeneratedCode({
          projectId: dto.projectId,
          activityType: dto.activityType,
          title: dto.title,
          description: dto.description,
          assigneeId: member.id,
          createdBy: actor.id,
          status: dto.status ?? 'todo',
          priority: dto.priority ?? 'medium',
          dueDate: dto.dueDate,
          estimatedHours: String(dto.estimatedHours ?? 0),
        });
        createdTasks.push(createdTask);
      }

      return {
        teamId: dto.teamId,
        createdCount: createdTasks.length,
        tasks: createdTasks,
      };
    }

    const resolvedAssigneeId =
      actor.role === 'worker' ? actor.id : dto.assigneeId;

    const taskPayload = {
      projectId: dto.projectId,
      activityType: dto.activityType,
      title: dto.title,
      description: dto.description,
      assigneeId: resolvedAssigneeId,
      createdBy: actor.id,
      status: dto.status ?? 'todo',
      priority: dto.priority ?? 'medium',
      dueDate: dto.dueDate,
      estimatedHours: String(dto.estimatedHours ?? 0),
    };

    if (dto.code?.trim().length) {
      const task = this.tasksRepository.create({
        ...taskPayload,
        code: dto.code.trim(),
      });
      return this.tasksRepository.save(task);
    }

    return this.createTaskWithGeneratedCode(taskPayload);
  }

  async update(
    taskId: string,
    dto: UpdateTaskDto,
    actor: {
      id: string;
      role: 'manager' | 'lead' | 'worker';
      specialty?: ProjectScope | null;
      specialties?: ProjectScope[] | null;
    },
  ) {
    const leadSpecialties = await this.resolveLeadSpecialties(actor);
    const task = await this.tasksRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const project = await this.projectsRepository.findOne({
      where: { id: task.projectId },
    });
    if (actor.role === 'lead') {
      const isLeadAssignee = task.assigneeId === actor.id;

      if (!isLeadAssignee) {
        if (leadSpecialties.length === 0) {
          throw new ForbiddenException('Lead specialty is required');
        }

        if (!project?.scope || !leadSpecialties.includes(project.scope)) {
          throw new ForbiddenException(
            'Leads can only update tasks within their specialties',
          );
        }
      }
    }

    if (actor.role === 'worker' && task.assigneeId !== actor.id) {
      throw new ForbiddenException('Workers can only update their own tasks');
    }

    if (
      actor.role === 'worker' &&
      (
        dto.description !== undefined ||
        dto.dueDate !== undefined ||
        dto.estimatedHours !== undefined
      )
    ) {
      throw new ForbiddenException(
        'Workers cannot edit task description, due date, or estimated hours',
      );
    }

    const {
      handoffToUserId,
      handoffMessage,
      nextActivityType,
      nextTitle,
      nextDueDate,
      nextEstimatedHours,
      ...taskFields
    } = dto;

    const before = {
      title: task.title,
      description: task.description ?? null,
      assigneeId: task.assigneeId ?? null,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate ?? null,
    };

    if (dto.status === 'done' && task.status === 'blocked') {
      throw new ForbiddenException(
        'Blocked tasks cannot be completed before previous steps are done',
      );
    }

    Object.assign(task, taskFields);
    if (taskFields.status === 'done' && before.status !== 'done') {
      task.completedAt = new Date();
    }
    const savedTask = await this.tasksRepository.save(task);

    if (actor.role === 'manager') {
      const changes: Record<string, { before: unknown; after: unknown }> = {};

      if (taskFields.title !== undefined && before.title !== savedTask.title) {
        changes.title = { before: before.title, after: savedTask.title };
      }

      const resolvedDescription = savedTask.description ?? null;
      if (
        taskFields.description !== undefined &&
        before.description !== resolvedDescription
      ) {
        changes.description = {
          before: before.description,
          after: resolvedDescription,
        };
      }

      const resolvedAssignee = savedTask.assigneeId ?? null;
      if (
        taskFields.assigneeId !== undefined &&
        before.assigneeId !== resolvedAssignee
      ) {
        changes.assigneeId = {
          before: before.assigneeId,
          after: resolvedAssignee,
        };
      }

      if (taskFields.status !== undefined && before.status !== savedTask.status) {
        changes.status = { before: before.status, after: savedTask.status };
      }

      if (
        taskFields.priority !== undefined &&
        before.priority !== savedTask.priority
      ) {
        changes.priority = { before: before.priority, after: savedTask.priority };
      }

      const resolvedDueDate = savedTask.dueDate ?? null;
      if (taskFields.dueDate !== undefined && before.dueDate !== resolvedDueDate) {
        changes.dueDate = { before: before.dueDate, after: resolvedDueDate };
      }

      if (Object.keys(changes).length > 0) {
        await this.recordManagerAudit({
          actorId: actor.id,
          action: 'task_updated',
          entityType: 'task',
          entityId: savedTask.id,
          entityLabel: `${savedTask.code} - ${savedTask.title}`,
          changes,
        });
      }
    }

    if (taskFields.status === 'done' && handoffToUserId) {
      const consequentActivityType = nextActivityType ?? task.activityType;
      const consequentTask = await this.createTaskWithGeneratedCode({
        projectId: task.projectId,
        parentTaskId: task.parentTaskId ?? task.id,
        activityType: consequentActivityType,
        title: nextTitle?.trim().length
          ? nextTitle
          : `Continuacion de ${task.title}`,
        description: handoffMessage?.trim().length
          ? handoffMessage
          : `Actividad creada al finalizar ${task.code}.`,
        assigneeId: handoffToUserId,
        createdBy: actor.id,
        status: 'todo',
        priority: task.priority,
        dueDate: nextDueDate ?? task.dueDate,
        estimatedHours:
          typeof nextEstimatedHours === 'number'
            ? String(nextEstimatedHours)
            : task.estimatedHours,
      });

      const notification = this.notificationsRepository.create({
        userId: handoffToUserId,
        taskId: consequentTask.id,
        title: 'Nueva tarea subsecuente asignada',
        message: `Se te asigno ${consequentTask.title} como continuidad de ${task.code}.`,
        isRead: false,
      });

      await this.notificationsRepository.save(notification);

      const today = new Date().toISOString().slice(0, 10);
      const consequentAssigneeLabel = handoffToUserId.slice(0, 8);
      const continuityComment = handoffMessage?.trim().length
        ? `Tarea finalizada y derivada a ${consequentTask.code} para ${consequentAssigneeLabel}. Nota: ${handoffMessage}`
        : `Tarea finalizada y derivada a ${consequentTask.code} para ${consequentAssigneeLabel}.`;

      const continuityUpdate = this.taskUpdatesRepository.create({
        taskId: task.id,
        userId: actor.id,
        updateDate: today,
        workedHours: '0',
        progressPercent: '100',
        comments: continuityComment,
      });

      const existingContinuityUpdate = await this.taskUpdatesRepository.findOne({
        where: {
          taskId: task.id,
          userId: actor.id,
          updateDate: today,
        },
      });

      if (existingContinuityUpdate) {
        const previousComments = existingContinuityUpdate.comments?.trim() ?? '';
        existingContinuityUpdate.workedHours = '0';
        existingContinuityUpdate.progressPercent = '100';
        existingContinuityUpdate.comments = previousComments.length > 0
          ? `${previousComments}\n${continuityComment}`
          : continuityComment;

        await this.taskUpdatesRepository.save(existingContinuityUpdate);
      } else {
        await this.taskUpdatesRepository.save(continuityUpdate);
      }
    }

    if (before.status !== 'done' && savedTask.status === 'done' && savedTask.chainId) {
      const nextTask = await this.tasksRepository.findOne({
        where: {
          chainId: savedTask.chainId,
          chainOrder: (savedTask.chainOrder ?? 0) + 1,
        },
      });

      if (nextTask && nextTask.status === 'blocked') {
        nextTask.status = 'todo';
        nextTask.activatedAt = new Date();
        await this.tasksRepository.save(nextTask);

        if (nextTask.assigneeId) {
          const nextNotification = this.notificationsRepository.create({
            userId: nextTask.assigneeId,
            taskId: nextTask.id,
            title: 'Siguiente paso activado',
            message: `Ya puedes iniciar ${nextTask.title}. El paso anterior del flujo fue completado.`,
            isRead: false,
          });
          await this.notificationsRepository.save(nextNotification);
        }
      }

      if (!nextTask) {
        const chainCreatorTask = await this.tasksRepository.findOne({
          where: {
            chainId: savedTask.chainId,
            chainOrder: 1,
          },
        });

        if (chainCreatorTask?.createdBy) {
          const completionNotification = this.notificationsRepository.create({
            userId: chainCreatorTask.createdBy,
            taskId: savedTask.id,
            title: 'Flujo completado',
            message: `La cadena ${savedTask.chainId.slice(0, 8)} se completo exitosamente.`,
            isRead: false,
          });
          await this.notificationsRepository.save(completionNotification);
        }
      }
    }

    return savedTask;
  }

  async remove(
    taskId: string,
    actor: {
      id: string;
      role: 'manager' | 'lead' | 'worker';
    },
  ) {
    const task = await this.tasksRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (actor.role !== 'manager' && task.createdBy !== actor.id) {
      throw new ForbiddenException(
        'Users can only delete tasks created by themselves',
      );
    }

    await this.tasksRepository.delete({ id: taskId });
    return { deleted: true, taskId };
  }
}
