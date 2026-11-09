require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS work_plans (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(160) NOT NULL,
      description TEXT,
      owner_id UUID NOT NULL REFERENCES users(id),
      project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(
    'CREATE INDEX IF NOT EXISTS idx_work_plans_owner ON work_plans(owner_id)',
  );

  await client.query(`
    CREATE TABLE IF NOT EXISTS work_plan_columns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_id UUID NOT NULL REFERENCES work_plans(id) ON DELETE CASCADE,
      label VARCHAR(120) NOT NULL,
      position INT NOT NULL DEFAULT 0
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS work_plan_sections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_id UUID NOT NULL REFERENCES work_plans(id) ON DELETE CASCADE,
      title VARCHAR(160) NOT NULL,
      spans_all BOOLEAN NOT NULL DEFAULT FALSE,
      position INT NOT NULL DEFAULT 0
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS work_plan_rows (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      section_id UUID NOT NULL REFERENCES work_plan_sections(id) ON DELETE CASCADE,
      label VARCHAR(160) NOT NULL,
      position INT NOT NULL DEFAULT 0
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS work_plan_cells (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      row_id UUID NOT NULL REFERENCES work_plan_rows(id) ON DELETE CASCADE,
      column_id UUID REFERENCES work_plan_columns(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'unassigned',
      start_date DATE,
      end_date DATE,
      suggested_assignee VARCHAR(120),
      note TEXT,
      task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_work_plan_cell ON work_plan_cells(row_id, COALESCE(column_id, '00000000-0000-0000-0000-000000000000'::uuid))",
  );
  await client.query(
    'ALTER TABLE work_plan_cells ADD COLUMN IF NOT EXISTS column_span INT NOT NULL DEFAULT 1',
  );
  await client.query(
    'ALTER TABLE work_plans ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL',
  );

  await client.end();
  console.log('DB_OK: work plans ready');
}

module.exports = { run };

if (require.main === module) {
  run().catch((error) => {
    console.error('DB_ERR:', error.message);
    process.exit(1);
  });
}
