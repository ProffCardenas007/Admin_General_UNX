import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ClassCourseEntity } from '../database/entities/class-course.entity';
import { ClassCourseSubjectEntity } from '../database/entities/class-course-subject.entity';
import { ClassSessionEntity } from '../database/entities/class-session.entity';
import { ClassScheduleProfileEntity } from '../database/entities/class-schedule-profile.entity';
import { UserEntity } from '../database/entities/user.entity';
import { CreateClassCourseDto } from './dto/create-class-course.dto';
import { UpdateClassCourseDto } from './dto/update-class-course.dto';
import { CreateClassSubjectDto } from './dto/create-class-subject.dto';
import { AssignSubjectTeacherDto } from './dto/assign-subject-teacher.dto';
import { CreateClassSessionDto } from './dto/create-class-session.dto';
import { AssignSessionCoverageDto } from './dto/assign-session-coverage.dto';

const PHYSICAL_CLASSROOMS = Array.from({ length: 10 }, (_, index) => `Aula ${index + 1}`);
const VIRTUAL_ROOMS = Array.from({ length: 11 }, (_, index) => `Sala ${index + 1}`);

const getAvailableRooms = (modality: 'presencial' | 'virtual') =>
  modality === 'virtual' ? VIRTUAL_ROOMS : PHYSICAL_CLASSROOMS;
const PRESENCIAL_TIME_BLOCKS = [
  { startTime: '08:00', endTime: '10:30' },
  { startTime: '11:00', endTime: '13:30' },
  { startTime: '16:00', endTime: '18:30' },
];
const VIRTUAL_EXTRA_TIME_BLOCK = { startTime: '19:00', endTime: '22:30' };

@Injectable()
export class ClassPlanningService {
  constructor(
    @InjectRepository(ClassCourseEntity)
    private readonly coursesRepository: Repository<ClassCourseEntity>,
    @InjectRepository(ClassCourseSubjectEntity)
    private readonly subjectsRepository: Repository<ClassCourseSubjectEntity>,
    @InjectRepository(ClassSessionEntity)
    private readonly sessionsRepository: Repository<ClassSessionEntity>,
    @InjectRepository(ClassScheduleProfileEntity)
    private readonly classScheduleProfilesRepository: Repository<ClassScheduleProfileEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async findCourses() {
    const courses = await this.coursesRepository.find({
      order: { createdAt: 'DESC' },
    });

    const subjects = await this.subjectsRepository.find({
      order: { displayOrder: 'ASC', name: 'ASC' },
    });

    const teacherIds = [...new Set(subjects.map((subject) => subject.teacherUserId).filter(Boolean) as string[])];
    const teachers = teacherIds.length
      ? await this.usersRepository.find({ where: { id: In(teacherIds) } })
      : [];

    const teacherNameById = new Map(teachers.map((teacher) => [teacher.id, teacher.fullName]));

    return courses.map((course) => ({
      ...course,
      subjects: subjects
        .filter((subject) => subject.courseId === course.id)
        .map((subject) => ({
          ...subject,
          teacherName: subject.teacherUserId
            ? teacherNameById.get(subject.teacherUserId) ?? ''
            : '',
        })),
    }));
  }

  async createCourse(dto: CreateClassCourseDto) {
    const code = this.normalizeCourseType(dto.code);
    const sectionCode = this.normalizeSectionCode(dto.sectionCode);
    const name = dto.name.trim();
    const modality = dto.modality;
    const classroom = dto.classroom.trim();
    const startTime = dto.startTime;
    const endTime = dto.endTime;
    const termStartDate = dto.termStartDate ? dto.termStartDate.slice(0, 10) : null;
    const termEndDate = dto.termEndDate ? dto.termEndDate.slice(0, 10) : null;

    if (!getAvailableRooms(modality).includes(classroom)) {
      throw new BadRequestException(
        modality === 'virtual'
          ? 'Selecciona una sala valida (Sala 1 a Sala 11) para cursos virtuales'
          : 'Selecciona un aula valida (Aula 1 a Aula 10) para cursos presenciales',
      );
    }

    if (startTime >= endTime) {
      throw new BadRequestException('La hora fin debe ser mayor a la hora inicio');
    }

    if (termStartDate && termEndDate && termStartDate > termEndDate) {
      throw new BadRequestException('La fecha de fin de vigencia debe ser mayor a la fecha de inicio');
    }

    this.ensureValidTimeBlockByModality(modality, startTime, endTime);
    await this.ensureNoCourseBaseClassroomConflict(
      classroom,
      startTime,
      endTime,
      undefined,
      termStartDate,
      termEndDate,
    );

    const duplicateCourse = await this.coursesRepository.findOne({ where: { name, sectionCode } });
    if (duplicateCourse) {
      throw new ConflictException(`Ya existe el curso ${name} ${sectionCode}`);
    }

    return this.coursesRepository.save(
      this.coursesRepository.create({
        code,
        sectionCode,
        name,
        modality,
        classroom,
        scheduleStartTime: startTime,
        scheduleEndTime: endTime,
        termStartDate,
        termEndDate,
        isActive: dto.isActive ?? true,
      }),
    );
  }

  async createSubject(courseId: string, dto: CreateClassSubjectDto) {
    await this.ensureCourseExists(courseId);

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Subject name is required');
    }

    if (dto.teacherUserId) {
      await this.ensureTeacherUser(dto.teacherUserId);
    }

    const duplicate = await this.subjectsRepository.findOne({
      where: { courseId, name },
    });

    if (duplicate) {
      throw new ConflictException('Subject already exists in this course');
    }

    return this.subjectsRepository.save(
      this.subjectsRepository.create({
        courseId,
        name,
        teacherUserId: dto.teacherUserId ?? null,
        displayOrder: dto.displayOrder ?? 1,
      }),
    );
  }

