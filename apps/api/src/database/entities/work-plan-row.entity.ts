import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'work_plan_rows' })
export class WorkPlanRowEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'section_id', type: 'uuid' })
  sectionId: string;

  @Column({ type: 'varchar', length: 160 })
  label: string;

  @Column({ type: 'int', default: 0 })
  position: number;
}
