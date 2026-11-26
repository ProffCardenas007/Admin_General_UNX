import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'material_kit_items' })
export class MaterialKitItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10 })
  program: 'PAA' | 'EXANI' | 'PIENSE';

  @Column({ name: 'course_key', type: 'varchar', length: 40 })
  courseKey: string;

  @Column({ type: 'varchar', length: 120 })
  item: string;

  @Column({ type: 'int', default: 0 })
  qty: number;

  @Column({ name: 'supply_id', type: 'uuid', nullable: true })
  supplyId: string | null;

  @Column({ type: 'int', default: 0 })
  position: number;
}
