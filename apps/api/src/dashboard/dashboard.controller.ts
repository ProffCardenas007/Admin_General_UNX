import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ProjectScope } from '../common/specialties';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @Roles('manager', 'lead', 'worker')
  getSummary(
    @Req()
    req: {
      user: {
        id: string;
        role: 'manager' | 'lead' | 'worker';
        specialty?: ProjectScope | null;
        specialties?: ProjectScope[] | null;
      };
    },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.dashboardService.getSummary({ from, to, projectId }, req.user);
  }

  @Get('workload')
  @Roles('manager', 'lead', 'worker')
  getWorkload(
    @Req()
    req: {
      user: {
        id: string;
        role: 'manager' | 'lead' | 'worker';
        specialty?: ProjectScope | null;
        specialties?: ProjectScope[] | null;
      };
    },
    @Query('projectId') projectId?: string,
  ) {
    return this.dashboardService.getWorkload({ projectId }, req.user);
  }

  @Get('trends')
  @Roles('manager', 'lead', 'worker')
  getTrends(
    @Req()
    req: {
      user: {
        id: string;
        role: 'manager' | 'lead' | 'worker';
        specialty?: ProjectScope | null;
        specialties?: ProjectScope[] | null;
      };
    },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.dashboardService.getTrends({ from, to, projectId }, req.user);
  }
}
