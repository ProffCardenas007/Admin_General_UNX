import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let projectsRepository: any;
  let tasksRepository: any;
  let taskUpdatesRepository: any;
  let projectsQb: any;
  let tasksQb: any;
  let hoursQb: any;
  let workloadQb: any;
  let trendsQb: any;

  beforeEach(() => {
    projectsQb = {
      where: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(1),
    };

    tasksQb = {
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { status: 'done', dueDate: null },
        { status: 'blocked', dueDate: null },
      ]),
    };

    hoursQb = {
      select: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ hoursWorked: '8' }),
    };

    workloadQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };

    trendsQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };

    projectsRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(projectsQb),
    };

    tasksRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(tasksQb),
    };

    taskUpdatesRepository = {
      createQueryBuilder: jest.fn(),
    };

    service = new DashboardService(
      projectsRepository,
      tasksRepository,
      taskUpdatesRepository,
    );
  });

  it('scopes summary queries for worker', async () => {
    taskUpdatesRepository.createQueryBuilder.mockReturnValue(hoursQb);
    const actor = { id: 'worker-1', role: 'worker' as const };
    const result = await service.getSummary({}, actor);

    expect(projectsQb.innerJoin).toHaveBeenCalledWith(
      expect.anything(),
      'task_scope',
      expect.stringContaining('task_scope.assignee_id = :actorId'),
      { actorId: 'worker-1' },
    );
    expect(tasksQb.andWhere).toHaveBeenCalledWith('task.assignee_id = :actorId', {
      actorId: 'worker-1',
    });
    expect(hoursQb.andWhere).toHaveBeenCalledWith('update.user_id = :actorId', {
      actorId: 'worker-1',
    });
    expect(result.hoursWorked).toBe(8);
  });

  it('scopes workload and trends for worker', async () => {
    taskUpdatesRepository.createQueryBuilder
      .mockImplementationOnce(() => workloadQb)
      .mockImplementationOnce(() => trendsQb);

    const actor = { id: 'worker-77', role: 'worker' as const };
    await service.getWorkload({}, actor);
    await service.getTrends({}, actor);

    expect(workloadQb.andWhere).toHaveBeenCalledWith('update.user_id = :actorId', {
      actorId: 'worker-77',
    });
    expect(trendsQb.andWhere).toHaveBeenCalledWith('update.user_id = :actorId', {
      actorId: 'worker-77',
    });
  });
});
