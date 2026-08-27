import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { ExcelImportEntity } from '../database/entities/excel-import.entity';
import { ExcelImportErrorEntity } from '../database/entities/excel-import-error.entity';
import { UserEntity } from '../database/entities/user.entity';
import { ProjectEntity } from '../database/entities/project.entity';
import { TaskEntity } from '../database/entities/task.entity';
import { TaskUpdateEntity } from '../database/entities/task-update.entity';
import { ClassScheduleProfileEntity } from '../database/entities/class-schedule-profile.entity';
import { ClassCourseEntity } from '../database/entities/class-course.entity';
import { ClassCourseSubjectEntity } from '../database/entities/class-course-subject.entity';
import { ClassSessionEntity } from '../database/entities/class-session.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExcelImportEntity,
      ExcelImportErrorEntity,
      UserEntity,
      ProjectEntity,
      TaskEntity,
      TaskUpdateEntity,
      ClassScheduleProfileEntity,
      ClassCourseEntity,
      ClassCourseSubjectEntity,
      ClassSessionEntity,
    ]),
  ],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
