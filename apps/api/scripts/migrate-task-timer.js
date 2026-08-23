require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query(
      "CREATE TYPE task_activity_type AS ENUM ('revision','edicion','creacion','presentaciones','grabacion','plataforma','administrativo')",
    );
  } catch (error) {
    if (!error || error.code !== '42710') {
      throw error;
    }
  }

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'task_activity_type'
          AND e.enumlabel = 'administrativo'
      ) THEN
        ALTER TYPE task_activity_type ADD VALUE 'administrativo';
      END IF;
    END
    $$;
  `);

  await client.query(`
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
  `);

  await client.query(
    'ALTER TABLE IF EXISTS tasks ADD COLUMN IF NOT EXISTS active_seconds integer NOT NULL DEFAULT 0',
  );
  await client.query(
    'ALTER TABLE IF EXISTS tasks ADD COLUMN IF NOT EXISTS timer_started_at timestamptz NULL',
  );

  await client.end();
  console.log('DB_OK: tasks timer fields ready');
}

module.exports = { run };

if (require.main === module) {
  run().catch((error) => {
    console.error('DB_ERR:', error.message);
    process.exit(1);
  });
}
