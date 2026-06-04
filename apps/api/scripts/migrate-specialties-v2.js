require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    await client.query("ALTER TYPE lead_specialty ADD VALUE IF NOT EXISTS 'paa'");
    await client.query("ALTER TYPE lead_specialty ADD VALUE IF NOT EXISTS 'exani_ii'");
    await client.query("ALTER TYPE lead_specialty ADD VALUE IF NOT EXISTS 'piense'");
    await client.query("ALTER TYPE lead_specialty ADD VALUE IF NOT EXISTS 'unam'");
    await client.query("ALTER TYPE lead_specialty ADD VALUE IF NOT EXISTS 'modulos'");

    await client.query("ALTER TYPE project_scope ADD VALUE IF NOT EXISTS 'paa'");
    await client.query("ALTER TYPE project_scope ADD VALUE IF NOT EXISTS 'exani_ii'");
    await client.query("ALTER TYPE project_scope ADD VALUE IF NOT EXISTS 'piense'");
    await client.query("ALTER TYPE project_scope ADD VALUE IF NOT EXISTS 'unam'");
    await client.query("ALTER TYPE project_scope ADD VALUE IF NOT EXISTS 'modulos'");

    await client.query('COMMIT');

    // Match by text to support multiple legacy enum labels without casting errors.
    await client.query("UPDATE users SET specialty = 'paa' WHERE specialty::text LIKE 'paa%'");
    await client.query("UPDATE users SET specialty = 'exani_ii' WHERE specialty::text LIKE 'exani%'");
    await client.query("UPDATE users SET specialty = 'unam' WHERE specialty::text LIKE 'unam%'");
    await client.query("UPDATE users SET specialty = 'modulos' WHERE specialty::text LIKE 'modulos%'");

    await client.query("UPDATE projects SET scope = 'paa' WHERE scope::text LIKE 'paa%'");
    await client.query("UPDATE projects SET scope = 'exani_ii' WHERE scope::text LIKE 'exani%'");
    await client.query("UPDATE projects SET scope = 'unam' WHERE scope::text LIKE 'unam%'");
    await client.query("UPDATE projects SET scope = 'modulos' WHERE scope::text LIKE 'modulos%'");

    await client.query('BEGIN');

    await client.query('ALTER TABLE users ALTER COLUMN specialty DROP DEFAULT');
    await client.query('ALTER TABLE users ALTER COLUMN specialty TYPE VARCHAR(50)');
    await client.query('DROP TYPE lead_specialty');
    await client.query("CREATE TYPE lead_specialty AS ENUM ('paa', 'exani_ii', 'piense', 'unam', 'modulos')");
    await client.query('ALTER TABLE users ALTER COLUMN specialty TYPE lead_specialty USING specialty::lead_specialty');

    await client.query('ALTER TABLE projects ALTER COLUMN scope TYPE VARCHAR(50)');
    await client.query('DROP TYPE project_scope');
    await client.query("CREATE TYPE project_scope AS ENUM ('paa', 'exani_ii', 'piense', 'unam', 'modulos')");
    await client.query('ALTER TABLE projects ALTER COLUMN scope TYPE project_scope USING scope::project_scope');

    await client.query('COMMIT');
    console.log('DB_OK: specialties migrated to v2 values');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('DB_ERR:', error.message);
  process.exit(1);
});
