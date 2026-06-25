import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskActivityType =
  | 'revision'
  | 'edicion'
  | 'creacion'
  | 'presentaciones'
  | 'grabacion'
  | 'plataforma';

@Entity({ name: 'tasks' })
export class TaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 60 })
  code: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ name: 'parent_task_id', type: 'uuid', nullable: true })
  parentTaskId?: string | null;

  @Column({
    name: 'activity_type',
    type: 'enum',
    enum: [
      'revision',
      'edicion',
      'creacion',
      'presentaciones',
      'grabacion',
      'plataforma',
    ],
    enumName: 'task_activity_type',
  })
  activityType: TaskActivityType;

  @Column({ type: 'varchar', length: 220 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'assignee_id', type: 'uuid', nullable: true })
  assigneeId?: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null;

  @Column({
    type: 'enum',
    enum: ['todo', 'doing', 'blocked', 'done'],
    enumName: 'task_status',
    default: 'todo',
  })
  status: TaskStatus;

  @Column({
    type: 'enum',
    enum: ['low', 'medium', 'high', 'urgent'],
    enumName: 'task_priority',
    default: 'medium',
  })
  priority: TaskPriority;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate?: string;

  @Column({
    name: 'estimated_hours',
    type: 'numeric',
    precision: 8,
    scale: 2,
    default: 0,
  })
  estimatedHours: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
