import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'task_evaluations' })
@Unique('uq_task_evaluations_task', ['taskId'])
export class TaskEvaluationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId: string;

  @Column({ type: 'numeric', precision: 5, scale: 2 })
  grade: string;

  @Column({ type: 'text', nullable: true })
  comments?: string | null;

  @Column({ name: 'evaluated_by', type: 'uuid' })
  evaluatedBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
