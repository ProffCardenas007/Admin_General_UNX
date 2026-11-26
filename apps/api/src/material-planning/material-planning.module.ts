import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialGroupEntity } from '../database/entities/material-group.entity';
import { MaterialItemEntity } from '../database/entities/material-item.entity';
import { MaterialAssignmentEntity } from '../database/entities/material-assignment.entity';
import { MaterialKitItemEntity } from '../database/entities/material-kit-item.entity';
import { MaterialScheduleEntryEntity } from '../database/entities/material-schedule-entry.entity';
import { MaterialNoteEntity } from '../database/entities/material-note.entity';
import { MaterialSupplyEntity } from '../database/entities/material-supply.entity';
import { MaterialCourseStartEntity } from '../database/entities/material-course-start.entity';
import { MaterialSupplyMovementEntity } from '../database/entities/material-supply-movement.entity';
import { MaterialPlanningController } from './material-planning.controller';
import { MaterialPlanningService } from './material-planning.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MaterialGroupEntity,
      MaterialItemEntity,
      MaterialAssignmentEntity,
      MaterialKitItemEntity,
      MaterialScheduleEntryEntity,
      MaterialNoteEntity,
      MaterialCourseStartEntity,
      MaterialSupplyEntity,
      MaterialSupplyMovementEntity,
    ]),
  ],
  controllers: [MaterialPlanningController],
  providers: [MaterialPlanningService],
})
export class MaterialPlanningModule {}
