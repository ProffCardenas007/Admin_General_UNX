require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(
    'ALTER TABLE IF EXISTS tasks ADD COLUMN IF NOT EXISTS authorized_extra_hours numeric(8, 2) NOT NULL DEFAULT 0',
  );

  await client.query(`
    CREATE TABLE IF NOT EXISTS time_extension_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      requested_by UUID NOT NULL REFERENCES users(id),
      requested_hours NUMERIC(8, 2) NOT NULL CHECK (requested_hours > 0),
      reason TEXT NOT NULL,
      source VARCHAR(10) NOT NULL DEFAULT 'manual',
      status VARCHAR(10) NOT NULL DEFAULT 'pending',
      approved_hours NUMERIC(8, 2),
      decided_by UUID REFERENCES users(id),
      decided_at TIMESTAMPTZ,
      decision_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_time_extension_one_pending ON time_extension_requests(task_id) WHERE status = 'pending'",
  );
  await client.query(
    'CREATE INDEX IF NOT EXISTS idx_time_extension_status_created ON time_extension_requests(status, created_at DESC)',
  );

  await client.query(
    'ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS type VARCHAR(40) NULL',
  );
  await client.query(
    'ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS request_id UUID NULL REFERENCES time_extension_requests(id) ON DELETE SET NULL',
  );

  await client.end();
  console.log('DB_OK: time extension requests ready');
}

module.exports = { run };

if (require.main === module) {
  run().catch((error) => {
    console.error('DB_ERR:', error.message);
    process.exit(1);
  });
}
