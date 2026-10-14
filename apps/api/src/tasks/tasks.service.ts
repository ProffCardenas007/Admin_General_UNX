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
import { MarkTaskNotCompletedDto } from './dto/mark-task-not-completed.dto';
import { ProjectScope, normalizeLeadSpecialties } from '../common/specialties';
import { todayKey } from '../common/dates';
import { TimeExtensionsService } from '../time-extensions/time-extensions.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
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
    private readonly timeExtensionsService: TimeExtensionsService,
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
        `Audit log skipped for task action ${input.action} on ${input.entityId}`,
      );
    }
  }

  private elapsedTimerSeconds(task: TaskEntity) {
    if (!task.timerStartedAt) {
      return 0;
    }

    return Math.max(
      0,
      Math.round((Date.now() - task.timerStartedAt.getTime()) / 1000),
    );
  }

  /**
   * Credits time measured by the task timer to the daily hours ledger
   * (task_updates), so dashboard and reports share one source of real hours.
   */
  private async recordTimerSeconds(
    taskId: string,
    userId: string | null | undefined,
    seconds: number,
    updatesRepository: Repository<TaskUpdateEntity> = this.taskUpdatesRepository,
  ) {
    if (!userId || seconds <= 0) {
      return;
    }

    const updateDate = todayKey();
    const existing = await updatesRepository.findOne({
      where: { taskId, userId, updateDate },
    });

    if (existing) {
      existing.timerSeconds = (existing.timerSeconds ?? 0) + seconds;
      await updatesRepository.save(existing);
      return;
    }

    const latest = await updatesRepository.findOne({
      where: { taskId, userId },
      order: { updateDate: 'DESC', createdAt: 'DESC' },
    });

    await updatesRepository.save(
      updatesRepository.create({
        taskId,
        userId,
        updateDate,
        workedHours: '0',
        timerSeconds: seconds,
        progressPercent: latest?.progressPercent ?? '0',
      }),
    );
  }

  /**
   * Tells each assignee about tasks given to them by someone else. Self-assigned
   * tasks do not notify. Runs on the caller's repository so it can share a
   * transaction with the task writes.
   */
  private async notifyAssignees(
    tasks: TaskEntity[],
    actorId: string,
    notificationsRepository: Repository<NotificationEntity> = this
      .notificationsRepository,
    kind: 'assigned' | 'reassigned' = 'assigned',
  ) {
    const recipients = tasks.filter(
      (task) => task.assigneeId && task.assigneeId !== actorId,
    );
    if (recipients.length === 0) {
      return;
    }

    await notificationsRepository.save(
      recipients.map((task) =>
        notificationsRepository.create({
          userId: task.assigneeId as string,
          taskId: task.id,
          title: kind === 'assigned' ? 'Nueva tarea asignada' : 'Tarea reasignada',
          message:
            `${kind === 'assigned' ? 'Se te asigno' : 'Se te reasigno'} ${task.code} - ${task.title}.` +
            (task.dueDate ? ` Vence ${task.dueDate}.` : ''),
          isRead: false,
        }),
      ),
    );
  }

  private async hasLoggedTime(task: TaskEntity) {
    if ((task.activeSeconds ?? 0) > 0 || task.timerStartedAt) {
      return true;
    }

    const loggedRows = await this.taskUpdatesRepository
      .createQueryBuilder('update')
      .where('update.task_id = :taskId', { taskId: task.id })
      .andWhere('(update.worked_hours > 0 OR update.timer_seconds > 0)')
      .getCount();
    return loggedRows > 0;
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
    tasksRepository: Repository<TaskEntity> = this.tasksRepository,
  ) {
    const prefix = this.activityCodePrefix(activityType);
    const rows = await tasksRepository
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
      status: 'todo' | 'doing' | 'paused' | 'blocked' | 'done';
      priority: 'low' | 'medium' | 'high' | 'urgent';
      dueDate?: string;
      estimatedHours: string;
      activatedAt?: Date;
    },
    maxAttempts = 5,
    tasksRepository: Repository<TaskEntity> = this.tasksRepository,
  ) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const generatedCode = await this.buildGeneratedCode(
        input.projectId,
        input.activityType,
        tasksRepository,
      );

      const task = tasksRepository.create({
        ...input,
        code: generatedCode,
      });

      try {
        return await tasksRepository.manager.transaction((manager) =>
          manager.getRepository(TaskEntity).save(task),
        );
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

    return this.tasksRepository.manager.transaction(async (manager) => {
      const transactionalTasksRepository = manager.getRepository(TaskEntity);
      const transactionalNotificationsRepository =
        manager.getRepository(NotificationEntity);
      const chainId = randomUUID();
      const chainTasks: TaskEntity[] = [];

      for (let index = 0; index < dto.steps.length; index += 1) {
        const step = dto.steps[index];
        const isFirst = index === 0;
        const previousTask = chainTasks[chainTasks.length - 1];
        const createdTask = await this.createTaskWithGeneratedCode(
          {
            projectId: dto.projectId,
            parentTaskId: isFirst ? undefined : previousTask?.id,
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
          },
          5,
          transactionalTasksRepository,
        );

        chainTasks.push(createdTask);
      }

      const firstTask = chainTasks[0];
      if (firstTask.assigneeId) {
        const firstNotification = transactionalNotificationsRepository.create({
          userId: firstTask.assigneeId,
          taskId: firstTask.id,
          title: 'Nueva tarea de flujo asignada',
          message: `Se te asigno ${firstTask.title}. Es el primer paso de un flujo de ${chainTasks.length} tareas.`,
          isRead: false,
        });
        await transactionalNotificationsRepository.save(firstNotification);
      }

      return {
        chainId,
        projectId: dto.projectId,
        totalSteps: chainTasks.length,
        tasks: chainTasks,
      };
    });
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

      // All-or-nothing: a failure on the 3rd member must not leave 2 orphan tasks.
      const createdTasks = await this.tasksRepository.manager.transaction(
        async (manager) => {
          const transactionalTasks = manager.getRepository(TaskEntity);
          const created: TaskEntity[] = [];
          for (const member of activeMembers) {
            created.push(
              await this.createTaskWithGeneratedCode(
                {
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
                },
                5,
                transactionalTasks,
              ),
            );
          }

          await this.notifyAssignees(
            created,
            actor.id,
            manager.getRepository(NotificationEntity),
          );
          return created;
        },
      );

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

    return this.tasksRepository.manager.transaction(async (manager) => {
      const transactionalTasks = manager.getRepository(TaskEntity);
      let created: TaskEntity;

      if (dto.code?.trim().length) {
        try {
          created = await transactionalTasks.save(
            transactionalTasks.create({
              ...taskPayload,
              code: dto.code.trim(),
            }),
          );
        } catch (error) {
          if (this.isTaskCodeConflict(error)) {
            throw new ConflictException(
              'Ya existe una tarea con ese codigo en el proyecto. Usa otro o deja el campo vacio para generarlo.',
            );
          }
          throw error;
        }
      } else {
        created = await this.createTaskWithGeneratedCode(
          taskPayload,
          5,
          transactionalTasks,
        );
      }

      await this.notifyAssignees(
        [created],
        actor.id,
        manager.getRepository(NotificationEntity),
      );
      return created;
    });
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

    if (dto.projectId !== undefined && actor.role !== 'manager') {
      throw new ForbiddenException(
        'Only managers can move tasks between projects',
      );
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
        dto.projectId !== undefined ||
        dto.title !== undefined ||
        dto.description !== undefined ||
        dto.activityType !== undefined ||
        dto.assigneeId !== undefined ||
        dto.priority !== undefined ||
        dto.dueDate !== undefined ||
        dto.estimatedHours !== undefined
      )
    ) {
      throw new ForbiddenException(
        'Workers cannot edit task planning fields',
      );
    }

    if (dto.projectId !== undefined && dto.projectId !== task.projectId) {
      const destinationProject = await this.projectsRepository.findOne({
        where: { id: dto.projectId },
      });
      if (!destinationProject) {
        throw new NotFoundException('Destination project not found');
      }
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
      projectId: task.projectId,
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
      task.completionOutcome = 'completed';
    } else if (taskFields.status !== undefined && taskFields.status !== 'done') {
      task.completedAt = null;
      task.completionOutcome = null;
    }

    let stoppedTimerSeconds = 0;
    if (
      taskFields.status !== undefined &&
      taskFields.status !== before.status
    ) {
      if (taskFields.status === 'doing') {
        task.timerStartedAt = new Date();
      } else if (before.status === 'doing' && task.timerStartedAt) {
        stoppedTimerSeconds = this.elapsedTimerSeconds(task);
        task.activeSeconds = (task.activeSeconds ?? 0) + stoppedTimerSeconds;
        task.timerStartedAt = null;
      }
    }

    const completedNow = taskFields.status === 'done' && before.status !== 'done';
    const startedNow = taskFields.status === 'doing' && before.status !== 'doing';
    const autoPaused: TaskEntity[] = [];
    const reassignedTo =
      taskFields.assigneeId && taskFields.assigneeId !== before.assigneeId
        ? taskFields.assigneeId
        : null;

    // The task, its hours, the handoff task, the chain step and every
    // notification commit together or not at all.
    const savedTask = await this.tasksRepository.manager.transaction(
      async (manager) => {
        const transactionalTasks = manager.getRepository(TaskEntity);
        const transactionalNotifications =
          manager.getRepository(NotificationEntity);
        const transactionalUpdates = manager.getRepository(TaskUpdateEntity);

        const saved = await transactionalTasks.save(task);
        await this.recordTimerSeconds(
          saved.id,
          before.assigneeId,
          stoppedTimerSeconds,
          transactionalUpdates,
        );

        if (startedNow && saved.assigneeId) {
          // One person, one running timer. Starting this task pauses whatever
          // else they had running and banks the time it had accumulated, so
          // hours are never counted twice and nothing is lost.
          const alsoRunning = await transactionalTasks.find({
            where: { assigneeId: saved.assigneeId, status: 'doing' },
          });
          for (const other of alsoRunning) {
            if (other.id === saved.id) {
              continue;
            }
            const seconds = this.elapsedTimerSeconds(other);
            other.activeSeconds = (other.activeSeconds ?? 0) + seconds;
            other.timerStartedAt = null;
            other.status = 'paused';
            await transactionalTasks.save(other);
            await this.recordTimerSeconds(
              other.id,
              other.assigneeId,
              seconds,
              transactionalUpdates,
            );
            autoPaused.push(other);
          }
        }

        if (reassignedTo) {
          await this.notifyAssignees(
            [saved],
            actor.id,
            transactionalNotifications,
            'reassigned',
          );
        }

        if (taskFields.status === 'done' && handoffToUserId) {
          const consequentTask = await this.createTaskWithGeneratedCode(
            {
              projectId: task.projectId,
              parentTaskId: task.parentTaskId ?? task.id,
              activityType: nextActivityType ?? task.activityType,
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
            },
            5,
            transactionalTasks,
          );

          await transactionalNotifications.save(
            transactionalNotifications.create({
              userId: handoffToUserId,
              taskId: consequentTask.id,
              title: 'Nueva tarea subsecuente asignada',
              message: `Se te asigno ${consequentTask.title} como continuidad de ${task.code}.`,
              isRead: false,
            }),
          );

          const today = todayKey();
          const consequentAssigneeLabel = handoffToUserId.slice(0, 8);
          const continuityComment = handoffMessage?.trim().length
            ? `Tarea finalizada y derivada a ${consequentTask.code} para ${consequentAssigneeLabel}. Nota: ${handoffMessage}`
            : `Tarea finalizada y derivada a ${consequentTask.code} para ${consequentAssigneeLabel}.`;

          const existingContinuityUpdate = await transactionalUpdates.findOne({
            where: { taskId: task.id, userId: actor.id, updateDate: today },
          });

          if (existingContinuityUpdate) {
            // Keep the hours already logged today; only append the note.
            const previousComments =
              existingContinuityUpdate.comments?.trim() ?? '';
            existingContinuityUpdate.progressPercent = '100';
            existingContinuityUpdate.comments =
              previousComments.length > 0
                ? `${previousComments}\n${continuityComment}`
                : continuityComment;
            await transactionalUpdates.save(existingContinuityUpdate);
          } else {
            await transactionalUpdates.save(
              transactionalUpdates.create({
                taskId: task.id,
                userId: actor.id,
                updateDate: today,
                workedHours: '0',
                progressPercent: '100',
                comments: continuityComment,
              }),
            );
          }
        }

        if (completedNow && saved.chainId) {
          const nextTask = await transactionalTasks.findOne({
            where: {
              chainId: saved.chainId,
              chainOrder: (saved.chainOrder ?? 0) + 1,
            },
          });

          if (nextTask && nextTask.status === 'blocked') {
            nextTask.status = 'todo';
            nextTask.activatedAt = new Date();
            await transactionalTasks.save(nextTask);

            if (nextTask.assigneeId) {
              await transactionalNotifications.save(
                transactionalNotifications.create({
                  userId: nextTask.assigneeId,
                  taskId: nextTask.id,
                  title: 'Siguiente paso activado',
                  message: `Ya puedes iniciar ${nextTask.title}. El paso anterior del flujo fue completado.`,
                  isRead: false,
                }),
              );
            }
          }

          if (!nextTask) {
            const chainCreatorTask = await transactionalTasks.findOne({
              where: { chainId: saved.chainId, chainOrder: 1 },
            });

            if (chainCreatorTask?.createdBy) {
              await transactionalNotifications.save(
                transactionalNotifications.create({
                  userId: chainCreatorTask.createdBy,
                  taskId: saved.id,
                  title: 'Flujo completado',
                  message: `La cadena ${saved.chainId.slice(0, 8)} se completo exitosamente.`,
                  isRead: false,
                }),
              );
            }
          }
        }

        return saved;
      },
    );

    if (actor.role === 'manager') {
      const changes: Record<string, { before: unknown; after: unknown }> = {};

      if (
        taskFields.projectId !== undefined &&
        before.projectId !== savedTask.projectId
      ) {
        changes.projectId = {
          before: before.projectId,
          after: savedTask.projectId,
        };
      }

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

    if (stoppedTimerSeconds > 0 || completedNow) {
      await this.timeExtensionsService.flagOverrunIfNeeded(savedTask.id);
    }
    for (const paused of autoPaused) {
      await this.timeExtensionsService.flagOverrunIfNeeded(paused.id);
    }

    // Tell the client which of the person's other tasks were paused for it.
    return autoPaused.length > 0
      ? Object.assign(savedTask, { pausedTasks: autoPaused })
      : savedTask;
  }

  async markNotCompleted(
    taskId: string,
    dto: MarkTaskNotCompletedDto,
    actor: {
      id: string;
      role: 'manager' | 'lead' | 'worker';
      specialty?: ProjectScope | null;
      specialties?: ProjectScope[] | null;
    },
  ) {
    if (actor.role === 'worker') {
      throw new ForbiddenException(
        'Only managers and leads can mark tasks as not completed',
      );
    }

    const task = await this.tasksRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const project = await this.projectsRepository.findOne({
      where: { id: task.projectId },
    });
    if (actor.role === 'lead') {
      const leadSpecialties = await this.resolveLeadSpecialties(actor);
      const isLeadAssignee = task.assigneeId === actor.id;
      if (
        !isLeadAssignee &&
        (leadSpecialties.length === 0 ||
          !project?.scope ||
          !leadSpecialties.includes(project.scope))
      ) {
        throw new ForbiddenException(
          'Leads can only update tasks within their specialties',
        );
      }
    }

    if (!task.assigneeId) {
      throw new BadRequestException(
        'The task must have an assignee before it can be marked as not completed',
      );
    }

    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('A non-completion reason is required');
    }
    const previousAssigneeId = task.assigneeId;
    let reassignedUser: UserEntity | null = null;

    if (dto.reassignToUserId) {
      if (dto.reassignToUserId === task.assigneeId) {
        throw new BadRequestException('Select a different assignee');
      }
      reassignedUser = await this.usersRepository.findOne({
        where: { id: dto.reassignToUserId, isActive: true },
      });
      if (!reassignedUser) {
        throw new NotFoundException('Reassignment user not found');
      }
    }

    let stoppedTimerSeconds = 0;
    if (task.status === 'doing' && task.timerStartedAt) {
      stoppedTimerSeconds = this.elapsedTimerSeconds(task);
      task.activeSeconds = (task.activeSeconds ?? 0) + stoppedTimerSeconds;
    }
    task.timerStartedAt = null;

    if (reassignedUser) {
      task.assigneeId = reassignedUser.id;
      task.status = 'todo';
      task.completedAt = null;
      task.completionOutcome = null;
    } else {
      task.status = 'done';
      task.completedAt = new Date();
      task.completionOutcome = 'not_completed';
    }

    const today = todayKey();
    const historyMessage = reassignedUser
      ? `Tarea no completada. Motivo: ${reason}. Reasignada a ${reassignedUser.fullName}.`
      : `Tarea no completada. Motivo: ${reason}.`;
    const savedTask = await this.tasksRepository.manager.transaction(
      async (manager) => {
        const transactionalTasksRepository = manager.getRepository(TaskEntity);
        const transactionalUpdatesRepository =
          manager.getRepository(TaskUpdateEntity);
        const saved = await transactionalTasksRepository.save(task);
        await this.recordTimerSeconds(
          task.id,
          previousAssigneeId,
          stoppedTimerSeconds,
          transactionalUpdatesRepository,
        );
        if (reassignedUser) {
          await this.notifyAssignees(
            [saved],
            actor.id,
            manager.getRepository(NotificationEntity),
            'reassigned',
          );
        }
        const existingUpdate = await transactionalUpdatesRepository.findOne({
          where: {
            taskId: task.id,
            userId: previousAssigneeId,
            updateDate: today,
          },
        });

        if (existingUpdate) {
          existingUpdate.blockerReason = existingUpdate.blockerReason || reason;
          existingUpdate.comments = existingUpdate.comments
            ? `${existingUpdate.comments}\n${historyMessage}`
            : historyMessage;
          await transactionalUpdatesRepository.save(existingUpdate);
        } else {
          const historyUpdate = transactionalUpdatesRepository.create({
            taskId: task.id,
            userId: previousAssigneeId,
            updateDate: today,
            workedHours: '0',
            progressPercent: '0',
            blockerReason: reason,
            comments: historyMessage,
          });
          await transactionalUpdatesRepository.save(historyUpdate);
        }

        return saved;
      },
    );

    if (stoppedTimerSeconds > 0) {
      await this.timeExtensionsService.flagOverrunIfNeeded(savedTask.id);
    }

    if (actor.role === 'manager') {
      await this.recordManagerAudit({
        actorId: actor.id,
        action: 'task_not_completed',
        entityType: 'task',
        entityId: savedTask.id,
        entityLabel: `${savedTask.code} - ${savedTask.title}`,
        changes: {
          completionOutcome: {
            before: null,
            after: reassignedUser ? 'reassigned' : 'not_completed',
          },
          assigneeId: {
            before: previousAssigneeId,
            after: savedTask.assigneeId ?? null,
          },
          reason: { before: null, after: reason },
        },
      });
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

    // Deleting cascades to task_updates and would erase logged hours from the
    // dashboard and reports, so tasks with time on them cannot be deleted.
    if (await this.hasLoggedTime(task)) {
      throw new ConflictException(
        'Esta tarea tiene horas registradas. Para no perder el historial de horas, marcala como no completada en lugar de borrarla.',
      );
    }

    await this.tasksRepository.delete({ id: taskId });
    return { deleted: true, taskId };
  }
}
