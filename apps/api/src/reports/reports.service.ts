import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TaskEntity } from '../database/entities/task.entity';
import { ProjectEntity } from '../database/entities/project.entity';
import { UserEntity } from '../database/entities/user.entity';
import { TaskUpdateEntity } from '../database/entities/task-update.entity';
import type { TaskActivityType } from '../database/entities/task.entity';

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
    actor: { id: string; role: 'manager' | 'lead' | 'worker' },
  ) {
    const qb = this.tasksRepository.createQueryBuilder('task');

    if (actor.role === 'worker') {
      qb.andWhere('task.assignee_id = :actorId', { actorId: actor.id });
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
