import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeacherAvailabilityController } from './teacher-availability.controller';
import { TeacherAvailabilityService } from './teacher-availability.service';
import { ClassScheduleProfileEntity } from '../database/entities/class-schedule-profile.entity';
import { UserEntity } from '../database/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClassScheduleProfileEntity, UserEntity]),
    NotificationsModule,
  ],
  controllers: [TeacherAvailabilityController],
  providers: [TeacherAvailabilityService],
})
export class TeacherAvailabilityModule {}
