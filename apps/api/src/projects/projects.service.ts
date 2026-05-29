import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectEntity } from '../database/entities/project.entity';
import { TaskEntity } from '../database/entities/task.entity';
import { UserEntity } from '../database/entities/user.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectScope, isLeadSpecialty } from '../common/specialties';

@Injectable()
export class ProjectsService {
	constructor(
		@InjectRepository(ProjectEntity)
		private readonly projectsRepository: Repository<ProjectEntity>,
		@InjectRepository(TaskEntity)
		private readonly tasksRepository: Repository<TaskEntity>,
		@InjectRepository(UserEntity)
		private readonly usersRepository: Repository<UserEntity>,
	) {}

	private async resolveLeadSpecialty(actor: {
		id: string;
		role: 'manager' | 'lead' | 'worker';
		specialty?: ProjectScope | null;
	}) {
		if (actor.role !== 'lead') {
			return null;
		}

		if (isLeadSpecialty(actor.specialty)) {
			return actor.specialty;
		}

		const user = await this.usersRepository.findOne({ where: { id: actor.id } });
		return isLeadSpecialty(user?.specialty) ? user.specialty : null;
	}

	async findAll(
		filters: { status?: string; search?: string },
		actor: { id: string; role: 'manager' | 'lead' | 'worker'; specialty?: ProjectScope | null },
	) {
		const qb = this.projectsRepository.createQueryBuilder('project');
		const leadSpecialty = await this.resolveLeadSpecialty(actor);

		if (actor.role === 'lead') {
			if (!leadSpecialty) {
				throw new ForbiddenException('Lead specialty is required');
			}

			qb.andWhere('project.scope = :scope', { scope: leadSpecialty });
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
			qb.andWhere('(project.name ILIKE :search OR project.code ILIKE :search)', {
				search: `%${filters.search}%`,
			});
		}
		qb.orderBy('project.created_at', 'DESC');
		return qb.getMany();
	}

	create(
		dto: CreateProjectDto,
		actor: { id: string; role: 'manager' | 'lead' | 'worker'; specialty?: ProjectScope | null },
	) {
		return this.createInternal(dto, actor);
	}

	private async createInternal(
		dto: CreateProjectDto,
		actor: { id: string; role: 'manager' | 'lead' | 'worker'; specialty?: ProjectScope | null },
	) {
		const resolvedScope = dto.scope ?? null;
		const leadSpecialty = await this.resolveLeadSpecialty(actor);

		if (actor.role === 'lead') {
			if (!leadSpecialty) {
				throw new BadRequestException('Lead specialty is required');
			}

			if (resolvedScope !== leadSpecialty) {
				throw new ForbiddenException('Leads can only create projects within their specialty');
			}
		} else if (!resolvedScope) {
			throw new BadRequestException('Project scope is required');
		}

		const project = this.projectsRepository.create({
			...dto,
			scope: resolvedScope,
			status: dto.status ?? 'planned',
		});
		return this.projectsRepository.save(project);
	}

	async getProgress(
		projectId: string,
		actor: { id: string; role: 'manager' | 'lead' | 'worker'; specialty?: ProjectScope | null },
	) {
		const leadSpecialty = await this.resolveLeadSpecialty(actor);
		const project = await this.projectsRepository.findOne({ where: { id: projectId } });
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
			if (!leadSpecialty) {
				throw new ForbiddenException('Lead specialty is required');
			}

			if (project.scope !== leadSpecialty) {
				throw new ForbiddenException('Leads can only view progress for their specialty');
			}
		}

		if (actor.role === 'worker' && tasks.length === 0) {
			throw new ForbiddenException('Workers can only view progress of their assigned projects');
		}

		const totalTasks = tasks.length;
		const doneTasks = tasks.filter((task) => task.status === 'done').length;
		const overdueTasks = tasks.filter(
			(task) => task.status !== 'done' && task.dueDate && new Date(task.dueDate) < new Date(),
		).length;

		return {
			projectId: project.id,
			projectCode: project.code,
			totalTasks,
			doneTasks,
			completionRate: totalTasks === 0 ? 0 : Number(((doneTasks / totalTasks) * 100).toFixed(2)),
			overdueTasks,
		};
	}

	async remove(projectId: string) {
		const project = await this.projectsRepository.findOne({ where: { id: projectId } });
		if (!project) {
			throw new NotFoundException('Project not found');
		}

		await this.projectsRepository.delete({ id: projectId });
		return { deleted: true, projectId };
	}
}
