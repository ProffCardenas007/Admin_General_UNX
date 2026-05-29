import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectEntity } from '../database/entities/project.entity';
import { TaskEntity } from '../database/entities/task.entity';
import { TaskUpdateEntity } from '../database/entities/task-update.entity';
import { ProjectScope, isLeadSpecialty } from '../common/specialties';

@Injectable()
export class DashboardService {
	constructor(
		@InjectRepository(ProjectEntity)
		private readonly projectsRepository: Repository<ProjectEntity>,
		@InjectRepository(TaskEntity)
		private readonly tasksRepository: Repository<TaskEntity>,
		@InjectRepository(TaskUpdateEntity)
		private readonly taskUpdatesRepository: Repository<TaskUpdateEntity>,
	) {}

	async getSummary(
		filters: { from?: string; to?: string; projectId?: string },
		actor: { id: string; role: 'manager' | 'lead' | 'worker'; specialty?: ProjectScope | null },
	) {
		const activeProjectsQb = this.projectsRepository
			.createQueryBuilder('project')
			.where('project.status = :status', { status: 'active' });

		if (actor.role === 'worker') {
			activeProjectsQb.innerJoin(
				TaskEntity,
				'task_scope',
				'task_scope.project_id = project.id AND task_scope.assignee_id = :actorId',
				{ actorId: actor.id },
			).distinct(true);
		} else if (actor.role === 'lead' && isLeadSpecialty(actor.specialty)) {
			activeProjectsQb.andWhere('project.scope = :scope', { scope: actor.specialty });
		}

		if (filters.projectId) {
			activeProjectsQb.andWhere('project.id = :projectId', {
				projectId: filters.projectId,
			});
		}
		const activeProjects = await activeProjectsQb.getCount();

		const tasksQb = this.tasksRepository.createQueryBuilder('task');
		if (actor.role === 'lead' && isLeadSpecialty(actor.specialty)) {
			tasksQb.innerJoin(ProjectEntity, 'project_scope', 'project_scope.id = task.project_id');
			tasksQb.andWhere('project_scope.scope = :scope', { scope: actor.specialty });
		}
		if (filters.projectId) {
			tasksQb.andWhere('task.project_id = :projectId', { projectId: filters.projectId });
		}
		if (actor.role === 'worker') {
			tasksQb.andWhere('task.assignee_id = :actorId', { actorId: actor.id });
		}
		const tasks = await tasksQb.getMany();
		const totalTasks = tasks.length;
		const doneTasks = tasks.filter((task) => task.status === 'done').length;
		const blockedTasks = tasks.filter((task) => task.status === 'blocked').length;

		const today = new Date();
		const overdueTasks = tasks.filter(
			(task) => task.status !== 'done' && task.dueDate && new Date(task.dueDate) < today,
		).length;

		const hoursQb = this.taskUpdatesRepository
			.createQueryBuilder('update')
			.select('COALESCE(SUM(update.worked_hours), 0)', 'hoursWorked')
			.innerJoin(TaskEntity, 'task', 'task.id = update.task_id');

		if (filters.projectId) {
			hoursQb.andWhere('task.project_id = :projectId', { projectId: filters.projectId });
		}
		if (filters.from) {
			hoursQb.andWhere('update.update_date >= :from', { from: filters.from });
		}
		if (filters.to) {
			hoursQb.andWhere('update.update_date <= :to', { to: filters.to });
		}
		if (actor.role === 'worker') {
			hoursQb.andWhere('update.user_id = :actorId', { actorId: actor.id });
		}
		const hoursResult = await hoursQb.getRawOne<{ hoursWorked: string }>();

		return {
			activeProjects,
			completionRate:
				totalTasks === 0 ? 0 : Number(((doneTasks / totalTasks) * 100).toFixed(2)),
			overdueTasks,
			blockedTasks,
			hoursWorked: Number(hoursResult?.hoursWorked ?? 0),
		};
	}

	async getWorkload(
		filters: { projectId?: string },
		actor: { id: string; role: 'manager' | 'lead' | 'worker'; specialty?: ProjectScope | null },
	) {
		const qb = this.taskUpdatesRepository
			.createQueryBuilder('update')
			.select('update.user_id', 'userId')
			.addSelect('COALESCE(SUM(update.worked_hours), 0)', 'hoursWorked')
			.addSelect('COUNT(update.id)', 'updatesCount')
			.innerJoin(TaskEntity, 'task', 'task.id = update.task_id')
			.groupBy('update.user_id')
			.orderBy('"hoursWorked"', 'DESC');

		if (actor.role === 'lead' && isLeadSpecialty(actor.specialty)) {
			qb.innerJoin(ProjectEntity, 'project_scope', 'project_scope.id = task.project_id');
			qb.andWhere('project_scope.scope = :scope', { scope: actor.specialty });
		}

		if (filters.projectId) {
			qb.andWhere('task.project_id = :projectId', { projectId: filters.projectId });
		}
		if (actor.role === 'worker') {
			qb.andWhere('update.user_id = :actorId', { actorId: actor.id });
		}

		return qb.getRawMany<{
			userId: string;
			hoursWorked: string;
			updatesCount: string;
		}>();
	}

	async getTrends(
		filters: { from?: string; to?: string; projectId?: string },
		actor: { id: string; role: 'manager' | 'lead' | 'worker'; specialty?: ProjectScope | null },
	) {
		const qb = this.taskUpdatesRepository
			.createQueryBuilder('update')
			.select("DATE_TRUNC('week', update.update_date)", 'weekStart')
			.addSelect('COALESCE(SUM(update.worked_hours), 0)', 'hoursWorked')
			.addSelect('COUNT(update.id)', 'updatesCount')
			.innerJoin(TaskEntity, 'task', 'task.id = update.task_id')
			.groupBy("DATE_TRUNC('week', update.update_date)")
			.orderBy('"weekStart"', 'ASC');

		if (actor.role === 'lead' && isLeadSpecialty(actor.specialty)) {
			qb.innerJoin(ProjectEntity, 'project_scope', 'project_scope.id = task.project_id');
			qb.andWhere('project_scope.scope = :scope', { scope: actor.specialty });
		}

		if (filters.projectId) {
			qb.andWhere('task.project_id = :projectId', { projectId: filters.projectId });
		}
		if (filters.from) {
			qb.andWhere('update.update_date >= :from', { from: filters.from });
		}
		if (filters.to) {
			qb.andWhere('update.update_date <= :to', { to: filters.to });
		}
		if (actor.role === 'worker') {
			qb.andWhere('update.user_id = :actorId', { actorId: actor.id });
		}

		return qb.getRawMany<{
			weekStart: string;
			hoursWorked: string;
			updatesCount: string;
		}>();
	}
}
