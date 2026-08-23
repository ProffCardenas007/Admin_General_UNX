import { ProjectsService } from './projects.service';
import { ConflictException, ForbiddenException } from '@nestjs/common';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let projectsRepository: any;
  let tasksRepository: any;
  let projectsQb: any;
  let tasksQb: any;

  beforeEach(() => {
    projectsQb = {
      where: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
      getMany: jest.fn().mockResolvedValue([]),
    };

    tasksQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    projectsRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(projectsQb),
      findOne: jest.fn().mockResolvedValue({ id: 'project-1', code: 'PRJ-1' }),
      create: jest.fn((project) => project),
      save: jest.fn((project) => Promise.resolve(project)),
    };

    tasksRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(tasksQb),
    };

    service = new ProjectsService(
      projectsRepository,
      tasksRepository,
      { findOne: jest.fn() } as any,
      { create: jest.fn(), save: jest.fn() } as any,
    );
  });

  it('allows a project name already used in another specialty', async () => {
    const result = await service.create(
      { code: 'EX-1', name: 'Examenes', scope: 'exani_ii' },
      { id: 'manager-1', role: 'manager' },
    );

    expect(projectsQb.andWhere).toHaveBeenCalledWith(
      'project.scope = :scope',
      { scope: 'exani_ii' },
    );
    expect(projectsRepository.save).toHaveBeenCalled();
    expect(result.scope).toBe('exani_ii');
  });

  it('rejects a duplicate project name in the same specialty', async () => {
    projectsQb.getOne.mockResolvedValue({ id: 'project-1' });

    await expect(
      service.create(
        { code: 'PAA-2', name: 'Examenes', scope: 'paa' },
        { id: 'manager-1', role: 'manager' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(projectsRepository.save).not.toHaveBeenCalled();
  });

  it('filters projects for worker by assigned tasks', async () => {
    await service.findAll({}, { id: 'worker-1', role: 'worker' });

    expect(projectsQb.innerJoin).toHaveBeenCalledWith(
      expect.anything(),
      'task',
      expect.stringContaining('task.assignee_id = :actorId'),
      { actorId: 'worker-1' },
    );
  });

  it('forbids worker requesting project progress without assigned tasks', async () => {
    tasksQb.getMany.mockResolvedValue([]);

    await expect(
      service.getProgress('project-1', { id: 'worker-1', role: 'worker' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns scoped progress for worker with assigned tasks', async () => {
    tasksQb.getMany.mockResolvedValue([
      { status: 'done', dueDate: null },
      { status: 'doing', dueDate: null },
    ]);

    const result = await service.getProgress('project-1', {
      id: 'worker-1',
      role: 'worker',
    });

    expect(result.totalTasks).toBe(2);
    expect(result.doneTasks).toBe(1);
    expect(result.completionRate).toBe(50);
  });
});
