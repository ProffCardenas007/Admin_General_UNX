import { BadRequestException } from '@nestjs/common';
import { TaskUpdatesController } from './task-updates.controller';

describe('TaskUpdatesController', () => {
  let controller: TaskUpdatesController;
  let service: { findByTask: jest.Mock; create: jest.Mock };
  const req = { user: { id: 'worker-1', role: 'worker' as const } };

  beforeEach(() => {
    service = {
      findByTask: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'u1' }),
    };
    controller = new TaskUpdatesController(service as any);
  });

  describe('findByTask', () => {
    it('requires a taskId', () => {
      expect(() => controller.findByTask(undefined, undefined, undefined, req)).toThrow(
        BadRequestException,
      );
    });

    it.each([
      ['from', '01/10/2026', undefined],
      ['to', undefined, '2026-1-5'],
    ])('rejects a malformed %s date', (_field, from, to) => {
      expect(() => controller.findByTask('task-1', from, to, req)).toThrow(
        BadRequestException,
      );
    });

    it('rejects an inverted range', () => {
      expect(() =>
        controller.findByTask('task-1', '2026-10-15', '2026-10-01', req),
      ).toThrow(BadRequestException);
    });

    it('passes a valid query to the service with the authenticated user', async () => {
      await controller.findByTask('task-1', '2026-10-01', '2026-10-15', req);
      expect(service.findByTask).toHaveBeenCalledWith(
        'task-1',
        req.user,
        '2026-10-01',
        '2026-10-15',
      );
    });
  });

  it('creates an update as the authenticated user', async () => {
    const dto = { taskId: 'task-1', updateDate: '2026-10-14', workedHours: 1, progressPercent: 10 };
    await controller.create(dto as any, req);
    expect(service.create).toHaveBeenCalledWith(dto, req.user);
  });
});
