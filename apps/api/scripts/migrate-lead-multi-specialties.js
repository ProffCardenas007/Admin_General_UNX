require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS specialties lead_specialty[]
    `);

    await client.query(`
      UPDATE users
      SET specialties = ARRAY[specialty]::lead_specialty[]
      WHERE specialty IS NOT NULL
        AND (specialties IS NULL OR array_length(specialties, 1) IS NULL)
    `);

    await client.query(`
      UPDATE users
      SET specialties = ARRAY(SELECT DISTINCT s FROM unnest(specialties) AS s)
      WHERE specialties IS NOT NULL
    `);

    await client.query('COMMIT');
    console.log('DB_OK: users.specialties ready and backfilled');
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
