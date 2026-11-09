import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessagingService } from './messaging.service';

type AuthenticatedRequest = {
  user: { id: string; role: 'manager' | 'lead' | 'worker' };
};

@Controller('messaging')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('manager', 'lead', 'worker')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Get('users')
  listUsers(@Req() req: AuthenticatedRequest) {
    return this.messagingService.listUsers(req.user);
  }

  @Get('conversations')
  listConversations(@Req() req: AuthenticatedRequest) {
    return this.messagingService.listConversations(req.user);
  }

  @Post('conversations')
  openConversation(
    @Body() dto: CreateConversationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.messagingService.openConversation(dto, req.user);
  }

  @Get('conversations/:conversationId/messages')
  listMessages(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Query('before') before: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.messagingService.listMessages(conversationId, before, req.user);
  }

  @Post('conversations/:conversationId/messages')
  sendMessage(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() dto: CreateMessageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.messagingService.sendMessage(
      conversationId,
      dto,
      req.user,
    );
  }
}
