import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationEntity } from '../database/entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationsRepository: Repository<NotificationEntity>,
  ) {}

  findMine(actor: { id: string }, status?: 'all' | 'unread' | 'read') {
    const qb = this.notificationsRepository
      .createQueryBuilder('notification')
      .where('notification.user_id = :userId', { userId: actor.id })
      .orderBy('notification.is_read', 'ASC')
      .addOrderBy('notification.created_at', 'DESC');

    if (status === 'unread') {
      qb.andWhere('notification.is_read = false');
    }

    if (status === 'read') {
      qb.andWhere('notification.is_read = true');
    }

    return qb.getMany();
  }

  async markRead(notificationId: string, actor: { id: string }) {
    const notification = await this.notificationsRepository.findOne({
      where: { id: notificationId, userId: actor.id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await this.notificationsRepository.save(notification);
    }

    return notification;
  }

  async markAllRead(actor: { id: string }) {
    await this.notificationsRepository
      .createQueryBuilder()
      .update(NotificationEntity)
      .set({ isRead: true, readAt: new Date() })
      .where('user_id = :userId', { userId: actor.id })
      .andWhere('is_read = false')
      .execute();

    return { ok: true };
  }

  async createMany(
    recipients: Array<{ userId: string }>,
    input: { title: string; message: string; taskId?: string | null },
  ) {
    if (recipients.length === 0) {
      return { created: 0 };
    }

    const notifications = recipients.map((recipient) =>
      this.notificationsRepository.create({
        userId: recipient.userId,
        taskId: input.taskId ?? undefined,
        title: input.title,
        message: input.message,
      }),
    );

    await this.notificationsRepository.save(notifications);
    return { created: notifications.length };
  }
}
