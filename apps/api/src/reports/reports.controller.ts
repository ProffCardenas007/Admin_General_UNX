import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('users/performance')
  @Roles('manager')
  getUserPerformance(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
  ) {
    return this.reportsService.getUserPerformance({ from, to });
  }

  @Get('tasks.csv')
  @Roles('manager', 'lead', 'worker')
  async downloadTasksCsv(
    @Req() req: { user: { id: string; role: 'manager' | 'lead' | 'worker' } },
    @Query('projectId') projectId: string | undefined,
    @Query('status') status: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.reportsService.buildTasksCsv(
      { projectId, status },
      req.user,
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="tasks-report.csv"',
    );
    return res.send(csv);
  }

  @Get('users/:userId/activity.xlsx')
  @Roles('manager', 'lead', 'worker')
  async downloadUserActivityExcel(
    @Req()
    req: {
      user: {
        id: string;
        role: 'manager' | 'lead' | 'worker';
        specialty?: string | null;
        specialties?: string[] | null;
      };
    },
    @Param('userId') userId: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    const { buffer, fileName } =
      await this.reportsService.buildUserActivityExcel(
        userId,
        { from, to },
        req.user,
      );

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`,
    );
    return res.send(buffer);
  }
}
