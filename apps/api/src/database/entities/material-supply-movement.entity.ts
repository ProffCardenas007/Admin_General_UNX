import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Movimiento de un insumo. entry = compra o ingreso; delivery = entrega a cursos
 * (descuenta lo que piden los paquetes); exit = otra salida (merma, uso interno);
 * adjust = corrección por conteo físico (cantidad con signo).
 */
@Entity({ name: 'material_supply_movements' })
export class MaterialSupplyMovementEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'supply_id', type: 'uuid' })
  supplyId: string;

  @Column({ type: 'varchar', length: 10 })
  type: 'entry' | 'delivery' | 'exit' | 'adjust';

  @Column({ type: 'int' })
  quantity: number;

  @Column({ name: 'movement_date', type: 'date' })
  movementDate: string;

  /** A quién o para qué fue una salida. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  detail: string | null;

  @Column({
    name: 'unit_cost',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value: number | null) => value,
      from: (value: string | null) => (value === null ? null : Number(value)),
    },
  })
  unitCost: number | null;

  @Column({ name: 'created_by', type: 'varchar', length: 160, nullable: true })
  createdBy: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;
}
