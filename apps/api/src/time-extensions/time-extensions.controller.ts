import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TimeExtensionsService } from './time-extensions.service';
import { CreateTimeExtensionRequestDto } from './dto/create-time-extension-request.dto';
import { ApproveTimeExtensionDto } from './dto/approve-time-extension.dto';
import { RejectTimeExtensionDto } from './dto/reject-time-extension.dto';
import type { TimeExtensionStatus } from '../database/entities/time-extension-request.entity';

type AuthedRequest = {
  user: { id: string; role: 'manager' | 'lead' | 'worker' };
};

@Controller('time-extension-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TimeExtensionsController {
  constructor(private readonly service: TimeExtensionsService) {}

  @Get()
  @Roles('manager', 'lead', 'worker')
  findAll(@Req() req: AuthedRequest, @Query('status') status?: string) {
    if (status && !['pending', 'approved', 'rejected'].includes(status)) {
      throw new BadRequestException('Invalid status filter');
    }
    return this.service.findAll(
      status as TimeExtensionStatus | undefined,
      req.user,
    );
  }

  @Post()
  @Roles('manager', 'lead', 'worker')
  create(
    @Body() dto: CreateTimeExtensionRequestDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.create(dto, req.user);
  }

  @Patch(':requestId/approve')
  @Roles('manager')
  approve(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: ApproveTimeExtensionDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.approve(requestId, dto, req.user);
  }

  @Patch(':requestId/reject')
  @Roles('manager')
  reject(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: RejectTimeExtensionDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.reject(requestId, dto, req.user);
  }
}
