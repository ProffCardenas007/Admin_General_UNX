import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ProjectEntity } from '../database/entities/project.entity';
import { TaskEntity } from '../database/entities/task.entity';
import { TaskUpdateEntity } from '../database/entities/task-update.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProjectEntity, TaskEntity, TaskUpdateEntity])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
