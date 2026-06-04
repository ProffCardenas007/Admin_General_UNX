-- Project management system (MVP) schema
-- PostgreSQL 14+

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('manager', 'lead', 'worker');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_specialty') THEN
        CREATE TYPE lead_specialty AS ENUM ('EXANI-II');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_scope') THEN
        CREATE TYPE project_scope AS ENUM ('EXANI-II');
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
        CREATE TYPE task_activity_type AS ENUM ('revision', 'edicion', 'creacion', 'presentaciones', 'grabacion', 'plataforma');
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
    code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(160) NOT NULL,
    client_name VARCHAR(160),
    owner_team_id UUID REFERENCES teams(id),
    scope project_scope,
    status project_status NOT NULL DEFAULT 'planned',
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS projects
    ADD COLUMN IF NOT EXISTS scope project_scope;

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(60) NOT NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    activity_type task_activity_type NOT NULL DEFAULT 'creacion',
    title VARCHAR(220) NOT NULL,
    description TEXT,
    assignee_id UUID REFERENCES users(id),
    status task_status NOT NULL DEFAULT 'todo',
    priority task_priority NOT NULL DEFAULT 'medium',
    due_date DATE,
    estimated_hours NUMERIC(8, 2) DEFAULT 0 CHECK (estimated_hours >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, code)
);

ALTER TABLE IF EXISTS tasks
    ADD COLUMN IF NOT EXISTS activity_type task_activity_type NOT NULL DEFAULT 'creacion';

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
CREATE INDEX IF NOT EXISTS idx_task_updates_task_date ON task_updates(task_id, update_date DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_excel_imports_user_date ON excel_imports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_project_date ON kpi_snapshots(project_id, snapshot_date DESC);

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

