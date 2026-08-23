require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    const duplicates = await client.query(`
      SELECT
        LOWER(TRIM(name)) AS normalized_name,
        scope::text AS specialty,
        COUNT(*)::int AS total
      FROM projects
      GROUP BY LOWER(TRIM(name)), scope
      HAVING COUNT(*) > 1
      ORDER BY total DESC, normalized_name ASC, specialty ASC
      LIMIT 10
    `);

    if (duplicates.rows.length > 0) {
      const examples = duplicates.rows
        .map(
          (row) =>
            `${row.normalized_name} / ${row.specialty ?? 'sin especialidad'} (${row.total})`,
        )
        .join(', ');

      throw new Error(
        `Cannot add unique project name/specialty index. Duplicates found: ${examples}`,
      );
    }

    await client.query('ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_code_key');
    await client.query('ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_name_key');
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS projects_name_scope_key
      ON projects (LOWER(TRIM(name)), scope)
      WHERE scope IS NOT NULL
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS projects_name_without_scope_key
      ON projects (LOWER(TRIM(name)))
      WHERE scope IS NULL
    `);

    await client.query('COMMIT');
    console.log('DB_OK: project uniqueness scoped by specialty (code can repeat)');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

module.exports = { run };

if (require.main === module) {
  run().catch((error) => {
    console.error('DB_ERR:', error.message);
    process.exit(1);
  });
}
