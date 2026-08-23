import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { TaskUpdatesModule } from './task-updates/task-updates.module';
import { ImportsModule } from './imports/imports.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { TeamsModule } from './teams/teams.module';
import { UserEntity } from './database/entities/user.entity';
import { ProjectEntity } from './database/entities/project.entity';
import { TaskEntity } from './database/entities/task.entity';
import { TaskUpdateEntity } from './database/entities/task-update.entity';
import { ExcelImportEntity } from './database/entities/excel-import.entity';
import { ExcelImportErrorEntity } from './database/entities/excel-import-error.entity';
import { NotificationEntity } from './database/entities/notification.entity';
import { AuditLogEntity } from './database/entities/audit-log.entity';
import { TeamEntity } from './database/entities/team.entity';
import { TeamMemberEntity } from './database/entities/team-member.entity';
import { TeacherAvailabilityModule } from './teacher-availability/teacher-availability.module';
import { ClassScheduleProfileEntity } from './database/entities/class-schedule-profile.entity';
import { ClassPlanningModule } from './class-planning/class-planning.module';
import { ClassCourseEntity } from './database/entities/class-course.entity';
import { ClassCourseSubjectEntity } from './database/entities/class-course-subject.entity';
import { ClassSessionEntity } from './database/entities/class-session.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('DATABASE_URL');

        const pgHost = configService.get<string>('PGHOST');
        const pgPort = configService.get<string>('PGPORT');
        const pgDatabase = configService.get<string>('PGDATABASE');
        const pgUser = configService.get<string>('PGUSER');
        const pgPassword = configService.get<string>('PGPASSWORD');

        const fallbackUrl =
          pgHost && pgPort && pgDatabase && pgUser && pgPassword
            ? `postgres://${encodeURIComponent(pgUser)}:${encodeURIComponent(pgPassword)}@${pgHost}:${pgPort}/${pgDatabase}?sslmode=require`
            : undefined;

        const url = databaseUrl ?? fallbackUrl;

        if (!url) {
          throw new Error(
            'Missing database configuration. Set DATABASE_URL or PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD.',
          );
        }

        return {
          type: 'postgres',
          url,
          autoLoadEntities: false,
          entities: [
            UserEntity,
            ProjectEntity,
            TaskEntity,
            TaskUpdateEntity,
            ExcelImportEntity,
            ExcelImportErrorEntity,
            NotificationEntity,
            AuditLogEntity,
            TeamEntity,
            TeamMemberEntity,
            ClassScheduleProfileEntity,
            ClassCourseEntity,
            ClassCourseSubjectEntity,
            ClassSessionEntity,
          ],
          synchronize: false,
        };
      },
    }),
    AuthModule,
    UsersModule,
    ProjectsModule,
    TasksModule,
    TaskUpdatesModule,
    ImportsModule,
    DashboardModule,
    ReportsModule,
    NotificationsModule,
    AuditLogsModule,
    TeamsModule,
    TeacherAvailabilityModule,
    ClassPlanningModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
