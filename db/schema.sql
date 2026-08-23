-- Project management + class planning system schema
-- PostgreSQL 14+
--
-- This file is a reference snapshot for bootstrapping a fresh database.
-- The actual source of truth applied on every deploy is the idempotent
-- script chain in apps/api/scripts/migrate-*.js (see "start:prod" in
-- apps/api/package.json). Keep this file in sync whenever a migrate-*.js
-- script changes the schema.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('manager', 'lead', 'worker');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_specialty') THEN
        CREATE TYPE lead_specialty AS ENUM (
            'paa',
            'exani_ii',
            'piense',
            'unam',
            'modulos'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_scope') THEN
        CREATE TYPE project_scope AS ENUM (
            'paa',
            'exani_ii',
            'piense',
            'unam',
            'modulos'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_status') THEN
        CREATE TYPE project_status AS ENUM ('planned', 'active', 'on_hold', 'done', 'cancelled');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
        CREATE TYPE task_status AS ENUM ('todo', 'doing', 'blocked', 'done');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_priority') THEN
        CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_activity_type') THEN
        CREATE TYPE task_activity_type AS ENUM ('revision', 'edicion', 'creacion', 'presentaciones', 'grabacion', 'plataforma', 'administrativo');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'import_status') THEN
        CREATE TYPE import_status AS ENUM ('pending', 'processing', 'completed', 'failed');
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(180) NOT NULL UNIQUE,
    role user_role NOT NULL,
    specialty lead_specialty,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS users
    ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE IF EXISTS users
    ADD COLUMN IF NOT EXISTS specialty lead_specialty;

CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(120) NOT NULL UNIQUE,
    lead_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(40) NOT NULL,
    name VARCHAR(160) NOT NULL,
    client_name VARCHAR(160),
    owner_team_id UUID REFERENCES teams(id),
    created_by UUID REFERENCES users(id),
    scope project_scope,
    status project_status NOT NULL DEFAULT 'planned',
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS projects
    ADD COLUMN IF NOT EXISTS scope project_scope;
ALTER TABLE IF EXISTS projects
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'projects_code_key'
          AND conrelid = 'projects'::regclass
    ) THEN
        ALTER TABLE projects DROP CONSTRAINT projects_code_key;
    END IF;

    ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_name_key;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS projects_name_scope_key
    ON projects (LOWER(TRIM(name)), scope)
    WHERE scope IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS projects_name_without_scope_key
    ON projects (LOWER(TRIM(name)))
    WHERE scope IS NULL;

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chain_id UUID,
    chain_order INT,
    code VARCHAR(60) NOT NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    activity_type task_activity_type NOT NULL DEFAULT 'creacion',
    title VARCHAR(220) NOT NULL,
    description TEXT,
    assignee_id UUID REFERENCES users(id),
    created_by UUID REFERENCES users(id),
    status task_status NOT NULL DEFAULT 'todo',
    priority task_priority NOT NULL DEFAULT 'medium',
    due_date DATE,
    activated_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    estimated_hours NUMERIC(8, 2) DEFAULT 0 CHECK (estimated_hours >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, code)
);

ALTER TABLE IF EXISTS tasks
    ADD COLUMN IF NOT EXISTS activity_type task_activity_type NOT NULL DEFAULT 'creacion';
ALTER TABLE IF EXISTS tasks
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE IF EXISTS tasks
    ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS tasks
    ADD COLUMN IF NOT EXISTS chain_id UUID;
ALTER TABLE IF EXISTS tasks
    ADD COLUMN IF NOT EXISTS chain_order INT;
