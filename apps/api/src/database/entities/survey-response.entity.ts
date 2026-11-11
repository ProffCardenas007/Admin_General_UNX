import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type SurveyType = 'lider' | 'profesor';
export type SurveyTextField = 'strengths' | 'improvements' | 'comments';

/** Respuesta anónima de una encuesta 360: no se guarda quién evaluó. */
@Entity({ name: 'survey_responses' })
export class SurveyResponseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'smallint' })
  semester: number;

  @Column({ name: 'survey_type', type: 'varchar', length: 20 })
  surveyType: SurveyType;

  @Column({ name: 'subject_key', type: 'varchar', length: 160 })
  subjectKey: string;

  @Column({ name: 'subject_name', type: 'varchar', length: 160 })
  subjectName: string;

  @Column({ name: 'subject_user_id', type: 'uuid', nullable: true })
  subjectUserId: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  scores: Record<string, number>;

  @Column({ type: 'text', nullable: true })
  strengths: string | null;

  @Column({ type: 'text', nullable: true })
  improvements: string | null;

  @Column({ type: 'text', nullable: true })
  comments: string | null;

  @Column({
    name: 'hidden_fields',
    type: 'varchar',
    length: 20,
    array: true,
    default: () => "'{}'",
  })
  hiddenFields: SurveyTextField[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
