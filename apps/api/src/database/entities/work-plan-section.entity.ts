import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'work_plan_sections' })
export class WorkPlanSectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'plan_id', type: 'uuid' })
  planId: string;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ name: 'spans_all', type: 'boolean', default: false })
  spansAll: boolean;

  @Column({ type: 'int', default: 0 })
  position: number;
}
