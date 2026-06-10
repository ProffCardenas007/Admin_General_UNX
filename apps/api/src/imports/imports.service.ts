import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { ExcelImportEntity } from '../database/entities/excel-import.entity';
import { ExcelImportErrorEntity } from '../database/entities/excel-import-error.entity';
import { UserEntity } from '../database/entities/user.entity';
import { ProjectEntity } from '../database/entities/project.entity';
import { TaskEntity } from '../database/entities/task.entity';
import { TaskUpdateEntity } from '../database/entities/task-update.entity';

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
  ) {}

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
