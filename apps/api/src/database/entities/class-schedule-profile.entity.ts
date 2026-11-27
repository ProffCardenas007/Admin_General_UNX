import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity({ name: 'class_schedule_profiles' })
export class ClassScheduleProfileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  @OneToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  /** Respaldo de antes de separar por calendario; ya no se usa. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  availability: Record<string, string>;

  /** Disponibilidad semanal por calendario escolar: { "2027A": {...}, "2027B": {...} }. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  calendars: Record<string, { availability: Record<string, string>; updatedAt: string }>;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  incidences: Array<{
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    reason: string;
  }>;

  /** Las materias no van aquí: viven en users.class_subjects. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  teaching: { programs?: string[]; modalities?: string[]; venues?: string[] };

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
