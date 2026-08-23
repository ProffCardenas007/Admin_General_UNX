import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'class_sessions' })
export class ClassSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @Column({ name: 'subject_id', type: 'uuid' })
  subjectId: string;

  @Column({ name: 'teacher_user_id', type: 'uuid' })
  teacherUserId: string;

  @Column({ name: 'cover_teacher_user_id', type: 'uuid', nullable: true })
  coverTeacherUserId?: string | null;

  @Column({ name: 'class_date', type: 'date' })
  classDate: string;

  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;

  @Column({ type: 'varchar', length: 40, default: 'Aula 1' })
  classroom: string;

  @Column({ type: 'varchar', length: 260, nullable: true })
  notes?: string | null;

  @Column({ name: 'coverage_note', type: 'varchar', length: 260, nullable: true })
  coverageNote?: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
