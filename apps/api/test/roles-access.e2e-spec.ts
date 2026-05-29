import { CanActivate, ExecutionContext, INestApplication, Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { TasksController } from '../src/tasks/tasks.controller';
import { TasksService } from '../src/tasks/tasks.service';
import { DashboardController } from '../src/dashboard/dashboard.controller';
import { DashboardService } from '../src/dashboard/dashboard.service';
import { ReportsController } from '../src/reports/reports.controller';
import { ReportsService } from '../src/reports/reports.service';
import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';

@Injectable()
class MockJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
      user?: { id: string; role: 'manager' | 'lead' | 'worker' };
    }>();

    const roleHeader = request.headers['x-test-role'];
    const userIdHeader = request.headers['x-test-user-id'];
    const role =
      roleHeader === 'manager' || roleHeader === 'lead' || roleHeader === 'worker'
        ? roleHeader
        : 'worker';

    request.user = {
      id: userIdHeader ?? 'worker-1',
      role,
    };
    return true;
  }
}

describe('Role Access (e2e)', () => {
  let app: INestApplication<App>;

  const tasksServiceMock = {
    findAll: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'task-1' }),
    update: jest.fn().mockResolvedValue({ id: 'task-1' }),
  };

  const dashboardServiceMock = {
    getSummary: jest.fn().mockResolvedValue({
      activeProjects: 1,
      completionRate: 50,
      overdueTasks: 0,
      blockedTasks: 0,
      hoursWorked: 4,
    }),
    getWorkload: jest.fn().mockResolvedValue([]),
    getTrends: jest.fn().mockResolvedValue([]),
  };

  const reportsServiceMock = {
    buildTasksCsv: jest.fn().mockResolvedValue('task_id,task_code\n1,TASK-1'),
  };

  const usersServiceMock = {
    findAll: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'user-1' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        TasksController,
        DashboardController,
        ReportsController,
        UsersController,
      ],
      providers: [
        RolesGuard,
        { provide: TasksService, useValue: tasksServiceMock },
        { provide: DashboardService, useValue: dashboardServiceMock },
        { provide: ReportsService, useValue: reportsServiceMock },
        { provide: UsersService, useValue: usersServiceMock },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockJwtAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('worker cannot create tasks', async () => {
    await request(app.getHttpServer())
      .post('/tasks')
      .set('x-test-role', 'worker')
      .send({ code: 'TASK-1' })
      .expect(403);
  });

  it('lead can create tasks', async () => {
    await request(app.getHttpServer())
      .post('/tasks')
      .set('x-test-role', 'lead')
      .send({ code: 'TASK-1' })
      .expect(201);

    expect(tasksServiceMock.create).toHaveBeenCalled();
  });

  it('worker can access dashboard summary', async () => {
    await request(app.getHttpServer())
      .get('/dashboard/summary')
      .set('x-test-role', 'worker')
      .expect(200);

    expect(dashboardServiceMock.getSummary).toHaveBeenCalled();
  });

  it('worker can download scoped CSV report', async () => {
    await request(app.getHttpServer())
      .get('/reports/tasks.csv')
      .set('x-test-role', 'worker')
      .set('x-test-user-id', 'worker-99')
      .expect(200)
      .expect('Content-Type', /text\/csv/);

    expect(reportsServiceMock.buildTasksCsv).toHaveBeenCalledWith(
      { projectId: undefined, status: undefined },
      { id: 'worker-99', role: 'worker' },
    );
  });

  it('worker cannot list users', async () => {
    await request(app.getHttpServer())
      .get('/users')
      .set('x-test-role', 'worker')
      .expect(403);
  });
});
