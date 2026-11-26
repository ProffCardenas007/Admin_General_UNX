import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'material_notes' })
export class MaterialNoteEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10 })
  program: 'PAA' | 'EXANI' | 'PIENSE';

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'int', default: 0 })
  position: number;
}
