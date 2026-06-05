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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
