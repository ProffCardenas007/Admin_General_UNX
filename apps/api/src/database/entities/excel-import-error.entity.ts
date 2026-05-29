import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'excel_import_errors' })
export class ExcelImportErrorEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'import_id', type: 'uuid' })
  importId: string;

  @Column({ name: 'row_number', type: 'int' })
  rowNumber: number;

  @Column({ name: 'column_name', type: 'varchar', length: 80 })
  columnName: string;

  @Column({ type: 'text' })
  message: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
