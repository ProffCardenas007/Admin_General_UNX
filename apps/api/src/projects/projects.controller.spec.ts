import { ProjectsController } from './projects.controller';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  let service: Record<string, jest.Mock>;
  const req = {
    user: { id: 'lead-1', role: 'lead' as const, specialties: ['edicion'] as any },
  };

  beforeEach(() => {
    service = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      getProgress: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({ deleted: true }),
      update: jest.fn().mockResolvedValue({}),
    };
    controller = new ProjectsController(service as any);
  });

  it('lists projects with the filters and the authenticated user', async () => {
    await controller.findAll(req, 'active', 'curso');
    expect(service.findAll).toHaveBeenCalledWith(
      { status: 'active', search: 'curso' },
      req.user,
    );
  });

  it('forwards create, progress, update and remove with the actor', async () => {
    const dto: any = { name: 'P' };
    await controller.create(dto, req);
    await controller.getProgress('p1', req);
    await controller.update('p1', dto, req);
    await controller.remove('p1', req);

    expect(service.create).toHaveBeenCalledWith(dto, req.user);
    expect(service.getProgress).toHaveBeenCalledWith('p1', req.user);
    expect(service.update).toHaveBeenCalledWith('p1', dto, req.user);
    expect(service.remove).toHaveBeenCalledWith('p1', req.user);
  });
});
