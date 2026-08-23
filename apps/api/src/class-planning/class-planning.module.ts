import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassCourseEntity } from '../database/entities/class-course.entity';
import { ClassCourseSubjectEntity } from '../database/entities/class-course-subject.entity';
import { ClassScheduleProfileEntity } from '../database/entities/class-schedule-profile.entity';
import { ClassSessionEntity } from '../database/entities/class-session.entity';
import { UserEntity } from '../database/entities/user.entity';
import { ClassPlanningController } from './class-planning.controller';
import { ClassPlanningService } from './class-planning.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClassCourseEntity,
      ClassCourseSubjectEntity,
      ClassScheduleProfileEntity,
      ClassSessionEntity,
      UserEntity,
    ]),
  ],
  controllers: [ClassPlanningController],
  providers: [ClassPlanningService],
})
export class ClassPlanningModule {}
