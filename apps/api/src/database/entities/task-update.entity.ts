import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'task_updates' })
export class TaskUpdateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'update_date', type: 'date' })
  updateDate: string;

  @Column({ name: 'worked_hours', type: 'numeric', precision: 8, scale: 2 })
  workedHours: string;

  @Column({ name: 'progress_percent', type: 'numeric', precision: 5, scale: 2 })
  progressPercent: string;

  @Column({ name: 'blocker_reason', type: 'text', nullable: true })
  blockerReason?: string;

  @Column({ type: 'text', nullable: true })
  comments?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
