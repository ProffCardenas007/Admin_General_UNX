import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import { In, Repository } from 'typeorm';
import { TaskEntity } from '../database/entities/task.entity';
import { ProjectEntity } from '../database/entities/project.entity';
import { UserEntity } from '../database/entities/user.entity';
import { TaskUpdateEntity } from '../database/entities/task-update.entity';
import { normalizeLeadSpecialties } from '../common/specialties';
import type { TaskActivityType, TaskStatus } from '../database/entities/task.entity';

const ACTIVITY_WEIGHTS: Record<TaskActivityType, number> = {
  creacion: 10,
  grabacion: 5,
  presentaciones: 5,
  edicion: 3,
  revision: 3,
  plataforma: 2,
  administrativo: 2,
};

const ACTIVITY_TYPES = Object.keys(ACTIVITY_WEIGHTS) as TaskActivityType[];

const ACTIVITY_TYPE_LABELS: Record<TaskActivityType, string> = {
  creacion: 'Creación',
  grabacion: 'Grabación',
  presentaciones: 'Presentaciones',
  edicion: 'Edición',
  revision: 'Revisión',
  plataforma: 'Plataforma',
  administrativo: 'Administrativo',
};

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Por hacer',
  doing: 'En curso',
  paused: 'Pausada',
  blocked: 'Bloqueada',
  done: 'Finalizada',
};

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(TaskEntity)
    private readonly tasksRepository: Repository<TaskEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectsRepository: Repository<ProjectEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(TaskUpdateEntity)
    private readonly taskUpdatesRepository: Repository<TaskUpdateEntity>,
  ) {}

  async getUserPerformance(filters: { from?: string; to?: string }) {
    const from = this.validateDate(filters.from, 'from');
    const to = this.validateDate(filters.to, 'to');
    if ((from && !to) || (!from && to)) {
      throw new BadRequestException('Both from and to are required');
    }
    if (from && to && from > to) {
      throw new BadRequestException('from must be before or equal to to');
    }

    const users = (
      await this.usersRepository.find({
        where: { isActive: true },
        order: { fullName: 'ASC' },
      })
    ).filter((user) => user.role !== 'manager');

    const tasksQb = this.tasksRepository
      .createQueryBuilder('task')
      .where('task.assignee_id IS NOT NULL')
      .orderBy('task.created_at', 'DESC');

    if (from && to) {
      tasksQb.andWhere(
        `(
          (task.due_date >= :from AND task.due_date <= :to)
          OR (task.completed_at::date >= :from AND task.completed_at::date <= :to)
        )`,
        { from, to },
      );
    }

    const updatesQb = this.taskUpdatesRepository
      .createQueryBuilder('taskUpdate')
      .select('taskUpdate.user_id', 'userId')
      .addSelect('task.activity_type', 'activityType')
      .addSelect('COALESCE(SUM(taskUpdate.worked_hours), 0)', 'workedHours')
      .addSelect('COUNT(taskUpdate.id)', 'updatesCount')
      .innerJoin(TaskEntity, 'task', 'task.id = taskUpdate.task_id')
      .groupBy('taskUpdate.user_id')
      .addGroupBy('task.activity_type');

    if (from && to) {
      updatesQb.andWhere(
        'taskUpdate.update_date >= :from AND taskUpdate.update_date <= :to',
        { from, to },
      );
    }

    const [tasks, activityRows] = await Promise.all([
      tasksQb.getMany(),
      updatesQb.getRawMany<{
        userId: string;
        activityType: TaskActivityType;
        workedHours: string;
        updatesCount: string;
      }>(),
    ]);

    const rows = users.map((user) => {
      const userTasks = tasks.filter((task) => task.assigneeId === user.id);
      const activity = Object.fromEntries(
        ACTIVITY_TYPES.map((activityType) => [
          activityType,
          {
            weight: ACTIVITY_WEIGHTS[activityType],
            tasks: userTasks.filter(
              (task) => task.activityType === activityType,
            ).length,
            completed: userTasks.filter(
              (task) =>
                task.activityType === activityType &&
                task.status === 'done' &&
                task.completionOutcome !== 'not_completed',
            ).length,
            hours: 0,
            points: 0,
          },
        ]),
      ) as Record<
        TaskActivityType,
        {
          weight: number;
          tasks: number;
          completed: number;
          hours: number;
          points: number;
        }
      >;

      for (const activityRow of activityRows.filter(
        (row) => row.userId === user.id,
      )) {
        const hours = Number(activityRow.workedHours || 0);
        activity[activityRow.activityType].hours = hours;
        activity[activityRow.activityType].points = Number(
          (hours * ACTIVITY_WEIGHTS[activityRow.activityType]).toFixed(2),
        );
      }

      const workedHours = ACTIVITY_TYPES.reduce(
        (sum, activityType) => sum + activity[activityType].hours,
        0,
      );
      const points = ACTIVITY_TYPES.reduce(
        (sum, activityType) => sum + activity[activityType].points,
        0,
      );
      const completedTasks = userTasks.filter(
        (task) =>
          task.status === 'done' &&
          task.completionOutcome !== 'not_completed',
      ).length;
      const notCompletedTasks = userTasks.filter(
        (task) => task.completionOutcome === 'not_completed',
      ).length;

      return {
        userId: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        tasks: userTasks.length,
        openTasks: userTasks.filter((task) => task.status !== 'done').length,
        completedTasks,
        notCompletedTasks,
        completionRate:
          userTasks.length === 0
            ? 0
            : Number(((completedTasks / userTasks.length) * 100).toFixed(1)),
        estimatedHours: Number(
          userTasks
            .reduce((sum, task) => sum + Number(task.estimatedHours || 0), 0)
            .toFixed(2),
        ),
        workedHours: Number(workedHours.toFixed(2)),
        points: Number(points.toFixed(2)),
        activity,
      };
    });

    rows.sort(
      (left, right) =>
        right.points - left.points ||
        right.completedTasks - left.completedTasks ||
        left.fullName.localeCompare(right.fullName),
    );

    const rankedRows = rows.map((row, index) => ({ ...row, rank: index + 1 }));
    const divisor = rankedRows.length || 1;

    return {
      period: { from: from ?? null, to: to ?? null },
      weights: ACTIVITY_WEIGHTS,
      team: {
        users: rankedRows.length,
        averageHours: Number(
          (
            rankedRows.reduce((sum, row) => sum + row.workedHours, 0) /
            divisor
          ).toFixed(2),
        ),
        averagePoints: Number(
          (
            rankedRows.reduce((sum, row) => sum + row.points, 0) /
            divisor
          ).toFixed(2),
        ),
        totalCompletedTasks: rankedRows.reduce(
          (sum, row) => sum + row.completedTasks,
          0,
        ),
      },
      users: rankedRows,
    };
  }

  async buildTasksCsv(
    filters: { projectId?: string; status?: string },
    actor: {
      id: string;
      role: 'manager' | 'lead' | 'worker';
      specialty?: string | null;
      specialties?: string[] | null;
    },
  ) {
    const qb = this.tasksRepository.createQueryBuilder('task');
    const leadSpecialties = normalizeLeadSpecialties(
      actor.specialties ?? actor.specialty,
    );

    if (actor.role === 'worker') {
      qb.andWhere('task.assignee_id = :actorId', { actorId: actor.id });
    } else if (actor.role === 'lead') {
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

    if (filters.projectId) {
      qb.andWhere('task.project_id = :projectId', {
        projectId: filters.projectId,
      });
    }
    if (filters.status) {
      qb.andWhere('task.status = :status', { status: filters.status });
    }
    qb.orderBy('task.created_at', 'DESC');

    const tasks = await qb.getMany();
    const projectIds = [...new Set(tasks.map((task) => task.projectId))];
    const assigneeIds = [
      ...new Set(tasks.map((task) => task.assigneeId).filter(Boolean)),
    ] as string[];

    const projects = projectIds.length
      ? await this.projectsRepository.find({ where: { id: In(projectIds) } })
      : [];
    const users = assigneeIds.length
      ? await this.usersRepository.find({ where: { id: In(assigneeIds) } })
      : [];

    const projectById = new Map(
      projects.map((project) => [project.id, project]),
    );
    const userById = new Map(users.map((user) => [user.id, user]));

    const header = [
      'task_id',
      'task_code',
      'task_title',
      'project_code',
      'project_name',
      'assignee_email',
      'status',
      'priority',
      'due_date',
      'estimated_hours',
    ];

    const lines = tasks.map((task) => {
      const project = projectById.get(task.projectId);
      const assignee = task.assigneeId
        ? userById.get(task.assigneeId)
        : undefined;
      return [
        task.id,
        task.code,
        this.escapeCsv(task.title),
        project?.code ?? '',
        this.escapeCsv(project?.name ?? ''),
        assignee?.email ?? '',
        task.status,
        task.priority,
        task.dueDate ?? '',
        task.estimatedHours ?? '',
      ].join(',');
    });

    return [header.join(','), ...lines].join('\n');
  }

  async buildUserActivityExcel(
    userId: string,
    filters: { from?: string; to?: string },
    actor: {
      id: string;
      role: 'manager' | 'lead' | 'worker';
      specialty?: string | null;
      specialties?: string[] | null;
    },
  ) {
    const from = this.validateDate(filters.from, 'from');
    const to = this.validateDate(filters.to, 'to');
    if (!from || !to) {
      throw new BadRequestException('Both from and to are required');
    }
    if (from > to) {
      throw new BadRequestException('from must be before or equal to to');
    }

    if (actor.role === 'worker' && actor.id !== userId) {
      throw new ForbiddenException(
        'Workers can only export their own activity',
      );
    }

    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const qb = this.taskUpdatesRepository
      .createQueryBuilder('update')
      .innerJoin(TaskEntity, 'task', 'task.id = update.task_id')
      .innerJoin(ProjectEntity, 'project', 'project.id = task.project_id')
      .where('update.user_id = :userId', { userId })
      .andWhere('update.update_date >= :from AND update.update_date <= :to', {
        from,
        to,
      })
      .orderBy('update.update_date', 'ASC')
      .addOrderBy('update.created_at', 'ASC')
      .select('update.update_date', 'updateDate')
      .addSelect('update.worked_hours', 'workedHours')
      .addSelect('update.progress_percent', 'progressPercent')
      .addSelect('update.blocker_reason', 'blockerReason')
      .addSelect('update.comments', 'comments')
      .addSelect('task.code', 'taskCode')
      .addSelect('task.title', 'taskTitle')
      .addSelect('task.activity_type', 'activityType')
      .addSelect('task.status', 'taskStatus')
      .addSelect('project.code', 'projectCode')
      .addSelect('project.name', 'projectName');

    if (actor.role === 'lead') {
      const leadSpecialties = normalizeLeadSpecialties(
        actor.specialties ?? actor.specialty,
      );
      if (leadSpecialties.length === 0) {
        throw new ForbiddenException('Lead specialty is required');
      }
      qb.andWhere('project.scope IN (:...scopes)', {
        scopes: leadSpecialties,
      });
    }

    const rows = await qb.getRawMany<{
      updateDate: string;
      workedHours: string;
      progressPercent: string;
      blockerReason: string | null;
      comments: string | null;
      taskCode: string;
      taskTitle: string;
      activityType: TaskActivityType;
      taskStatus: TaskStatus;
      projectCode: string;
      projectName: string;
    }>();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Actividades');
    sheet.columns = [
      { header: 'Fecha', key: 'date', width: 14 },
      { header: 'Proyecto', key: 'project', width: 30 },
      { header: 'Código tarea', key: 'code', width: 16 },
      { header: 'Tarea', key: 'task', width: 36 },
      { header: 'Tipo de actividad', key: 'activityType', width: 20 },
      { header: 'Horas trabajadas', key: 'hours', width: 16 },
      { header: 'Avance %', key: 'progress', width: 12 },
      { header: 'Estado de la tarea', key: 'status', width: 18 },
      { header: 'Bloqueo', key: 'blocker', width: 30 },
      { header: 'Comentarios', key: 'comments', width: 40 },
    ];
    sheet.getRow(1).font = { bold: true };

    let totalHours = 0;
    for (const row of rows) {
      const hours = Number(row.workedHours || 0);
      totalHours += hours;
      sheet.addRow({
        date: row.updateDate,
        project: `${row.projectCode} · ${row.projectName}`,
        code: row.taskCode,
        task: row.taskTitle,
        activityType: ACTIVITY_TYPE_LABELS[row.activityType] ?? row.activityType,
        hours,
        progress: Number(row.progressPercent || 0),
        status: TASK_STATUS_LABELS[row.taskStatus] ?? row.taskStatus,
        blocker: row.blockerReason ?? '',
        comments: row.comments ?? '',
      });
    }

    sheet.addRow({});
    const totalsRow = sheet.addRow({
      date: 'Total',
      hours: Number(totalHours.toFixed(2)),
    });
    totalsRow.font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = user.fullName.replace(/[^a-z0-9]+/gi, '_');
    const fileName = `actividades_${safeName}_${from}_a_${to}.xlsx`;

    return { buffer, fileName };
  }

  private escapeCsv(value: string) {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private validateDate(value: string | undefined, field: string) {
    if (!value) {
      return undefined;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${field} must use YYYY-MM-DD format`);
    }
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException(`${field} must be a valid date`);
    }
    return value;
  }
}
