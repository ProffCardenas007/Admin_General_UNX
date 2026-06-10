import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskUpdateEntity } from '../database/entities/task-update.entity';
import { TaskEntity } from '../database/entities/task.entity';
import { CreateTaskUpdateDto } from './dto/create-task-update.dto';

@Injectable()
export class TaskUpdatesService {
  constructor(
    @InjectRepository(TaskUpdateEntity)
    private readonly taskUpdatesRepository: Repository<TaskUpdateEntity>,
    @InjectRepository(TaskEntity)
    private readonly tasksRepository: Repository<TaskEntity>,
  ) {}

  async create(
    dto: CreateTaskUpdateDto,
    actor: { id: string; role: 'manager' | 'lead' | 'worker' },
  ) {
    const task = await this.tasksRepository.findOne({
      where: { id: dto.taskId },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (actor.role === 'worker' && task.assigneeId !== actor.id) {
      throw new ForbiddenException(
        'Workers can only report updates on their own tasks',
      );
    }

    const resolvedUserId =
      actor.role === 'worker' ? actor.id : (dto.userId ?? actor.id);

    const existing = await this.taskUpdatesRepository.findOne({
      where: {
        taskId: dto.taskId,
        userId: resolvedUserId,
        updateDate: dto.updateDate,
      },
    });

    if (existing) {
      existing.workedHours = String(dto.workedHours);
      existing.progressPercent = String(dto.progressPercent);
      existing.blockerReason = dto.blockerReason;
      existing.comments = dto.comments;
      return this.taskUpdatesRepository.save(existing);
    }

    const created = this.taskUpdatesRepository.create({
      taskId: dto.taskId,
      userId: resolvedUserId,
      updateDate: dto.updateDate,
      workedHours: String(dto.workedHours),
      progressPercent: String(dto.progressPercent),
      blockerReason: dto.blockerReason,
      comments: dto.comments,
    });

    return this.taskUpdatesRepository.save(created);
  }

  async findByTask(
    taskId: string,
    actor: { id: string; role: 'manager' | 'lead' | 'worker' },
    from?: string,
    to?: string,
  ) {
    const task = await this.tasksRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (actor.role === 'worker' && task.assigneeId !== actor.id) {
      throw new ForbiddenException(
        'Workers can only view updates on their own tasks',
      );
    }

    const qb = this.taskUpdatesRepository
      .createQueryBuilder('update')
      .where('update.task_id = :taskId', { taskId })
      .orderBy('update.update_date', 'DESC')
      .addOrderBy('update.created_at', 'DESC');

    if (from) {
      qb.andWhere('update.update_date >= :from', { from });
    }

    if (to) {
      qb.andWhere('update.update_date <= :to', { to });
    }

    if (actor.role === 'worker') {
      qb.andWhere('update.user_id = :actorId', { actorId: actor.id });
    }

    return qb.getMany();
  }
}
