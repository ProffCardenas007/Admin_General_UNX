import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ProjectScope } from '../../common/specialties';

export type ProjectStatus =
  | 'planned'
  | 'active'
  | 'on_hold'
  | 'done'
  | 'cancelled';

@Entity({ name: 'projects' })
export class ProjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ name: 'client_name', type: 'varchar', length: 160, nullable: true })
  clientName?: string;

  @Column({ name: 'owner_team_id', type: 'uuid', nullable: true })
  ownerTeamId?: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null;

  @Column({
    name: 'scope',
    type: 'varchar',
    length: 60,
    nullable: true,
  })
  scope?: ProjectScope | null;

  @Column({
    type: 'enum',
    enum: ['planned', 'active', 'on_hold', 'done', 'cancelled'],
    enumName: 'project_status',
    default: 'planned',
  })
  status: ProjectStatus;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate?: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
