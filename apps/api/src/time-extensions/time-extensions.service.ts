import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuditLogEntity } from '../database/entities/audit-log.entity';
import { NotificationEntity } from '../database/entities/notification.entity';
import { TaskEntity } from '../database/entities/task.entity';
import { TaskUpdateEntity } from '../database/entities/task-update.entity';
import {
  TimeExtensionRequestEntity,
  TimeExtensionStatus,
} from '../database/entities/time-extension-request.entity';
import { UserEntity } from '../database/entities/user.entity';
import { CreateTimeExtensionRequestDto } from './dto/create-time-extension-request.dto';
import { ApproveTimeExtensionDto } from './dto/approve-time-extension.dto';
import { RejectTimeExtensionDto } from './dto/reject-time-extension.dto';

type Actor = { id: string; role: 'manager' | 'lead' | 'worker' };

export const REQUEST_NOTIFICATION_TYPE = 'time_extension_request';
export const DECISION_NOTIFICATION_TYPE = 'time_extension_decision';
export const INFO_NOTIFICATION_TYPE = 'time_extension_info';

const hoursLabel = (value: number) => `${Number(value.toFixed(2))} h`;

@Injectable()
export class TimeExtensionsService {
  private readonly logger = new Logger(TimeExtensionsService.name);

  constructor(
    @InjectRepository(TimeExtensionRequestEntity)
    private readonly requestsRepository: Repository<TimeExtensionRequestEntity>,
    @InjectRepository(TaskEntity)
    private readonly tasksRepository: Repository<TaskEntity>,
    @InjectRepository(TaskUpdateEntity)
    private readonly taskUpdatesRepository: Repository<TaskUpdateEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(NotificationEntity)
    private readonly notificationsRepository: Repository<NotificationEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditLogsRepository: Repository<AuditLogEntity>,
  ) {}

  /** Hours the assignee may spend: original estimate plus approved extras. */
  authorizedHours(
    task: Pick<TaskEntity, 'estimatedHours' | 'authorizedExtraHours'>,
  ) {
    return (
      Number(task.estimatedHours || 0) + Number(task.authorizedExtraHours || 0)
    );
  }

  /**
   * Same definition as the deviation report: manual hours plus the timer
   * total, where the timer total is the larger of the task's own counter and
   * what the ledger already holds (covers time tracked before the ledger).
   */
  private async loggedHours(task: TaskEntity) {
    const row = await this.taskUpdatesRepository
      .createQueryBuilder('update')
      .select('COALESCE(SUM(update.worked_hours), 0)', 'manual')
      .addSelect('COALESCE(SUM(update.timer_seconds), 0)', 'timer')
      .where('update.task_id = :taskId', { taskId: task.id })
      .getRawOne<{ manual: string; timer: string }>();
    const timerSeconds = Math.max(
      Number(task.activeSeconds ?? 0),
      Number(row?.timer ?? 0),
    );
    return Number(row?.manual ?? 0) + timerSeconds / 3600;
  }

  private async notifyManagers(
    request: TimeExtensionRequestEntity,
    task: TaskEntity,
    requester: UserEntity | null,
  ) {
    const managers = await this.usersRepository.find({
      where: { role: 'manager', isActive: true },
    });
    const recipients = managers.filter((m) => m.id !== request.requestedBy);
    if (recipients.length === 0) {
      return;
    }

    const who = requester?.fullName ?? 'Un colaborador';
    const message =
      `${who} solicita ${hoursLabel(Number(request.requestedHours))} adicionales en ` +
      `${task.code} - ${task.title}. Motivo: ${request.reason}`;

    await this.notificationsRepository.save(
      recipients.map((manager) =>
        this.notificationsRepository.create({
          userId: manager.id,
          taskId: task.id,
          requestId: request.id,
          type: REQUEST_NOTIFICATION_TYPE,
          title: 'Solicitud de horas adicionales',
          message,
          isRead: false,
        }),
      ),
    );
  }

