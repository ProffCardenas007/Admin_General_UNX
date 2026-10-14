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
      innerJoin: jest.fn().mockReturnThis(),
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
      where: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };

    trendsQb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
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
    expect(tasksQb.andWhere).toHaveBeenCalledWith(
      'task.assignee_id = :actorId',
      {
        actorId: 'worker-1',
      },
    );
    expect(hoursQb.andWhere).toHaveBeenCalledWith('update.user_id = :actorId', {
      actorId: 'worker-1',
    });
    expect(result.hoursWorked).toBe(8);
  });

  it('scopes workload and trends for worker', async () => {
    const workedQb = {
      ...hoursQb,
      groupBy: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    tasksRepository.createQueryBuilder
      .mockImplementationOnce(() => workloadQb)
      .mockImplementationOnce(() => trendsQb);
    taskUpdatesRepository.createQueryBuilder.mockReturnValue(workedQb);

    const actor = { id: 'worker-77', role: 'worker' as const };
    await service.getWorkload({}, actor);
    await service.getTrends({}, actor);

    expect(workloadQb.andWhere).toHaveBeenCalledWith(
      'task.assignee_id = :actorId',
      { actorId: 'worker-77' },
    );
    expect(workedQb.andWhere).toHaveBeenCalledWith(
      'update.user_id = :actorId',
      {
        actorId: 'worker-77',
      },
    );
    expect(trendsQb.andWhere).toHaveBeenCalledWith(
      'task.assignee_id = :actorId',
      { actorId: 'worker-77' },
    );
  });

  it('exposes estimated and real hours separately in workload', async () => {
    const workedQb = {
      ...hoursQb,
      groupBy: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawMany: jest
        .fn()
        .mockResolvedValue([{ userId: 'u1', workedHours: '5.5' }]),
    };
    workloadQb.getRawMany.mockResolvedValue([
      {
        userId: 'u1',
        estimatedHours: '10',
        activeSecondsWorked: '3600',
        tasksCount: '2',
      },
      {
        userId: 'u2',
        estimatedHours: '4',
        activeSecondsWorked: '0',
        tasksCount: '1',
      },
    ]);
    tasksRepository.createQueryBuilder.mockImplementationOnce(() => workloadQb);
    taskUpdatesRepository.createQueryBuilder.mockReturnValue(workedQb);

    const rows = await service.getWorkload(
      {},
      { id: 'm', role: 'manager' as const },
    );

    expect(rows[0]).toMatchObject({
      userId: 'u1',
      estimatedHours: '10',
      hoursWorked: '10',
      workedHours: '5.5',
    });
    expect(rows[1]).toMatchObject({ userId: 'u2', workedHours: '0' });
  });

  it('limits summary hours to the lead specialties', async () => {
    taskUpdatesRepository.createQueryBuilder.mockReturnValue(hoursQb);

    await service.getSummary(
      {},
      { id: 'lead-1', role: 'lead' as const, specialties: ['media'] as any },
    );

    expect(hoursQb.andWhere).toHaveBeenCalledWith(
      'project_scope.scope IN (:...scopes)',
      {
        scopes: expect.any(Array),
      },
    );
  });
});
