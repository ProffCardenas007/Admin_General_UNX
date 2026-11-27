import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassScheduleProfileEntity } from '../database/entities/class-schedule-profile.entity';
import { UserEntity } from '../database/entities/user.entity';
import { CALENDAR_PATTERN, currentCalendar } from '../common/calendar';
import { NotificationsService } from '../notifications/notifications.service';
import {
  TEACHING_OPTIONS,
  TeachingProfileDto,
  UpsertTeacherAvailabilityDto,
} from './dto/upsert-teacher-availability.dto';

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

  async findMine(userId: string, calendar?: string) {
    return this.findByUserId(userId, this.resolveCalendar(calendar));
  }

  async upsertMine(userId: string, dto: UpsertTeacherAvailabilityDto) {
    return this.upsertByUserId(userId, dto);
  }

  async findRegistry(requested?: string) {
    const calendar = this.resolveCalendar(requested);
    const [profiles, users] = await Promise.all([
      this.profileRepository.find(),
      this.userRepository.find({ select: ['id', 'classSubjects'] }),
    ]);
    const subjectsByUser = new Map(users.map((user) => [user.id, user.classSubjects]));
    const registry: Record<
      string,
      {
        availability: AvailabilityMap;
        incidences: IncidenceRow[];
        teaching: TeachingProfileDto;
        calendar: string;
        savedCalendars: string[];
        updatedAt: string;
      }
    > = {};

    profiles.forEach((profile) => {
      registry[profile.userId] = {
        ...this.calendarData(profile, calendar),
        incidences: this.normalizeIncidences(profile.incidences),
        teaching: this.buildTeaching(profile.teaching, subjectsByUser.get(profile.userId)),
      };
    });

    // Quien tiene materias pero aún no guardó disponibilidad también aparece.
    users.forEach((user) => {
      if (!registry[user.id] && user.classSubjects?.length) {
        registry[user.id] = {
          ...this.calendarData(undefined, calendar),
          incidences: [],
          teaching: this.buildTeaching(undefined, user.classSubjects),
        };
      }
    });

    return registry;
  }

  async upsertByUserId(userId: string, dto: UpsertTeacherAvailabilityDto) {
    const user = await this.ensureUserExists(userId);

    const currentProfile = await this.profileRepository.findOne({ where: { userId } });
    const previousIncidenceSignature = this.buildIncidenceSignature(currentProfile?.incidences);

    // Solo se toca el calendario indicado, y solo si llega disponibilidad.
    const calendar = this.resolveCalendar(dto.calendar);
    const calendars = { ...(currentProfile?.calendars ?? {}) };
    if (dto.availability) {
      calendars[calendar] = {
        availability: this.normalizeAvailability(dto.availability),
        updatedAt: new Date().toISOString(),
      };
    }
    const incidences = this.normalizeIncidences(dto.incidences ?? currentProfile?.incidences);

    let classSubjects = user.classSubjects ?? [];
    let teaching = currentProfile?.teaching ?? {};
    if (dto.teaching) {
      const { subjects, programs, modalities, venues } = dto.teaching;
      teaching = { programs, modalities, venues };
      // Se conservan otras materias que la persona tuviera (de Usuarios o de la importación).
      classSubjects = [
        ...classSubjects.filter((subject) => !TEACHING_OPTIONS.subjects.includes(subject)),
        ...subjects,
      ];
      await this.userRepository.update(userId, {
        classSubjects: classSubjects.length ? classSubjects : null,
      });
    }

    const saved = await this.profileRepository.save(
      this.profileRepository.create({
        id: currentProfile?.id,
        userId,
        calendars,
        incidences,
        teaching,
      }),
    );

    const nextIncidenceSignature = this.buildIncidenceSignature(saved.incidences);
    if (nextIncidenceSignature !== previousIncidenceSignature) {
      await this.notifyManagersAboutIncidences(userId, incidences);
    }

    return {
      ...this.calendarData(saved, calendar),
      incidences: this.normalizeIncidences(saved.incidences),
      teaching: this.buildTeaching(saved.teaching, classSubjects),
    };
  }

  private async findByUserId(userId: string, calendar: string) {
    const [profile, user] = await Promise.all([
      this.profileRepository.findOne({ where: { userId } }),
      this.userRepository.findOne({ where: { id: userId }, select: ['id', 'classSubjects'] }),
    ]);

    if (!profile) {
      return {
        ...this.calendarData(undefined, calendar),
        incidences: [] as IncidenceRow[],
        teaching: this.buildTeaching(undefined, user?.classSubjects),
      };
    }

    return {
      ...this.calendarData(profile, calendar),
      incidences: this.normalizeIncidences(profile.incidences),
      teaching: this.buildTeaching(profile.teaching, user?.classSubjects),
    };
  }

  private async ensureUserExists(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'classSubjects'],
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private resolveCalendar(calendar?: string) {
    return calendar && CALENDAR_PATTERN.test(calendar) ? calendar : currentCalendar();
  }

  /** `updatedAt` vacío = esa persona todavía no guarda ese calendario. */
  private calendarData(
    profile: Pick<ClassScheduleProfileEntity, 'calendars'> | undefined,
    calendar: string,
  ) {
    const entry = profile?.calendars?.[calendar];
    return {
      availability: this.normalizeAvailability(entry?.availability),
      calendar,
      savedCalendars: Object.keys(profile?.calendars ?? {}).sort(),
      updatedAt: entry?.updatedAt ?? '',
    };
  }

  private buildTeaching(
    stored: { programs?: string[]; modalities?: string[]; venues?: string[] } | undefined,
    classSubjects: string[] | null | undefined,
  ): TeachingProfileDto {
    const only = (values: string[] | null | undefined, allowed: string[]) =>
      allowed.filter((option) => values?.includes(option));
    return {
      subjects: only(classSubjects, TEACHING_OPTIONS.subjects),
      programs: only(stored?.programs, TEACHING_OPTIONS.programs),
      modalities: only(stored?.modalities, TEACHING_OPTIONS.modalities),
      venues: only(stored?.venues, TEACHING_OPTIONS.venues),
    };
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