ALTER TABLE IF EXISTS tasks
    ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS tasks
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS task_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    update_date DATE NOT NULL,
    worked_hours NUMERIC(8, 2) NOT NULL CHECK (worked_hours >= 0),
    progress_percent NUMERIC(5, 2) NOT NULL CHECK (progress_percent >= 0 AND progress_percent <= 100),
    blocker_reason TEXT,
    comments TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (task_id, user_id, update_date)
);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    title VARCHAR(160) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_role user_role NOT NULL,
    actor_email VARCHAR(180),
    entity_type VARCHAR(40) NOT NULL,
    entity_id UUID NOT NULL,
    entity_label VARCHAR(220),
    action VARCHAR(80) NOT NULL,
    changes_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS excel_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    file_name VARCHAR(255) NOT NULL,
    status import_status NOT NULL DEFAULT 'pending',
    total_rows INT NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
    success_rows INT NOT NULL DEFAULT 0 CHECK (success_rows >= 0),
    failed_rows INT NOT NULL DEFAULT 0 CHECK (failed_rows >= 0),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS excel_import_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_id UUID NOT NULL REFERENCES excel_imports(id) ON DELETE CASCADE,
    row_number INT NOT NULL CHECK (row_number > 0),
    column_name VARCHAR(80) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kpi_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    completion_rate NUMERIC(5, 2) NOT NULL CHECK (completion_rate >= 0 AND completion_rate <= 100),
    delay_risk NUMERIC(5, 2) NOT NULL CHECK (delay_risk >= 0 AND delay_risk <= 100),
    team_load_index NUMERIC(6, 2) NOT NULL CHECK (team_load_index >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_chain_order ON tasks(chain_id, chain_order);
CREATE INDEX IF NOT EXISTS idx_task_updates_task_date ON task_updates(task_id, update_date DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_excel_imports_user_date ON excel_imports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_project_date ON kpi_snapshots(project_id, snapshot_date DESC);

-- Task timer support (paused status + active/paused time tracking)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'task_status'
          AND e.enumlabel = 'paused'
    ) THEN
        ALTER TYPE task_status ADD VALUE 'paused';
    END IF;
END
$$;

ALTER TABLE IF EXISTS tasks
    ADD COLUMN IF NOT EXISTS active_seconds INT NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS tasks
    ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMPTZ;

-- Lead multi-specialty support
ALTER TABLE IF EXISTS users
    ADD COLUMN IF NOT EXISTS specialties lead_specialty[];

-- Subjects a user (teacher) is qualified to teach
ALTER TABLE IF EXISTS users
    ADD COLUMN IF NOT EXISTS class_subjects VARCHAR(60)[];

-- Class planning: courses, subjects and concrete sessions
CREATE TABLE IF NOT EXISTS class_courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(40) NOT NULL,
    section_code VARCHAR(20),
    name VARCHAR(160) NOT NULL,
    modality VARCHAR(20) NOT NULL DEFAULT 'presencial',
    classroom VARCHAR(40) NOT NULL DEFAULT 'Aula 1',
    schedule_start_time TIME NOT NULL DEFAULT '08:00',
    schedule_end_time TIME NOT NULL DEFAULT '10:30',
    term_start_date DATE,
    term_end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_class_courses_name_section_code UNIQUE (name, section_code)
);

CREATE TABLE IF NOT EXISTS class_course_subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES class_courses(id) ON DELETE CASCADE,
    name VARCHAR(140) NOT NULL,
    teacher_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    display_order INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_class_course_subject_name UNIQUE (course_id, name)
);

CREATE TABLE IF NOT EXISTS class_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES class_courses(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES class_course_subjects(id) ON DELETE CASCADE,
    teacher_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    cover_teacher_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    class_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    classroom VARCHAR(40) NOT NULL DEFAULT 'Aula 1',
    notes VARCHAR(260),
    coverage_note VARCHAR(260),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_class_sessions_time_range CHECK (start_time < end_time)
);

CREATE INDEX IF NOT EXISTS idx_class_course_subjects_course_id ON class_course_subjects(course_id);
CREATE INDEX IF NOT EXISTS idx_class_sessions_course_date ON class_sessions(course_id, class_date);
CREATE INDEX IF NOT EXISTS idx_class_sessions_teacher_date ON class_sessions(teacher_user_id, class_date);
CREATE INDEX IF NOT EXISTS idx_class_sessions_cover_teacher_date ON class_sessions(cover_teacher_user_id, class_date);

CREATE OR REPLACE FUNCTION set_timestamp_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

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

-- Teacher weekly availability + incidences (used by class planning conflict checks)
CREATE TABLE IF NOT EXISTS class_schedule_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    availability JSONB NOT NULL DEFAULT '{}'::jsonb,
    incidences JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_class_schedule_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_class_schedule_profiles_updated_at ON class_schedule_profiles;
CREATE TRIGGER trg_class_schedule_profiles_updated_at
    BEFORE UPDATE ON class_schedule_profiles
    FOR EACH ROW
    EXECUTE FUNCTION set_class_schedule_profiles_updated_at();

CREATE OR REPLACE VIEW v_project_progress AS
SELECT
    p.id AS project_id,
    p.code AS project_code,
    p.name AS project_name,
    COUNT(t.id) AS total_tasks,
    COUNT(t.id) FILTER (WHERE t.status = 'done') AS done_tasks,
    CASE
        WHEN COUNT(t.id) = 0 THEN 0
        ELSE ROUND((COUNT(t.id) FILTER (WHERE t.status = 'done')::NUMERIC / COUNT(t.id)::NUMERIC) * 100, 2)
    END AS completion_rate,
    COUNT(t.id) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status <> 'done') AS overdue_tasks
FROM projects p
LEFT JOIN tasks t ON t.project_id = p.id
GROUP BY p.id, p.code, p.name;

COMMIT;
