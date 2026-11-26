require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Grupos = columnas de la matriz (curso + sede). `counts` indica si sus
  // alumnos entran en la proyección de material.
  await client.query(`
    CREATE TABLE IF NOT EXISTS material_groups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      program VARCHAR(10) NOT NULL,
      course_key VARCHAR(40) NOT NULL,
      course_label VARCHAR(80) NOT NULL,
      venue VARCHAR(80),
      students INT NOT NULL DEFAULT 0,
      counts BOOLEAN NOT NULL DEFAULT TRUE,
      position INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(
    'CREATE INDEX IF NOT EXISTS idx_material_groups_program ON material_groups(program)',
  );

  await client.query(`
    CREATE TABLE IF NOT EXISTS material_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      program VARCHAR(10) NOT NULL,
      kind VARCHAR(120) NOT NULL,
      version VARCHAR(80),
      module VARCHAR(120),
      available INT,
      print_qty INT,
      notes TEXT,
      do_not_use BOOLEAN NOT NULL DEFAULT FALSE,
      reviewed BOOLEAN NOT NULL DEFAULT FALSE,
      position INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(
    'CREATE INDEX IF NOT EXISTS idx_material_items_program ON material_items(program, position)',
  );

  await client.query(`
    CREATE TABLE IF NOT EXISTS material_assignments (
      item_id UUID NOT NULL REFERENCES material_items(id) ON DELETE CASCADE,
      group_id UUID NOT NULL REFERENCES material_groups(id) ON DELETE CASCADE,
      PRIMARY KEY (item_id, group_id)
    )
  `);
  await client.query(
    'CREATE INDEX IF NOT EXISTS idx_material_assignments_group ON material_assignments(group_id)',
  );

  await client.query(`
    CREATE TABLE IF NOT EXISTS material_kit_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      program VARCHAR(10) NOT NULL,
      course_key VARCHAR(40) NOT NULL,
      item VARCHAR(120) NOT NULL,
      qty INT NOT NULL DEFAULT 0,
      position INT NOT NULL DEFAULT 0
    )
  `);
  await client.query(
    'CREATE INDEX IF NOT EXISTS idx_material_kit_items_course ON material_kit_items(program, course_key)',
  );

  await client.query(`
    CREATE TABLE IF NOT EXISTS material_schedule_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      program VARCHAR(10) NOT NULL,
      course_key VARCHAR(40) NOT NULL,
      week_start DATE,
      week_number INT,
      label VARCHAR(160) NOT NULL,
      kind VARCHAR(10) NOT NULL DEFAULT 'exam'
    )
  `);
  await client.query(
    'CREATE INDEX IF NOT EXISTS idx_material_schedule_course ON material_schedule_entries(program, course_key, week_start)',
  );

  await client.query(`
    CREATE TABLE IF NOT EXISTS material_course_starts (
      program VARCHAR(10) NOT NULL,
      course_key VARCHAR(40) NOT NULL,
      start_date DATE NOT NULL,
      PRIMARY KEY (program, course_key)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS material_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      program VARCHAR(10) NOT NULL,
      text TEXT NOT NULL,
      position INT NOT NULL DEFAULT 0
    )
  `);

  // Insumos (papelería, artículos de paquete) y su vínculo con los renglones del paquete.
  await client.query(`
    CREATE TABLE IF NOT EXISTS material_supplies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(120) NOT NULL,
      available INT,
      position INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(
    'ALTER TABLE material_kit_items ADD COLUMN IF NOT EXISTS supply_id UUID REFERENCES material_supplies(id) ON DELETE SET NULL',
  );

  // Control de compras y salidas de insumos.
  await client.query(
    'ALTER TABLE material_supplies ADD COLUMN IF NOT EXISTS min_stock INT',
  );
  await client.query(`
    CREATE TABLE IF NOT EXISTS material_supply_movements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      supply_id UUID NOT NULL REFERENCES material_supplies(id) ON DELETE CASCADE,
      type VARCHAR(10) NOT NULL,
      quantity INT NOT NULL,
      movement_date DATE NOT NULL,
      detail VARCHAR(200),
      unit_cost NUMERIC(12,2),
      created_by VARCHAR(160),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(
    'CREATE INDEX IF NOT EXISTS idx_material_supply_movements_supply ON material_supply_movements(supply_id, movement_date)',
  );

  // Qué se hará con el material retirado (null = por decidir).
  await client.query(
    'ALTER TABLE material_items ADD COLUMN IF NOT EXISTS disposition VARCHAR(20)',
  );

  // Inscritos reales por grupo, capturados a mano (null = sin capturar).
  await client.query(
    'ALTER TABLE material_groups ADD COLUMN IF NOT EXISTS enrolled INT',
  );

  await client.end();
  console.log('DB_OK: material planning ready');
}

module.exports = { run };

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
