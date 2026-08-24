require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS specialties (
        code VARCHAR(60) PRIMARY KEY,
        name VARCHAR(120) NOT NULL UNIQUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      INSERT INTO specialties (code, name)
      VALUES
        ('paa', 'PAA'),
        ('exani_ii', 'EXANI-II'),
        ('piense', 'PIENSE'),
        ('unam', 'UNAM'),
        ('modulos', 'Módulos')
      ON CONFLICT (code) DO NOTHING
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS specialties VARCHAR(60)[] NULL
    `);
    await client.query(`
      ALTER TABLE users
      ALTER COLUMN specialty TYPE VARCHAR(60) USING specialty::text
    `);
    await client.query(`
      ALTER TABLE users
      ALTER COLUMN specialties TYPE VARCHAR(60)[] USING specialties::text::VARCHAR(60)[]
    `);
    await client.query(`
      ALTER TABLE projects
      ALTER COLUMN scope TYPE VARCHAR(60) USING scope::text
    `);

    await client.query(`
      INSERT INTO specialties (code, name)
      SELECT code, INITCAP(REPLACE(code, '_', ' '))
      FROM (
        SELECT specialty AS code FROM users WHERE specialty IS NOT NULL
        UNION
        SELECT UNNEST(specialties) AS code FROM users WHERE specialties IS NOT NULL
        UNION
        SELECT scope AS code FROM projects WHERE scope IS NOT NULL
      ) existing_specialties
      WHERE code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
      ON CONFLICT (code) DO NOTHING
    `);

    await client.query(`
      ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_specialty_fkey
    `);
    await client.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_specialty_fkey
      FOREIGN KEY (specialty) REFERENCES specialties(code)
    `);
    await client.query(`
      ALTER TABLE projects
      DROP CONSTRAINT IF EXISTS projects_scope_fkey
    `);
    await client.query(`
      ALTER TABLE projects
      ADD CONSTRAINT projects_scope_fkey
      FOREIGN KEY (scope) REFERENCES specialties(code)
    `);

    await client.query('COMMIT');
    console.log('DB_OK: dynamic specialties catalog ready');
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