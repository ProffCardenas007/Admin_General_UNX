import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { UserRole } from './user.entity';

type AuditFieldDiff = {
  before: unknown;
  after: unknown;
};

@Entity({ name: 'audit_logs' })
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId: string;

  @Column({
    name: 'actor_role',
    type: 'enum',
    enum: ['manager', 'lead', 'worker'],
    enumName: 'user_role',
  })
  actorRole: UserRole;

  @Column({ name: 'actor_email', type: 'varchar', length: 180, nullable: true })
  actorEmail?: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 40 })
  entityType: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId: string;

  @Column({ name: 'entity_label', type: 'varchar', length: 220, nullable: true })
  entityLabel?: string;

  @Column({ type: 'varchar', length: 80 })
  action: string;

  @Column({ name: 'changes_json', type: 'jsonb', default: () => "'{}'::jsonb" })
  changesJson: Record<string, AuditFieldDiff>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
