require('dotenv').config();
const { Client } = require('pg');

// Tareas que una persona registra por su cuenta: quedan pendientes hasta que
// gerencia las aprueba (y les asigna categoría) o las rechaza.
// approval_status NULL = tarea normal, no requiere aprobación.
async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(`
    ALTER TABLE IF EXISTS tasks
      ADD COLUMN IF NOT EXISTS approval_status varchar(20) NULL,
      ADD COLUMN IF NOT EXISTS approval_note text NULL,
      ADD COLUMN IF NOT EXISTS reviewed_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS reviewed_at timestamptz NULL
  `);
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'tasks'
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tasks_approval_status_check'
          AND conrelid = 'tasks'::regclass
      ) THEN
        ALTER TABLE tasks
          ADD CONSTRAINT tasks_approval_status_check
          CHECK (approval_status IS NULL OR approval_status IN ('pending', 'approved', 'rejected'));
      END IF;
    END
    $$;
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_tasks_approval_pending
      ON tasks (approval_status) WHERE approval_status = 'pending'
  `);

  await client.end();
  console.log('DB_OK: task approval ready');
}

module.exports = { run };

if (require.main === module) {
  run().catch((error) => {
    console.error('DB_ERR:', error.message);
    process.exit(1);
  });
}
