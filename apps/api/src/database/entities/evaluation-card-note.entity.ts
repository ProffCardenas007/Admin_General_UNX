import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Comentarios de dirección en la tarjeta de evaluación de una persona. */
@Entity({ name: 'evaluation_card_notes' })
@Unique('uq_evaluation_card_note', ['year', 'semester', 'subjectKey'])
export class EvaluationCardNoteEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'smallint' })
  semester: number;

  @Column({ name: 'subject_key', type: 'varchar', length: 160 })
  subjectKey: string;

  @Column({ name: 'subject_name', type: 'varchar', length: 160 })
  subjectName: string;

  @Column({ name: 'subject_user_id', type: 'uuid', nullable: true })
  subjectUserId: string | null;

  @Column({ type: 'text', default: '' })
  comments: string;

  @Column({ name: 'updated_by', type: 'uuid' })
  updatedBy: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
