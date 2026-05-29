require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_specialty') THEN
        CREATE TYPE lead_specialty AS ENUM (
          'paa_mate',
          'paa_espanol',
          'exani_ii_mate',
          'exani_ii_espanol',
          'modulos_especificos',
          'unam_mate',
          'unam_espanol'
        );
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_scope') THEN
        CREATE TYPE project_scope AS ENUM (
          'paa_mate',
          'paa_espanol',
          'exani_ii_mate',
          'exani_ii_espanol',
          'modulos_especificos',
          'unam_mate',
          'unam_espanol'
        );
      END IF;
    END
    $$;
  `);

  await client.query('ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS specialty lead_specialty');
  await client.query('ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS scope project_scope');

  await client.end();
  console.log('DB_OK: specialties columns ready');
}

run().catch((error) => {
  console.error('DB_ERR:', error.message);
  process.exit(1);
});
