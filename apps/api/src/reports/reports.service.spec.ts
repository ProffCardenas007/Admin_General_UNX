import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let tasksRepository: any;
  let projectsRepository: any;
  let usersRepository: any;
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

    service = new ReportsService(
      tasksRepository,
      projectsRepository,
      usersRepository,
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
});
