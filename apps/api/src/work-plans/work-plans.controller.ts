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
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  BulkUpsertCellsDto,
  CreateBulkCellTasksDto,
  CreateCellTaskDto,
  CreateSectionDto,
  CreateWorkPlanDto,
  LabelDto,
  MergeCellDto,
  UpdateLabelDto,
  UpdateSectionDto,
  UpdateWorkPlanDto,
  UpsertCellDto,
} from './dto/work-plan.dto';
import { WorkPlansService } from './work-plans.service';

type AuthedRequest = {
  user: { id: string; role: 'manager' | 'lead' | 'worker' };
};

@Controller('work-plans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('manager', 'lead')
export class WorkPlansController {
  constructor(private readonly service: WorkPlansService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.service.list(req.user);
  }

  @Post()
  create(@Body() dto: CreateWorkPlanDto, @Req() req: AuthedRequest) {
    return this.service.create(dto, req.user);
  }

  @Put('cells')
  upsertCell(@Body() dto: UpsertCellDto, @Req() req: AuthedRequest) {
    return this.service.upsertCell(dto, req.user);
  }

  @Put('cells/merge')
  mergeCell(@Body() dto: MergeCellDto, @Req() req: AuthedRequest) {
    return this.service.mergeCell(dto, req.user);
  }

  @Post('cells/task')
  createCellTask(
    @Body() dto: CreateCellTaskDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.createCellTask(dto, req.user);
  }

  @Put('cells/bulk')
  upsertCellsBulk(
    @Body() dto: BulkUpsertCellsDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.upsertCellsBulk(dto, req.user);
  }

  @Post('cells/tasks')
  createCellTasksBulk(
    @Body() dto: CreateBulkCellTasksDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.createCellTasksBulk(dto, req.user);
  }

  @Patch('sections/:id')
  updateSection(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSectionDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.updateSection(id, dto, req.user);
  }

  @Delete('sections/:id')
  removeSection(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedRequest,
  ) {
    return this.service.removeSection(id, req.user);
  }

  @Post('sections/:id/rows')
  addRow(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LabelDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.addRow(id, dto, req.user);
  }

  @Patch('rows/:id')
  updateRow(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLabelDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.updateRow(id, dto, req.user);
  }

  @Delete('rows/:id')
  removeRow(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.service.removeRow(id, req.user);
  }

  @Patch('columns/:id')
  updateColumn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLabelDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.updateColumn(id, dto, req.user);
  }

  @Delete('columns/:id')
  removeColumn(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedRequest,
  ) {
    return this.service.removeColumn(id, req.user);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.service.get(id, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkPlanDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.service.remove(id, req.user);
  }

  @Post(':id/sections')
  addSection(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSectionDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.addSection(id, dto, req.user);
  }

  @Post(':id/columns')
  addColumn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LabelDto,
    @Req() req: AuthedRequest,
  ) {
    return this.service.addColumn(id, dto, req.user);
  }
}
