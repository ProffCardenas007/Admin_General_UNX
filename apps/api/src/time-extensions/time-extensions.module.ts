import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogEntity } from '../database/entities/audit-log.entity';
import { NotificationEntity } from '../database/entities/notification.entity';
import { TaskEntity } from '../database/entities/task.entity';
import { TaskUpdateEntity } from '../database/entities/task-update.entity';
import { TimeExtensionRequestEntity } from '../database/entities/time-extension-request.entity';
import { UserEntity } from '../database/entities/user.entity';
import { TimeExtensionsController } from './time-extensions.controller';
import { TimeExtensionsService } from './time-extensions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TimeExtensionRequestEntity,
      TaskEntity,
      TaskUpdateEntity,
      UserEntity,
      NotificationEntity,
      AuditLogEntity,
    ]),
  ],
  controllers: [TimeExtensionsController],
  providers: [TimeExtensionsService],
  exports: [TimeExtensionsService],
})
export class TimeExtensionsModule {}
