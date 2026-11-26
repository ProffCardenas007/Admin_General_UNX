import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Fecha de inicio de clases de un curso (un curso agrupa varias sedes/grupos). */
@Entity({ name: 'material_course_starts' })
export class MaterialCourseStartEntity {
  @PrimaryColumn({ type: 'varchar', length: 10 })
  program: 'PAA' | 'EXANI' | 'PIENSE';

  @PrimaryColumn({ name: 'course_key', type: 'varchar', length: 40 })
  courseKey: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;
}
