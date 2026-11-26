import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  BadRequestException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  BulkUpdateMaterialItemsDto,
  CreateKitItemDto,
  CreateMaterialGroupDto,
  CreateMaterialItemDto,
  CreateSupplyDto,
  CreateSupplyMovementDto,
  ImportMaterialItemsDto,
  CreateScheduleEntryDto,
  SetAssignmentsDto,
  SetCourseStartDto,
  ShiftScheduleDto,
  UpdateKitItemDto,
  UpdateMaterialGroupDto,
  UpdateMaterialItemDto,
  UpdateScheduleEntryDto,
  UpdateSupplyDto,
} from './dto/material-planning.dto';
import { MaterialPlanningService } from './material-planning.service';

@Controller('material-planning')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('manager')
export class MaterialPlanningController {
  constructor(private readonly service: MaterialPlanningService) {}

  @Get()
  getAll() {
    return this.service.getAll();
  }

  @Post('items')
  createItem(@Body() dto: CreateMaterialItemDto) {
    return this.service.createItem(dto);
  }

  @Patch('items/bulk')
  bulkUpdateItems(@Body() dto: BulkUpdateMaterialItemsDto) {
    return this.service.bulkUpdateItems(dto);
  }

  @Patch('items/:id')
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaterialItemDto,
  ) {
    return this.service.updateItem(id, dto);
  }

  @Delete('items/:id')
  removeItem(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeItem(id);
  }

  @Put('assignments')
  setAssignments(@Body() dto: SetAssignmentsDto) {
    return this.service.setAssignments(dto);
  }

  @Post('groups')
  createGroup(@Body() dto: CreateMaterialGroupDto) {
    return this.service.createGroup(dto);
  }

  @Delete('groups/:id')
  removeGroup(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeGroup(id);
  }

  @Patch('groups/:id')
  updateGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaterialGroupDto,
  ) {
    return this.service.updateGroup(id, dto);
  }

  /** Lee un .xlsx/.csv y devuelve el texto para la vista previa; no guarda nada. */
  @Post('items/import/file')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
      fileFilter: (_request, file, callback) => {
        if (!/\.(xlsx|xlsm|csv)$/i.test(file.originalname)) {
          callback(
            new BadRequestException('Sube un archivo .xlsx o .csv'),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  readImportFile(
    @UploadedFile() file: { originalname: string; buffer: Buffer },
  ) {
    if (!file) throw new BadRequestException('Falta el archivo');
    return this.service.fileToImportText(file);
  }

  @Post('items/import')
  importItems(@Body() dto: ImportMaterialItemsDto) {
    return this.service.importItems(dto);
  }

  @Post('supplies')
  createSupply(@Body() dto: CreateSupplyDto) {
    return this.service.createSupply(dto);
  }

  @Patch('supplies/:id')
  updateSupply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplyDto,
  ) {
    return this.service.updateSupply(id, dto);
  }

  @Delete('supplies/:id')
  removeSupply(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeSupply(id);
  }

  @Post('supplies/:id/movements')
  createSupplyMovement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSupplyMovementDto,
    @Req() request: { user?: { email?: string } },
  ) {
    return this.service.createSupplyMovement(
      id,
      dto,
      request.user?.email ?? null,
    );
  }

  @Delete('supply-movements/:id')
  removeSupplyMovement(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeSupplyMovement(id);
  }

  @Post('kits')
  createKitItem(@Body() dto: CreateKitItemDto) {
    return this.service.createKitItem(dto);
  }

  @Delete('kits/:id')
  removeKitItem(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeKitItem(id);
  }

  @Patch('kits/:id')
  updateKitItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKitItemDto,
  ) {
    return this.service.updateKitItem(id, dto);
  }

  @Patch('schedule/:id')
  updateScheduleEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScheduleEntryDto,
  ) {
    return this.service.updateScheduleEntry(id, dto);
  }

  @Post('schedule')
  createScheduleEntry(@Body() dto: CreateScheduleEntryDto) {
    return this.service.createScheduleEntry(dto);
  }

  @Delete('schedule/:id')
  removeScheduleEntry(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeScheduleEntry(id);
  }

  @Put('courses/:program/:courseKey/start')
  setCourseStart(
    @Param('program') program: string,
    @Param('courseKey') courseKey: string,
    @Body() dto: SetCourseStartDto,
  ) {
    return this.service.setCourseStart(program, courseKey, dto);
  }

  @Post('schedule/shift')
  shiftSchedule(@Body() dto: ShiftScheduleDto) {
    return this.service.shiftSchedule(dto);
  }
}