  async create(dto: CreateTimeExtensionRequestDto, actor: Actor) {
    const task = await this.tasksRepository.findOne({
      where: { id: dto.taskId },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    if (actor.role !== 'manager' && task.assigneeId !== actor.id) {
      throw new ForbiddenException(
        'Only the assignee can request more hours for a task',
      );
    }

    const pending = await this.requestsRepository.findOne({
      where: { taskId: task.id, status: 'pending' },
    });
    if (pending) {
      throw new ConflictException(
        'Esta tarea ya tiene una solicitud de horas pendiente',
      );
    }

    const request = await this.requestsRepository.save(
      this.requestsRepository.create({
        taskId: task.id,
        requestedBy: actor.id,
        requestedHours: String(dto.requestedHours),
        reason: dto.reason.trim(),
        source: 'manual',
        status: 'pending',
      }),
    );

    const requester = await this.usersRepository.findOne({
      where: { id: actor.id },
    });
    await this.notifyManagers(request, task, requester);
    return request;
  }

  /**
   * Called when a task's timer stops or the task closes. If logged hours went
   * past the authorized total and nobody has asked yet, opens a request for
   * the managers. Skipped when the last request is still pending or was
   * rejected (the manager already answered); the assignee can still ask again
   * manually.
   */
  async flagOverrunIfNeeded(taskId: string) {
    try {
      const task = await this.tasksRepository.findOne({
        where: { id: taskId },
      });
      if (!task?.assigneeId || Number(task.estimatedHours || 0) <= 0) {
        return null;
      }

      const cap = this.authorizedHours(task);
      const logged = await this.loggedHours(task);
      if (logged <= cap) {
        return null;
      }

      const last = await this.requestsRepository.findOne({
        where: { taskId: task.id },
        order: { createdAt: 'DESC' },
      });
      if (last && (last.status === 'pending' || last.status === 'rejected')) {
        return null;
      }

      const overage = Math.max(0.5, Math.ceil((logged - cap) * 2) / 2);
      const request = await this.requestsRepository.save(
        this.requestsRepository.create({
          taskId: task.id,
          requestedBy: task.assigneeId,
          requestedHours: String(overage),
          reason: `Generada automáticamente: se registraron ${hoursLabel(logged)} contra ${hoursLabel(cap)} autorizadas.`,
          source: 'auto',
          status: 'pending',
        }),
      );

      const requester = await this.usersRepository.findOne({
        where: { id: task.assigneeId },
      });
      await this.notifyManagers(request, task, requester);
      await this.notificationsRepository.save(
        this.notificationsRepository.create({
          userId: task.assigneeId,
          taskId: task.id,
          requestId: request.id,
          type: INFO_NOTIFICATION_TYPE,
          title: 'Superaste el tiempo autorizado',
          message: `${task.code} lleva ${hoursLabel(logged)} de ${hoursLabel(cap)} autorizadas. Se pidió autorización a gerencia por ${hoursLabel(overage)}.`,
          isRead: false,
        }),
      );
      return request;
    } catch (error) {
      // A failure here must never block pausing or closing a task.
      this.logger.warn(
        `Overrun check failed for task ${taskId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  async findAll(status: TimeExtensionStatus | undefined, actor: Actor) {
    const where: Record<string, unknown> = {};
    if (status) {
      where.status = status;
    }
    if (actor.role !== 'manager') {
      where.requestedBy = actor.id;
    }

    const requests = await this.requestsRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: 200,
    });
    if (requests.length === 0) {
      return [];
    }

    const tasks = await this.tasksRepository.find({
      where: { id: In([...new Set(requests.map((r) => r.taskId))]) },
    });
    const users = await this.usersRepository.find({
      where: { id: In([...new Set(requests.map((r) => r.requestedBy))]) },
    });
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const userById = new Map(users.map((u) => [u.id, u]));

    return requests.map((request) => {
      const task = taskById.get(request.taskId);
      return {
        ...request,
        taskCode: task?.code ?? null,
        taskTitle: task?.title ?? null,
        taskEstimatedHours: task?.estimatedHours ?? null,
        taskAuthorizedExtraHours: task?.authorizedExtraHours ?? null,
        requesterName: userById.get(request.requestedBy)?.fullName ?? null,
      };
    });
  }

  private async loadPending(requestId: string) {
    const request = await this.requestsRepository.findOne({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException('Request not found');
    }
    if (request.status !== 'pending') {
      throw new ConflictException('Esta solicitud ya fue resuelta');
    }
    const task = await this.tasksRepository.findOne({
      where: { id: request.taskId },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return { request, task };
  }

  private async recordAudit(
    actorId: string,
    action: string,
    task: TaskEntity,
    changes: Record<string, { before: unknown; after: unknown }>,
  ) {
    const actor = await this.usersRepository.findOne({
      where: { id: actorId },
    });
    try {
      await this.auditLogsRepository.save(
        this.auditLogsRepository.create({
          actorId,
          actorRole: 'manager',
          actorEmail: actor?.email,
          action,
          entityType: 'task',
          entityId: task.id,
          entityLabel: `${task.code} - ${task.title}`.slice(0, 220),
          changesJson: changes,
        }),
      );
    } catch {
      this.logger.warn(`Audit log skipped for ${action} on ${task.id}`);
    }
  }

  private async closeManagerNotifications(requestId: string) {
    await this.notificationsRepository
      .createQueryBuilder()
      .update(NotificationEntity)
      .set({ isRead: true, readAt: new Date() })
      .where('request_id = :requestId', { requestId })
      .andWhere('type = :type', { type: REQUEST_NOTIFICATION_TYPE })
      .andWhere('is_read = false')
      .execute();
  }

  async approve(requestId: string, dto: ApproveTimeExtensionDto, actor: Actor) {
    if (actor.role !== 'manager') {
      throw new ForbiddenException('Only managers can authorize more hours');
    }
    const { request, task } = await this.loadPending(requestId);

    const granted = dto.approvedHours ?? Number(request.requestedHours);
    if (!Number.isFinite(granted) || granted <= 0) {
      throw new BadRequestException('approvedHours must be greater than 0');
    }

    const before = Number(task.authorizedExtraHours || 0);
    const after = Number((before + granted).toFixed(2));

    await this.tasksRepository.manager.transaction(async (manager) => {
      task.authorizedExtraHours = String(after);
      await manager.getRepository(TaskEntity).save(task);

      request.status = 'approved';
      request.approvedHours = String(granted);
      request.decidedBy = actor.id;
      request.decidedAt = new Date();
      request.decisionNote = dto.note?.trim() || null;
      await manager.getRepository(TimeExtensionRequestEntity).save(request);
    });

    await this.recordAudit(actor.id, 'time_extension_approved', task, {
      authorizedExtraHours: { before, after },
    });
    await this.closeManagerNotifications(request.id);
    await this.notificationsRepository.save(
      this.notificationsRepository.create({
        userId: request.requestedBy,
        taskId: task.id,
        requestId: request.id,
        type: DECISION_NOTIFICATION_TYPE,
        title: 'Horas adicionales autorizadas',
        message:
          `Gerencia autorizó ${hoursLabel(granted)} adicionales en ${task.code} - ${task.title}.` +
          (request.decisionNote ? ` Nota: ${request.decisionNote}` : ''),
        isRead: false,
      }),
    );

    return request;
  }

  async reject(requestId: string, dto: RejectTimeExtensionDto, actor: Actor) {
    if (actor.role !== 'manager') {
      throw new ForbiddenException('Only managers can authorize more hours');
    }
    const { request, task } = await this.loadPending(requestId);

    request.status = 'rejected';
    request.decidedBy = actor.id;
    request.decidedAt = new Date();
    request.decisionNote = dto.note.trim();
    await this.requestsRepository.save(request);

    await this.recordAudit(actor.id, 'time_extension_rejected', task, {
      timeExtensionRequest: {
        before: `pending (${hoursLabel(Number(request.requestedHours))})`,
        after: 'rejected',
      },
    });
    await this.closeManagerNotifications(request.id);
    await this.notificationsRepository.save(
      this.notificationsRepository.create({
        userId: request.requestedBy,
        taskId: task.id,
        requestId: request.id,
        type: DECISION_NOTIFICATION_TYPE,
        title: 'Horas adicionales no autorizadas',
        message: `Gerencia no autorizó horas adicionales en ${task.code} - ${task.title}. Motivo: ${request.decisionNote}`,
        isRead: false,
      }),
    );

    return request;
  }
}
