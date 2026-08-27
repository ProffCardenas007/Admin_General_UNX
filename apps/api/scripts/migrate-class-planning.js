require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    await client.query(`
      CREATE TABLE IF NOT EXISTS class_courses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(40) NOT NULL,
        section_code VARCHAR(20) NULL,
        name VARCHAR(160) NOT NULL,
        modality VARCHAR(20) NOT NULL DEFAULT 'presencial',
        classroom VARCHAR(40) NOT NULL DEFAULT 'Aula 1',
        schedule_start_time TIME NOT NULL DEFAULT '08:00',
        schedule_end_time TIME NOT NULL DEFAULT '10:30',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      ALTER TABLE class_courses
      ADD COLUMN IF NOT EXISTS section_code VARCHAR(20) NULL
    `);

    await client.query(`
      ALTER TABLE class_courses
      ADD COLUMN IF NOT EXISTS modality VARCHAR(20) NOT NULL DEFAULT 'presencial'
    `);

    await client.query(`
      ALTER TABLE class_courses
      ADD COLUMN IF NOT EXISTS classroom VARCHAR(40) NOT NULL DEFAULT 'Aula 1'
    `);

    await client.query(`
      ALTER TABLE class_courses
      ADD COLUMN IF NOT EXISTS schedule_start_time TIME NOT NULL DEFAULT '08:00'
    `);

    await client.query(`
      ALTER TABLE class_courses
      ALTER COLUMN schedule_start_time SET DEFAULT '08:00'
    `);

    await client.query(`
      ALTER TABLE class_courses
      ADD COLUMN IF NOT EXISTS schedule_end_time TIME NOT NULL DEFAULT '10:30'
    `);

    await client.query(`
      ALTER TABLE class_courses
      ADD COLUMN IF NOT EXISTS term_start_date DATE NULL
    `);

    await client.query(`
      ALTER TABLE class_courses
      ADD COLUMN IF NOT EXISTS term_end_date DATE NULL
    `);

    await client.query(`
      ALTER TABLE class_courses
      DROP CONSTRAINT IF EXISTS class_courses_code_key
    `);

    await client.query(`
      DO $$
      DECLARE
        unique_constraint RECORD;
      BEGIN
        FOR unique_constraint IN
          SELECT constraint_row.conname
          FROM pg_constraint constraint_row
          JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
          WHERE table_row.relname = 'class_courses'
            AND constraint_row.contype = 'u'
            AND array_length(constraint_row.conkey, 1) = 1
            AND (
              SELECT column_row.attname
              FROM pg_attribute column_row
              WHERE column_row.attrelid = constraint_row.conrelid
                AND column_row.attnum = constraint_row.conkey[1]
            ) IN ('name', 'section_code')
        LOOP
          EXECUTE format(
            'ALTER TABLE class_courses DROP CONSTRAINT %I',
            unique_constraint.conname
          );
        END LOOP;
      END
      $$;
    `);

    await client.query('DROP INDEX IF EXISTS uq_class_courses_section_code');

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'class_courses'::regclass
            AND conname = 'uq_class_courses_name_section_code'
        ) THEN
          ALTER TABLE class_courses
          ADD CONSTRAINT uq_class_courses_name_section_code UNIQUE (name, section_code);
        END IF;
      END
      $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS class_course_subjects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id UUID NOT NULL REFERENCES class_courses(id) ON DELETE CASCADE,
        name VARCHAR(140) NOT NULL,
        teacher_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        display_order INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_class_course_subject_name UNIQUE (course_id, name)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS class_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id UUID NOT NULL REFERENCES class_courses(id) ON DELETE CASCADE,
        subject_id UUID NOT NULL REFERENCES class_course_subjects(id) ON DELETE CASCADE,
        teacher_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        cover_teacher_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        class_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        classroom VARCHAR(40) NOT NULL DEFAULT 'Aula 1',
        notes VARCHAR(260) NULL,
        coverage_note VARCHAR(260) NULL,
        created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_class_sessions_time_range CHECK (start_time < end_time)
      )
    `);

    await client.query(`
      ALTER TABLE class_sessions
      ADD COLUMN IF NOT EXISTS cover_teacher_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL
    `);

    await client.query(`
      ALTER TABLE class_sessions
      ADD COLUMN IF NOT EXISTS coverage_note VARCHAR(260) NULL
    `);

    await client.query(`
      ALTER TABLE class_sessions
      ADD COLUMN IF NOT EXISTS classroom VARCHAR(40) NOT NULL DEFAULT 'Aula 1'
    `);

    await client.query(`
      ALTER TABLE class_courses
      ADD COLUMN IF NOT EXISTS import_key VARCHAR(64) NULL
    `);

    await client.query(`
      ALTER TABLE class_sessions
      ADD COLUMN IF NOT EXISTS import_key VARCHAR(64) NULL
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_class_courses_import_key
      ON class_courses(import_key)
      WHERE import_key IS NOT NULL
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_class_sessions_import_key
      ON class_sessions(import_key)
      WHERE import_key IS NOT NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_class_course_subjects_course_id
      ON class_course_subjects(course_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_class_sessions_course_date
      ON class_sessions(course_id, class_date)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_class_sessions_teacher_date
      ON class_sessions(teacher_user_id, class_date)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_class_sessions_cover_teacher_date
      ON class_sessions(cover_teacher_user_id, class_date)
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION set_timestamp_updated_at()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trg_class_courses_updated_at ON class_courses;
      CREATE TRIGGER trg_class_courses_updated_at
      BEFORE UPDATE ON class_courses
      FOR EACH ROW
      EXECUTE FUNCTION set_timestamp_updated_at();

      DROP TRIGGER IF EXISTS trg_class_course_subjects_updated_at ON class_course_subjects;
      CREATE TRIGGER trg_class_course_subjects_updated_at
      BEFORE UPDATE ON class_course_subjects
      FOR EACH ROW
      EXECUTE FUNCTION set_timestamp_updated_at();

      DROP TRIGGER IF EXISTS trg_class_sessions_updated_at ON class_sessions;
      CREATE TRIGGER trg_class_sessions_updated_at
      BEFORE UPDATE ON class_sessions
      FOR EACH ROW
      EXECUTE FUNCTION set_timestamp_updated_at();
    `);

    await client.query('COMMIT');
    console.log('DB_OK: class planning tables ready');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

module.exports = { run };

if (require.main === module) {
  run().catch((error) => {
    console.error('DB_ERR:', error.message);
    process.exit(1);
  });
}
