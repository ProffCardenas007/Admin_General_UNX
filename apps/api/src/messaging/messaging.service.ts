import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageConversationParticipantEntity } from '../database/entities/message-conversation-participant.entity';
import { MessageConversationEntity } from '../database/entities/message-conversation.entity';
import { MessageEntity } from '../database/entities/message.entity';
import { NotificationEntity } from '../database/entities/notification.entity';
import { ProjectEntity } from '../database/entities/project.entity';
import { TaskEntity } from '../database/entities/task.entity';
import { UserEntity } from '../database/entities/user.entity';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';

type MessagingActor = { id: string; role: UserEntity['role'] };

@Injectable()
export class MessagingService {
  constructor(
    @InjectRepository(MessageConversationEntity)
    private readonly conversationsRepository: Repository<MessageConversationEntity>,
    @InjectRepository(MessageConversationParticipantEntity)
    private readonly participantsRepository: Repository<MessageConversationParticipantEntity>,
    @InjectRepository(MessageEntity)
    private readonly messagesRepository: Repository<MessageEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectsRepository: Repository<ProjectEntity>,
    @InjectRepository(TaskEntity)
    private readonly tasksRepository: Repository<TaskEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  listUsers(actor: MessagingActor) {
    return this.usersRepository
      .find({
        where: { isActive: true },
        select: { id: true, fullName: true, role: true },
        order: { fullName: 'ASC' },
      })
      .then((users) => users.filter((user) => user.id !== actor.id));
  }

  async listConversations(actor: MessagingActor) {
    const conversations = await this.conversationsRepository.find({
      where: [{ userOneId: actor.id }, { userTwoId: actor.id }],
      order: {
        lastMessageAt: { direction: 'DESC', nulls: 'last' },
        updatedAt: 'DESC',
      },
    });

    return Promise.all(
      conversations.map(async (conversation) => {
        const otherUserId =
          conversation.userOneId === actor.id
            ? conversation.userTwoId
            : conversation.userOneId;
        const participant = await this.participantsRepository.findOne({
          where: { conversationId: conversation.id, userId: actor.id },
        });
        const [otherUser, lastMessage, unreadCount] = await Promise.all([
          this.usersRepository.findOne({
            where: { id: otherUserId },
            select: { id: true, fullName: true, role: true },
          }),
          this.messagesRepository.findOne({
            where: { conversationId: conversation.id },
            order: { createdAt: 'DESC' },
          }),
          (() => {
            const unreadQuery = this.messagesRepository
              .createQueryBuilder('message')
              .where('message.conversation_id = :conversationId', {
                conversationId: conversation.id,
              })
              .andWhere('message.sender_id <> :userId', { userId: actor.id });
            if (participant?.lastReadAt) {
              unreadQuery.andWhere('message.created_at > :lastReadAt', {
                lastReadAt: participant.lastReadAt,
              });
            }
            return unreadQuery.getCount();
          })(),
        ]);

        return {
          id: conversation.id,
          otherUser,
          lastMessage,
          unreadCount,
          updatedAt: conversation.lastMessageAt ?? conversation.updatedAt,
        };
      }),
    );
  }

  async openConversation(dto: CreateConversationDto, actor: MessagingActor) {
    if (dto.recipientId === actor.id) {
      throw new BadRequestException('You cannot start a conversation with yourself');
    }

    const recipient = await this.usersRepository.findOne({
      where: { id: dto.recipientId, isActive: true },
      select: { id: true },
    });
    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }

    const [userOneId, userTwoId] = [actor.id, recipient.id].sort();
    return this.conversationsRepository.manager.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO message_conversations (user_one_id, user_two_id)
         VALUES ($1, $2)
         ON CONFLICT (user_one_id, user_two_id) DO NOTHING`,
        [userOneId, userTwoId],
      );
      const conversation = await manager
        .getRepository(MessageConversationEntity)
        .findOne({ where: { userOneId, userTwoId } });
      if (!conversation) {
        throw new Error('Conversation could not be opened');
      }

      await manager.query(
        `INSERT INTO message_conversation_participants
           (conversation_id, user_id, last_read_at)
         VALUES ($1, $2, NOW()), ($1, $3, NOW())
         ON CONFLICT (conversation_id, user_id) DO NOTHING`,
        [conversation.id, userOneId, userTwoId],
      );
      return conversation;
    });
  }

  private async getConversationForParticipant(
    conversationId: string,
    actorId: string,
  ) {
    const conversation = await this.conversationsRepository.findOne({
      where: [
        { id: conversationId, userOneId: actorId },
        { id: conversationId, userTwoId: actorId },
      ],
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  async listMessages(
    conversationId: string,
    before: string | undefined,
    actor: MessagingActor,
  ) {
    await this.getConversationForParticipant(conversationId, actor.id);
    let beforeMessage: MessageEntity | null = null;
    if (before) {
      beforeMessage = await this.messagesRepository.findOne({
        where: { id: before, conversationId },
      });
      if (!beforeMessage) {
        throw new BadRequestException('Invalid message cursor');
      }
    }

    const query = this.messagesRepository
      .createQueryBuilder('message')
      .where('message.conversation_id = :conversationId', { conversationId })
      .orderBy('message.created_at', 'DESC')
      .addOrderBy('message.id', 'DESC')
      .take(51);
    if (beforeMessage) {
      query.andWhere(
        '(message.created_at, message.id) < (:beforeCreatedAt, :beforeId)',
        {
          beforeCreatedAt: beforeMessage.createdAt,
          beforeId: beforeMessage.id,
        },
      );
    }

    const rows = await query.getMany();
    const hasMore = rows.length > 50;
    const messages = rows.slice(0, 50).reverse();
    await this.participantsRepository.update(
      { conversationId, userId: actor.id },
      { lastReadAt: new Date() },
    );
    return { messages, hasMore };
  }

  async sendMessage(
    conversationId: string,
    dto: CreateMessageDto,
    actor: MessagingActor,
  ) {
    const conversation = await this.getConversationForParticipant(
      conversationId,
      actor.id,
    );
    const content = dto.content.trim();
    if (!content) {
      throw new BadRequestException('Message content cannot be empty');
    }

    let task: TaskEntity | null = null;
    if (dto.taskId) {
      task = await this.tasksRepository.findOne({ where: { id: dto.taskId } });
      if (!task) {
        throw new NotFoundException('Task context not found');
      }
    }
    if (dto.projectId) {
      const project = await this.projectsRepository.findOne({
        where: { id: dto.projectId },
        select: { id: true },
      });
      if (!project) {
        throw new NotFoundException('Project context not found');
      }
    }
    if (task && dto.projectId && task.projectId !== dto.projectId) {
      throw new BadRequestException(
        'The selected task does not belong to the selected project',
      );
    }

    const recipientId =
      conversation.userOneId === actor.id
        ? conversation.userTwoId
        : conversation.userOneId;
    const sender = await this.usersRepository.findOne({
      where: { id: actor.id },
      select: { id: true, fullName: true },
    });
    if (!sender) {
      throw new NotFoundException('Sender not found');
    }

    return this.conversationsRepository.manager.transaction(async (manager) => {
      const message = await manager.getRepository(MessageEntity).save(
        manager.getRepository(MessageEntity).create({
          conversationId,
          senderId: actor.id,
          content,
          taskId: task?.id ?? null,
          projectId: dto.projectId ?? task?.projectId ?? null,
        }),
      );
      await manager.query(
        `UPDATE message_conversations
         SET last_message_at = GREATEST(COALESCE(last_message_at, $2), $2),
             updated_at = NOW()
         WHERE id = $1`,
        [conversationId, message.createdAt],
      );
      await manager.getRepository(NotificationEntity).save(
        manager.getRepository(NotificationEntity).create({
          userId: recipientId,
          taskId: task?.id ?? undefined,
          conversationId,
          title: `Nuevo mensaje de ${sender.fullName}`,
          message: content.slice(0, 500),
          type: 'message',
          isRead: false,
        }),
      );
      return message;
    });
  }
}
