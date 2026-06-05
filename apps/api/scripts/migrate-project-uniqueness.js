require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    const duplicates = await client.query(`
      SELECT LOWER(TRIM(name)) AS normalized_name, COUNT(*)::int AS total
      FROM projects
      GROUP BY LOWER(TRIM(name))
      HAVING COUNT(*) > 1
      ORDER BY total DESC, normalized_name ASC
      LIMIT 10
    `);

    if (duplicates.rows.length > 0) {
      const examples = duplicates.rows
        .map((row) => `${row.normalized_name} (${row.total})`)
        .join(', ');

      throw new Error(
        `Cannot add unique constraint on project name. Duplicate names found: ${examples}`,
      );
    }

    await client.query('ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_code_key');
    await client.query('ALTER TABLE projects ADD CONSTRAINT projects_name_key UNIQUE (name)');

    await client.query('COMMIT');
    console.log('DB_OK: project uniqueness migrated to name (code can repeat)');
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
