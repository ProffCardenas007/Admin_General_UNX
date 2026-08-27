import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'node:crypto';
import * as ExcelJS from 'exceljs';
import { ExcelImportEntity } from '../database/entities/excel-import.entity';
import { ExcelImportErrorEntity } from '../database/entities/excel-import-error.entity';
import { UserEntity } from '../database/entities/user.entity';
import { ProjectEntity } from '../database/entities/project.entity';
import { TaskEntity } from '../database/entities/task.entity';
import { TaskUpdateEntity } from '../database/entities/task-update.entity';
import { ClassScheduleProfileEntity } from '../database/entities/class-schedule-profile.entity';
import { ClassCourseEntity } from '../database/entities/class-course.entity';
import { ClassCourseSubjectEntity } from '../database/entities/class-course-subject.entity';
import { ClassSessionEntity } from '../database/entities/class-session.entity';
import {
  parseClassPlanningWorkbook,
  ParsedPlanningSession,
} from './class-planning-workbook';

type UploadInput = {
  fileName: string;
  fileBuffer: Buffer;
  userId?: string;
};

type ParsedRow = {
  employee_email: string;
  project_code: string;
  task_code: string;
  task_name: string;
  status: 'todo' | 'doing' | 'blocked' | 'done';
  progress_percent: string;
  worked_hours: string;
  update_date: string;
  blocker_reason?: string;
  comment?: string;
};

type TeacherImportRow = {
  rowNumber: number;
  fullName: string;
  subject: string;
};

const WEEK_DAYS = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;

@Injectable()
export class ImportsService {
  constructor(
    @InjectRepository(ExcelImportEntity)
    private readonly importsRepository: Repository<ExcelImportEntity>,
    @InjectRepository(ExcelImportErrorEntity)
    private readonly importErrorsRepository: Repository<ExcelImportErrorEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectsRepository: Repository<ProjectEntity>,
    @InjectRepository(TaskEntity)
    private readonly tasksRepository: Repository<TaskEntity>,
    @InjectRepository(TaskUpdateEntity)
    private readonly taskUpdatesRepository: Repository<TaskUpdateEntity>,
    @InjectRepository(ClassScheduleProfileEntity)
    private readonly classScheduleProfilesRepository: Repository<ClassScheduleProfileEntity>,
    @InjectRepository(ClassCourseEntity)
    private readonly classCoursesRepository: Repository<ClassCourseEntity>,
    @InjectRepository(ClassCourseSubjectEntity)
    private readonly classSubjectsRepository: Repository<ClassCourseSubjectEntity>,
    @InjectRepository(ClassSessionEntity)
    private readonly classSessionsRepository: Repository<ClassSessionEntity>,
  ) {}

