import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import type { TaskActivityType } from './task.entity';

@Entity({ name: 'semester_activity_weights' })
@Unique('uq_semester_activity_weight', ['year', 'semester', 'activityType'])
export class SemesterActivityWeightEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'smallint' })
  semester: number;

  @Column({ name: 'activity_type', type: 'varchar', length: 30 })
  activityType: TaskActivityType;

  @Column({ type: 'numeric', precision: 8, scale: 2 })
  weight: string;

  @Column({ name: 'updated_by', type: 'uuid' })
  updatedBy: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
