import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'class_course_subjects' })
@Unique('uq_class_course_subject_name', ['courseId', 'name'])
export class ClassCourseSubjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @Column({ type: 'varchar', length: 140 })
  name: string;

  @Column({ name: 'teacher_user_id', type: 'uuid', nullable: true })
  teacherUserId?: string | null;

  @Column({ name: 'display_order', type: 'int', default: 1 })
  displayOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
