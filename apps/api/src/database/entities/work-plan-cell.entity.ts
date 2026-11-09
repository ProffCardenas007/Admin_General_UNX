import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type WorkPlanCellStatus =
  | 'unassigned'
  | 'assigned'
  | 'in_progress'
  | 'done'
  | 'blocked';

@Entity({ name: 'work_plan_cells' })
export class WorkPlanCellEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'row_id', type: 'uuid' })
  rowId: string;

  @Column({ name: 'column_id', type: 'uuid', nullable: true })
  columnId?: string | null;

  @Column({ type: 'varchar', length: 20, default: 'unassigned' })
  status: WorkPlanCellStatus;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate?: string | null;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate?: string | null;

  @Column({
    name: 'suggested_assignee',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  suggestedAssignee?: string | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ name: 'task_id', type: 'uuid', nullable: true })
  taskId?: string | null;

  @Column({ name: 'column_span', type: 'int', default: 1 })
  columnSpan: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
