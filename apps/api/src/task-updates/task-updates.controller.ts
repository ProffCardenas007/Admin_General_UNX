import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TaskUpdatesService } from './task-updates.service';
import { CreateTaskUpdateDto } from './dto/create-task-update.dto';

@Controller('task-updates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TaskUpdatesController {
  constructor(private readonly taskUpdatesService: TaskUpdatesService) {}

  @Get()
  @Roles('manager', 'lead', 'worker')
  findByTask(
    @Query('taskId') taskId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Req() req: { user: { id: string; role: 'manager' | 'lead' | 'worker' } },
  ) {
    if (!taskId) {
      throw new BadRequestException('taskId is required');
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (from && !datePattern.test(from)) {
      throw new BadRequestException('from must be in YYYY-MM-DD format');
    }

    if (to && !datePattern.test(to)) {
      throw new BadRequestException('to must be in YYYY-MM-DD format');
    }

    if (from && to && from > to) {
      throw new BadRequestException('from cannot be greater than to');
    }

    return this.taskUpdatesService.findByTask(taskId, req.user, from, to);
  }

  @Post()
  @Roles('manager', 'lead', 'worker')
  create(
    @Body() dto: CreateTaskUpdateDto,
    @Req() req: { user: { id: string; role: 'manager' | 'lead' | 'worker' } },
  ) {
    return this.taskUpdatesService.create(dto, req.user);
  }
}
