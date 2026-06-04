-- Migration: Update lead_specialty enum to only EXANI-II
-- This migration consolidates all specialty values to a single EXANI-II value

BEGIN;

-- Create new enum type with only EXANI-II
CREATE TYPE lead_specialty_new AS ENUM ('EXANI-II');

-- Update the column type
ALTER TABLE users 
  ALTER COLUMN specialty TYPE lead_specialty_new 
  USING 'EXANI-II'::lead_specialty_new;

-- Drop old enum
DROP TYPE lead_specialty;

-- Rename new enum to original name
ALTER TYPE lead_specialty_new RENAME TO lead_specialty;

-- Update project_scope enum as well (if it has the same values)
CREATE TYPE project_scope_new AS ENUM ('EXANI-II');

ALTER TABLE projects 
  ALTER COLUMN scope TYPE project_scope_new 
  USING 'EXANI-II'::project_scope_new;

DROP TYPE project_scope;

ALTER TYPE project_scope_new RENAME TO project_scope;

COMMIT;

