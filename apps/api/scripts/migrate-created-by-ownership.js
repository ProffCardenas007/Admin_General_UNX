require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id)
    `);

    await client.query(`
      ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id)
    `);

    // Backfill owner for existing rows to avoid blocking owners of legacy data.
    await client.query(`
      UPDATE projects
      SET created_by = COALESCE(created_by, owner_team.lead_id)
      FROM teams AS owner_team
      WHERE projects.owner_team_id = owner_team.id
        AND projects.created_by IS NULL
    `);

    await client.query(`
      UPDATE tasks
      SET created_by = COALESCE(tasks.created_by, projects.created_by)
      FROM projects
      WHERE tasks.project_id = projects.id
        AND tasks.created_by IS NULL
    `);

    await client.query('COMMIT');
    console.log('DB_OK: created_by ownership columns migrated for projects/tasks');
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
