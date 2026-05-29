import { Test, TestingModule } from '@nestjs/testing';
import { TaskUpdatesController } from './task-updates.controller';

describe('TaskUpdatesController', () => {
  let controller: TaskUpdatesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TaskUpdatesController],
    }).compile();

    controller = module.get<TaskUpdatesController>(TaskUpdatesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