  async assignSubjectTeacher(subjectId: string, dto: AssignSubjectTeacherDto) {
    const subject = await this.subjectsRepository.findOne({ where: { id: subjectId } });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }

    await this.ensureTeacherUser(dto.teacherUserId);

    subject.teacherUserId = dto.teacherUserId;
    return this.subjectsRepository.save(subject);
  }

  async createSession(
    dto: CreateClassSessionDto,
    actor: { id: string; role: 'manager' | 'lead' | 'worker' },
  ) {
    const course = await this.ensureCourseExists(dto.courseId);

    const subject = await this.subjectsRepository.findOne({ where: { id: dto.subjectId } });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }

    if (subject.courseId !== dto.courseId) {
      throw new BadRequestException('Subject does not belong to selected course');
    }

    await this.ensureTeacherUser(dto.teacherUserId);

    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException('End time must be greater than start time');
    }

    const classroom = dto.classroom.trim();
    if (!getAvailableRooms(course.modality).includes(classroom)) {
      throw new BadRequestException(
        course.modality === 'virtual'
          ? 'Selecciona una sala valida (Sala 1 a Sala 11) para cursos virtuales'
          : 'Selecciona un aula valida (Aula 1 a Aula 10) para cursos presenciales',
      );
    }

    this.ensureValidTimeBlockByModality(course.modality, dto.startTime, dto.endTime);

    if (
      this.normalizeTime(dto.startTime) !== this.normalizeTime(course.scheduleStartTime) ||
      this.normalizeTime(dto.endTime) !== this.normalizeTime(course.scheduleEndTime)
    ) {
      throw new BadRequestException('La sesión debe usar el horario definido para el curso');
    }

    await this.ensureNoSessionClassroomConflict(
      classroom,
      dto.classDate,
      dto.startTime,
      dto.endTime,
    );

    await this.ensureNoTeacherConflict(
      dto.teacherUserId,
      dto.classDate,
      dto.startTime,
      dto.endTime,
    );

    await this.ensureNoCourseConflict(
      dto.courseId,
      dto.classDate,
      dto.startTime,
      dto.endTime,
    );

    const classDate = dto.classDate.slice(0, 10);

    const teacherProfile = await this.classScheduleProfilesRepository.findOne({
      where: { userId: dto.teacherUserId },
    });
    const availabilityStatus = this.matchAvailabilityStatus(
      teacherProfile?.availability,
      classDate,
      dto.startTime,
      dto.endTime,
    );

    if (availabilityStatus === 'busy') {
      throw new ConflictException(
        'El profesor titular marcó este bloque horario como no disponible en su disponibilidad semanal',
      );
    }

    const saved = await this.sessionsRepository.save(
      this.sessionsRepository.create({
        courseId: dto.courseId,
        subjectId: dto.subjectId,
        teacherUserId: dto.teacherUserId,
        classDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
        classroom,
        notes: dto.notes?.trim() ? dto.notes.trim() : null,
        createdBy: actor.role === 'manager' ? actor.id : null,
      }),
    );

    return {
      ...saved,
      availabilityWarning:
        availabilityStatus === 'confirm'
          ? 'El profesor titular tiene disponibilidad condicional (requiere confirmación) en este horario'
          : undefined,
    };
  }

  async findSessions(filters?: {
    courseId?: string;
    from?: string;
    to?: string;
    pendingCoverage?: boolean;
  }) {
    const qb = this.sessionsRepository.createQueryBuilder('session');

    if (filters?.courseId) {
      qb.andWhere('session.course_id = :courseId', { courseId: filters.courseId });
    }

    if (filters?.from) {
      qb.andWhere('session.class_date >= :fromDate', { fromDate: filters.from.slice(0, 10) });
    }

    if (filters?.to) {
      qb.andWhere('session.class_date <= :toDate', { toDate: filters.to.slice(0, 10) });
    }

    qb.orderBy('session.class_date', 'ASC').addOrderBy('session.start_time', 'ASC');

    const sessions = await qb.getMany();
    const enrichedSessions = await this.enrichSessions(sessions);

    if (filters?.pendingCoverage) {
      return enrichedSessions.filter(
        (session) => session.hasTitularIncidenceConflict && !session.isCovered,
      );
    }

    return enrichedSessions;
  }

  async findMySessions(userId: string, filters?: { from?: string; to?: string }) {
    const qb = this.sessionsRepository
      .createQueryBuilder('session')
      .where(
        '(session.teacher_user_id = :userId OR session.cover_teacher_user_id = :userId)',
        { userId },
      );

    if (filters?.from) {
      qb.andWhere('session.class_date >= :fromDate', { fromDate: filters.from.slice(0, 10) });
    }

    if (filters?.to) {
      qb.andWhere('session.class_date <= :toDate', { toDate: filters.to.slice(0, 10) });
    }

    qb.orderBy('session.class_date', 'ASC').addOrderBy('session.start_time', 'ASC');

    const sessions = await qb.getMany();
    return this.enrichSessions(sessions);
  }

  async assignSessionCoverage(
    sessionId: string,
    dto: AssignSessionCoverageDto,
    actor: { id: string; role: 'manager' | 'lead' | 'worker' },
  ) {
    const session = await this.sessionsRepository.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const coverTeacherUserId = dto.coverTeacherUserId ?? null;
    const coverageNote = dto.coverageNote?.trim() ? dto.coverageNote.trim() : null;

    if (coverTeacherUserId) {
      await this.ensureTeacherUser(coverTeacherUserId);

      if (coverTeacherUserId === session.teacherUserId) {
        throw new BadRequestException('Cover teacher must be different from titular teacher');
      }

      await this.ensureNoTeacherConflict(
        coverTeacherUserId,
        session.classDate,
        session.startTime,
        session.endTime,
        session.id,
      );

      const coverProfile = await this.classScheduleProfilesRepository.findOne({
        where: { userId: coverTeacherUserId },
      });
      const coverAvailabilityStatus = this.matchAvailabilityStatus(
        coverProfile?.availability,
        session.classDate,
        session.startTime,
        session.endTime,
      );

      if (coverAvailabilityStatus === 'busy') {
        throw new ConflictException(
          'El profesor de cobertura marcó este bloque horario como no disponible en su disponibilidad semanal',
        );
      }

      session.coverTeacherUserId = coverTeacherUserId;
      session.coverageNote = coverageNote;
      session.createdBy = actor.role === 'manager' ? actor.id : session.createdBy ?? null;

      const saved = await this.sessionsRepository.save(session);
      const [enriched] = await this.enrichSessions([saved]);
      return {
        ...enriched,
        coverTeacherAvailabilityWarning:
          coverAvailabilityStatus === 'confirm'
            ? 'El profesor de cobertura tiene disponibilidad condicional (requiere confirmación) en este horario'
            : undefined,
      };
    }

    session.coverTeacherUserId = null;
    session.coverageNote = coverageNote;
    session.createdBy = actor.role === 'manager' ? actor.id : session.createdBy ?? null;

    const saved = await this.sessionsRepository.save(session);
    const [enriched] = await this.enrichSessions([saved]);
    return enriched;
  }

  async updateCourse(courseId: string, dto: UpdateClassCourseDto) {
    const course = await this.ensureCourseExists(courseId);

    const trimmedName = dto.name?.trim();
    const newName = trimmedName || course.name;
    const newSectionCode =
      dto.sectionCode !== undefined ? this.normalizeSectionCode(dto.sectionCode) : course.sectionCode;

    if (
      newSectionCode &&
      (newName !== course.name || newSectionCode !== course.sectionCode)
    ) {
      const duplicateCourse = await this.coursesRepository.findOne({
        where: { name: newName, sectionCode: newSectionCode },
      });
      if (duplicateCourse && duplicateCourse.id !== courseId) {
        throw new ConflictException(`Ya existe el curso ${newName} ${newSectionCode}`);
      }
    }

    course.name = newName;
    course.sectionCode = newSectionCode;

    const newClassroom = dto.classroom?.trim() ?? course.classroom;
    const newModality = (dto.modality ?? course.modality) as 'presencial' | 'virtual';
    const newStartTime = dto.startTime ?? course.scheduleStartTime;
    const newEndTime = dto.endTime ?? course.scheduleEndTime;
    const newTermStartDate =
      dto.termStartDate !== undefined
        ? (dto.termStartDate ? dto.termStartDate.slice(0, 10) : null)
        : (course.termStartDate ?? null);
    const newTermEndDate =
      dto.termEndDate !== undefined
        ? (dto.termEndDate ? dto.termEndDate.slice(0, 10) : null)
        : (course.termEndDate ?? null);

    if (dto.classroom !== undefined && !getAvailableRooms(newModality).includes(newClassroom)) {
      throw new BadRequestException(
        newModality === 'virtual'
          ? 'Selecciona una sala valida (Sala 1 a Sala 11) para cursos virtuales'
          : 'Selecciona un aula valida (Aula 1 a Aula 10) para cursos presenciales',
      );
    }

    if (newStartTime >= newEndTime) {
      throw new BadRequestException('La hora fin debe ser mayor a la hora inicio');
    }

    if (newTermStartDate && newTermEndDate && newTermStartDate > newTermEndDate) {
      throw new BadRequestException('La fecha de fin de vigencia debe ser mayor a la fecha de inicio');
    }

    this.ensureValidTimeBlockByModality(newModality, newStartTime, newEndTime);

    const scheduleOrRoomChanged =
      newClassroom !== course.classroom ||
      newStartTime !== course.scheduleStartTime ||
      newEndTime !== course.scheduleEndTime ||
      newModality !== course.modality ||
      newTermStartDate !== (course.termStartDate ?? null) ||
      newTermEndDate !== (course.termEndDate ?? null);

    if (scheduleOrRoomChanged) {
      await this.ensureNoCourseBaseClassroomConflict(
        newClassroom,
        newStartTime,
        newEndTime,
        courseId,
        newTermStartDate,
        newTermEndDate,
      );
    }

    course.classroom = newClassroom;
    course.modality = newModality;
    course.scheduleStartTime = newStartTime;
    course.scheduleEndTime = newEndTime;
    course.termStartDate = newTermStartDate;
    course.termEndDate = newTermEndDate;

    if (dto.isActive !== undefined) {
      course.isActive = dto.isActive;
    }

    return this.coursesRepository.save(course);
  }

  async deleteCourse(courseId: string) {
    const course = await this.ensureCourseExists(courseId);

    const sessionCount = await this.sessionsRepository.count({ where: { courseId } });
    if (sessionCount > 0) {
      throw new BadRequestException(
        `No se puede eliminar un curso con ${sessionCount} sesión(es) programada(s). Elimina primero las sesiones.`,
      );
    }

    await this.subjectsRepository.delete({ courseId });
    await this.coursesRepository.remove(course);
  }

  async deleteSession(sessionId: string) {
    const session = await this.sessionsRepository.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    await this.sessionsRepository.remove(session);
  }

  private async enrichSessions(sessions: ClassSessionEntity[]) {
    const subjectIds = [...new Set(sessions.map((session) => session.subjectId))];
    const courseIds = [...new Set(sessions.map((session) => session.courseId))];
    const teacherIds = [
      ...new Set(
        sessions
          .flatMap((session) => [session.teacherUserId, session.coverTeacherUserId ?? null])
          .filter(Boolean) as string[],
      ),
    ];

    const [subjects, courses, teachers] = await Promise.all([
      subjectIds.length
        ? this.subjectsRepository.find({ where: { id: In(subjectIds) } })
        : Promise.resolve([] as ClassCourseSubjectEntity[]),
      courseIds.length
        ? this.coursesRepository.find({ where: { id: In(courseIds) } })
        : Promise.resolve([] as ClassCourseEntity[]),
      teacherIds.length
        ? this.usersRepository.find({ where: { id: In(teacherIds) } })
        : Promise.resolve([] as UserEntity[]),
    ]);

    const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
    const courseById = new Map(courses.map((course) => [course.id, course]));
    const teacherById = new Map(teachers.map((teacher) => [teacher.id, teacher]));

    const classScheduleProfiles = teacherIds.length
      ? await this.classScheduleProfilesRepository.find({ where: { userId: In(teacherIds) } })
      : [];
    const profileByUserId = new Map(classScheduleProfiles.map((profile) => [profile.userId, profile]));

    return sessions.map((session) => {
      const subject = subjectById.get(session.subjectId);
      const course = courseById.get(session.courseId);
      const teacher = teacherById.get(session.teacherUserId);
      const coverTeacher = session.coverTeacherUserId
        ? teacherById.get(session.coverTeacherUserId)
        : undefined;

      const profile = profileByUserId.get(session.teacherUserId);
      const incidenceConflict = this.matchIncidenceConflict(
        profile?.incidences,
        session.classDate,
        session.startTime,
        session.endTime,
      );

      const isCovered = Boolean(session.coverTeacherUserId);
      const effectiveTeacherName = isCovered
        ? (coverTeacher?.fullName ?? '')
        : (teacher?.fullName ?? '');

      return {
        ...session,
        subjectName: subject?.name ?? '',
        courseCode: course?.code ?? '',
        courseName: course?.name ?? '',
        courseModality: course?.modality ?? 'presencial',
        courseClassroom: course?.classroom ?? '',
        teacherName: teacher?.fullName ?? '',
        coverTeacherName: coverTeacher?.fullName ?? '',
        effectiveTeacherName,
        isCovered,
        hasTitularIncidenceConflict: Boolean(incidenceConflict),
        incidenceReason: incidenceConflict?.reason ?? '',
      };
    });
  }

  private async ensureCourseExists(courseId: string) {
    const course = await this.coursesRepository.findOne({ where: { id: courseId } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return course;
  }

  private async ensureTeacherUser(userId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Teacher user not found');
    }

    if (user.role !== 'lead' && user.role !== 'worker' && user.role !== 'manager') {
      throw new BadRequestException('Selected user is not a teacher profile');
    }
  }

  private async ensureNoTeacherConflict(
    teacherUserId: string,
    classDate: string,
    startTime: string,
    endTime: string,
    excludeSessionId?: string,
  ) {
    const qb = this.sessionsRepository
      .createQueryBuilder('session')
      .where(
        '(session.teacher_user_id = :teacherUserId OR session.cover_teacher_user_id = :teacherUserId)',
        { teacherUserId },
      )
      .andWhere('session.class_date = :classDate', { classDate: classDate.slice(0, 10) })
      .andWhere('session.start_time < :endTime', { endTime })
      .andWhere('session.end_time > :startTime', { startTime });

    if (excludeSessionId) {
      qb.andWhere('session.id != :excludeSessionId', { excludeSessionId });
    }

    const conflict = await qb.getOne();

    if (conflict) {
      throw new ConflictException('Teacher already has another class in this time range');
    }
  }

  private toMinuteValue(time: string) {
    const [hourText, minuteText] = time.slice(0, 5).split(':');
    const hour = Number(hourText);
    const minute = Number(minuteText);
    return hour * 60 + minute;
  }

  private normalizeTime(time: string) {
    return time.slice(0, 5);
  }

  private hasTimeOverlap(
    firstStart: string,
    firstEnd: string,
    secondStart: string,
    secondEnd: string,
  ) {
    const aStart = this.toMinuteValue(firstStart);
    const aEnd = this.toMinuteValue(firstEnd);
    const bStart = this.toMinuteValue(secondStart);
    const bEnd = this.toMinuteValue(secondEnd);
    return aStart < bEnd && aEnd > bStart;
  }

  private matchIncidenceConflict(
    rawIncidences: unknown,
    classDate: string,
    startTime: string,
    endTime: string,
  ) {
    if (!Array.isArray(rawIncidences)) {
      return null;
    }

    for (const item of rawIncidences) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const incidence = item as {
        date?: unknown;
        startTime?: unknown;
        endTime?: unknown;
        reason?: unknown;
      };

      if (
        typeof incidence.date !== 'string' ||
        typeof incidence.startTime !== 'string' ||
        typeof incidence.endTime !== 'string'
      ) {
        continue;
      }

      if (incidence.date !== classDate.slice(0, 10)) {
        continue;
      }

      if (
        this.hasTimeOverlap(startTime, endTime, incidence.startTime, incidence.endTime)
      ) {
        return {
          reason: typeof incidence.reason === 'string' ? incidence.reason : '',
          startTime: incidence.startTime,
          endTime: incidence.endTime,
        };
      }
    }

    return null;
  }

  private getAllowedTimeBlocks(modality: 'presencial' | 'virtual') {
    if (modality === 'virtual') {
      return [...PRESENCIAL_TIME_BLOCKS, VIRTUAL_EXTRA_TIME_BLOCK];
    }

    return [...PRESENCIAL_TIME_BLOCKS];
  }

  private normalizeCourseType(rawCode: string) {
    const normalized = rawCode.trim().toLowerCase();

    if (normalized === 'curso') {
      return 'Curso';
    }

    if (normalized === 'regularizacion' || normalized === 'regularización') {
      return 'Regularización';
    }

    if (normalized === 'asesorias' || normalized === 'asesorías') {
      return 'Asesorías';
    }

    if (normalized === 'examen') {
      return 'Examen';
    }

    throw new BadRequestException('Tipo de clase invalido. Usa: Curso, Regularización, Asesorías o Examen.');
  }

  private normalizeSectionCode(rawSectionCode: string) {
    const normalized = rawSectionCode.trim().toUpperCase();

    if (!/^[0-9]{1,3}[A-Z]$/.test(normalized)) {
      throw new BadRequestException('Codigo invalido. Usa formatos como 1A, 1B, 2A o 10C.');
    }

    return normalized;
  }

  private ensureValidTimeBlockByModality(
    modality: 'presencial' | 'virtual',
    startTime: string,
    endTime: string,
  ) {
    const isAllowed = this.getAllowedTimeBlocks(modality).some(
      (block) => block.startTime === startTime && block.endTime === endTime,
    );

    if (!isAllowed) {
      throw new BadRequestException(
        `Horario no permitido para modalidad ${modality}. Usa un bloque predefinido.`,
      );
    }
  }

  private async ensureNoCourseConflict(
    courseId: string,
    classDate: string,
    startTime: string,
    endTime: string,
  ) {
    const conflict = await this.sessionsRepository
      .createQueryBuilder('session')
      .where('session.course_id = :courseId', { courseId })
      .andWhere('session.class_date = :classDate', { classDate: classDate.slice(0, 10) })
      .andWhere('session.start_time < :endTime', { endTime })
      .andWhere('session.end_time > :startTime', { startTime })
      .getOne();

    if (conflict) {
      throw new ConflictException('Course already has another subject in this time range');
    }
  }

  private async ensureNoCourseBaseClassroomConflict(
    classroom: string,
    startTime: string,
    endTime: string,
    excludeCourseId?: string,
    termStartDate?: string | null,
    termEndDate?: string | null,
  ) {
    const qb = this.coursesRepository
      .createQueryBuilder('course')
      .where('course.classroom = :classroom', { classroom })
      .andWhere('course.isActive = true');

    if (excludeCourseId) {
      qb.andWhere('course.id != :excludeCourseId', { excludeCourseId });
    }

    const coursesInClassroom = await qb.getMany();

    const conflict = coursesInClassroom.find(
      (course) =>
        this.hasTimeOverlap(startTime, endTime, course.scheduleStartTime, course.scheduleEndTime) &&
        this.hasDateRangeOverlap(
          termStartDate ?? null,
          termEndDate ?? null,
          course.termStartDate ?? null,
          course.termEndDate ?? null,
        ),
    );

    if (conflict) {
      throw new ConflictException(
        `El aula ${classroom} ya esta ocupada en el horario ${conflict.scheduleStartTime.slice(0, 5)}-${conflict.scheduleEndTime.slice(0, 5)} por el curso ${conflict.name}${conflict.termEndDate ? ` (vigente hasta ${conflict.termEndDate})` : ''}`,
      );
    }
  }

  private hasDateRangeOverlap(
    aStart: string | null,
    aEnd: string | null,
    bStart: string | null,
    bEnd: string | null,
  ) {
    if (aEnd && bStart && aEnd < bStart) {
      return false;
    }

    if (bEnd && aStart && bEnd < aStart) {
      return false;
    }

    return true;
  }

  private async ensureNoSessionClassroomConflict(
    classroom: string,
    classDate: string,
    startTime: string,
    endTime: string,
    excludeSessionId?: string,
  ) {
    const qb = this.sessionsRepository
      .createQueryBuilder('session')
      .where('session.classroom = :classroom', { classroom })
      .andWhere('session.class_date = :classDate', { classDate: classDate.slice(0, 10) })
      .andWhere('session.start_time < :endTime', { endTime })
      .andWhere('session.end_time > :startTime', { startTime });

    if (excludeSessionId) {
      qb.andWhere('session.id != :excludeSessionId', { excludeSessionId });
    }

    const conflict = await qb.getOne();

    if (conflict) {
      throw new ConflictException(
        `El aula ${classroom} ya tiene una clase programada en ese rango horario para esa fecha`,
      );
    }
  }

  private classDateToDayName(classDate: string): string {
    const date = new Date(`${classDate.slice(0, 10)}T12:00:00Z`);
    const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return DAYS[date.getUTCDay()] ?? '';
  }

  private formatAvailabilitySlot(hour: number): string {
    const suffix = hour >= 12 ? 'pm' : 'am';
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${hour12}:00 ${suffix}`;
  }

  private getOverlappingHourSlots(startTime: string, endTime: string): string[] {
    const [startHour, startMin] = startTime.slice(0, 5).split(':').map(Number);
    const [endHour, endMin] = endTime.slice(0, 5).split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    const slots: string[] = [];
    for (let h = 7; h <= 22; h += 1) {
      const slotStart = h * 60;
      const slotEnd = (h + 1) * 60;
      if (slotStart < endMinutes && slotEnd > startMinutes) {
        slots.push(this.formatAvailabilitySlot(h));
      }
    }
    return slots;
  }

  private matchAvailabilityStatus(
    rawAvailability: unknown,
    classDate: string,
    startTime: string,
    endTime: string,
  ): 'busy' | 'confirm' | null {
    if (!rawAvailability || typeof rawAvailability !== 'object') {
      return null;
    }

    const availability = rawAvailability as Record<string, string>;
    const dayName = this.classDateToDayName(classDate);
    if (!dayName) return null;

    const slots = this.getOverlappingHourSlots(startTime, endTime);
    let hasConfirm = false;

    for (const slot of slots) {
      const key = `${dayName}-${slot}`;
      const status = availability[key];
      if (status === 'busy') return 'busy';
      if (status === 'confirm') hasConfirm = true;
    }

    return hasConfirm ? 'confirm' : null;
  }
}
