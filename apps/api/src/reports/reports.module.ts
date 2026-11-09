import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { TaskEntity } from '../database/entities/task.entity';
import { ProjectEntity } from '../database/entities/project.entity';
import { UserEntity } from '../database/entities/user.entity';
import { TaskUpdateEntity } from '../database/entities/task-update.entity';
import { TaskEvaluationEntity } from '../database/entities/task-evaluation.entity';
import { SemesterActivityWeightEntity } from '../database/entities/semester-activity-weight.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TaskEntity,
      ProjectEntity,
      UserEntity,
      TaskUpdateEntity,
      TaskEvaluationEntity,
      SemesterActivityWeightEntity,
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
