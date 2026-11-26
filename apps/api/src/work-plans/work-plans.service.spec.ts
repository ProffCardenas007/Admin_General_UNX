import { WorkPlansService } from './work-plans.service';

const actor = { id: 'boss', role: 'manager' as const };

function setup(task: Record<string, unknown>) {
  const cell = {
    id: 'c',
    rowId: 'r',
    taskId: 't',
    status: 'assigned',
    endDate: '2026-11-20',
    suggestedAssignee: 'Ana',
  };
  const repo = (value: unknown) => ({
    findOne: jest.fn().mockResolvedValue(value),
    save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    update: jest.fn(),
  });
  const update = jest.fn();
  const service = new WorkPlansService(
    repo({ id: 'p' }) as never,
    repo(null) as never,
    repo({ id: 's', planId: 'p' }) as never,
    repo({ id: 'r', sectionId: 's' }) as never,
    repo(cell) as never,
    repo(null) as never,
    repo({ id: 'u2', fullName: 'Luis' }) as never,
    repo({ id: 't', assigneeId: 'u1', ...task }) as never,
    { update } as never,
  );
  return { service, update };
}

describe('updateCellTask', () => {
  it('restarts a running task when it is reassigned', async () => {
    const { service, update } = setup({ status: 'doing' });
    const saved = await service.updateCellTask(
      'c',
      { assigneeId: 'u2', dueDate: '2026-11-27' },
      actor,
    );
    expect(update).toHaveBeenCalledWith(
      't',
      { assigneeId: 'u2', dueDate: '2026-11-27', status: 'todo' },
      actor,
    );
    expect(saved.suggestedAssignee).toBe('Luis');
    expect(saved.endDate).toBe('2026-11-27');
  });

  it('keeps the status when only the deadline changes', async () => {
    const { service, update } = setup({ status: 'doing' });
    await service.updateCellTask('c', { dueDate: '2026-11-27' }, actor);
    expect(update).toHaveBeenCalledWith('t', { dueDate: '2026-11-27' }, actor);
  });

  it('rejects changes to a completed task', async () => {
    const { service, update } = setup({
      status: 'done',
      completionOutcome: 'completed',
    });
    await expect(
      service.updateCellTask('c', { assigneeId: 'u2' }, actor),
    ).rejects.toThrow('finalizada');
    expect(update).not.toHaveBeenCalled();
  });
});
