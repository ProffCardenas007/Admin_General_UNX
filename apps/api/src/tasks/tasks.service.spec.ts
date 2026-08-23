import { TasksService } from './tasks.service';
import { ForbiddenException } from '@nestjs/common';

describe('TasksService', () => {
  let service: TasksService;
  let tasksRepository: any;
  let qb: any;
  let projectsRepository: any;
  let notificationsRepository: any;
  let taskUpdatesRepository: any;
  let usersRepository: any;
  let auditLogsRepository: any;
  let teamsRepository: any;
  let teamMembersRepository: any;

  beforeEach(() => {
    qb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getRawMany: jest.fn().mockResolvedValue([]),
    };

    tasksRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };
    projectsRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'project-1', scope: 'creacion' }),
    };
    notificationsRepository = {
      create: jest.fn((input) => input),
      save: jest.fn().mockResolvedValue(undefined),
    };
    taskUpdatesRepository = {
      create: jest.fn((input) => input),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
    };
    usersRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'manager-1', role: 'manager' }),
      find: jest.fn().mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]),
    };
    auditLogsRepository = {
      create: jest.fn((input) => input),
      save: jest.fn().mockResolvedValue(undefined),
    };
    teamsRepository = { findOne: jest.fn() };
    teamMembersRepository = { find: jest.fn() };

    service = new TasksService(
      tasksRepository,
      projectsRepository,
      notificationsRepository,
      taskUpdatesRepository,
      usersRepository,
      auditLogsRepository,
      teamsRepository,
      teamMembersRepository,
    );
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
    tasksRepository.findOne.mockResolvedValue({
      id: 'task-1',
      assigneeId: 'worker-2',
    });

    await expect(
      service.update(
        'task-1',
        { status: 'done' },
        { id: 'worker-1', role: 'worker' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows manager updating any task', async () => {
    tasksRepository.findOne.mockResolvedValue({
      id: 'task-1',
      assigneeId: 'worker-2',
    });
    tasksRepository.save.mockResolvedValue({ id: 'task-1', status: 'done' });

    const result = await service.update(
      'task-1',
      { status: 'done' },
      { id: 'manager-1', role: 'manager' },
    );

    expect(result).toEqual({ id: 'task-1', status: 'done' });
    expect(tasksRepository.save).toHaveBeenCalled();
  });

  it('starts the timer when a task moves into doing', async () => {
    tasksRepository.findOne.mockResolvedValue({
      id: 'task-1',
      assigneeId: 'worker-1',
      status: 'todo',
      activeSeconds: 0,
      timerStartedAt: null,
    });
    tasksRepository.save.mockImplementation(async (task: any) => task);

    const result = await service.update(
      'task-1',
      { status: 'doing' },
      { id: 'worker-1', role: 'worker' },
    );

    expect(result.timerStartedAt).toBeInstanceOf(Date);
    expect(result.activeSeconds).toBe(0);
  });

  it('accumulates active seconds when pausing a running task', async () => {
    const startedAt = new Date(Date.now() - 5000);
    tasksRepository.findOne.mockResolvedValue({
      id: 'task-1',
      assigneeId: 'worker-1',
      status: 'doing',
      activeSeconds: 10,
      timerStartedAt: startedAt,
    });
    tasksRepository.save.mockImplementation(async (task: any) => task);

    const result = await service.update(
      'task-1',
      { status: 'paused' },
      { id: 'worker-1', role: 'worker' },
    );

    expect(result.timerStartedAt).toBeNull();
    expect(result.activeSeconds).toBeGreaterThanOrEqual(15);
  });

  it('accumulates active seconds when finishing a running task', async () => {
    const startedAt = new Date(Date.now() - 3000);
    tasksRepository.findOne.mockResolvedValue({
      id: 'task-1',
      assigneeId: 'worker-1',
      status: 'doing',
      activeSeconds: 0,
      timerStartedAt: startedAt,
    });
    tasksRepository.save.mockImplementation(async (task: any) => task);

    const result = await service.update(
      'task-1',
      { status: 'done' },
      { id: 'worker-1', role: 'worker' },
    );

    expect(result.timerStartedAt).toBeNull();
    expect(result.activeSeconds).toBeGreaterThanOrEqual(3);
    expect(result.completedAt).toBeInstanceOf(Date);
  });

  it('links each following step in a chain to the previous task as parent', async () => {
    tasksRepository.create.mockImplementation((input) => ({ ...input }));
    tasksRepository.save.mockImplementation(async (task) => ({
      ...task,
      id: task.chainOrder === 1 ? 'task-1' : 'task-2',
    }));

    const result = await service.createChain(
      {
        projectId: 'project-1',
        steps: [
          {
            activityType: 'creacion',
            title: 'Paso 1',
            description: 'Primera tarea',
            assigneeId: 'user-1',
            status: 'todo',
            priority: 'medium',
            estimatedHours: 2,
          },
          {
            activityType: 'edicion',
            title: 'Paso 2',
            description: 'Siguiente tarea',
            assigneeId: 'user-2',
            status: 'blocked',
            priority: 'medium',
            estimatedHours: 3,
          },
        ],
      },
      { id: 'manager-1', role: 'manager' },
    );

    expect(result.tasks[0].parentTaskId).toBeUndefined();
    expect(result.tasks[1].parentTaskId).toBe('task-1');
  });
});
