import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassScheduleProfileEntity } from '../database/entities/class-schedule-profile.entity';
import { UserEntity } from '../database/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { UpsertTeacherAvailabilityDto } from './dto/upsert-teacher-availability.dto';

type AvailabilityStatus = 'full' | 'confirm' | 'busy';
type AvailabilityMap = Record<string, AvailabilityStatus>;
type IncidenceRow = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
};

@Injectable()
export class TeacherAvailabilityService {
  constructor(
    @InjectRepository(ClassScheduleProfileEntity)
    private readonly profileRepository: Repository<ClassScheduleProfileEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findMine(userId: string) {
    return this.findByUserId(userId);
  }

  async upsertMine(userId: string, dto: UpsertTeacherAvailabilityDto) {
    return this.upsertByUserId(userId, dto);
  }

  async findRegistry() {
    const profiles = await this.profileRepository.find();
    const registry: Record<
      string,
      { availability: AvailabilityMap; incidences: IncidenceRow[]; updatedAt: string }
    > = {};

    profiles.forEach((profile) => {
      registry[profile.userId] = {
        availability: this.normalizeAvailability(profile.availability),
        incidences: this.normalizeIncidences(profile.incidences),
        updatedAt: this.formatStoredDate(profile.updatedAt),
      };
    });

    return registry;
  }

  async upsertByUserId(userId: string, dto: UpsertTeacherAvailabilityDto) {
    await this.ensureUserExists(userId);

    const currentProfile = await this.profileRepository.findOne({ where: { userId } });
    const previousIncidenceSignature = this.buildIncidenceSignature(currentProfile?.incidences);

    const availability = this.normalizeAvailability(dto.availability ?? currentProfile?.availability);
    const incidences = this.normalizeIncidences(dto.incidences ?? currentProfile?.incidences);

    const saved = await this.profileRepository.save(
      this.profileRepository.create({
        id: currentProfile?.id,
        userId,
        availability,
        incidences,
      }),
    );

    const nextIncidenceSignature = this.buildIncidenceSignature(saved.incidences);
    if (nextIncidenceSignature !== previousIncidenceSignature) {
      await this.notifyManagersAboutIncidences(userId, incidences);
    }

    return {
      availability: this.normalizeAvailability(saved.availability),
      incidences: this.normalizeIncidences(saved.incidences),
      updatedAt: this.formatStoredDate(saved.updatedAt),
    };
  }

  private async findByUserId(userId: string) {
    const profile = await this.profileRepository.findOne({ where: { userId } });

    if (!profile) {
      return {
        availability: {} as AvailabilityMap,
        incidences: [] as IncidenceRow[],
        updatedAt: '',
      };
    }

    return {
      availability: this.normalizeAvailability(profile.availability),
      incidences: this.normalizeIncidences(profile.incidences),
      updatedAt: this.formatStoredDate(profile.updatedAt),
    };
  }

  private async ensureUserExists(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId }, select: ['id'] });
    if (!user) {
      throw new NotFoundException('User not found');
    }
  }

  private normalizeAvailability(raw: unknown): AvailabilityMap {
    if (!raw || typeof raw !== 'object') {
      return {};
    }

    const normalized: AvailabilityMap = {};
    Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
      if (value === 'full' || value === 'confirm' || value === 'busy') {
        normalized[key] = value;
      }
    });

    return normalized;
  }

  private normalizeIncidences(raw: unknown): IncidenceRow[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const row = item as {
          id?: unknown;
          date?: unknown;
          startTime?: unknown;
          endTime?: unknown;
          reason?: unknown;
        };

        if (
          typeof row.date !== 'string' ||
          typeof row.startTime !== 'string' ||
          typeof row.endTime !== 'string'
        ) {
          return null;
        }

        return {
          id:
            typeof row.id === 'string' && row.id
              ? row.id
              : `${row.date}-${row.startTime}-${row.endTime}`,
          date: row.date,
          startTime: row.startTime,
          endTime: row.endTime,
          reason: typeof row.reason === 'string' ? row.reason.trim() : '',
        };
      })
      .filter((item): item is IncidenceRow => item !== null)
      .sort((a, b) => `${a.date}-${a.startTime}`.localeCompare(`${b.date}-${b.startTime}`));
  }

  private buildIncidenceSignature(raw: unknown) {
    const incidences = this.normalizeIncidences(raw);
    return incidences
      .map((incidence) => `${incidence.date}|${incidence.startTime}|${incidence.endTime}|${incidence.reason}`)
      .join('||');
  }

  private formatStoredDate(value: Date | string | null | undefined) {
    if (!value) {
      return '';
    }

    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }

  private async notifyManagersAboutIncidences(userId: string, incidences: IncidenceRow[]) {
    const managers = await this.userRepository.find({
      where: { role: 'manager', isActive: true },
      select: ['id', 'fullName'],
    });

    if (managers.length === 0) {
      return;
    }

    const teacher = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'fullName'],
    });

    const latestIncidence = incidences[incidences.length - 1];
    if (!latestIncidence) {
      return;
    }

    await this.notificationsService.createMany(
      managers.map((manager) => ({ userId: manager.id })),
      {
        title: 'Nueva incidencia de profesor',
        message: `${teacher?.fullName ?? 'Un profesor'} registró una incidencia para ${latestIncidence.date} de ${latestIncidence.startTime} a ${latestIncidence.endTime}${latestIncidence.reason ? ` · ${latestIncidence.reason}` : ''}. Revisa cobertura de clase.`,
      },
    );
  }
}
