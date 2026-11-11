import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { WorkPlanEntity } from '../database/entities/work-plan.entity';
import { WorkPlanColumnEntity } from '../database/entities/work-plan-column.entity';
import { WorkPlanSectionEntity } from '../database/entities/work-plan-section.entity';
import { WorkPlanRowEntity } from '../database/entities/work-plan-row.entity';
import {
  WorkPlanCellEntity,
  type WorkPlanCellStatus,
} from '../database/entities/work-plan-cell.entity';
import {
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
import { ProjectEntity } from '../database/entities/project.entity';
import { UserEntity } from '../database/entities/user.entity';
import { TasksService } from '../tasks/tasks.service';
import { TaskEntity, type TaskStatus } from '../database/entities/task.entity';

type Actor = { id: string; role: 'manager' | 'lead' | 'worker' };

const MANUAL_STAGES = [
  'Creación',
  'Revisión de Contenido',
  'Correcciones',
  'Revisión Estructural',
  'Corrección 2',
  'Revisión Estructural 2',
  'Corrección 3',
];

const MANUAL_LAYOUT: Array<{
  title: string;
  spansAll: boolean;
  rows: string[];
}> = [
  { title: 'Creación del Manual', spansAll: false, rows: MANUAL_STAGES },
  {
    title: 'Compilación del Manual',
    spansAll: true,
    rows: ['Compilación del Manual'],
  },
  { title: 'Revisión Final IA', spansAll: true, rows: ['Revisión Final IA'] },
  {
    title: 'Creación de Presentaciones',
    spansAll: false,
    rows: ['Creación de Presentaciones'],
  },
  { title: 'Grabación', spansAll: false, rows: ['Grabación'] },
  {
    title: 'Plataforma (KAJABI)',
    spansAll: false,
    rows: ['Plataforma (KAJABI)'],
  },
];

function cellStatusFromTask(
  status: TaskStatus,
  hasAssignee: boolean,
): WorkPlanCellStatus {
  if (status === 'done') return 'done';
  if (status === 'doing') return 'in_progress';
  if (status === 'blocked') return 'blocked';
  return hasAssignee ? 'assigned' : 'unassigned';
}

@Injectable()
export class WorkPlansService {
  constructor(
    @InjectRepository(WorkPlanEntity)
    private readonly plans: Repository<WorkPlanEntity>,
    @InjectRepository(WorkPlanColumnEntity)
    private readonly columns: Repository<WorkPlanColumnEntity>,
    @InjectRepository(WorkPlanSectionEntity)
    private readonly sections: Repository<WorkPlanSectionEntity>,
    @InjectRepository(WorkPlanRowEntity)
    private readonly rows: Repository<WorkPlanRowEntity>,
    @InjectRepository(WorkPlanCellEntity)
    private readonly cells: Repository<WorkPlanCellEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(TaskEntity)
    private readonly tasks: Repository<TaskEntity>,
    private readonly tasksService: TasksService,
  ) {}

  private async assertPlan(planId: string, actor: Actor) {
    const plan = await this.plans.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan no encontrado');
    if (actor.role !== 'manager' && plan.ownerId !== actor.id) {
      throw new ForbiddenException('Este plan pertenece a otro líder');
    }
    return plan;
  }

  private async findSection(sectionId: string) {
    const section = await this.sections.findOne({ where: { id: sectionId } });
    if (!section) throw new NotFoundException('Sección no encontrada');
    return section;
  }

  private async findRow(rowId: string) {
    const row = await this.rows.findOne({ where: { id: rowId } });
    if (!row) throw new NotFoundException('Fila no encontrada');
    const section = await this.findSection(row.sectionId);
    return { row, section };
  }

  private async findColumn(columnId: string) {
    const column = await this.columns.findOne({ where: { id: columnId } });
    if (!column) throw new NotFoundException('Columna no encontrada');
    return column;
  }

  private async touch(planId: string) {
    await this.plans.update({ id: planId }, { updatedAt: new Date() });
  }

  async list(actor: Actor) {
    const plans = await this.plans.find({
      where: actor.role === 'manager' ? {} : { ownerId: actor.id },
      order: { updatedAt: 'DESC' },
    });
    const full = await Promise.all(plans.map((plan) => this.load(plan)));
    return full.map(({ id, name, description, updatedAt, progress }) => ({
      id,
      name,
      description,
      updatedAt,
      progress,
    }));
  }

  async get(planId: string, actor: Actor) {
    return this.load(await this.assertPlan(planId, actor));
  }

  private async load(plan: WorkPlanEntity) {
    const [columns, sections] = await Promise.all([
      this.columns.find({
        where: { planId: plan.id },
        order: { position: 'ASC' },
      }),
      this.sections.find({
        where: { planId: plan.id },
        order: { position: 'ASC' },
      }),
    ]);
    const rows = sections.length
      ? await this.rows.find({
          where: { sectionId: In(sections.map((s) => s.id)) },
          order: { position: 'ASC' },
        })
      : [];
    const cells = rows.length
      ? await this.cells.find({ where: { rowId: In(rows.map((r) => r.id)) } })
      : [];
    const taskIds = cells
      .map((cell) => cell.taskId)
      .filter((taskId): taskId is string => Boolean(taskId));
    const linkedTasks = taskIds.length
      ? await this.tasks.find({ where: { id: In(taskIds) } })
      : [];
    const tasksById = new Map(linkedTasks.map((task) => [task.id, task]));

    const counts = {
      total: 0,
      unassigned: 0,
      assigned: 0,
      inProgress: 0,
      done: 0,
      blocked: 0,
    };
    const tree = sections.map((section) => {
      const sectionRows = rows
        .filter((r) => r.sectionId === section.id)
        .map((row) => {
          const rowCells = cells
            .filter((cell) => cell.rowId === row.id)
            .map((cell) => {
              const task = cell.taskId ? tasksById.get(cell.taskId) : undefined;
              if (!task) return cell;
              return {
                ...cell,
                status: cellStatusFromTask(task.status, Boolean(task.assigneeId)),
                taskStatus: task.status,
                taskDueDate: task.dueDate ?? null,
                taskCompletionOutcome: task.completionOutcome ?? null,
              };
            });
          const mergedSlots = rowCells.reduce(
            (total, cell) => total + Math.max(0, cell.columnSpan - 1),
            0,
          );
          const slots = section.spansAll
            ? 1
            : Math.max(0, columns.length - mergedSlots);
          counts.total += slots;
          const set = rowCells.filter((c) => c.status !== 'unassigned');
          counts.unassigned += slots - set.length;
          for (const c of set) {
            if (c.status === 'assigned') counts.assigned++;
            else if (c.status === 'in_progress') counts.inProgress++;
            else if (c.status === 'done') counts.done++;
            else if (c.status === 'blocked') counts.blocked++;
          }
          return { ...row, cells: rowCells };
        });
      return { ...section, rows: sectionRows };
    });

    return {
      id: plan.id,
      name: plan.name,
      description: plan.description ?? null,
      ownerId: plan.ownerId,
      projectId: plan.projectId ?? null,
      updatedAt: plan.updatedAt,
      columns,
      sections: tree,
      progress: {
        ...counts,
        percent: counts.total
          ? Math.round((counts.done / counts.total) * 100)
          : 0,
      },
    };
  }

  async create(dto: CreateWorkPlanDto, actor: Actor) {
    const plan = await this.plans.save(
      this.plans.create({
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        ownerId: actor.id,
        projectId: dto.projectId ?? null,
      }),
    );

    if (dto.template === 'manual') {
      const topics = dto.topics ?? 12;
      await this.columns.save(
        Array.from({ length: topics }, (_, i) =>
          this.columns.create({
            planId: plan.id,
            label: `Tema ${i + 1}`,
            position: i,
          }),
        ),
      );
      for (const [i, item] of MANUAL_LAYOUT.entries()) {
        const section = await this.sections.save(
          this.sections.create({
            planId: plan.id,
            title: item.title,
            spansAll: item.spansAll,
            position: i,
          }),
        );
        await this.rows.save(
          item.rows.map((label, j) =>
            this.rows.create({ sectionId: section.id, label, position: j }),
          ),
        );
      }
    }
    return this.load(plan);
  }

  async update(planId: string, dto: UpdateWorkPlanDto, actor: Actor) {
    const plan = await this.assertPlan(planId, actor);
    if (dto.name !== undefined) plan.name = dto.name.trim();
    if (dto.projectId !== undefined) {
      const project = await this.projects.findOne({
        where: { id: dto.projectId },
      });
      if (!project) throw new BadRequestException('Proyecto no encontrado');
      plan.projectId = project.id;
    }
    if (dto.description !== undefined) {
      plan.description = dto.description.trim();
    }
    await this.plans.save(plan);
    return this.load(plan);
  }

  async remove(planId: string, actor: Actor) {
    await this.assertPlan(planId, actor);
    await this.plans.delete({ id: planId });
    return { deleted: true };
  }

  async addSection(planId: string, dto: CreateSectionDto, actor: Actor) {
    await this.assertPlan(planId, actor);
    const last = await this.sections.findOne({
      where: { planId },
      order: { position: 'DESC' },
    });
    const section = await this.sections.save(
      this.sections.create({
        planId,
        title: dto.title.trim(),
        spansAll: dto.spansAll ?? false,
        position: last ? last.position + 1 : 0,
      }),
    );
    await this.touch(planId);
    return section;
  }

  async updateSection(id: string, dto: UpdateSectionDto, actor: Actor) {
    const section = await this.findSection(id);
    await this.assertPlan(section.planId, actor);
    if (dto.title !== undefined) section.title = dto.title.trim();
    if (dto.position !== undefined) section.position = dto.position;
    await this.touch(section.planId);
    return this.sections.save(section);
  }

  async removeSection(id: string, actor: Actor) {
    const section = await this.findSection(id);
    await this.assertPlan(section.planId, actor);
    await this.sections.delete({ id });
    await this.touch(section.planId);
    return { deleted: true };
  }

  async addRow(sectionId: string, dto: LabelDto, actor: Actor) {
    const section = await this.findSection(sectionId);
    await this.assertPlan(section.planId, actor);
    const last = await this.rows.findOne({
      where: { sectionId },
      order: { position: 'DESC' },
    });
    const row = await this.rows.save(
      this.rows.create({
        sectionId,
        label: dto.label.trim(),
        position: last ? last.position + 1 : 0,
      }),
    );
    await this.touch(section.planId);
    return row;
  }

  async updateRow(id: string, dto: UpdateLabelDto, actor: Actor) {
    const { row, section } = await this.findRow(id);
    await this.assertPlan(section.planId, actor);
    if (dto.label !== undefined) row.label = dto.label.trim();
    if (dto.position !== undefined) row.position = dto.position;
    await this.touch(section.planId);
    return this.rows.save(row);
  }

  async removeRow(id: string, actor: Actor) {
    const { section } = await this.findRow(id);
    await this.assertPlan(section.planId, actor);
    await this.rows.delete({ id });
    await this.touch(section.planId);
    return { deleted: true };
  }

  async addColumn(planId: string, dto: LabelDto, actor: Actor) {
    await this.assertPlan(planId, actor);
    const last = await this.columns.findOne({
      where: { planId },
      order: { position: 'DESC' },
    });
    const column = await this.columns.save(
      this.columns.create({
        planId,
        label: dto.label.trim(),
        position: last ? last.position + 1 : 0,
      }),
    );
    await this.touch(planId);
    return column;
  }

  async updateColumn(id: string, dto: UpdateLabelDto, actor: Actor) {
    const column = await this.findColumn(id);
    await this.assertPlan(column.planId, actor);
    if (dto.label !== undefined) column.label = dto.label.trim();
    if (dto.position !== undefined) column.position = dto.position;
    await this.touch(column.planId);
    return this.columns.save(column);
  }

  async removeColumn(id: string, actor: Actor) {
    const column = await this.findColumn(id);
    await this.assertPlan(column.planId, actor);
    await this.columns.delete({ id });
    await this.touch(column.planId);
    return { deleted: true };
  }

  async upsertCell(dto: UpsertCellDto, actor: Actor) {
    const { section } = await this.findRow(dto.rowId);
    await this.assertPlan(section.planId, actor);

    let columnId: string | null = null;
    if (!section.spansAll) {
      if (!dto.columnId) throw new BadRequestException('Falta la columna');
      const column = await this.findColumn(dto.columnId);
      if (column.planId !== section.planId) {
        throw new BadRequestException('La columna no pertenece a este plan');
      }
      columnId = column.id;
    }

    let cell = await this.cells.findOne({
      where: { rowId: dto.rowId, columnId: columnId ?? IsNull() },
    });
    cell ??= this.cells.create({ rowId: dto.rowId, columnId });

    if (cell.taskId && dto.status !== undefined && dto.status !== cell.status) {
      throw new BadRequestException(
        'Esta celda ya tiene una tarea asignada; su estado lo controla la tarea',
      );
    }
    if (dto.status !== undefined) cell.status = dto.status;
    if (dto.startDate !== undefined) cell.startDate = dto.startDate;
    if (dto.endDate !== undefined) cell.endDate = dto.endDate;
    if (dto.suggestedAssignee !== undefined) {
      cell.suggestedAssignee = dto.suggestedAssignee?.trim() || null;
    }
    if (dto.note !== undefined) cell.note = dto.note?.trim() || null;
    if (cell.startDate && cell.endDate && cell.endDate < cell.startDate) {
      throw new BadRequestException('La fecha fin es anterior al inicio');
    }
    await this.touch(section.planId);
    return this.cells.save(cell);
  }

  async mergeCell(dto: MergeCellDto, actor: Actor) {
    const { section } = await this.findRow(dto.rowId);
    await this.assertPlan(section.planId, actor);
    if (section.spansAll) {
      throw new BadRequestException('Esta fila ya ocupa todos los temas');
    }

    const columns = await this.columns.find({
      where: { planId: section.planId },
      order: { position: 'ASC' },
    });
    const startIndex = columns.findIndex((column) => column.id === dto.columnId);
    if (startIndex < 0) {
      throw new BadRequestException('La columna no pertenece a este plan');
    }
    if (startIndex + dto.columnSpan > columns.length) {
      throw new BadRequestException(
        'La combinación supera las columnas disponibles',
      );
    }

    const rowCells = await this.cells.find({ where: { rowId: dto.rowId } });
    const columnIndexes = new Map(
      columns.map((column, index) => [column.id, index]),
    );
    const anchor = rowCells.find((cell) => cell.columnId === dto.columnId);

    const coveringCell = rowCells.find((cell) => {
      if (!cell.columnId || cell.id === anchor?.id) return false;
      const index = columnIndexes.get(cell.columnId);
      return (
        index !== undefined &&
        index < startIndex &&
        index + cell.columnSpan > startIndex
      );
    });
    if (coveringCell) {
      throw new BadRequestException(
        'La celda ya forma parte de otra combinación',
      );
    }

    const coveredColumnIds = new Set(
      columns
        .slice(startIndex + 1, startIndex + dto.columnSpan)
        .map((column) => column.id),
    );
    const coveredCells = rowCells.filter(
      (cell) => cell.columnId && coveredColumnIds.has(cell.columnId),
    );
    const nonEmptyCell = coveredCells.find(
      (cell) =>
        cell.status !== 'unassigned' ||
        cell.startDate ||
        cell.endDate ||
        cell.suggestedAssignee ||
        cell.note ||
        cell.taskId ||
        cell.columnSpan > 1,
    );
    if (nonEmptyCell) {
      throw new BadRequestException(
        'Solo se pueden combinar celdas adicionales vacías',
      );
    }

    if (coveredCells.length > 0) {
      await this.cells.delete({
        id: In(coveredCells.map((cell) => cell.id)),
      });
    }

    const cell =
      anchor ??
      this.cells.create({
        rowId: dto.rowId,
        columnId: dto.columnId,
        status: 'unassigned',
      });
    if (cell.taskId && dto.columnSpan !== cell.columnSpan) {
      throw new BadRequestException(
        'No se puede cambiar la combinación de una celda con tarea asignada',
      );
    }
    cell.columnSpan = dto.columnSpan;
    await this.touch(section.planId);
    return this.cells.save(cell);
  }

  async createCellTask(dto: CreateCellTaskDto, actor: Actor) {
    const { section } = await this.findRow(dto.rowId);
    const plan = await this.assertPlan(section.planId, actor);
    if (!plan.projectId) {
      throw new BadRequestException(
        'Vincula este plan con un proyecto antes de crear tareas',
      );
    }

    let columnId: string | null = null;
    if (!section.spansAll) {
      if (!dto.columnId) throw new BadRequestException('Falta la columna');
      const column = await this.findColumn(dto.columnId);
      if (column.planId !== plan.id) {
        throw new BadRequestException('La columna no pertenece a este plan');
      }
      columnId = column.id;
    }

    let cell = await this.cells.findOne({
      where: { rowId: dto.rowId, columnId: columnId ?? IsNull() },
    });
    if (cell?.taskId) {
      throw new BadRequestException('Esta celda ya tiene una tarea');
    }
    if (dto.startDate && dto.endDate && dto.endDate < dto.startDate) {
      throw new BadRequestException('La fecha fin es anterior al inicio');
    }

    let assigneeName: string | null = null;
    if (dto.assigneeId) {
      const assignee = await this.users.findOne({
        where: { id: dto.assigneeId, isActive: true },
      });
      if (!assignee) {
        throw new BadRequestException('El responsable no existe o está inactivo');
      }
      assigneeName = assignee.fullName;
    }

    const task = await this.tasksService.create(
      {
        projectId: plan.projectId,
        activityType: dto.activityType,
        title: dto.title.trim(),
        description: dto.description.trim(),
        assigneeId: dto.assigneeId,
        status: 'todo',
        priority: dto.priority,
        dueDate: dto.dueDate,
        estimatedHours: dto.estimatedHours,
      },
      actor,
    );
    if (!('id' in task)) {
      throw new InternalServerErrorException(
        'La planeación esperaba crear una sola tarea',
      );
    }

    cell ??= this.cells.create({ rowId: dto.rowId, columnId });
    cell.taskId = task.id;
    cell.status = dto.assigneeId ? 'assigned' : 'unassigned';
    cell.startDate = dto.startDate ?? null;
    cell.endDate = dto.endDate ?? null;
    cell.suggestedAssignee = assigneeName;
    cell.note = dto.note?.trim() || null;

    try {
      await this.touch(plan.id);
      return await this.cells.save(cell);
    } catch (error) {
      try {
        await this.tasksService.remove(task.id, actor);
      } catch {
        throw new InternalServerErrorException(
          'La tarea fue creada, pero no se pudo enlazar ni revertir; revisa el apartado de tareas',
        );
      }
      throw error;
    }
  }
}
