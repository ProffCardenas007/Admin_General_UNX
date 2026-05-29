import { Test, TestingModule } from '@nestjs/testing';
import { TaskUpdatesService } from './task-updates.service';

describe('TaskUpdatesService', () => {
  let service: TaskUpdatesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TaskUpdatesService],
    }).compile();

    service = module.get<TaskUpdatesService>(TaskUpdatesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
