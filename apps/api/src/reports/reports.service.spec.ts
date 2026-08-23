import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let tasksRepository: any;
  let projectsRepository: any;
  let usersRepository: any;
  let taskUpdatesRepository: any;
  let qb: any;

  beforeEach(() => {
    qb = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 'task-1',
          code: 'TASK-1',
          title: 'Task worker',
          projectId: 'project-1',
          assigneeId: 'worker-1',
          status: 'doing',
          priority: 'high',
          dueDate: null,
          estimatedHours: '4',
        },
      ]),
    };

    tasksRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };

    projectsRepository = {
      find: jest
        .fn()
        .mockResolvedValue([
          { id: 'project-1', code: 'PRJ-1', name: 'Proj 1' },
        ]),
    };

    usersRepository = {
      find: jest
        .fn()
        .mockResolvedValue([{ id: 'worker-1', email: 'worker@acme.com' }]),
    };

    taskUpdatesRepository = {
      createQueryBuilder: jest.fn(),
    };

    service = new ReportsService(
      tasksRepository,
      projectsRepository,
      usersRepository,
      taskUpdatesRepository,
    );
  });

  it('adds assignee scope filter for worker', async () => {
    await service.buildTasksCsv({}, { id: 'worker-1', role: 'worker' });

    expect(qb.andWhere).toHaveBeenCalledWith('task.assignee_id = :actorId', {
      actorId: 'worker-1',
    });
  });

  it('does not add worker assignee filter for manager', async () => {
    await service.buildTasksCsv({}, { id: 'manager-1', role: 'manager' });

    expect(qb.andWhere).not.toHaveBeenCalledWith(
      'task.assignee_id = :actorId',
      {
        actorId: 'manager-1',
      },
    );
  });

  it('returns CSV including header and scoped rows', async () => {
    const csv = await service.buildTasksCsv(
      {},
      { id: 'worker-1', role: 'worker' },
    );

    expect(csv).toContain('task_id,task_code,task_title');
    expect(csv).toContain(
      'task-1,TASK-1,Task worker,PRJ-1,Proj 1,worker@acme.com',
    );
  });

  it('calculates weighted user performance and ranking', async () => {
    usersRepository.find.mockResolvedValue([
      {
        id: 'worker-1',
        fullName: 'Ana',
        email: 'ana@acme.com',
        role: 'worker',
        isActive: true,
      },
      {
        id: 'worker-2',
        fullName: 'Luis',
        email: 'luis@acme.com',
        role: 'worker',
        isActive: true,
      },
      {
        id: 'manager-1',
        fullName: 'Gerencia',
        email: 'manager@acme.com',
        role: 'manager',
        isActive: true,
      },
    ]);

    const taskReportQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          assigneeId: 'worker-1',
          activityType: 'creacion',
          status: 'done',
          completionOutcome: 'completed',
          estimatedHours: '2',
        },
        {
          assigneeId: 'worker-2',
          activityType: 'revision',
          status: 'done',
          completionOutcome: 'not_completed',
          estimatedHours: '4',
        },
      ]),
    };
    const updatesReportQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          userId: 'worker-1',
          activityType: 'creacion',
          workedHours: '2',
          updatesCount: '1',
        },
        {
          userId: 'worker-2',
          activityType: 'revision',
          workedHours: '4',
          updatesCount: '1',
        },
      ]),
    };
    tasksRepository.createQueryBuilder.mockReturnValue(taskReportQb);
    taskUpdatesRepository.createQueryBuilder.mockReturnValue(updatesReportQb);

    const result = await service.getUserPerformance({
      from: '2026-08-01',
      to: '2026-08-15',
    });

    expect(result.weights).toEqual(
      expect.objectContaining({ creacion: 10, revision: 3, plataforma: 2 }),
    );
    expect(result.users[0]).toEqual(
      expect.objectContaining({
        userId: 'worker-1',
        rank: 1,
        workedHours: 2,
        points: 20,
        completedTasks: 1,
      }),
    );
    expect(result.users[1]).toEqual(
      expect.objectContaining({
        userId: 'worker-2',
        rank: 2,
        workedHours: 4,
        points: 12,
        notCompletedTasks: 1,
      }),
    );
    expect(taskReportQb.andWhere).toHaveBeenCalled();
    expect(updatesReportQb.andWhere).toHaveBeenCalledWith(
      'taskUpdate.update_date >= :from AND taskUpdate.update_date <= :to',
      { from: '2026-08-01', to: '2026-08-15' },
    );
  });
});
