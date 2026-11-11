import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { CreateTaskChainDto } from './dto/create-task-chain.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MarkTaskNotCompletedDto } from './dto/mark-task-not-completed.dto';
import { ReviewTaskDto, SelfReportTaskDto } from './dto/self-report-task.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { ProjectScope } from '../common/specialties';

@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @Roles('manager', 'lead', 'worker')
  findAll(
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
    @Query('assigneeId') assigneeId?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('scope') scope?: string,
  ) {
    return this.tasksService.findAll(
      { projectId, assigneeId, status, priority, scope },
      req.user,
    );
  }

  @Post()
  @Roles('manager', 'lead')
  create(
    @Body() dto: CreateTaskDto,
    @Req()
    req: {
      user: {
        id: string;
        role: 'manager' | 'lead' | 'worker';
        specialty?: ProjectScope | null;
        specialties?: ProjectScope[] | null;
      };
    },
  ) {
    return this.tasksService.create(dto, req.user);
  }

  @Post('self-report')
  @Roles('lead', 'worker')
  selfReport(
    @Body() dto: SelfReportTaskDto,
    @Req() req: { user: { id: string; role: 'manager' | 'lead' | 'worker' } },
  ) {
    return this.tasksService.selfReport(dto, req.user);
  }

  @Get('administrative-timers')
  @Roles('lead')
  listAdministrativeTimers(
    @Req()
    req: {
      user: {
        id: string;
        role: 'manager' | 'lead' | 'worker';
        specialty?: ProjectScope | null;
        specialties?: ProjectScope[] | null;
      };
    },
  ) {
    return this.tasksService.listAdministrativeTimers(req.user);
  }

  @Post('administrative-timers/:scope/start')
  @Roles('lead')
  startAdministrativeTimer(
    @Param('scope') scope: ProjectScope,
    @Req()
    req: {
      user: {
        id: string;
        role: 'manager' | 'lead' | 'worker';
        specialty?: ProjectScope | null;
        specialties?: ProjectScope[] | null;
      };
    },
  ) {
    return this.tasksService.startAdministrativeTimer(scope, req.user);
  }

  @Post('administrative-timers/:scope/pause')
  @Roles('lead')
  pauseAdministrativeTimer(
    @Param('scope') scope: ProjectScope,
    @Req()
    req: {
      user: {
        id: string;
        role: 'manager' | 'lead' | 'worker';
        specialty?: ProjectScope | null;
        specialties?: ProjectScope[] | null;
      };
    },
  ) {
    return this.tasksService.pauseAdministrativeTimer(scope, req.user);
  }

  @Patch(':taskId/review')
  @Roles('manager')
  review(
    @Param('taskId') taskId: string,
    @Body() dto: ReviewTaskDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.tasksService.review(taskId, dto, req.user.id);
  }

  @Post('chains')
  @Roles('manager', 'lead')
  createChain(
    @Body() dto: CreateTaskChainDto,
    @Req()
    req: {
      user: {
        id: string;
        role: 'manager' | 'lead' | 'worker';
        specialty?: ProjectScope | null;
        specialties?: ProjectScope[] | null;
      };
    },
  ) {
    return this.tasksService.createChain(dto, req.user);
  }

  @Patch(':taskId')
  @Roles('manager', 'lead', 'worker')
  update(
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
    @Req()
    req: {
      user: {
        id: string;
        role: 'manager' | 'lead' | 'worker';
        specialty?: ProjectScope | null;
        specialties?: ProjectScope[] | null;
      };
    },
  ) {
    return this.tasksService.update(taskId, dto, req.user);
  }

  @Patch(':taskId/claim')
  @Roles('lead', 'worker')
  claim(
    @Param('taskId') taskId: string,
    @Req()
    req: {
      user: {
        id: string;
        role: 'lead' | 'worker';
      };
    },
  ) {
    return this.tasksService.claim(taskId, req.user);
  }

  @Patch(':taskId/not-completed')
  @Roles('manager', 'lead')
  markNotCompleted(
    @Param('taskId') taskId: string,
    @Body() dto: MarkTaskNotCompletedDto,
    @Req()
    req: {
      user: {
        id: string;
        role: 'manager' | 'lead' | 'worker';
        specialty?: ProjectScope | null;
        specialties?: ProjectScope[] | null;
      };
    },
  ) {
    return this.tasksService.markNotCompleted(taskId, dto, req.user);
  }

  @Delete(':taskId')
  @Roles('manager', 'lead', 'worker')
  remove(
    @Param('taskId') taskId: string,
    @Req()
    req: {
      user: {
        id: string;
        role: 'manager' | 'lead' | 'worker';
      };
    },
  ) {
    return this.tasksService.remove(taskId, req.user);
  }
}
