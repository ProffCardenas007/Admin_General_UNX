import { ConflictException, ForbiddenException } from '@nestjs/common';
import { TimeExtensionsService } from './time-extensions.service';

describe('TimeExtensionsService', () => {
  let service: TimeExtensionsService;
  let requestsRepository: any;
  let tasksRepository: any;
  let taskUpdatesRepository: any;
  let usersRepository: any;
  let notificationsRepository: any;
  let auditLogsRepository: any;
  let savedTask: any;
  let savedRequest: any;
  let hoursQb: any;
  let updateQb: any;

  const task = () => ({
    id: 'task-1',
    code: 'EDI-001',
    title: 'Editar video',
    assigneeId: 'worker-1',
    estimatedHours: '4.00',
    authorizedExtraHours: '0.00',
  });

  beforeEach(() => {
    hoursQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ manual: '0', timer: '0' }),
    };
    updateQb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };

    requestsRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((input) => ({ id: 'req-1', ...input })),
      save: jest.fn(async (input) => input),
    };
    tasksRepository = {
      findOne: jest.fn().mockResolvedValue(task()),
      find: jest.fn().mockResolvedValue([]),
      manager: {
        transaction: jest.fn(async (callback) =>
          callback({
            getRepository: jest.fn((entity) => ({
              save: jest.fn(async (value) => {
                if (entity.name === 'TaskEntity') savedTask = value;
                else savedRequest = value;
                return value;
              }),
            })),
          }),
        ),
      },
    };
    taskUpdatesRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(hoursQb),
    };
    usersRepository = {
      find: jest
        .fn()
        .mockResolvedValue([{ id: 'manager-1' }, { id: 'manager-2' }]),
      findOne: jest.fn().mockResolvedValue({
        id: 'worker-1',
        fullName: 'Ana',
        email: 'a@x.mx',
      }),
    };
    notificationsRepository = {
      create: jest.fn((input) => input),
      save: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue(updateQb),
    };
    auditLogsRepository = {
      create: jest.fn((input) => input),
      save: jest.fn().mockResolvedValue(undefined),
    };

    service = new TimeExtensionsService(
      requestsRepository,
      tasksRepository,
      taskUpdatesRepository,
      usersRepository,
      notificationsRepository,
      auditLogsRepository,
    );
  });

  describe('create', () => {
    const dto = {
      taskId: 'task-1',
      requestedHours: 2,
      reason: 'Más correcciones',
    };

    it('rejects a request from someone who is not the assignee', async () => {
      await expect(
        service.create(dto, { id: 'worker-2', role: 'worker' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows only one pending request per task', async () => {
      requestsRepository.findOne.mockResolvedValue({
        id: 'old',
        status: 'pending',
      });
      await expect(
        service.create(dto, { id: 'worker-1', role: 'worker' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('notifies every manager with an actionable notification', async () => {
      await service.create(dto, { id: 'worker-1', role: 'worker' });

      const notifications = notificationsRepository.save.mock.calls[0][0];
      expect(notifications).toHaveLength(2);
      expect(notifications[0]).toMatchObject({
        userId: 'manager-1',
        type: 'time_extension_request',
        requestId: 'req-1',
      });
    });
  });

  describe('approve / reject', () => {
    beforeEach(() => {
      requestsRepository.findOne.mockResolvedValue({
        id: 'req-1',
        taskId: 'task-1',
        requestedBy: 'worker-1',
        requestedHours: '2.00',
        status: 'pending',
      });
    });

    it('only lets managers approve', async () => {
      await expect(
        service.approve('req-1', {}, { id: 'lead-1', role: 'lead' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.reject(
          'req-1',
          { note: 'No' },
          { id: 'worker-1', role: 'worker' },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('adds the granted hours on top of the original estimate', async () => {
      await service.approve(
        'req-1',
        { approvedHours: 1.5 },
        { id: 'manager-1', role: 'manager' },
      );

      expect(savedTask.authorizedExtraHours).toBe('1.5');
      expect(savedTask.estimatedHours).toBe('4.00');
      expect(savedRequest).toMatchObject({
        status: 'approved',
        approvedHours: '1.5',
        decidedBy: 'manager-1',
      });
      expect(notificationsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'worker-1',
          type: 'time_extension_decision',
        }),
      );
    });

    it('defaults to the requested hours and accumulates previous extras', async () => {
      tasksRepository.findOne.mockResolvedValue({
        ...task(),
        authorizedExtraHours: '1.00',
      });

      await service.approve('req-1', {}, { id: 'manager-1', role: 'manager' });

      expect(savedTask.authorizedExtraHours).toBe('3');
    });

    it('cannot resolve the same request twice', async () => {
      requestsRepository.findOne.mockResolvedValue({
        id: 'req-1',
        status: 'approved',
      });
      await expect(
        service.approve('req-1', {}, { id: 'manager-1', role: 'manager' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects without changing the task hours and tells the requester why', async () => {
      await service.reject(
        'req-1',
        { note: 'Fuera de alcance' },
        { id: 'manager-1', role: 'manager' },
      );

      expect(tasksRepository.manager.transaction).not.toHaveBeenCalled();
      expect(requestsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'rejected',
          decisionNote: 'Fuera de alcance',
        }),
      );
      expect(notificationsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'worker-1',
          message: expect.stringContaining('Fuera de alcance'),
        }),
      );
    });
  });

  describe('flagOverrunIfNeeded', () => {
    it('does nothing while logged hours are within the authorized total', async () => {
      hoursQb.getRawOne.mockResolvedValue({ manual: '4', timer: '0' });
      expect(await service.flagOverrunIfNeeded('task-1')).toBeNull();
      expect(requestsRepository.save).not.toHaveBeenCalled();
    });

    it('opens an automatic request rounded up to half hours when over the estimate', async () => {
      hoursQb.getRawOne.mockResolvedValue({ manual: '2.2', timer: '10800' });

      await service.flagOverrunIfNeeded('task-1');

      expect(requestsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'auto',
          status: 'pending',
          requestedHours: '1.5',
        }),
      );
    });

    it('counts previously approved extra hours as part of the cap', async () => {
      tasksRepository.findOne.mockResolvedValue({
        ...task(),
        authorizedExtraHours: '2.00',
      });
      hoursQb.getRawOne.mockResolvedValue({ manual: '2.5', timer: '10800' });
      expect(await service.flagOverrunIfNeeded('task-1')).toBeNull();
    });

    it('counts timer time recorded before the ledger existed', async () => {
      tasksRepository.findOne.mockResolvedValue({
        ...task(),
        activeSeconds: 7 * 3600,
      });
      hoursQb.getRawOne.mockResolvedValue({ manual: '0', timer: '0' });

      await service.flagOverrunIfNeeded('task-1');

      expect(requestsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'auto', requestedHours: '3' }),
      );
    });

    it('does not nag again after the manager rejected or while one is pending', async () => {
      hoursQb.getRawOne.mockResolvedValue({ manual: '9', timer: '0' });
      requestsRepository.findOne.mockResolvedValue({ status: 'rejected' });
      expect(await service.flagOverrunIfNeeded('task-1')).toBeNull();
      requestsRepository.findOne.mockResolvedValue({ status: 'pending' });
      expect(await service.flagOverrunIfNeeded('task-1')).toBeNull();
      expect(requestsRepository.save).not.toHaveBeenCalled();
    });

    it('ignores tasks without an estimate', async () => {
      tasksRepository.findOne.mockResolvedValue({
        ...task(),
        estimatedHours: '0.00',
      });
      hoursQb.getRawOne.mockResolvedValue({ manual: '9', timer: '0' });
      expect(await service.flagOverrunIfNeeded('task-1')).toBeNull();
    });

    it('never throws into the caller', async () => {
      tasksRepository.findOne.mockRejectedValue(new Error('db down'));
      await expect(service.flagOverrunIfNeeded('task-1')).resolves.toBeNull();
    });
  });
});
