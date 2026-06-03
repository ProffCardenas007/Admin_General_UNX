-- Migración: consolidar especialidades a PAA, EXANI-II, PIENSE, UNAM, Módulos
-- Ejecutar conectado a la BD del proyecto

BEGIN;

-- 1. Agregar nuevos valores a los ENUMs existentes
ALTER TYPE lead_specialty ADD VALUE IF NOT EXISTS 'paa';
ALTER TYPE lead_specialty ADD VALUE IF NOT EXISTS 'exani_ii';
ALTER TYPE lead_specialty ADD VALUE IF NOT EXISTS 'piense';
ALTER TYPE lead_specialty ADD VALUE IF NOT EXISTS 'unam';
ALTER TYPE lead_specialty ADD VALUE IF NOT EXISTS 'modulos';

ALTER TYPE project_scope ADD VALUE IF NOT EXISTS 'paa';
ALTER TYPE project_scope ADD VALUE IF NOT EXISTS 'exani_ii';
ALTER TYPE project_scope ADD VALUE IF NOT EXISTS 'piense';
ALTER TYPE project_scope ADD VALUE IF NOT EXISTS 'unam';
ALTER TYPE project_scope ADD VALUE IF NOT EXISTS 'modulos';

COMMIT;

-- 2. Migrar datos existentes (fuera de transacción por limitación de PostgreSQL con ENUMs)
UPDATE users SET specialty = 'paa'      WHERE specialty IN ('paa_mate', 'paa_espanol');
UPDATE users SET specialty = 'exani_ii' WHERE specialty IN ('exani_ii_mate', 'exani_ii_espanol');
UPDATE users SET specialty = 'unam'     WHERE specialty IN ('unam_mate', 'unam_espanol');
UPDATE users SET specialty = 'modulos'  WHERE specialty = 'modulos_especificos';

UPDATE projects SET scope = 'paa'      WHERE scope IN ('paa_mate', 'paa_espanol');
UPDATE projects SET scope = 'exani_ii' WHERE scope IN ('exani_ii_mate', 'exani_ii_espanol');
UPDATE projects SET scope = 'unam'     WHERE scope IN ('unam_mate', 'unam_espanol');
UPDATE projects SET scope = 'modulos'  WHERE scope = 'modulos_especificos';

-- 3. Reemplazar ENUMs con los nuevos valores solamente
--    PostgreSQL no permite DROP VALUE directamente; se recrea el tipo.

BEGIN;

-- lead_specialty
ALTER TABLE users ALTER COLUMN specialty DROP DEFAULT;
ALTER TABLE users
  ALTER COLUMN specialty TYPE VARCHAR(50);

DROP TYPE lead_specialty;
CREATE TYPE lead_specialty AS ENUM ('paa', 'exani_ii', 'piense', 'unam', 'modulos');

ALTER TABLE users
  ALTER COLUMN specialty TYPE lead_specialty USING specialty::lead_specialty;

-- project_scope
ALTER TABLE projects
  ALTER COLUMN scope TYPE VARCHAR(50);

DROP TYPE project_scope;
CREATE TYPE project_scope AS ENUM ('paa', 'exani_ii', 'piense', 'unam', 'modulos');

ALTER TABLE projects
  ALTER COLUMN scope TYPE project_scope USING scope::project_scope;

COMMIT;
