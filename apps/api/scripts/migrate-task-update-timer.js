require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(
    'ALTER TABLE IF EXISTS task_updates ADD COLUMN IF NOT EXISTS timer_seconds integer NOT NULL DEFAULT 0',
  );

  await client.end();
  console.log('DB_OK: task_updates timer_seconds ready');
}

module.exports = { run };

if (require.main === module) {
  run().catch((error) => {
    console.error('DB_ERR:', error.message);
    process.exit(1);
  });
}
