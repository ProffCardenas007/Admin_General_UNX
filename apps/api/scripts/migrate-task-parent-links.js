require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL
    `);

    // Backfill links for already-generated consequent tasks using the parent's continuity update.
    await client.query(`
      WITH derived_links AS (
        SELECT DISTINCT
          parent_task.id AS parent_task_id,
          child_task.id AS child_task_id
        FROM task_updates update_log
        INNER JOIN tasks parent_task
          ON parent_task.id = update_log.task_id
        INNER JOIN tasks child_task
          ON child_task.project_id = parent_task.project_id
         AND update_log.comments ILIKE '%' || child_task.code || '%'
        WHERE child_task.parent_task_id IS NULL
          AND update_log.comments ILIKE 'Tarea finalizada y derivada a %'
      )
      UPDATE tasks child_task
      SET parent_task_id = derived_links.parent_task_id
      FROM derived_links
      WHERE child_task.id = derived_links.child_task_id
        AND child_task.parent_task_id IS NULL
    `);

    // Collapse chains so every consequent points to the original task, not to another consequent.
    await client.query(`
      WITH RECURSIVE ancestry AS (
        SELECT
          task.id AS task_id,
          task.parent_task_id,
          task.parent_task_id AS root_parent_id,
          1 AS depth
        FROM tasks task
        WHERE task.parent_task_id IS NOT NULL

        UNION ALL

        SELECT
          ancestry.task_id,
          parent_task.parent_task_id,
          parent_task.parent_task_id AS root_parent_id,
          ancestry.depth + 1 AS depth
        FROM ancestry
        INNER JOIN tasks parent_task
          ON parent_task.id = ancestry.parent_task_id
        WHERE ancestry.parent_task_id IS NOT NULL
          AND parent_task.parent_task_id IS NOT NULL
      ),
      deepest_root AS (
        SELECT DISTINCT ON (task_id)
          task_id,
          COALESCE(root_parent_id, parent_task_id) AS final_root_id
        FROM ancestry
        ORDER BY task_id, depth DESC
      )
      UPDATE tasks child_task
      SET parent_task_id = deepest_root.final_root_id
      FROM deepest_root
      WHERE child_task.id = deepest_root.task_id
        AND child_task.parent_task_id IS DISTINCT FROM deepest_root.final_root_id
    `);

    await client.query('COMMIT');
    console.log('DB_OK: parent_task_id migrated, backfilled and collapsed to root task');
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
