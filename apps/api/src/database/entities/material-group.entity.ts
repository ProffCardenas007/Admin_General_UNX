import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'material_groups' })
export class MaterialGroupEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10 })
  program: 'PAA' | 'EXANI' | 'PIENSE';

  @Column({ name: 'course_key', type: 'varchar', length: 40 })
  courseKey: string;

  @Column({ name: 'course_label', type: 'varchar', length: 80 })
  courseLabel: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  venue: string | null;

  @Column({ type: 'int', default: 0 })
  students: number;

  /** Inscritos reales (null = sin capturar). `students` es la proyección. */
  @Column({ type: 'int', nullable: true })
  enrolled: number | null;

  @Column({ type: 'boolean', default: true })
  counts: boolean;

  @Column({ type: 'int', default: 0 })
  position: number;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'NOW()' })
  updatedAt: Date;
}
