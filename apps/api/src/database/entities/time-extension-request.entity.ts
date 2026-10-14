import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type TimeExtensionStatus = 'pending' | 'approved' | 'rejected';

@Entity({ name: 'time_extension_requests' })
export class TimeExtensionRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId: string;

  @Column({ name: 'requested_by', type: 'uuid' })
  requestedBy: string;

  @Column({ name: 'requested_hours', type: 'numeric', precision: 8, scale: 2 })
  requestedHours: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'varchar', length: 10, default: 'manual' })
  source: 'manual' | 'auto';

  @Column({ type: 'varchar', length: 10, default: 'pending' })
  status: TimeExtensionStatus;

  @Column({
    name: 'approved_hours',
    type: 'numeric',
    precision: 8,
    scale: 2,
    nullable: true,
  })
  approvedHours?: string | null;

  @Column({ name: 'decided_by', type: 'uuid', nullable: true })
  decidedBy?: string | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt?: Date | null;

  @Column({ name: 'decision_note', type: 'text', nullable: true })
  decisionNote?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
