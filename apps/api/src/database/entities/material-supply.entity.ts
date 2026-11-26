import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Inventario de insumos que no son material didáctico: papelería y artículos de paquete. */
@Entity({ name: 'material_supplies' })
export class MaterialSupplyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'int', nullable: true })
  available: number | null;

  /** Existencia de seguridad: por debajo de esto conviene comprar. */
  @Column({ name: 'min_stock', type: 'int', nullable: true })
  minStock: number | null;

  @Column({ type: 'int', default: 0 })
  position: number;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'NOW()' })
  updatedAt: Date;
}
