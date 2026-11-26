import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** exam = lleva examen · none = semana sin examen · break = descanso · end = cierre. */
export type MaterialScheduleKind = 'exam' | 'none' | 'break' | 'end';

@Entity({ name: 'material_schedule_entries' })
export class MaterialScheduleEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10 })
  program: 'PAA' | 'EXANI' | 'PIENSE';

  @Column({ name: 'course_key', type: 'varchar', length: 40 })
  courseKey: string;

  @Column({ name: 'week_start', type: 'date', nullable: true })
  weekStart: string | null;

  @Column({ name: 'week_number', type: 'int', nullable: true })
  weekNumber: number | null;

  @Column({ type: 'varchar', length: 160 })
  label: string;

  @Column({ type: 'varchar', length: 10, default: 'exam' })
  kind: MaterialScheduleKind;
}
