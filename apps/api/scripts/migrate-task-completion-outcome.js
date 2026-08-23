require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(
    'ALTER TABLE IF EXISTS tasks ADD COLUMN IF NOT EXISTS completion_outcome varchar(20) NULL',
  );
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'tasks'
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tasks_completion_outcome_check'
          AND conrelid = 'tasks'::regclass
      ) THEN
        ALTER TABLE tasks
          ADD CONSTRAINT tasks_completion_outcome_check
          CHECK (completion_outcome IS NULL OR completion_outcome IN ('completed', 'not_completed'));
      END IF;
    END
    $$;
  `);

  await client.end();
  console.log('DB_OK: tasks.completion_outcome ready');
}

module.exports = { run };

if (require.main === module) {
  run().catch((error) => {
    console.error('DB_ERR:', error.message);
    process.exit(1);
  });
}