import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ProjectScope } from '../../common/specialties';

export type ProjectStatus = 'planned' | 'active' | 'on_hold' | 'done' | 'cancelled';

@Entity({ name: 'projects' })
export class ProjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Column({ type: 'varchar', length: 160, unique: true })
  name: string;

  @Column({ name: 'client_name', type: 'varchar', length: 160, nullable: true })
  clientName?: string;

  @Column({ name: 'owner_team_id', type: 'uuid', nullable: true })
  ownerTeamId?: string;

  @Column({
    name: 'scope',
    type: 'enum',
    enum: [
      'paa',
      'exani_ii',
      'piense',
      'unam',
      'modulos',
    ],
    enumName: 'project_scope',
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
