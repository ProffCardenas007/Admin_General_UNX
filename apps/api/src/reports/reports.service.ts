import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TaskEntity } from '../database/entities/task.entity';
import { ProjectEntity } from '../database/entities/project.entity';
import { UserEntity } from '../database/entities/user.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(TaskEntity)
    private readonly tasksRepository: Repository<TaskEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectsRepository: Repository<ProjectEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

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
}
