import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'material_items' })
export class MaterialItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10 })
  program: 'PAA' | 'EXANI' | 'PIENSE';

  @Column({ type: 'varchar', length: 120 })
  kind: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  version: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  module: string | null;

  @Column({ type: 'int', nullable: true })
  available: number | null;

  @Column({ name: 'print_qty', type: 'int', nullable: true })
  printQty: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'do_not_use', type: 'boolean', default: false })
  doNotUse: boolean;

  @Column({ type: 'boolean', default: false })
  reviewed: boolean;

  /** Destino del material retirado: conservar, reutilizar, donar o reciclar. null = por decidir. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  disposition: string | null;

  @Column({ type: 'int', default: 0 })
  position: number;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'NOW()' })
  updatedAt: Date;
}
