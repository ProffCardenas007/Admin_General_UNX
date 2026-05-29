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
import { UserEntity } from './database/entities/user.entity';
import { ProjectEntity } from './database/entities/project.entity';
import { TaskEntity } from './database/entities/task.entity';
import { TaskUpdateEntity } from './database/entities/task-update.entity';
import { ExcelImportEntity } from './database/entities/excel-import.entity';
import { ExcelImportErrorEntity } from './database/entities/excel-import-error.entity';
import { NotificationEntity } from './database/entities/notification.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.getOrThrow<string>('DATABASE_URL'),
        autoLoadEntities: false,
        entities: [
          UserEntity,
          ProjectEntity,
          TaskEntity,
          TaskUpdateEntity,
          ExcelImportEntity,
          ExcelImportErrorEntity,
          NotificationEntity,
        ],
        synchronize: false,
      }),
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
