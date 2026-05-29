import {
	Controller,
	Get,
	Headers,
	Param,
	Post,
	UploadedFile,
	UseInterceptors,
	BadRequestException,
	UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportsService } from './imports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('imports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ImportsController {
	constructor(private readonly importsService: ImportsService) {}

	@Post('excel')
	@Roles('manager', 'lead', 'worker')
	@UseInterceptors(FileInterceptor('file'))
	async uploadExcel(
		@UploadedFile() file: any,
		@Headers('x-user-id') userId?: string,
	) {
		if (!file) {
			throw new BadRequestException('File is required');
		}
		const importRecord = await this.importsService.processUpload({
			fileName: file.originalname,
			fileBuffer: file.buffer,
			userId,
		});
		return {
			importId: importRecord.id,
			status: importRecord.status,
		};
	}

	@Get(':importId')
	@Roles('manager', 'lead', 'worker')
	getImportById(@Param('importId') importId: string) {
		return this.importsService.getImportById(importId);
	}

	@Get(':importId/errors')
	@Roles('manager', 'lead', 'worker')
	getImportErrors(@Param('importId') importId: string) {
		return this.importsService.getImportErrors(importId);
	}
}
