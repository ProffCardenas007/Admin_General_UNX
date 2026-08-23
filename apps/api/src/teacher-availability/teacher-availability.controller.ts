import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TeacherAvailabilityService } from './teacher-availability.service';
import { UpsertTeacherAvailabilityDto } from './dto/upsert-teacher-availability.dto';

@Controller('teacher-availability')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeacherAvailabilityController {
  constructor(private readonly teacherAvailabilityService: TeacherAvailabilityService) {}

  @Get('me')
  @Roles('manager', 'lead', 'worker')
  findMine(@Req() req: { user: { id: string } }) {
    return this.teacherAvailabilityService.findMine(req.user.id);
  }

  @Put('me')
  @Roles('manager', 'lead', 'worker')
  upsertMine(
    @Req() req: { user: { id: string } },
    @Body() dto: UpsertTeacherAvailabilityDto,
  ) {
    return this.teacherAvailabilityService.upsertMine(req.user.id, dto);
  }

  @Get('registry')
  @Roles('manager')
  findRegistry() {
    return this.teacherAvailabilityService.findRegistry();
  }

  @Put('users/:userId')
  @Roles('manager')
  upsertByUserId(@Param('userId') userId: string, @Body() dto: UpsertTeacherAvailabilityDto) {
    return this.teacherAvailabilityService.upsertByUserId(userId, dto);
  }
}
