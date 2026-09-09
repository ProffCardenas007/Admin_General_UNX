import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportsService } from './imports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const EXCEL_IMPORT_FILE_PATTERN = /\.(csv|xlsx|xlsm)$/i;
const PLANNING_IMPORT_FILE_PATTERN = /\.(xlsx|xlsm)$/i;

const importFileInterceptor = (filePattern: RegExp) =>
  FileInterceptor('file', {
    limits: { fileSize: MAX_IMPORT_FILE_SIZE_BYTES, files: 1 },
    fileFilter: (_request, file, callback) => {
      if (!filePattern.test(file.originalname)) {
        callback(
          new BadRequestException('Unsupported import file type.'),
          false,
        );
        return;
      }
      callback(null, true);
    },
  });

@Controller('imports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('excel')
  @Roles('manager')
  @UseInterceptors(importFileInterceptor(EXCEL_IMPORT_FILE_PATTERN))
  async uploadExcel(
    @UploadedFile() file: any,
    @Req() req: { user?: { id?: string; role?: string } },
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const actor = req.user;
    if (!actor?.id || actor.role !== 'manager') {
      throw new ForbiddenException(
        'Only managers can import Excel files.',
      );
    }

    const importRecord = await this.importsService.processUpload({
      fileName: file.originalname,
      fileBuffer: file.buffer,
      actorId: actor.id,
    });
    return {
      importId: importRecord.id,
      status: importRecord.status,
    };
  }

  @Post('class-planning')
  @Roles('manager')
  @UseInterceptors(importFileInterceptor(PLANNING_IMPORT_FILE_PATTERN))
  async uploadClassPlanningExcel(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    return this.importsService.processClassPlanningUpload({
      fileName: file.originalname,
      fileBuffer: file.buffer,
    });
  }

  @Get(':importId')
  @Roles('manager')
  getImportById(@Param('importId') importId: string) {
    return this.importsService.getImportById(importId);
  }

  @Get(':importId/errors')
  @Roles('manager')
  getImportErrors(@Param('importId') importId: string) {
    return this.importsService.getImportErrors(importId);
  }
}
