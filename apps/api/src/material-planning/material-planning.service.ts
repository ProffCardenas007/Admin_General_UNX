import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { MaterialGroupEntity } from '../database/entities/material-group.entity';
import { MaterialItemEntity } from '../database/entities/material-item.entity';
import { MaterialAssignmentEntity } from '../database/entities/material-assignment.entity';
import { MaterialKitItemEntity } from '../database/entities/material-kit-item.entity';
import { MaterialScheduleEntryEntity } from '../database/entities/material-schedule-entry.entity';
import { MaterialNoteEntity } from '../database/entities/material-note.entity';
import { MaterialSupplyEntity } from '../database/entities/material-supply.entity';
import { MaterialCourseStartEntity } from '../database/entities/material-course-start.entity';
import { MaterialSupplyMovementEntity } from '../database/entities/material-supply-movement.entity';
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

function emptyToNull(value: string | null | undefined) {
  if (value === undefined) return undefined;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

@Injectable()
export class MaterialPlanningService {
  constructor(
    @InjectRepository(MaterialGroupEntity)
    private readonly groups: Repository<MaterialGroupEntity>,
    @InjectRepository(MaterialItemEntity)
    private readonly items: Repository<MaterialItemEntity>,
    @InjectRepository(MaterialAssignmentEntity)
    private readonly assignments: Repository<MaterialAssignmentEntity>,
    @InjectRepository(MaterialKitItemEntity)
    private readonly kits: Repository<MaterialKitItemEntity>,
    @InjectRepository(MaterialScheduleEntryEntity)
    private readonly schedule: Repository<MaterialScheduleEntryEntity>,
    @InjectRepository(MaterialNoteEntity)
    private readonly notes: Repository<MaterialNoteEntity>,
    @InjectRepository(MaterialCourseStartEntity)
    private readonly courseStarts: Repository<MaterialCourseStartEntity>,
    @InjectRepository(MaterialSupplyEntity)
    private readonly supplies: Repository<MaterialSupplyEntity>,
    @InjectRepository(MaterialSupplyMovementEntity)
    private readonly movements: Repository<MaterialSupplyMovementEntity>,
  ) {}

  /** Todo el módulo en una sola respuesta: son ~150 materiales y ~25 grupos. */
  async getAll() {
    const [
      groups,
      items,
      assignments,
      kits,
      schedule,
      notes,
      courseStarts,
      supplies,
      supplyMovements,
    ] = await Promise.all([
      this.groups.find({ order: { program: 'ASC', position: 'ASC' } }),
      this.items.find({ order: { program: 'ASC', position: 'ASC' } }),
      this.assignments.find(),
      this.kits.find({ order: { position: 'ASC' } }),
      this.schedule.find({ order: { weekStart: 'ASC', weekNumber: 'DESC' } }),
      this.notes.find({ order: { position: 'ASC' } }),
      this.courseStarts.find(),
      this.supplies.find({ order: { position: 'ASC' } }),
      this.movements.find({
        order: { movementDate: 'DESC', createdAt: 'DESC' },
      }),
    ]);

    const groupIdsByItem = new Map<string, string[]>();
    for (const row of assignments) {
      const list = groupIdsByItem.get(row.itemId);
      if (list) list.push(row.groupId);
      else groupIdsByItem.set(row.itemId, [row.groupId]);
    }

    return {
      groups,
      items: items.map((item) => ({
        ...item,
        groupIds: groupIdsByItem.get(item.id) ?? [],
      })),
      kits,
      schedule,
      notes,
      courseStarts,
      supplies,
      supplyMovements,
    };
  }

  /** Fija (o quita, con null) la fecha de inicio de clases de un curso. */
  async setCourseStart(
    program: string,
    courseKey: string,
    dto: SetCourseStartDto,
  ) {
    if (program !== 'PAA' && program !== 'EXANI' && program !== 'PIENSE') {
      throw new BadRequestException('Programa inválido');
    }
    const exists = await this.groups.exist({ where: { program, courseKey } });
    if (!exists) throw new NotFoundException('Curso no encontrado');

    if (!dto.startDate) {
      await this.courseStarts.delete({ program, courseKey });
      return { program, courseKey, startDate: null, shiftedDays: 0 };
    }

    // El calendario del curso siempre arranca en su inicio de clases: al cambiar la
    // fecha, todas las semanas se recorren por la misma diferencia (se conserva su orden).
    const startDate = dto.startDate;
    const shiftedDays = await this.schedule.manager.transaction(
      async (manager) => {
        await manager.save(
          MaterialCourseStartEntity,
          manager.create(MaterialCourseStartEntity, {
            program,
            courseKey,
            startDate,
          }),
        );
        const rows: Array<{ days: number | null }> = await manager.query(
          `SELECT ($1::date - MIN(week_start))::int AS days
           FROM material_schedule_entries
          WHERE program = $2 AND course_key = $3 AND kind <> 'break' AND week_start IS NOT NULL`,
          [startDate, program, courseKey],
        );
        const days = rows[0]?.days ?? 0;
        if (days !== 0) {
          await manager.query(
            `UPDATE material_schedule_entries
              SET week_start = week_start + ($1::int * INTERVAL '1 day')
            WHERE program = $2 AND course_key = $3 AND week_start IS NOT NULL`,
            [days, program, courseKey],
          );
        }
        return days;
      },
    );
    return { program, courseKey, startDate, shiftedDays };
  }

  async createItem(dto: CreateMaterialItemDto) {
    const last = await this.items
      .createQueryBuilder('i')
      .select('COALESCE(MAX(i.position), -1)', 'max')
      .where('i.program = :program', { program: dto.program })
      .getRawOne<{ max: string }>();

    const created = await this.items.save(
      this.items.create({
        program: dto.program,
        kind: dto.kind.trim(),
        version: emptyToNull(dto.version) ?? null,
        module: emptyToNull(dto.module) ?? null,
        available: dto.available ?? null,
        printQty: null,
        notes: null,
        doNotUse: false,
        reviewed: false,
        position: Number(last?.max ?? -1) + 1,
      }),
    );
    return { ...created, groupIds: [] as string[] };
  }

  async updateItem(id: string, dto: UpdateMaterialItemDto) {
    const item = await this.items.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Material no encontrado');

    if (dto.kind !== undefined) item.kind = dto.kind.trim();
    if (dto.version !== undefined)
      item.version = emptyToNull(dto.version) ?? null;
    if (dto.module !== undefined) item.module = emptyToNull(dto.module) ?? null;
    if (dto.available !== undefined) item.available = dto.available;
    if (dto.printQty !== undefined) item.printQty = dto.printQty;
    if (dto.notes !== undefined) item.notes = emptyToNull(dto.notes) ?? null;
    if (dto.doNotUse !== undefined) item.doNotUse = dto.doNotUse;
    if (dto.disposition !== undefined) item.disposition = dto.disposition;
    // Un material que vuelve a usarse deja de tener destino de retiro.
    if (dto.doNotUse === false) item.disposition = null;
    if (dto.reviewed !== undefined) item.reviewed = dto.reviewed;
    item.updatedAt = new Date();

    return this.items.save(item);
  }

  async bulkUpdateItems(dto: BulkUpdateMaterialItemsDto) {
    const patch: Partial<MaterialItemEntity> = { updatedAt: new Date() };
    if (dto.reviewed !== undefined) patch.reviewed = dto.reviewed;
    if (dto.doNotUse !== undefined) patch.doNotUse = dto.doNotUse;
    await this.items.update({ id: In(dto.ids) }, patch);
    return { updated: dto.ids.length };
  }

  async removeItem(id: string) {
    const result = await this.items.delete({ id });
    if (!result.affected) throw new NotFoundException('Material no encontrado');
    return { ok: true };
  }

  async setAssignments(dto: SetAssignmentsDto) {
    const group = await this.groups.findOne({ where: { id: dto.groupId } });
    if (!group) throw new NotFoundException('Grupo no encontrado');

    if (dto.assigned) {
      const existing = await this.items.find({
        where: { id: In(dto.itemIds), program: group.program },
        select: { id: true },
      });
      if (existing.length > 0) {
        await this.assignments
          .createQueryBuilder()
          .insert()
          .values(
            existing.map((item) => ({ itemId: item.id, groupId: dto.groupId })),
          )
          .orIgnore()
          .execute();
      }
    } else {
      await this.assignments.delete({
        groupId: dto.groupId,
        itemId: In(dto.itemIds),
      });
    }
    return { ok: true };
  }

  async createGroup(dto: CreateMaterialGroupDto) {
    const label = dto.courseLabel.trim();
    const siblings = await this.groups.find({
      where: { program: dto.program },
    });

    // Mismo nombre de curso => mismo curso (comparten paquete y calendario).
    const sameCourse = siblings.find(
      (group) => group.courseLabel.toLowerCase() === label.toLowerCase(),
    );
    let courseKey = sameCourse?.courseKey;
    if (!courseKey) {
      const base =
        label
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 30) || 'curso';
      const taken = new Set(siblings.map((group) => group.courseKey));
      courseKey = base;
      for (let n = 2; taken.has(courseKey); n += 1) courseKey = `${base}_${n}`;
    }

    const position =
      siblings.reduce((max, group) => Math.max(max, group.position), -1) + 1;
    return this.groups.save(
      this.groups.create({
        program: dto.program,
        courseKey,
        courseLabel: sameCourse?.courseLabel ?? label,
        venue: emptyToNull(dto.venue) ?? null,
        students: dto.students ?? 0,
        counts: dto.counts ?? true,
        position,
      }),
    );
  }

  async updateGroup(id: string, dto: UpdateMaterialGroupDto) {
    const group = await this.groups.findOne({ where: { id } });
    if (!group) throw new NotFoundException('Grupo no encontrado');
    if (dto.students !== undefined) group.students = dto.students;
    if (dto.enrolled !== undefined) group.enrolled = dto.enrolled;
    if (dto.counts !== undefined) group.counts = dto.counts;
    if (dto.venue !== undefined) group.venue = emptyToNull(dto.venue) ?? null;
    group.updatedAt = new Date();

    if (dto.courseLabel !== undefined) {
      const label = dto.courseLabel.trim();
      // Dos cursos con el mismo nombre se confundirían en filtros y calendarios.
      const siblings = await this.groups.find({
        where: { program: group.program },
      });
      if (
        siblings.some(
          (other) =>
            other.courseKey !== group.courseKey &&
            other.courseLabel.toLowerCase() === label.toLowerCase(),
        )
      ) {
        throw new BadRequestException('Ya existe un curso con ese nombre');
      }
      group.courseLabel = label;
      // El nombre es del curso: se actualiza en todas sus sedes.
      await this.groups.update(
        { program: group.program, courseKey: group.courseKey },
        { courseLabel: label },
      );
    }
    return this.groups.save(group);
  }

  async removeGroup(id: string) {
    const result = await this.groups.delete({ id });
    if (!result.affected) throw new NotFoundException('Grupo no encontrado');
    return { ok: true };
  }

  async updateKitItem(id: string, dto: UpdateKitItemDto) {
    const kit = await this.kits.findOne({ where: { id } });
    if (!kit) throw new NotFoundException('Renglón de paquete no encontrado');
    if (dto.qty !== undefined) kit.qty = dto.qty;
    if (dto.item !== undefined) kit.item = dto.item.trim();
    const saved = await this.kits.save(kit);
    if (dto.supplyId !== undefined) {
      if (
        dto.supplyId &&
        !(await this.supplies.exist({ where: { id: dto.supplyId } }))
      ) {
        throw new NotFoundException('Insumo no encontrado');
      }
      // El vínculo es por nombre de renglón: vale para el mismo renglón de todos los cursos del programa.
      await this.kits
        .createQueryBuilder()
        .update()
        .set({ supplyId: dto.supplyId })
        .where('program = :program AND LOWER(item) = LOWER(:item)', {
          program: saved.program,
          item: saved.item,
        })
        .execute();
      saved.supplyId = dto.supplyId;
    }
    return saved;
  }

  /**
   * Convierte un .xlsx/.csv subido a texto tabulado para la vista previa de importación.
   * Usa la hoja "Materiales" (o la primera) y arranca en la fila que trae el encabezado "Material".
   */
  async fileToImportText(file: { originalname: string; buffer: Buffer }) {
    if (/\.csv$/i.test(file.originalname)) {
      return { text: file.buffer.toString('utf8').replace(/^\uFEFF/, '') };
    }
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file.buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new BadRequestException('No se pudo leer el archivo de Excel');
    }
    const sheet =
      workbook.worksheets.find(
        (ws) => ws.name.trim().toLowerCase() === 'materiales',
      ) ?? workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('El archivo no tiene hojas');

    const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
    const lines: string[] = [];
    let started = false;
    const width = Math.min(sheet.columnCount, 12);
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells = Array.from({ length: width }, (_, i) =>
        clean(row.getCell(i + 1).text ?? ''),
      );
      if (!started) {
        if (!cells.some((cell) => cell.toLowerCase() === 'material')) return;
        started = true;
      }
      if (cells.some(Boolean)) lines.push(cells.join('\t'));
    });
    if (!started) {
      throw new BadRequestException(
        'No encontré la columna “Material” en el archivo',
      );
    }
    return { text: lines.join('\n') };
  }

  /** Forma comparable de un nombre: sin acentos, sin plurales simples ni palabras de marca. */
  private supplyKey(name: string) {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word && word !== 'unx')
      .map((word) =>
        word.endsWith('ces')
          ? word.slice(0, -3) + 'z'
          : word.length > 3 && word.endsWith('s')
            ? word.slice(0, -1)
            : word,
      )
      .join(' ');
  }

  /** Vincula renglones de paquete sin insumo con el insumo cuyo nombre coincide (o lo empieza). */
  private async autoLinkKits() {
    const [supplies, kits] = await Promise.all([
      this.supplies.find(),
      this.kits.find({ where: { supplyId: IsNull() } }),
    ]);
    const keys = supplies.map((supply) => ({
      id: supply.id,
      key: this.supplyKey(supply.name),
    }));
    for (const kit of kits) {
      const kitKey = this.supplyKey(kit.item);
      const match =
        keys.find((entry) => entry.key === kitKey) ??
        keys.find((entry) => entry.key.startsWith(kitKey + ' '));
      if (match) await this.kits.update({ id: kit.id }, { supplyId: match.id });
    }
  }

  async createSupply(dto: CreateSupplyDto) {
    const name = dto.name.trim();
    const existing = await this.supplies.find();
    if (existing.some((row) => row.name.toLowerCase() === name.toLowerCase())) {
      throw new BadRequestException('Ya existe un insumo con ese nombre');
    }
    const position =
      existing.reduce((max, row) => Math.max(max, row.position), -1) + 1;
    const created = await this.supplies.save(
      this.supplies.create({
        name,
        available: dto.available ?? null,
        position,
        updatedAt: new Date(),
      }),
    );
    await this.autoLinkKits();
    return created;
  }

  async updateSupply(id: string, dto: UpdateSupplyDto) {
    const supply = await this.supplies.findOne({ where: { id } });
    if (!supply) throw new NotFoundException('Insumo no encontrado');
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      const all = await this.supplies.find();
      if (
        all.some(
          (row) =>
            row.id !== id && row.name.toLowerCase() === name.toLowerCase(),
        )
      ) {
        throw new BadRequestException('Ya existe un insumo con ese nombre');
      }
      supply.name = name;
    }
    if (dto.minStock !== undefined) supply.minStock = dto.minStock;
    supply.updatedAt = new Date();
    const saved = await this.supplies.save(supply);
    if (dto.name !== undefined) await this.autoLinkKits();
    return saved;
  }

  async removeSupply(id: string) {
    const result = await this.supplies.delete({ id });
    if (!result.affected) throw new NotFoundException('Insumo no encontrado');
    return { ok: true };
  }

  /** Registra el movimiento y actualiza las existencias en la misma transacción. */
  async createSupplyMovement(
    supplyId: string,
    dto: CreateSupplyMovementDto,
    createdBy: string | null,
  ) {
    return this.supplies.manager.transaction(async (manager) => {
      const supply = await manager.findOne(MaterialSupplyEntity, {
        where: { id: supplyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!supply) throw new NotFoundException('Insumo no encontrado');

      const stock = supply.available ?? 0;
      let quantity = dto.quantity;
      let next: number;
      if (dto.type === 'adjust') {
        next = dto.quantity;
        quantity = next - stock;
      } else {
        if (quantity < 1) {
          throw new BadRequestException('La cantidad debe ser mayor a cero');
        }
        next = dto.type === 'entry' ? stock + quantity : stock - quantity;
        if (next < 0) {
          throw new BadRequestException(
            `No hay existencias suficientes: quedan ${stock}`,
          );
        }
      }

      supply.available = next;
      supply.updatedAt = new Date();
      await manager.save(supply);
      const movement = await manager.save(
        manager.create(MaterialSupplyMovementEntity, {
          supplyId,
          type: dto.type,
          quantity,
          movementDate: dto.movementDate,
          detail: emptyToNull(dto.detail) ?? null,
          unitCost: dto.type === 'entry' ? (dto.unitCost ?? null) : null,
          createdBy,
          createdAt: new Date(),
        }),
      );
      return { movement, available: next };
    });
  }

  /** Anula un movimiento capturado por error y regresa las existencias. */
  async removeSupplyMovement(id: string) {
    return this.supplies.manager.transaction(async (manager) => {
      const movement = await manager.findOne(MaterialSupplyMovementEntity, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!movement) throw new NotFoundException('Movimiento no encontrado');
      const supply = await manager.findOne(MaterialSupplyEntity, {
        where: { id: movement.supplyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!supply) throw new NotFoundException('Insumo no encontrado');

      // entry y adjust se guardan sumando; delivery y exit, restando.
      const effect =
        movement.type === 'entry' || movement.type === 'adjust'
          ? movement.quantity
          : -movement.quantity;
      const next = (supply.available ?? 0) - effect;
      if (next < 0) {
        throw new BadRequestException(
          'No se puede anular: las existencias quedarían en negativo',
        );
      }
      supply.available = next;
      supply.updatedAt = new Date();
      await manager.save(supply);
      await manager.delete(MaterialSupplyMovementEntity, { id });
      return { ok: true, supplyId: supply.id, available: next };
    });
  }

  async createKitItem(dto: CreateKitItemDto) {
    const exists = await this.groups.exist({
      where: { program: dto.program, courseKey: dto.courseKey },
    });
    if (!exists) throw new NotFoundException('Curso no encontrado');

    const name = dto.item.trim();
    const siblings = await this.kits.find({
      where: { program: dto.program, courseKey: dto.courseKey },
    });
    if (siblings.some((row) => row.item.toLowerCase() === name.toLowerCase())) {
      throw new BadRequestException('Ese renglón ya está en el paquete');
    }
    const position =
      siblings.reduce((max, row) => Math.max(max, row.position), -1) + 1;
    return this.kits.save(
      this.kits.create({
        program: dto.program,
        courseKey: dto.courseKey,
        item: name,
        qty: dto.qty ?? 1,
        position,
      }),
    );
  }

  async removeKitItem(id: string) {
    const result = await this.kits.delete({ id });
    if (!result.affected)
      throw new NotFoundException('Renglón de paquete no encontrado');
    return { ok: true };
  }

  /**
   * Carga masiva de materiales/inventario (p. ej. pegado desde Excel). Un renglón
   * coincide con un material existente si tienen el mismo material + versión + módulo;
   * si no existe, se crea. Todo ocurre en una transacción: o entra todo o nada.
   */
  async importItems(dto: ImportMaterialItemsDto) {
    const key = (
      program: string,
      kind: string,
      version?: string | null,
      module?: string | null,
    ) =>
      [program, kind, version ?? '', module ?? '']
        .map((part) => part.trim().toLowerCase())
        .join('|');

    const result = await this.items.manager.transaction(async (manager) => {
      const existing = await manager.find(MaterialItemEntity);
      const byKey = new Map(
        existing.map((item) => [
          key(item.program, item.kind, item.version, item.module),
          item,
        ]),
      );
      const positions: Record<string, number> = { PAA: 0, EXANI: 0, PIENSE: 0 };
      for (const item of existing) {
        positions[item.program] = Math.max(
          positions[item.program] ?? 0,
          item.position + 1,
        );
      }

      let created = 0;
      let updated = 0;

      // Filas con Programa = "Insumo": van al inventario de insumos (se buscan por nombre).
      const supplyRows = dto.rows.filter((row) => row.program === 'INSUMO');
      if (supplyRows.length > 0) {
        const supplies = await manager.find(MaterialSupplyEntity);
        const byName = new Map(
          supplies.map((supply) => [supply.name.trim().toLowerCase(), supply]),
        );
        let supplyPosition =
          supplies.reduce((max, supply) => Math.max(max, supply.position), -1) +
          1;
        for (const row of supplyRows) {
          const name = row.kind.trim();
          const match = byName.get(name.toLowerCase());
          if (match) {
            if (row.available !== undefined) {
              const before = match.available ?? 0;
              match.available =
                dto.mode === 'add' ? before + row.available : row.available;
              match.updatedAt = new Date();
              await manager.save(match);
              // La importación también queda en el historial.
              if (match.available !== before) {
                await manager.save(
                  manager.create(MaterialSupplyMovementEntity, {
                    supplyId: match.id,
                    type: dto.mode === 'add' ? 'entry' : 'adjust',
                    quantity: match.available - before,
                    movementDate: new Date().toLocaleDateString('en-CA', {
                      timeZone: 'America/Mexico_City',
                    }),
                    detail: 'Importación',
                    createdAt: new Date(),
                  }),
                );
              }
            }
            updated += 1;
          } else {
            const supply = await manager.save(
              manager.create(MaterialSupplyEntity, {
                name,
                available: row.available ?? null,
                position: supplyPosition++,
                updatedAt: new Date(),
              }),
            );
            byName.set(name.toLowerCase(), supply);
            created += 1;
          }
        }
      }

      for (const row of dto.rows) {
        if (row.program === 'INSUMO') continue;
        const program = row.program ?? dto.program;
        const kind = row.kind.trim();
        const version = emptyToNull(row.version) ?? null;
        const module = emptyToNull(row.module) ?? null;
        const match = byKey.get(key(program, kind, version, module));

        if (match) {
          if (row.available !== undefined) {
            match.available =
              dto.mode === 'add'
                ? (match.available ?? 0) + row.available
                : row.available;
          }
          if (row.printQty !== undefined) match.printQty = row.printQty;
          if (row.notes !== undefined)
            match.notes = emptyToNull(row.notes) ?? null;
          if (row.doNotUse !== undefined) match.doNotUse = row.doNotUse;
          match.updatedAt = new Date();
          await manager.save(match);
          updated += 1;
        } else {
          const item = await manager.save(
            manager.create(MaterialItemEntity, {
              program,
              kind,
              version,
              module,
              available: row.available ?? null,
              printQty: row.printQty ?? null,
              notes: emptyToNull(row.notes) ?? null,
              doNotUse: row.doNotUse ?? false,
              reviewed: false,
              position: positions[program]++,
            }),
          );
          byKey.set(key(program, kind, version, module), item);
          created += 1;
        }
      }
      return { created, updated };
    });
    await this.autoLinkKits();
    return result;
  }

  async updateScheduleEntry(id: string, dto: UpdateScheduleEntryDto) {
    const entry = await this.schedule.findOne({ where: { id } });
    if (!entry)
      throw new NotFoundException('Entrada de calendario no encontrada');
    if (dto.kind !== undefined) {
      // El cierre de curso no cambia de tipo.
      if (entry.kind === 'end') {
        throw new BadRequestException(
          'El cierre del curso no puede cambiarse de tipo',
        );
      }
      entry.kind = dto.kind;
      if (dto.kind === 'none') entry.label = 'Sin examen';
      else if (dto.kind === 'break' && dto.label === undefined)
        entry.label = 'Situación especial';
    }
    if (dto.label !== undefined && entry.kind !== 'none')
      entry.label = dto.label.trim();
    if (dto.weekStart !== undefined) entry.weekStart = dto.weekStart;
    return this.schedule.save(entry);
  }

  async createScheduleEntry(dto: CreateScheduleEntryDto) {
    const exists = await this.groups.exist({
      where: { program: dto.program, courseKey: dto.courseKey },
    });
    if (!exists) throw new NotFoundException('Curso no encontrado');

    const kind = dto.kind ?? 'exam';
    const typed = dto.label?.trim();
    const label =
      kind === 'none'
        ? 'Sin examen'
        : typed || (kind === 'break' ? 'Situación especial' : 'Examen');

    return this.schedule.save(
      this.schedule.create({
        program: dto.program,
        courseKey: dto.courseKey,
        weekStart: dto.weekStart,
        // La numeración de semanas se calcula en pantalla a partir de las fechas.
        weekNumber: null,
        label,
        kind,
      }),
    );
  }

  async removeScheduleEntry(id: string) {
    const result = await this.schedule.delete({ id });
    if (!result.affected)
      throw new NotFoundException('Entrada de calendario no encontrada');
    return { ok: true };
  }

  /** Recorre el calendario y, junto con él, el inicio de clases de los cursos afectados. */
  async shiftSchedule(dto: ShiftScheduleDto) {
    const params: unknown[] = [dto.days, dto.program];
    const courseFilter = dto.courseKey ? ' AND course_key = $3' : '';
    if (dto.courseKey) params.push(dto.courseKey);

    return this.schedule.manager.transaction(async (manager) => {
      const entries: Array<unknown> = await manager.query(
        `UPDATE material_schedule_entries
            SET week_start = week_start + ($1::int * INTERVAL '1 day')
          WHERE program = $2 AND week_start IS NOT NULL${courseFilter}
        RETURNING id`,
        params,
      );
      await manager.query(
        `UPDATE material_course_starts
            SET start_date = start_date + ($1::int * INTERVAL '1 day')
          WHERE program = $2${courseFilter}`,
        params,
      );
      return { updated: entries.length };
    });
  }
}
