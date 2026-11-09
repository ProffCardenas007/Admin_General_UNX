import { TasksController } from './tasks.controller';

describe('TasksController', () => {
  let controller: TasksController;
  let service: Record<string, jest.Mock>;
  const req = {
    user: { id: 'lead-1', role: 'lead' as const, specialties: ['edicion'] as any },
  };

  beforeEach(() => {
    service = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      createChain: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      claim: jest.fn().mockResolvedValue({}),
      markNotCompleted: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({ deleted: true }),
    };
    controller = new TasksController(service as any);
  });

  it('lists tasks with the query filters and the authenticated user', async () => {
    await controller.findAll(req, 'p1', 'u1', 'doing', 'high', 'assigned');
    expect(service.findAll).toHaveBeenCalledWith(
      { projectId: 'p1', assigneeId: 'u1', status: 'doing', priority: 'high', scope: 'assigned' },
      req.user,
    );
  });

  it('forwards create, chain, update, claim, not-completed and delete with the actor', async () => {
    const dto: any = { title: 'x' };
    await controller.create(dto, req);
    await controller.createChain(dto, req);
    await controller.update('t1', dto, req);
    await controller.claim('t1', req);
    await controller.markNotCompleted('t1', { reason: 'r' } as any, req);
    await controller.remove('t1', req);

    expect(service.create).toHaveBeenCalledWith(dto, req.user);
    expect(service.createChain).toHaveBeenCalledWith(dto, req.user);
    expect(service.update).toHaveBeenCalledWith('t1', dto, req.user);
    expect(service.claim).toHaveBeenCalledWith('t1', req.user);
    expect(service.markNotCompleted).toHaveBeenCalledWith('t1', { reason: 'r' }, req.user);
    expect(service.remove).toHaveBeenCalledWith('t1', req.user);
  });
});
