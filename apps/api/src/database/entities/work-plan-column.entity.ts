import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'work_plan_columns' })
export class WorkPlanColumnEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'plan_id', type: 'uuid' })
  planId: string;

  @Column({ type: 'varchar', length: 120 })
  label: string;

  @Column({ type: 'int', default: 0 })
  position: number;
}
