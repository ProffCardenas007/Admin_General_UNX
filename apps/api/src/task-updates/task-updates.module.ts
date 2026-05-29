import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskUpdatesController } from './task-updates.controller';
import { TaskUpdatesService } from './task-updates.service';
import { TaskUpdateEntity } from '../database/entities/task-update.entity';
import { TaskEntity } from '../database/entities/task.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TaskUpdateEntity, TaskEntity])],
  controllers: [TaskUpdatesController],
  providers: [TaskUpdatesService],
})
export class TaskUpdatesModule {}
