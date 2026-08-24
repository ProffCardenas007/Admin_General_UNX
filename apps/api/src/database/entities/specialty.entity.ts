import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'specialties' })
export class SpecialtyEntity {
  @PrimaryColumn({ type: 'varchar', length: 60 })
  code: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  name: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}