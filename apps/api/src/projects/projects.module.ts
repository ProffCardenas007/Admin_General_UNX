import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectEntity } from '../database/entities/project.entity';
import { TaskEntity } from '../database/entities/task.entity';
import { UserEntity } from '../database/entities/user.entity';
import { AuditLogEntity } from '../database/entities/audit-log.entity';
import { SpecialtyEntity } from '../database/entities/specialty.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectEntity,
      TaskEntity,
      UserEntity,
      AuditLogEntity,
      SpecialtyEntity,
    ]),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
