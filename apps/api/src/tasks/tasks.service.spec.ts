import { TasksService } from './tasks.service';
import { ForbiddenException } from '@nestjs/common';

describe('TasksService', () => {
  let service: TasksService;
  let tasksRepository: any;
  let qb: any;

  beforeEach(() => {
    qb = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    tasksRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };

    service = new TasksService(tasksRepository);
  });

  it('forces worker visibility to own assignee id', async () => {
    await service.findAll(
      { assigneeId: 'someone-else', projectId: 'project-1' },
      { id: 'worker-1', role: 'worker' },
    );

    expect(qb.andWhere).toHaveBeenCalledWith('task.assignee_id = :assigneeId', {
      assigneeId: 'worker-1',
    });
  });

  it('blocks worker updating task not assigned to them', async () => {
    tasksRepository.findOne.mockResolvedValue({ id: 'task-1', assigneeId: 'worker-2' });

    await expect(
      service.update('task-1', { status: 'done' }, { id: 'worker-1', role: 'worker' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows manager updating any task', async () => {
    tasksRepository.findOne.mockResolvedValue({ id: 'task-1', assigneeId: 'worker-2' });
    tasksRepository.save.mockResolvedValue({ id: 'task-1', status: 'done' });

    const result = await service.update(
      'task-1',
      { status: 'done' },
      { id: 'manager-1', role: 'manager' },
    );

    expect(result).toEqual({ id: 'task-1', status: 'done' });
    expect(tasksRepository.save).toHaveBeenCalled();
  });
});
