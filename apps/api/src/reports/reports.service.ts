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
import { TaskEvaluationEntity } from '../database/entities/task-evaluation.entity';
import { SemesterActivityWeightEntity } from '../database/entities/semester-activity-weight.entity';
import { normalizeLeadSpecialties } from '../common/specialties';
import { realHoursSql } from '../common/hours';
import { APP_TIMEZONE, todayKey } from '../common/dates';
import type {
  TaskActivityType,
  TaskStatus,
} from '../database/entities/task.entity';
import {
  SaveSemesterWeightsDto,
  SaveTaskEvaluationDto,
  SaveTaskEvaluationsDto,
} from './dto/semester-evaluation.dto';

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

/** A late delivery can never score above this grade. */
const LATE_GRADE_CAP = 70;

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

const TASK_PRIORITY_LABELS: Record<string, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
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
    @InjectRepository(TaskEvaluationEntity)
    private readonly taskEvaluationsRepository: Repository<TaskEvaluationEntity>,
    @InjectRepository(SemesterActivityWeightEntity)
    private readonly semesterWeightsRepository: Repository<SemesterActivityWeightEntity>,
  ) {}

  private semesterRange(year: number, semester: number) {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('Invalid semester year');
    }
    if (semester !== 1 && semester !== 2) {
      throw new BadRequestException('Semester must be 1 or 2');
    }
    // Ciclo escolar: semestre 1 = febrero a julio; semestre 2 = agosto a enero
    // del año siguiente (el año identifica al agosto con que inicia).
    return semester === 1
      ? { from: `${year}-02-01`, to: `${year}-07-31` }
      : { from: `${year}-08-01`, to: `${year + 1}-01-31` };
  }

  private deliveryStatus(task: TaskEntity) {
    if (task.completionOutcome === 'not_completed') return 'not_delivered';
    if (task.status !== 'done') {
      // Still in time: the due date has not passed yet.
      if (task.dueDate && task.dueDate >= todayKey()) return 'pending';
      return 'not_delivered';
    }
    if (!task.completedAt || !task.dueDate) return 'delivered';
    return todayKey(task.completedAt) <= task.dueDate ? 'on_time' : 'late';
  }

  async getSemesterEvaluation(year: number, semester: number) {
    const period = this.semesterRange(year, semester);
    const [users, tasks, storedWeights] = await Promise.all([
      this.usersRepository.find({
        where: { isActive: true },
        order: { fullName: 'ASC' },
      }),
      this.tasksRepository
        .createQueryBuilder('task')
        .where('task.assignee_id IS NOT NULL')
        .andWhere('task.due_date >= :from AND task.due_date <= :to', period)
        .orderBy('task.due_date', 'ASC')
        .addOrderBy('task.created_at', 'ASC')
        .getMany(),
      this.semesterWeightsRepository.find({ where: { year, semester } }),
    ]);

    const taskIds = tasks.map((task) => task.id);
    const projectIds = [...new Set(tasks.map((task) => task.projectId))];
    const [evaluations, projects] = await Promise.all([
      taskIds.length
        ? this.taskEvaluationsRepository.find({
            where: { taskId: In(taskIds) },
          })
        : [],
      projectIds.length
        ? this.projectsRepository.find({ where: { id: In(projectIds) } })
        : [],
    ]);
    const evaluationsByTask = new Map<string, TaskEvaluationEntity>(
      evaluations.map((evaluation): [string, TaskEvaluationEntity] => [
        evaluation.taskId,
        evaluation,
      ]),
    );
    const projectsById = new Map<string, ProjectEntity>(
      projects.map((project): [string, ProjectEntity] => [project.id, project]),
    );
    const weights = {
      ...ACTIVITY_WEIGHTS,
      ...Object.fromEntries(
        storedWeights.map((row) => [row.activityType, Number(row.weight)]),
      ),
    };

    const activeUsers = users.filter((user) => user.role !== 'manager');
    const rows = activeUsers
      .map((user) => {
        const userTasks = tasks.filter((task) => task.assigneeId === user.id);
        const taskRows = userTasks.map((task) => {
          const evaluation = evaluationsByTask.get(task.id);
          const estimatedHours = Number(task.estimatedHours || 0);
          const weight = weights[task.activityType];
          const possiblePoints = estimatedHours * weight;
          const deliveryStatus = this.deliveryStatus(task);
          const manualGrade =
            evaluation === undefined ? null : Number(evaluation.grade);
          // Not-delivered tasks score 0 automatically unless graded by hand.
          const autoZero =
            manualGrade === null && deliveryStatus === 'not_delivered';
          const baseGrade = autoZero ? 0 : manualGrade;
          // A late delivery cannot score above the cap.
          const lateCapApplied =
            baseGrade !== null &&
            deliveryStatus === 'late' &&
            baseGrade > LATE_GRADE_CAP;
          const grade = lateCapApplied ? LATE_GRADE_CAP : baseGrade;
          return {
            id: task.id,
            code: task.code,
            title: task.title,
            projectName:
              projectsById.get(task.projectId)?.name ??
              'Proyecto no encontrado',
            activityType: task.activityType,
            status: task.status,
            completionOutcome: task.completionOutcome ?? null,
            deliveryStatus,
            dueDate: task.dueDate ?? null,
            completedAt: task.completedAt?.toISOString() ?? null,
            estimatedHours,
            weight,
            possiblePoints: Number(possiblePoints.toFixed(2)),
            manualGrade,
            autoZero,
            lateCapApplied,
            grade,
            earnedPoints:
              grade === null
                ? null
                : Number(((possiblePoints * grade) / 100).toFixed(2)),
            comments: evaluation?.comments ?? null,
          };
        });
        const gradedTasks = taskRows.filter((task) => task.grade !== null);
        const possiblePoints = gradedTasks.reduce(
          (sum, task) => sum + task.possiblePoints,
          0,
        );
        const earnedPoints = gradedTasks.reduce(
          (sum, task) => sum + (task.earnedPoints ?? 0),
          0,
        );
        const activity = Object.fromEntries(
          ACTIVITY_TYPES.map((activityType) => {
            const activityTasks = taskRows.filter(
              (task) => task.activityType === activityType,
            );
            const graded = activityTasks.filter((task) => task.grade !== null);
            const activityPossible = graded.reduce(
              (sum, task) => sum + task.possiblePoints,
              0,
            );
            const activityEarned = graded.reduce(
              (sum, task) => sum + (task.earnedPoints ?? 0),
              0,
            );
            return [
              activityType,
              {
                tasks: activityTasks.length,
                graded: graded.length,
                estimatedHours: Number(
                  activityTasks
                    .reduce((sum, task) => sum + task.estimatedHours, 0)
                    .toFixed(2),
                ),
                possiblePoints: Number(activityPossible.toFixed(2)),
                earnedPoints: Number(activityEarned.toFixed(2)),
                grade:
                  activityPossible > 0
                    ? Number(
                        ((activityEarned / activityPossible) * 100).toFixed(1),
                      )
                    : null,
              },
            ];
          }),
        );

        return {
          userId: user.id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          tasks: taskRows,
          taskCount: taskRows.length,
          gradedCount: gradedTasks.length,
          completedCount: taskRows.filter(
            (task) =>
              task.deliveryStatus === 'on_time' ||
              task.deliveryStatus === 'late' ||
              task.deliveryStatus === 'delivered',
          ).length,
          onTimeCount: taskRows.filter(
            (task) => task.deliveryStatus === 'on_time',
          ).length,
          lateCount: taskRows.filter((task) => task.deliveryStatus === 'late')
            .length,
          notDeliveredCount: taskRows.filter(
            (task) => task.deliveryStatus === 'not_delivered',
          ).length,
          pendingCount: taskRows.filter(
            (task) => task.deliveryStatus === 'pending',
          ).length,
          estimatedHours: Number(
            taskRows
              .reduce((sum, task) => sum + task.estimatedHours, 0)
              .toFixed(2),
          ),
          possiblePoints: Number(possiblePoints.toFixed(2)),
          earnedPoints: Number(earnedPoints.toFixed(2)),
          finalGrade:
            possiblePoints > 0
              ? Number(((earnedPoints / possiblePoints) * 100).toFixed(1))
              : null,
          activity,
        };
      })
      .filter((user) => user.taskCount > 0)
      .sort(
        (left, right) =>
          (right.finalGrade ?? -1) - (left.finalGrade ?? -1) ||
          right.gradedCount - left.gradedCount ||
          left.fullName.localeCompare(right.fullName, 'es'),
      )
      .map((user, index) => ({ ...user, rank: index + 1 }));

    const gradedUsers = rows.filter((user) => user.finalGrade !== null);
    return {
      year,
      semester,
      period,
      weights,
      customizedWeights: storedWeights.length > 0,
      lateGradeCap: LATE_GRADE_CAP,
      team: {
        users: rows.length,
        tasks: rows.reduce((sum, user) => sum + user.taskCount, 0),
        gradedTasks: rows.reduce((sum, user) => sum + user.gradedCount, 0),
        averageGrade:
          gradedUsers.length > 0
            ? Number(
                (
                  gradedUsers.reduce(
                    (sum, user) => sum + (user.finalGrade ?? 0),
                    0,
                  ) / gradedUsers.length
                ).toFixed(1),
              )
            : null,
      },
      users: rows,
    };
  }

  async saveSemesterWeights(dto: SaveSemesterWeightsDto, actorId: string) {
    this.semesterRange(dto.year, dto.semester);
    for (const activityType of ACTIVITY_TYPES) {
      const value = Number(dto.weights[activityType]);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        throw new BadRequestException(
          `Invalid weight for ${activityType}; use a value from 0 to 100`,
        );
      }
      let row = await this.semesterWeightsRepository.findOne({
        where: {
          year: dto.year,
          semester: dto.semester,
          activityType,
        },
      });
      row ??= this.semesterWeightsRepository.create({
        year: dto.year,
        semester: dto.semester,
        activityType,
      });
      row.weight = String(value);
      row.updatedBy = actorId;
      await this.semesterWeightsRepository.save(row);
    }
    return this.getSemesterEvaluation(dto.year, dto.semester);
  }

  async saveTaskEvaluation(
    taskId: string,
    dto: SaveTaskEvaluationDto,
    actorId: string,
  ) {
    const task = await this.tasksRepository.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    let evaluation = await this.taskEvaluationsRepository.findOne({
      where: { taskId },
    });
    evaluation ??= this.taskEvaluationsRepository.create({ taskId });
    evaluation.grade = String(dto.grade);
    evaluation.comments = dto.comments?.trim() || null;
    evaluation.evaluatedBy = actorId;
    return this.taskEvaluationsRepository.save(evaluation);
  }

  /** Guarda varias calificaciones de una vez (todas o ninguna). */
  async saveTaskEvaluations(dto: SaveTaskEvaluationsDto, actorId: string) {
    const taskIds = dto.evaluations.map((item) => item.taskId);
    if (new Set(taskIds).size !== taskIds.length) {
      throw new BadRequestException(
        'Each task can be graded only once per request',
      );
    }
    const tasks = await this.tasksRepository.find({
      where: { id: In(taskIds) },
    });
    if (tasks.length !== taskIds.length) {
      throw new NotFoundException('One or more tasks were not found');
    }
    const existing = await this.taskEvaluationsRepository.find({
      where: { taskId: In(taskIds) },
    });
    const existingByTask = new Map(
      existing.map((evaluation) => [evaluation.taskId, evaluation]),
    );
    const rows = dto.evaluations.map((item) => {
      const evaluation =
        existingByTask.get(item.taskId) ??
        this.taskEvaluationsRepository.create({ taskId: item.taskId });
      evaluation.grade = String(item.grade);
      evaluation.evaluatedBy = actorId;
      return evaluation;
    });
    // save() con un arreglo corre en una sola transacción.
    await this.taskEvaluationsRepository.save(rows);
    return { saved: rows.length };
  }

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
      .addSelect(
        `COALESCE(SUM(${realHoursSql('taskUpdate')}), 0)`,
        'workedHours',
      )
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
          task.status === 'done' && task.completionOutcome !== 'not_completed',
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
            rankedRows.reduce((sum, row) => sum + row.workedHours, 0) / divisor
          ).toFixed(2),
        ),
        averagePoints: Number(
          (
            rankedRows.reduce((sum, row) => sum + row.points, 0) / divisor
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

    const tasksQb = this.tasksRepository
      .createQueryBuilder('task')
      .where('task.assignee_id = :userId', { userId })
      .andWhere(
        `(
          (task.due_date >= :from AND task.due_date <= :to)
          OR (task.completed_at::date >= :from AND task.completed_at::date <= :to)
        )`,
        { from, to },
      )
      .orderBy('task.due_date', 'ASC')
      .addOrderBy('task.created_at', 'ASC');

    if (actor.role === 'lead') {
      const leadSpecialties = normalizeLeadSpecialties(
        actor.specialties ?? actor.specialty,
      );
      if (leadSpecialties.length === 0) {
        throw new ForbiddenException('Lead specialty is required');
      }
      tasksQb
        .innerJoin(
          ProjectEntity,
          'project_scope',
          'project_scope.id = task.project_id',
        )
        .andWhere('project_scope.scope IN (:...scopes)', {
          scopes: leadSpecialties,
        });
    }

    const tasks = await tasksQb.getMany();

    const projectIds = [...new Set(tasks.map((task) => task.projectId))];
    const projects = projectIds.length
      ? await this.projectsRepository.find({ where: { id: In(projectIds) } })
      : [];
    const projectById = new Map(
      projects.map((project) => [project.id, project]),
    );

    const parentTaskIds = [
      ...new Set(
        tasks
          .map((task) => task.parentTaskId)
          .filter((value): value is string => !!value),
      ),
    ];
    const parentTasks = parentTaskIds.length
      ? await this.tasksRepository.find({ where: { id: In(parentTaskIds) } })
      : [];
    const parentCodeById = new Map(
      parentTasks.map((task) => [task.id, task.code]),
    );

    const taskIds = tasks.map((task) => task.id);
    const workedHoursByTask = new Map<string, number>();
    if (taskIds.length > 0) {
      const workedRows = await this.taskUpdatesRepository
        .createQueryBuilder('update')
        .select('update.task_id', 'taskId')
        .addSelect(`COALESCE(SUM(${realHoursSql('update')}), 0)`, 'workedHours')
        .where('update.task_id IN (:...taskIds)', { taskIds })
        .andWhere('update.user_id = :userId', { userId })
        .groupBy('update.task_id')
        .getRawMany<{ taskId: string; workedHours: string }>();

      for (const row of workedRows) {
        workedHoursByTask.set(row.taskId, Number(row.workedHours || 0));
      }
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Tareas');
    sheet.columns = [
      { header: 'Fecha límite', key: 'dueDate', width: 14 },
      { header: 'Proyecto', key: 'project', width: 30 },
      { header: 'Código', key: 'code', width: 14 },
      { header: 'Tarea', key: 'task', width: 36 },
      { header: 'Tipo de tarea', key: 'taskKind', width: 16 },
      { header: 'Tarea principal', key: 'parentCode', width: 16 },
      { header: 'Tipo de actividad', key: 'activityType', width: 20 },
      { header: 'Prioridad', key: 'priority', width: 12 },
      { header: 'Estado', key: 'status', width: 16 },
      { header: 'Resultado', key: 'outcome', width: 16 },
      { header: 'Horas estimadas', key: 'estimatedHours', width: 16 },
      { header: 'Horas trabajadas', key: 'workedHours', width: 16 },
      { header: 'Fecha de finalización', key: 'completedAt', width: 18 },
    ];
    sheet.getRow(1).font = { bold: true };

    let totalEstimatedHours = 0;
    let totalWorkedHours = 0;
    let completedCount = 0;
    let notCompletedCount = 0;

    for (const task of tasks) {
      const project = projectById.get(task.projectId);
      const estimatedHours = Number(task.estimatedHours || 0);
      const workedHours = workedHoursByTask.get(task.id) ?? 0;
      totalEstimatedHours += estimatedHours;
      totalWorkedHours += workedHours;

      const outcome =
        task.status === 'done'
          ? task.completionOutcome === 'not_completed'
            ? 'No completada'
            : 'Completada'
          : 'En proceso';
      if (task.status === 'done') {
        if (task.completionOutcome === 'not_completed') {
          notCompletedCount += 1;
        } else {
          completedCount += 1;
        }
      }

      sheet.addRow({
        dueDate: task.dueDate ?? '',
        project: project ? `${project.code} · ${project.name}` : '',
        code: task.code,
        task: task.title,
        taskKind: task.parentTaskId ? 'Consecuente' : 'Principal',
        parentCode: task.parentTaskId
          ? (parentCodeById.get(task.parentTaskId) ?? '')
          : '',
        activityType:
          ACTIVITY_TYPE_LABELS[task.activityType] ?? task.activityType,
        priority: TASK_PRIORITY_LABELS[task.priority] ?? task.priority,
        status: TASK_STATUS_LABELS[task.status] ?? task.status,
        outcome,
        estimatedHours,
        workedHours,
        completedAt: task.completedAt
          ? new Date(task.completedAt).toISOString().slice(0, 10)
          : '',
      });
    }

    sheet.addRow({});
    const summaryRow = sheet.addRow({
      dueDate: 'Total',
      task: `${tasks.length} tarea(s) · ${completedCount} completada(s) · ${notCompletedCount} no completada(s)`,
      estimatedHours: Number(totalEstimatedHours.toFixed(2)),
      workedHours: Number(totalWorkedHours.toFixed(2)),
    });
    summaryRow.font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = user.fullName.replace(/[^a-z0-9]+/gi, '_');
    const fileName = `tareas_${safeName}_${from}_a_${to}.xlsx`;

    return { buffer, fileName };
  }

  /**
   * Estimated vs authorized vs real hours.
   * - Completed tasks (done, not marked "not completed") with logged time are
   *   measured; the period filters on completion date.
   * - Open tasks already past their authorized hours are listed separately.
   * Real hours per task: manual hours from the ledger plus the timer total.
   * The timer total is the larger of tasks.active_seconds and the timer
   * seconds already credited to the ledger, so time tracked before the ledger
   * existed still counts (it has no per-day detail, only a task total).
   */
  async getHoursDeviation(filters: { from?: string; to?: string }) {
    const from = this.validateDate(filters.from, 'from');
    const to = this.validateDate(filters.to, 'to');
    if ((from && !to) || (!from && to)) {
      throw new BadRequestException('Both from and to are required');
    }
    if (from && to && from > to) {
      throw new BadRequestException('from must be before or equal to to');
    }

    const rows: Array<{
      id: string;
      code: string;
      title: string;
      activityType: TaskActivityType;
      assigneeId: string;
      status: TaskStatus;
      estimated: number;
      extra: number;
      real: number;
    }> = await this.tasksRepository.query(
      `SELECT t.id, t.code, t.title,
              t.activity_type AS "activityType",
              t.assignee_id AS "assigneeId",
              t.status,
              t.estimated_hours::float AS estimated,
              t.authorized_extra_hours::float AS extra,
              (
                COALESCE((SELECT SUM(u.worked_hours) FROM task_updates u WHERE u.task_id = t.id), 0)
                + GREATEST(
                    t.active_seconds,
                    COALESCE((SELECT SUM(u.timer_seconds) FROM task_updates u WHERE u.task_id = t.id), 0)
                  ) / 3600.0
              )::float AS real
         FROM tasks t
        WHERE t.assignee_id IS NOT NULL
          AND t.estimated_hours > 0
          AND (
            (t.status = 'done'
              AND t.completion_outcome IS DISTINCT FROM 'not_completed'
              AND ($1::date IS NULL OR (t.completed_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date))
            OR t.status <> 'done'
          )`,
      [from ?? null, to ?? null, APP_TIMEZONE],
    );

    const completed = rows.filter((row) => row.status === 'done');
    const measured = completed.filter((row) => row.real > 0);
    const untrackedTasks = completed.length - measured.length;

    const summarize = (items: typeof rows) => {
      const estimated = items.reduce((sum, row) => sum + row.estimated, 0);
      const authorized = items.reduce(
        (sum, row) => sum + row.estimated + row.extra,
        0,
      );
      const real = items.reduce((sum, row) => sum + row.real, 0);
      return {
        tasks: items.length,
        estimatedHours: Number(estimated.toFixed(2)),
        authorizedHours: Number(authorized.toFixed(2)),
        realHours: Number(real.toFixed(2)),
        varianceHours: Number((real - estimated).toFixed(2)),
        variancePercent:
          estimated > 0
            ? Number((((real - estimated) / estimated) * 100).toFixed(1))
            : 0,
        overEstimateTasks: items.filter((row) => row.real > row.estimated)
          .length,
        overAuthorizedTasks: items.filter(
          (row) => row.real > row.estimated + row.extra,
        ).length,
      };
    };

    const users = await this.usersRepository.find({
      where: { id: In([...new Set(rows.map((row) => row.assigneeId))]) },
    });
    const userName = new Map(users.map((user) => [user.id, user.fullName]));

    const byUser = [...new Set(measured.map((row) => row.assigneeId))]
      .map((userId) => ({
        userId,
        fullName: userName.get(userId) ?? 'Usuario',
        ...summarize(measured.filter((row) => row.assigneeId === userId)),
      }))
      .sort((left, right) => right.varianceHours - left.varianceHours);

    const byActivity = ACTIVITY_TYPES.map((activityType) => ({
      activityType,
      ...summarize(measured.filter((row) => row.activityType === activityType)),
    })).filter((row) => row.tasks > 0);

    const overrunningNow = rows
      .filter(
        (row) => row.status !== 'done' && row.real > row.estimated + row.extra,
      )
      .map((row) => ({
        taskId: row.id,
        code: row.code,
        title: row.title,
        activityType: row.activityType,
        assigneeName: userName.get(row.assigneeId) ?? 'Usuario',
        estimatedHours: Number(row.estimated.toFixed(2)),
        authorizedHours: Number((row.estimated + row.extra).toFixed(2)),
        realHours: Number(row.real.toFixed(2)),
        overHours: Number((row.real - row.estimated - row.extra).toFixed(2)),
      }))
      .sort((left, right) => right.overHours - left.overHours)
      .slice(0, 20);

    return {
      period: { from: from ?? null, to: to ?? null },
      totals: summarize(measured),
      untrackedTasks,
      byUser,
      byActivity,
      overrunningNow,
    };
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
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException(`${field} must be a valid date`);
    }
    return value;
  }
}
