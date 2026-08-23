require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    await client.query(`
      CREATE TABLE IF NOT EXISTS class_schedule_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        availability JSONB NOT NULL DEFAULT '{}'::jsonb,
        incidences JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION set_class_schedule_profiles_updated_at()
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
      DROP TRIGGER IF EXISTS trg_class_schedule_profiles_updated_at
      ON class_schedule_profiles
    `);

    await client.query(`
      CREATE TRIGGER trg_class_schedule_profiles_updated_at
      BEFORE UPDATE ON class_schedule_profiles
      FOR EACH ROW
      EXECUTE FUNCTION set_class_schedule_profiles_updated_at()
    `);

    await client.query('COMMIT');
    console.log('DB_OK: class_schedule_profiles ready');
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
