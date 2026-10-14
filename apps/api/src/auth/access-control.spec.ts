import 'reflect-metadata';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY, UserRole } from './roles.decorator';
import { AuditLogsController } from '../audit-logs/audit-logs.controller';
import { ClassPlanningController } from '../class-planning/class-planning.controller';
import { DashboardController } from '../dashboard/dashboard.controller';
import { ImportsController } from '../imports/imports.controller';
import { NotificationsController } from '../notifications/notifications.controller';
import { ProjectsController } from '../projects/projects.controller';
import { ReportsController } from '../reports/reports.controller';
import { SpecialtiesController } from '../specialties/specialties.controller';
import { TaskUpdatesController } from '../task-updates/task-updates.controller';
import { TasksController } from '../tasks/tasks.controller';
import { TeacherAvailabilityController } from '../teacher-availability/teacher-availability.controller';
import { TeamsController } from '../teams/teams.controller';
import { TimeExtensionsController } from '../time-extensions/time-extensions.controller';
import { UsersController } from '../users/users.controller';

// Every controller except login and the health check must sit behind both guards.
const protectedControllers = [
  AuditLogsController,
  ClassPlanningController,
  DashboardController,
  ImportsController,
  NotificationsController,
  ProjectsController,
  ReportsController,
  SpecialtiesController,
  TaskUpdatesController,
  TasksController,
  TeacherAvailabilityController,
  TeamsController,
  TimeExtensionsController,
  UsersController,
];

const rolesOf = (controller: { prototype: object }, method: string): UserRole[] | undefined =>
  Reflect.getMetadata(
    ROLES_KEY,
    (controller.prototype as Record<string, unknown>)[method] as object,
  );

describe('access control', () => {
  it.each(protectedControllers.map((controller) => [controller.name, controller]))(
    '%s requires authentication and role checks',
    (_name, controller) => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', controller as object) ?? [];
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(RolesGuard);
    },
  );

  // Routes that must stay manager-only: changing these is a security decision.
  it.each([
    [UsersController, 'create'],
    [UsersController, 'update'],
    [UsersController, 'remove'],
    [TimeExtensionsController, 'approve'],
    [TimeExtensionsController, 'reject'],
    [ReportsController, 'getUserPerformance'],
    [ReportsController, 'getHoursDeviation'],
  ] as const)('%p.%s is manager-only', (controller, method) => {
    expect(rolesOf(controller, method)).toEqual(['manager']);
  });

  // Planning actions: workers must never reach them.
  it.each([
    [TasksController, 'createChain'],
    [TasksController, 'markNotCompleted'],
    [ProjectsController, 'create'],
    [ProjectsController, 'update'],
    [ProjectsController, 'remove'],
  ] as const)('%p.%s excludes workers', (controller, method) => {
    const roles = rolesOf(controller, method) ?? [];
    expect(roles).toContain('manager');
    expect(roles).not.toContain('worker');
  });

  it('every route in a protected controller declares which roles may use it', () => {
    const missing: string[] = [];
    for (const controller of protectedControllers) {
      const proto = controller.prototype as unknown as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (name === 'constructor' || typeof handler !== 'function') {
          continue;
        }
        const isRoute = Reflect.getMetadata('path', handler as object) !== undefined;
        const classRoles = Reflect.getMetadata(ROLES_KEY, controller);
        if (isRoute && !rolesOf(controller, name) && !classRoles) {
          missing.push(`${controller.name}.${name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
