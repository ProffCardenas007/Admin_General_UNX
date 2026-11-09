import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageConversationEntity } from '../database/entities/message-conversation.entity';
import { MessageConversationParticipantEntity } from '../database/entities/message-conversation-participant.entity';
import { MessageEntity } from '../database/entities/message.entity';
import { NotificationEntity } from '../database/entities/notification.entity';
import { ProjectEntity } from '../database/entities/project.entity';
import { TaskEntity } from '../database/entities/task.entity';
import { UserEntity } from '../database/entities/user.entity';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MessageConversationEntity,
      MessageConversationParticipantEntity,
      MessageEntity,
      NotificationEntity,
      ProjectEntity,
      TaskEntity,
      UserEntity,
    ]),
  ],
  controllers: [MessagingController],
  providers: [MessagingService],
})
export class MessagingModule {}
