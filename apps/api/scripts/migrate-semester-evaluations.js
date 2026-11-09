require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS task_evaluations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      grade NUMERIC(5,2) NOT NULL CHECK (grade >= 0 AND grade <= 100),
      comments TEXT,
      evaluated_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_task_evaluations_task UNIQUE (task_id)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS semester_activity_weights (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      year INT NOT NULL CHECK (year >= 2000 AND year <= 2100),
      semester SMALLINT NOT NULL CHECK (semester IN (1, 2)),
      activity_type VARCHAR(30) NOT NULL,
      weight NUMERIC(8,2) NOT NULL CHECK (weight >= 0 AND weight <= 100),
      updated_by UUID NOT NULL REFERENCES users(id),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_semester_activity_weight UNIQUE (year, semester, activity_type)
    )
  `);

  await client.end();
  console.log('DB_OK: semester evaluations ready');
}

module.exports = { run };

if (require.main === module) {
  run().catch((error) => {
    console.error('DB_ERR:', error.message);
    process.exit(1);
  });
}
