import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'class_courses' })
@Unique('uq_class_courses_name_section_code', ['name', 'sectionCode'])
export class ClassCourseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Column({ name: 'section_code', type: 'varchar', length: 20, nullable: true })
  sectionCode?: string | null;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'varchar', length: 20, default: 'presencial' })
  modality: 'presencial' | 'virtual';

  @Column({ type: 'varchar', length: 40, default: 'Aula 1' })
  classroom: string;

  @Column({ name: 'schedule_start_time', type: 'time', default: '08:00' })
  scheduleStartTime: string;

  @Column({ name: 'schedule_end_time', type: 'time', default: '10:30' })
  scheduleEndTime: string;

  @Column({ name: 'term_start_date', type: 'date', nullable: true })
  termStartDate?: string | null;

  @Column({ name: 'term_end_date', type: 'date', nullable: true })
  termEndDate?: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
