import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TaskUpdatesService } from './task-updates.service';

describe('TaskUpdatesService', () => {
  let service: TaskUpdatesService;
  let taskUpdatesRepository: any;
  let tasksRepository: any;
  let tasksService: { update: jest.Mock };

  const dto = (overrides: Record<string, unknown> = {}) => ({
    taskId: 'task-1',
    updateDate: '2026-10-14',
    workedHours: 2,
    progressPercent: 40,
    ...overrides,
  });

  beforeEach(() => {
    taskUpdatesRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((input) => ({ ...input })),
      save: jest.fn(async (input) => input),
      createQueryBuilder: jest.fn(),
    };
    tasksRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'task-1', assigneeId: 'worker-1', status: 'doing' }),
    };
    tasksService = { update: jest.fn().mockResolvedValue(undefined) };

    service = new TaskUpdatesService(
      taskUpdatesRepository,
      tasksRepository,
      tasksService as any,
    );
  });

  describe('create', () => {
    it('404s on an unknown task', async () => {
      tasksRepository.findOne.mockResolvedValue(null);
      await expect(
        service.create(dto() as any, { id: 'worker-1', role: 'worker' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does not let a worker report on someone else\'s task', async () => {
      await expect(
        service.create(dto() as any, { id: 'worker-2', role: 'worker' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(taskUpdatesRepository.save).not.toHaveBeenCalled();
    });

    it('records a worker\'s hours under their own id even if the body names another user', async () => {
      await service.create(dto({ userId: 'worker-9' }) as any, {
        id: 'worker-1',
        role: 'worker',
      });

      expect(taskUpdatesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'worker-1', workedHours: '2' }),
      );
    });

    it('lets a manager report on behalf of the assignee', async () => {
      await service.create(dto({ userId: 'worker-1' }) as any, {
        id: 'manager-1',
        role: 'manager',
      });

      expect(taskUpdatesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'worker-1' }),
      );
    });

    it('overwrites the manual hours of the same day without touching timer seconds', async () => {
      const existing = {
        workedHours: '1',
        progressPercent: '10',
        timerSeconds: 1800,
        comments: 'viejo',
      };
      taskUpdatesRepository.findOne.mockResolvedValue(existing);

      await service.create(dto({ workedHours: 3, comments: 'nuevo' }) as any, {
        id: 'worker-1',
        role: 'worker',
      });

      expect(existing).toMatchObject({
        workedHours: '3',
        progressPercent: '40',
        comments: 'nuevo',
        timerSeconds: 1800,
      });
    });
  });

  describe('closing the task from the progress report', () => {
    it('closes through the normal completion flow at 100% progress', async () => {
      const actor = { id: 'worker-1', role: 'worker' as const };
      await service.create(dto({ progressPercent: 100 }) as any, actor);

      expect(tasksService.update).toHaveBeenCalledWith(
        'task-1',
        { status: 'done' },
        actor,
      );
    });

    it('does nothing below 100%', async () => {
      await service.create(dto({ progressPercent: 99 }) as any, {
        id: 'worker-1',
        role: 'worker',
      });
      expect(tasksService.update).not.toHaveBeenCalled();
    });

    it.each(['done', 'blocked'])('skips a task that is already %s', async (status) => {
      tasksRepository.findOne.mockResolvedValue({
        id: 'task-1',
        assigneeId: 'worker-1',
        status,
      });

      await service.create(dto({ progressPercent: 100 }) as any, {
        id: 'worker-1',
        role: 'worker',
      });
      expect(tasksService.update).not.toHaveBeenCalled();
    });
  });

  describe('findByTask', () => {
    const queryBuilder = () => {
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      taskUpdatesRepository.createQueryBuilder.mockReturnValue(qb);
      return qb;
    };

    it('blocks a worker from reading another person\'s task history', async () => {
      queryBuilder();
      await expect(
        service.findByTask('task-1', { id: 'worker-2', role: 'worker' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('limits a worker to their own entries and applies the date range', async () => {
      const qb = queryBuilder();

      await service.findByTask(
        'task-1',
        { id: 'worker-1', role: 'worker' },
        '2026-10-01',
        '2026-10-15',
      );

      expect(qb.andWhere).toHaveBeenCalledWith('update.update_date >= :from', {
        from: '2026-10-01',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('update.update_date <= :to', {
        to: '2026-10-15',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('update.user_id = :actorId', {
        actorId: 'worker-1',
      });
    });

    it('lets a manager see every entry', async () => {
      const qb = queryBuilder();
      await service.findByTask('task-1', { id: 'manager-1', role: 'manager' });
      expect(qb.andWhere).not.toHaveBeenCalledWith(
        'update.user_id = :actorId',
        expect.anything(),
      );
    });
  });
});
