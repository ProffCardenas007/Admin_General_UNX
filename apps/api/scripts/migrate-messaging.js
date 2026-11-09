require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS message_conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_one_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_two_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        last_message_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_message_conversation_distinct_users CHECK (user_one_id <> user_two_id),
        CONSTRAINT uq_message_conversations_direct_pair UNIQUE (user_one_id, user_two_id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS message_conversation_participants (
        conversation_id UUID NOT NULL REFERENCES message_conversations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        last_read_at TIMESTAMPTZ,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (conversation_id, user_id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_message_conversations_user_one
      ON message_conversations(user_one_id, last_message_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_message_conversations_user_two
      ON message_conversations(user_two_id, last_message_at DESC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES message_conversations(id) ON DELETE CASCADE,
        sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
        project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
      ON messages(conversation_id, created_at DESC)
    `);
    await client.query(`
      ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS conversation_id UUID
    `);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_notifications_conversation'
            AND conrelid = 'notifications'::regclass
        ) THEN
          ALTER TABLE notifications
          ADD CONSTRAINT fk_notifications_conversation
          FOREIGN KEY (conversation_id)
          REFERENCES message_conversations(id) ON DELETE SET NULL;
        END IF;
      END
      $$
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }

  console.log('DB_OK: messaging tables ready');
}

module.exports = { run };

if (require.main === module) {
  run().catch((error) => {
    console.error('DB_ERR:', error.message);
    process.exit(1);
  });
}
