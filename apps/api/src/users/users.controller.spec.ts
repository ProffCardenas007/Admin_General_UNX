import { UsersController } from './users.controller';

describe('UsersController', () => {
  let controller: UsersController;
  let service: Record<string, jest.Mock>;

  beforeEach(() => {
    service = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'u1' }),
      update: jest.fn().mockResolvedValue({ id: 'u1' }),
      remove: jest.fn().mockResolvedValue({ deleted: true }),
    };
    controller = new UsersController(service as any);
  });

  it('filters the list by role', async () => {
    await controller.findAll('worker');
    expect(service.findAll).toHaveBeenCalledWith('worker');
  });

  it('forwards create, update and remove', async () => {
    const dto: any = { fullName: 'Ana' };
    await controller.create(dto);
    await controller.update('u1', dto);
    await controller.remove('u1');

    expect(service.create).toHaveBeenCalledWith(dto);
    expect(service.update).toHaveBeenCalledWith('u1', dto);
    expect(service.remove).toHaveBeenCalledWith('u1');
  });
});
