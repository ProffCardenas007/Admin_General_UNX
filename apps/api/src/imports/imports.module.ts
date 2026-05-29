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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExcelImportEntity,
      ExcelImportErrorEntity,
      UserEntity,
      ProjectEntity,
      TaskEntity,
      TaskUpdateEntity,
    ]),
  ],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
