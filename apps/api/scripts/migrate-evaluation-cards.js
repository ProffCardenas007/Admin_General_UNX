require('dotenv').config();
const { Client } = require('pg');

// Encuestas 360 y comentarios de dirección para las tarjetas de evaluación.
// Las respuestas NO guardan quién evaluó: el anonimato queda en la base de datos,
// no solo en la pantalla.
async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS survey_responses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      year INT NOT NULL CHECK (year >= 2000 AND year <= 2100),
      semester SMALLINT NOT NULL CHECK (semester IN (1, 2)),
      survey_type VARCHAR(20) NOT NULL CHECK (survey_type IN ('lider', 'profesor')),
      subject_key VARCHAR(160) NOT NULL,
      subject_name VARCHAR(160) NOT NULL,
      subject_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      scores JSONB NOT NULL DEFAULT '{}'::jsonb,
      strengths TEXT,
      improvements TEXT,
      comments TEXT,
      hidden_fields VARCHAR(20)[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_survey_responses_period
      ON survey_responses (year, semester, survey_type)
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS evaluation_card_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      year INT NOT NULL CHECK (year >= 2000 AND year <= 2100),
      semester SMALLINT NOT NULL CHECK (semester IN (1, 2)),
      subject_key VARCHAR(160) NOT NULL,
      subject_name VARCHAR(160) NOT NULL,
      subject_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      comments TEXT NOT NULL DEFAULT '',
      updated_by UUID NOT NULL REFERENCES users(id),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_evaluation_card_note UNIQUE (year, semester, subject_key)
    )
  `);

  await client.end();
  console.log('DB_OK: evaluation cards ready');
}

module.exports = { run };

if (require.main === module) {
  run().catch((error) => {
    console.error('DB_ERR:', error.message);
    process.exit(1);
  });
}