  async processClassPlanningUpload(input: UploadInput) {
    const workbook = await this.loadPlanningWorkbook(input);
    const teacherRows = this.parseTeacherRows(workbook);
    if (teacherRows.length === 0) {
      throw new BadRequestException(
        'No teacher rows found. The workbook must contain Profesores and Materia columns.',
      );
    }

    const users = await this.usersRepository.find();
    const usersByName = new Map(
      users.map((user) => [this.normalizeIdentity(user.fullName), user]),
    );

    const rows: Array<{
      fullName: string;
      matched: boolean;
      changed: boolean;
      email?: string;
      subjects: string[];
    }> = [];
    const errors: Array<{ rowNumber: number; message: string }> = [];
    let updatedUsers = 0;
    let skippedRows = 0;
    let availabilityProfiles = 0;
    let unchangedRows = 0;

    for (const row of teacherRows) {
      try {
        const identity = this.normalizeIdentity(row.fullName);
        const user = usersByName.get(identity);

        if (!user) {
          skippedRows += 1;
          rows.push({
            fullName: 'Profesor N/A',
            matched: false,
            changed: false,
            subjects: row.subject ? [row.subject] : [],
          });
          continue;
        }

        const subjects = [...new Set([...(user.classSubjects ?? []), row.subject].filter(Boolean))];
        const currentSubjects = user.classSubjects ?? [];
        const userChanged =
          !user.isActive ||
          currentSubjects.length !== subjects.length ||
          currentSubjects.some((subject, index) => subject !== subjects[index]);
        let savedUser = user;

        if (userChanged) {
          user.classSubjects = subjects;
          user.isActive = true;
          savedUser = await this.usersRepository.save(user);
          updatedUsers += 1;
        }

        usersByName.set(identity, savedUser);

        const availability = this.parseTeacherAvailability(workbook, row.fullName);
        let availabilityChanged = false;
        if (availability) {
          const currentProfile = await this.classScheduleProfilesRepository.findOne({
            where: { userId: savedUser.id },
          });
          availabilityChanged =
            !currentProfile ||
            !this.haveSameAvailability(currentProfile.availability, availability);

          if (availabilityChanged) {
            await this.classScheduleProfilesRepository.save(
              this.classScheduleProfilesRepository.create({
                id: currentProfile?.id,
                userId: savedUser.id,
                availability,
                incidences: currentProfile?.incidences ?? [],
              }),
            );
            availabilityProfiles += 1;
          }
        }

        const changed = userChanged || availabilityChanged;
        if (!changed) {
          unchangedRows += 1;
        }

        rows.push({
          fullName: savedUser.fullName,
          matched: true,
          changed,
          email: savedUser.email.endsWith('@profesores.unx.mx')
            ? undefined
            : savedUser.email,
          subjects,
        });
      } catch (error) {
        errors.push({
          rowNumber: row.rowNumber,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const importedTeacherByName = new Map(
      teacherRows.map((row) => [this.normalizeIdentity(row.fullName), row]),
    );
    const planningTeachers = users
      .filter((user) => {
        const imported = importedTeacherByName.get(
          this.normalizeIdentity(user.fullName),
        );
        return Boolean(imported?.subject || user.classSubjects?.[0]);
      })
      .map((user) => {
        const imported = importedTeacherByName.get(
          this.normalizeIdentity(user.fullName),
        );
        return {
          fullName: user.fullName,
          subject: imported?.subject ?? user.classSubjects?.[0] ?? 'Materia',
        };
      });
    const parsedPlanning = parseClassPlanningWorkbook(
      workbook,
      planningTeachers,
    );
    const scheduleResult = await this.syncPlanningSessions(
      parsedPlanning.sessions,
      usersByName,
    );

    return {
      fileName: input.fileName,
      totalRows: teacherRows.length,
      updatedUsers,
      skippedRows,
      availabilityProfiles,
      unchangedRows,
      ...scheduleResult,
      scheduleWarnings: parsedPlanning.warnings,
      failedRows: errors.length,
      rows,
      errors,
    };
  }

  private async syncPlanningSessions(
    parsedSessions: ParsedPlanningSession[],
    usersByName: Map<string, UserEntity>,
  ) {
    return this.classSessionsRepository.manager.transaction(async (manager) => {
      const coursesRepository = manager.getRepository(ClassCourseEntity);
      const subjectsRepository = manager.getRepository(ClassCourseSubjectEntity);
      const sessionsRepository = manager.getRepository(ClassSessionEntity);
      const courses = await coursesRepository.find();
      const subjects = await subjectsRepository.find();
      const importedSessions = await sessionsRepository
        .createQueryBuilder('session')
        .where('session.import_key IS NOT NULL')
        .getMany();
      const courseByImportKey = new Map(
        courses
          .filter((course) => course.importKey)
          .map((course) => [course.importKey!, course]),
      );
      const subjectByCourseAndName = new Map(
        subjects.map((subject) => [
          `${subject.courseId}|${this.normalizeIdentity(subject.name)}`,
          subject,
        ]),
      );
      const sessionByImportKey = new Map(
        importedSessions.map((session) => [session.importKey!, session]),
      );
      const activeCourseKeys = new Set<string>();
      const activeSessionKeys = new Set<string>();
      let createdCourses = 0;
      let createdSessions = 0;
      let updatedSessions = 0;
      let unchangedSessions = 0;

      for (const parsed of parsedSessions) {
        const teacher = usersByName.get(
          this.normalizeIdentity(parsed.teacherName),
        );
        if (!teacher) continue;

        const courseImportKey = this.hashImportKey([
          'course',
          this.normalizeIdentity(parsed.courseName),
          parsed.modality,
          this.normalizeIdentity(parsed.classroom),
          parsed.startTime,
          parsed.endTime,
        ]);
        activeCourseKeys.add(courseImportKey);
        let course = courseByImportKey.get(courseImportKey);

        if (!course) {
          course = await coursesRepository.save(
            coursesRepository.create({
              code: parsed.courseCode,
              sectionCode: `IMP-${courseImportKey.slice(0, 8)}`,
              name: parsed.courseName,
              modality: parsed.modality,
              classroom: parsed.classroom,
              scheduleStartTime: parsed.startTime,
              scheduleEndTime: parsed.endTime,
              termStartDate: parsed.classDate,
              termEndDate: parsed.classDate,
              isActive: true,
              importKey: courseImportKey,
            }),
          );
          courseByImportKey.set(courseImportKey, course);
          createdCourses += 1;
        } else {
          const nextStartDate =
            !course.termStartDate || parsed.classDate < course.termStartDate
              ? parsed.classDate
              : course.termStartDate;
          const nextEndDate =
            !course.termEndDate || parsed.classDate > course.termEndDate
              ? parsed.classDate
              : course.termEndDate;
          if (
            nextStartDate !== course.termStartDate ||
            nextEndDate !== course.termEndDate ||
            !course.isActive
          ) {
            course.termStartDate = nextStartDate;
            course.termEndDate = nextEndDate;
            course.isActive = true;
            course = await coursesRepository.save(course);
            courseByImportKey.set(courseImportKey, course);
          }
        }

        const subjectKey = `${course.id}|${this.normalizeIdentity(parsed.subjectName)}`;
        let subject = subjectByCourseAndName.get(subjectKey);
        if (!subject) {
          subject = await subjectsRepository.save(
            subjectsRepository.create({
              courseId: course.id,
              name: parsed.subjectName,
              teacherUserId: teacher.id,
              displayOrder: 1,
            }),
          );
          subjectByCourseAndName.set(subjectKey, subject);
        }

        const sessionImportKey = this.hashImportKey([
          'session',
          parsed.classDate,
          parsed.startTime,
          parsed.endTime,
          this.normalizeIdentity(parsed.classroom),
        ]);
        activeSessionKeys.add(sessionImportKey);
        const current = sessionByImportKey.get(sessionImportKey);
        const notes = parsed.sourceText.slice(0, 260);

        if (!current) {
          const created = await sessionsRepository.save(
            sessionsRepository.create({
              courseId: course.id,
              subjectId: subject.id,
              teacherUserId: teacher.id,
              classDate: parsed.classDate,
              startTime: parsed.startTime,
              endTime: parsed.endTime,
              classroom: parsed.classroom,
              notes,
              createdBy: null,
              importKey: sessionImportKey,
            }),
          );
          sessionByImportKey.set(sessionImportKey, created);
          createdSessions += 1;
          continue;
        }

        const changed =
          current.courseId !== course.id ||
          current.subjectId !== subject.id ||
          current.teacherUserId !== teacher.id ||
          current.classDate !== parsed.classDate ||
          current.startTime.slice(0, 5) !== parsed.startTime ||
          current.endTime.slice(0, 5) !== parsed.endTime ||
          current.classroom !== parsed.classroom ||
          current.notes !== notes;
        if (!changed) {
          unchangedSessions += 1;
          continue;
        }

        current.courseId = course.id;
        current.subjectId = subject.id;
        current.teacherUserId = teacher.id;
        current.classDate = parsed.classDate;
        current.startTime = parsed.startTime;
        current.endTime = parsed.endTime;
        current.classroom = parsed.classroom;
        current.notes = notes;
        await sessionsRepository.save(current);
        updatedSessions += 1;
      }

      const staleSessions = importedSessions.filter(
        (session) => !activeSessionKeys.has(session.importKey!),
      );
      if (staleSessions.length > 0) {
        await sessionsRepository.remove(staleSessions);
      }

      const staleCourses = courses.filter(
        (course) =>
          course.importKey && !activeCourseKeys.has(course.importKey),
      );
      let removedCourses = 0;
      for (const course of staleCourses) {
        const remainingSessions = await sessionsRepository.count({
          where: { courseId: course.id },
        });
        if (remainingSessions === 0) {
          await coursesRepository.remove(course);
          removedCourses += 1;
        }
      }

      return {
        parsedSessions: parsedSessions.length,
        createdCourses,
        createdSessions,
        updatedSessions,
        unchangedSessions,
        removedSessions: staleSessions.length,
        removedCourses,
      };
    });
  }

  private hashImportKey(parts: string[]) {
    return createHash('sha256').update(parts.join('|')).digest('hex');
  }

  private haveSameAvailability(
    current: Record<string, string>,
    next: Record<string, string>,
  ) {
    const currentKeys = Object.keys(current);
    const nextKeys = Object.keys(next);

    return (
      currentKeys.length === nextKeys.length &&
      currentKeys.every((key) => current[key] === next[key])
    );
  }

  private async loadPlanningWorkbook(input: UploadInput): Promise<ExcelJS.Workbook> {
    const lowerFileName = input.fileName.toLowerCase();
    if (!lowerFileName.endsWith('.xlsx') && !lowerFileName.endsWith('.xlsm')) {
      throw new BadRequestException('Use an .xlsx or .xlsm file');
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(new Uint8Array(input.fileBuffer) as any);
    return workbook;
  }

  async processUpload(input: UploadInput) {
    const actor = input.userId
      ? await this.usersRepository.findOne({ where: { id: input.userId } })
      : await this.usersRepository.findOne({ where: { role: 'manager' } });

    if (!actor) {
      throw new BadRequestException(
        'No user found. Create at least one user before importing.',
      );
    }

    const importRecord = await this.importsRepository.save(
      this.importsRepository.create({
        userId: actor.id,
        fileName: input.fileName,
        status: 'processing',
        startedAt: new Date(),
      }),
    );

    const rows = await this.parseFile(input.fileName, input.fileBuffer);

    let successRows = 0;
    let failedRows = 0;
    const errorsToInsert: ExcelImportErrorEntity[] = [];

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const row = rows[index];

      try {
        await this.processRow(row);
        successRows += 1;
      } catch (error) {
        failedRows += 1;
        errorsToInsert.push(
          this.importErrorsRepository.create({
            importId: importRecord.id,
            rowNumber,
            columnName: 'row',
            message: error instanceof Error ? error.message : 'Unknown error',
          }),
        );
      }
    }

    if (errorsToInsert.length > 0) {
      await this.importErrorsRepository.save(errorsToInsert);
    }

    importRecord.totalRows = rows.length;
    importRecord.successRows = successRows;
    importRecord.failedRows = failedRows;
    importRecord.status = successRows > 0 ? 'completed' : 'failed';
    importRecord.finishedAt = new Date();

    return this.importsRepository.save(importRecord);
  }

  async getImportById(importId: string) {
    const found = await this.importsRepository.findOne({
      where: { id: importId },
    });
    if (!found) {
      throw new NotFoundException('Import not found');
    }
    return found;
  }

  getImportErrors(importId: string) {
    return this.importErrorsRepository.find({
      where: { importId },
      order: { rowNumber: 'ASC' },
    });
  }

  private async processRow(row: ParsedRow) {
    this.validateRow(row);

    const user = await this.usersRepository.findOne({
      where: { email: row.employee_email },
    });
    if (!user) {
      throw new BadRequestException(`User not found: ${row.employee_email}`);
    }

    const project = await this.projectsRepository.findOne({
      where: { code: row.project_code },
    });
    if (!project) {
      throw new BadRequestException(`Project not found: ${row.project_code}`);
    }

    let task = await this.tasksRepository.findOne({
      where: { projectId: project.id, code: row.task_code },
    });

    if (!task) {
      task = await this.tasksRepository.save(
        this.tasksRepository.create({
          projectId: project.id,
          code: row.task_code,
          title: row.task_name,
          assigneeId: user.id,
          status: row.status,
          priority: 'medium',
          estimatedHours: '0',
        }),
      );
    }

    task.status = row.status;
    task.assigneeId = user.id;
    await this.tasksRepository.save(task);

    const existingUpdate = await this.taskUpdatesRepository.findOne({
      where: {
        taskId: task.id,
        userId: user.id,
        updateDate: row.update_date,
      },
    });

    if (existingUpdate) {
      return;
    }

    await this.taskUpdatesRepository.save(
      this.taskUpdatesRepository.create({
        taskId: task.id,
        userId: user.id,
        updateDate: row.update_date,
        workedHours: row.worked_hours,
        progressPercent: row.progress_percent,
        blockerReason: row.blocker_reason,
        comments: row.comment,
      }),
    );
  }

  private validateRow(row: ParsedRow) {
    const requiredColumns: Array<keyof ParsedRow> = [
      'employee_email',
      'project_code',
      'task_code',
      'task_name',
      'status',
      'progress_percent',
      'worked_hours',
      'update_date',
    ];

    for (const key of requiredColumns) {
      if (!row[key]) {
        throw new BadRequestException(`Missing required value: ${key}`);
      }
    }

    if (!['todo', 'doing', 'blocked', 'done'].includes(row.status)) {
      throw new BadRequestException('Invalid status value');
    }

    const progress = Number(row.progress_percent);
    const workedHours = Number(row.worked_hours);

    if (Number.isNaN(progress) || progress < 0 || progress > 100) {
      throw new BadRequestException(
        'progress_percent must be between 0 and 100',
      );
    }

    if (Number.isNaN(workedHours) || workedHours < 0) {
      throw new BadRequestException('worked_hours must be >= 0');
    }

    const updateDate = new Date(row.update_date);
    if (Number.isNaN(updateDate.getTime())) {
      throw new BadRequestException('Invalid update_date');
    }
  }

  private async parseFile(
    fileName: string,
    fileBuffer: Buffer,
  ): Promise<ParsedRow[]> {
    const lowerFileName = fileName.toLowerCase();
    if (lowerFileName.endsWith('.csv')) {
      return this.parseCsv(fileBuffer);
    }

    const workbook = new ExcelJS.Workbook();
    const binary = new Uint8Array(fileBuffer);
    await workbook.xlsx.load(binary as any);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('Excel file has no sheets');
    }

    const headerRow = sheet.getRow(1);
    const headerValues = headerRow.values as Array<unknown>;
    const headers = headerValues.slice(1).map((value) =>
      String(value ?? '')
        .trim()
        .toLowerCase(),
    );

    const parsedRows: ParsedRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return;
      }

      const values = (row.values as Array<unknown>).slice(1);
      const mapped: Record<string, string> = {};

      headers.forEach((header, index) => {
        mapped[header] = String(values[index] ?? '').trim();
      });

      parsedRows.push(mapped as ParsedRow);
    });

    return parsedRows;
  }

