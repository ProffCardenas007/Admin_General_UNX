import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { LeadSpecialty } from '../../common/specialties';

export type UserRole = 'manager' | 'lead' | 'worker';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'full_name', type: 'varchar', length: 120 })
  fullName: string;

  @Column({ type: 'varchar', length: 180, unique: true })
  email: string;

  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    nullable: true,
    select: false,
  })
  passwordHash?: string;

  @Column({
    type: 'enum',
    enum: ['manager', 'lead', 'worker'],
    enumName: 'user_role',
  })
  role: UserRole;

  @Column({
    name: 'specialty',
    type: 'enum',
    enum: [
      'paa',
      'exani_ii',
      'piense',
      'unam',
      'modulos',
    ],
    enumName: 'lead_specialty',
    nullable: true,
  })
  specialty?: LeadSpecialty | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
