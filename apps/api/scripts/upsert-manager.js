#!/usr/bin/env node

require('dotenv').config();
const { Client } = require('pg');
const { hash } = require('bcryptjs');

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.PGHOST;
  const port = process.env.PGPORT;
  const database = process.env.PGDATABASE;
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;

  if (host && port && database && user && password) {
    return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}?sslmode=require`;
  }

  return '';
}

async function main() {
  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) {
    throw new Error('Missing database configuration. Set DATABASE_URL or PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD.');
  }

  const email = (process.env.MANAGER_EMAIL || 'gerente@unx.mx').trim().toLowerCase();
  const fullName = (process.env.MANAGER_NAME || 'Gerente').trim();
  const plainPassword = (process.env.MANAGER_PASSWORD || '123456').trim();

  if (!email) {
    throw new Error('MANAGER_EMAIL is required.');
  }
  if (plainPassword.length < 6) {
    throw new Error('MANAGER_PASSWORD must have at least 6 characters.');
  }

  const passwordHash = await hash(plainPassword, 10);
  const requiresSsl =
    /sslmode=require/i.test(databaseUrl) ||
    String(process.env.PGSSLMODE || '').toLowerCase() === 'require';

  const client = new Client({
    connectionString: databaseUrl,
    ssl: requiresSsl ? { rejectUnauthorized: false } : false,
  });

  await client.connect();
  try {
    const result = await client.query(
      `
      INSERT INTO users (full_name, email, password_hash, role, specialty, is_active)
      VALUES ($1, $2, $3, 'manager', NULL, true)
      ON CONFLICT (email)
      DO UPDATE
      SET
        full_name = EXCLUDED.full_name,
        password_hash = EXCLUDED.password_hash,
        role = 'manager',
        specialty = NULL,
        is_active = true,
        updated_at = NOW()
      RETURNING id, full_name, email, role, is_active;
      `,
      [fullName, email, passwordHash],
    );

    const user = result.rows[0];
    console.log('Manager upsert completed successfully.');
    console.log(`id=${user.id}`);
    console.log(`email=${user.email}`);
    console.log(`role=${user.role}`);
    console.log(`is_active=${user.is_active}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Failed to upsert manager user.');
  console.error(error.message || error);
  process.exit(1);
});