  private parseTeacherRows(workbook: ExcelJS.Workbook): TeacherImportRow[] {
    const preferredSheet = workbook.worksheets.find(
      (sheet) => this.normalizeIdentity(sheet.name) === 'datos',
    );
    const sheets = preferredSheet
      ? [preferredSheet, ...workbook.worksheets.filter((sheet) => sheet !== preferredSheet)]
      : workbook.worksheets;

    for (const sheet of sheets) {
      for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 100); rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        const values = Array.from({ length: Math.max(sheet.columnCount, 1) }, (_, index) =>
          row.getCell(index + 1).text.trim(),
        );
        const teacherColumn = values.findIndex((value) =>
          ['profesor', 'profesores', 'docente', 'docentes'].includes(
            this.normalizeIdentity(value),
          ),
        );
        const subjectColumn = values.findIndex((value) =>
          ['materia', 'materias', 'asignatura', 'asignaturas'].includes(
            this.normalizeIdentity(value),
          ),
        );

        if (teacherColumn < 0 || subjectColumn < 0) {
          continue;
        }

        const parsed: TeacherImportRow[] = [];
        for (let dataRowNumber = rowNumber + 1; dataRowNumber <= sheet.rowCount; dataRowNumber += 1) {
          const dataRow = sheet.getRow(dataRowNumber);
          const fullName = dataRow.getCell(teacherColumn + 1).text.trim();
          const subject = dataRow.getCell(subjectColumn + 1).text.trim();
          if (!fullName && !subject) {
            if (parsed.length > 0) {
              break;
            }
            continue;
          }
          if (fullName) {
            parsed.push({ rowNumber: dataRowNumber, fullName, subject });
          }
        }

        if (parsed.length > 0) {
          return parsed;
        }
      }
    }

    return [];
  }

  private parseTeacherAvailability(
    workbook: ExcelJS.Workbook,
    fullName: string,
  ): Record<string, 'full' | 'confirm' | 'busy'> | null {
    const sheet = workbook.worksheets.find(
      (candidate) =>
        this.normalizeIdentity(candidate.name) === this.normalizeIdentity(fullName),
    );
    if (!sheet) {
      return null;
    }

    for (let headerRowNumber = 1; headerRowNumber <= Math.min(sheet.rowCount, 30); headerRowNumber += 1) {
      const headerRow = sheet.getRow(headerRowNumber);
      const dayColumns = new Map<string, number>();
      headerRow.eachCell((cell, columnNumber) => {
        const normalized = this.normalizeIdentity(cell.text);
        WEEK_DAYS.forEach((day) => {
          if (normalized === this.normalizeIdentity(day)) {
            dayColumns.set(day, columnNumber);
          }
        });
      });

      if (dayColumns.size !== WEEK_DAYS.length) {
        continue;
      }

      const availability: Record<string, 'full' | 'confirm' | 'busy'> = {};
      const firstDayColumn = Math.min(...dayColumns.values());
      let timeRowOffset = 0;

      for (
        let rowNumber = headerRowNumber + 1;
        rowNumber <= Math.min(sheet.rowCount, headerRowNumber + 20);
        rowNumber += 1
      ) {
        const timeText = sheet.getRow(rowNumber).getCell(firstDayColumn - 1).text.trim();
        if (!/^\d{1,2}:\d{2}/.test(timeText)) {
          continue;
        }

        const hour24 = 7 + timeRowOffset;
        WEEK_DAYS.forEach((day) => {
          const status = this.getAvailabilityStatus(
            sheet.getRow(rowNumber).getCell(dayColumns.get(day)!),
          );
          if (!status) {
            return;
          }
          availability[`${day}-${this.formatTime(hour24, 0)}`] = status;
          availability[`${day}-${this.formatTime(hour24, 30)}`] = status;
        });
        timeRowOffset += 1;
      }

      return availability;
    }

    return null;
  }

  private getAvailabilityStatus(
    cell: ExcelJS.Cell,
  ): 'full' | 'confirm' | 'busy' | null {
    const fill = cell.fill as ExcelJS.FillPattern;
    if (!fill || fill.type !== 'pattern' || !fill.fgColor) {
      return null;
    }
    if (fill.fgColor.argb?.toUpperCase().endsWith('C00000')) {
      return 'busy';
    }
    if (fill.fgColor.theme === 5) {
      return 'confirm';
    }
    if (fill.fgColor.theme === 9) {
      return 'full';
    }
    return null;
  }

  private normalizeIdentity(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  private formatTime(hour24: number, minute: number) {
    const suffix = hour24 >= 12 ? 'pm' : 'am';
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return `${hour12}:${minute.toString().padStart(2, '0')} ${suffix}`;
  }

  private parseCsv(fileBuffer: Buffer): ParsedRow[] {
    const raw = fileBuffer.toString('utf-8').trim();
    if (!raw) {
      return [];
    }

    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const headers = lines[0]
      .split(',')
      .map((header) => header.trim().toLowerCase());

    return lines.slice(1).map((line) => {
      const values = line.split(',').map((value) => value.trim());
      const mapped: Record<string, string> = {};
      headers.forEach((header, index) => {
        mapped[header] = values[index] ?? '';
      });
      return mapped as ParsedRow;
    });
  }
}
