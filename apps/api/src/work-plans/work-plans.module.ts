import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkPlanEntity } from '../database/entities/work-plan.entity';
import { WorkPlanColumnEntity } from '../database/entities/work-plan-column.entity';
import { WorkPlanSectionEntity } from '../database/entities/work-plan-section.entity';
import { WorkPlanRowEntity } from '../database/entities/work-plan-row.entity';
import { WorkPlanCellEntity } from '../database/entities/work-plan-cell.entity';
import { WorkPlansController } from './work-plans.controller';
import { WorkPlansService } from './work-plans.service';
import { ProjectEntity } from '../database/entities/project.entity';
import { UserEntity } from '../database/entities/user.entity';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [
    TasksModule,
    TypeOrmModule.forFeature([
      WorkPlanEntity,
      WorkPlanColumnEntity,
      WorkPlanSectionEntity,
      WorkPlanRowEntity,
      WorkPlanCellEntity,
      ProjectEntity,
      UserEntity,
    ]),
  ],
  controllers: [WorkPlansController],
  providers: [WorkPlansService],
})
export class WorkPlansModule {}
