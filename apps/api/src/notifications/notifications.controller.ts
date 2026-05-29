import { Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @Roles('manager', 'lead', 'worker')
  findMine(
    @Req() req: { user: { id: string } },
    @Query('status') status?: 'all' | 'unread' | 'read',
  ) {
    return this.notificationsService.findMine(req.user, status ?? 'all');
  }

  @Patch(':notificationId/read')
  @Roles('manager', 'lead', 'worker')
  markRead(
    @Param('notificationId') notificationId: string,
    @Req() req: { user: { id: string } },
  ) {
    return this.notificationsService.markRead(notificationId, req.user);
  }

  @Patch('read-all')
  @Roles('manager', 'lead', 'worker')
  markAllRead(@Req() req: { user: { id: string } }) {
    return this.notificationsService.markAllRead(req.user);
  }
}
