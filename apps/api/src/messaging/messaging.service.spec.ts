import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MessageEntity } from '../database/entities/message.entity';
import { NotificationEntity } from '../database/entities/notification.entity';
import { ProjectEntity } from '../database/entities/project.entity';
import { TaskEntity } from '../database/entities/task.entity';
import { MessagingService } from './messaging.service';

describe('MessagingService', () => {
  const actor = { id: 'user-a', role: 'worker' as const };
  const conversation = {
    id: 'conversation-1',
    userOneId: 'user-a',
    userTwoId: 'user-b',
    lastMessageAt: null,
    updatedAt: new Date(),
  };
  let service: MessagingService;
  let conversationsRepository: any;
  let participantsRepository: any;
  let messagesRepository: any;
  let projectsRepository: any;
  let tasksRepository: any;
  let usersRepository: any;
  let manager: any;
  let transactionalMessageRepository: any;
  let transactionalNotificationRepository: any;

  beforeEach(() => {
    transactionalMessageRepository = {
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => ({
        id: 'message-1',
        createdAt: new Date(),
        ...input,
      })),
    };
    transactionalNotificationRepository = {
      create: jest.fn((input) => input),
      save: jest.fn().mockResolvedValue(undefined),
    };
    manager = {
      getRepository: jest.fn((entity) => {
        if (entity === MessageEntity) return transactionalMessageRepository;
        if (entity === NotificationEntity) return transactionalNotificationRepository;
        return {};
      }),
      query: jest.fn(),
    };
    conversationsRepository = {
      manager: {
        transaction: jest.fn(async (callback) => callback(manager)),
      },
      findOne: jest.fn().mockResolvedValue(conversation),
    };
    participantsRepository = { update: jest.fn().mockResolvedValue(undefined) };
    messagesRepository = {};
    projectsRepository = { findOne: jest.fn() };
    tasksRepository = { findOne: jest.fn() };
    usersRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'user-a', fullName: 'Ana' }),
    };
    service = new MessagingService(
      conversationsRepository,
      participantsRepository,
      messagesRepository,
      projectsRepository,
      tasksRepository,
      usersRepository,
    );
  });

  it('does not expose a conversation to a non-participant', async () => {
    conversationsRepository.findOne.mockResolvedValue(null);

    await expect(
      service.listMessages('conversation-1', undefined, {
        id: 'outsider',
        role: 'worker',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects empty message content', async () => {
    await expect(
      service.sendMessage(
        'conversation-1',
        { content: '   ' },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(conversationsRepository.manager.transaction).not.toHaveBeenCalled();
  });

  it('stores the message and creates a notification for the other participant', async () => {
    const sent = await service.sendMessage(
      'conversation-1',
      { content: '  Avance listo  ' },
      actor,
    );

    expect(sent).toEqual(
      expect.objectContaining({ senderId: 'user-a', content: 'Avance listo' }),
    );
    expect(transactionalNotificationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-b',
        conversationId: 'conversation-1',
        type: 'message',
        message: 'Avance listo',
      }),
    );
  });

  it('rejects opening a conversation with oneself', async () => {
    await expect(
      service.openConversation({ recipientId: actor.id }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(usersRepository.findOne).not.toHaveBeenCalled();
  });
});
