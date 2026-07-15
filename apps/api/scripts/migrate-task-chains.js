require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS chain_id UUID,
      ADD COLUMN IF NOT EXISTS chain_order INT,
      ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_chain_order
      ON tasks(chain_id, chain_order)
    `);

    await client.query('COMMIT');
    console.log('DB_OK: task chain columns created');
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
