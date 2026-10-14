import { DashboardController } from './dashboard.controller';

describe('DashboardController', () => {
  let controller: DashboardController;
  let service: Record<string, jest.Mock>;
  const req = {
    user: { id: 'lead-1', role: 'lead' as const, specialties: ['edicion'] as any },
  };

  beforeEach(() => {
    service = {
      getSummary: jest.fn().mockResolvedValue({}),
      getWorkload: jest.fn().mockResolvedValue([]),
      getTrends: jest.fn().mockResolvedValue([]),
    };
    controller = new DashboardController(service as any);
  });

  it('scopes the summary to the authenticated user and passes the filters', async () => {
    await controller.getSummary(req, '2026-10-01', '2026-10-15', 'p1');
    expect(service.getSummary).toHaveBeenCalledWith(
      { from: '2026-10-01', to: '2026-10-15', projectId: 'p1' },
      req.user,
    );
  });

  it('scopes workload and trends the same way', async () => {
    await controller.getWorkload(req, 'p1');
    await controller.getTrends(req, '2026-10-01', undefined, 'p1');

    expect(service.getWorkload).toHaveBeenCalledWith({ projectId: 'p1' }, req.user);
    expect(service.getTrends).toHaveBeenCalledWith(
      { from: '2026-10-01', to: undefined, projectId: 'p1' },
      req.user,
    );
  });
});
