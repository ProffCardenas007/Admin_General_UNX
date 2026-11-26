// Carga inicial de "Planeación de material" desde el Excel "Proyección de Material".
// Uso: npm run seed:material-planning            (solo si las tablas están vacías)
//      npm run seed:material-planning -- --force (borra y vuelve a cargar)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function run() {
  const force = process.argv.includes('--force');
  const seed = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, 'data', 'material-planning-seed.json'),
      'utf8',
    ),
  );

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT COUNT(*)::int AS n FROM material_groups',
    );
    if (rows[0].n > 0 && !force) {
      await client.query('ROLLBACK');
      console.log(
        `SKIP: ya hay ${rows[0].n} grupos cargados. Usa --force para recargar.`,
      );
      return;
    }
    if (force) {
      for (const table of [
        'material_assignments',
        'material_items',
        'material_groups',
        'material_kit_items',
        'material_schedule_entries',
        'material_notes',
      ]) {
        await client.query(`DELETE FROM ${table}`);
      }
    }

    const groupIds = new Map();
    for (const g of seed.groups) {
      const res = await client.query(
        `INSERT INTO material_groups
           (program, course_key, course_label, venue, students, counts, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [g.program, g.courseKey, g.courseLabel, g.venue, g.students, g.counts, g.position],
      );
      groupIds.set(g.ref, res.rows[0].id);
    }

    const itemIds = new Map();
    for (const i of seed.items) {
      const res = await client.query(
        `INSERT INTO material_items
           (program, kind, version, module, available, print_qty, notes, do_not_use, reviewed, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [i.program, i.kind, i.version, i.module, i.available, i.printQty, i.notes, i.doNotUse, i.reviewed, i.position],
      );
      itemIds.set(i.ref, res.rows[0].id);
    }

    for (const a of seed.assignments) {
      await client.query(
        'INSERT INTO material_assignments (item_id, group_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [itemIds.get(a.item), groupIds.get(a.group)],
      );
    }
    for (const k of seed.kits) {
      await client.query(
        'INSERT INTO material_kit_items (program, course_key, item, qty, position) VALUES ($1,$2,$3,$4,$5)',
        [k.program, k.courseKey, k.item, k.qty, k.position],
      );
    }
    for (const s of seed.schedule) {
      await client.query(
        `INSERT INTO material_schedule_entries (program, course_key, week_start, week_number, label, kind)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [s.program, s.courseKey, s.weekStart, s.weekNumber, s.label, s.kind],
      );
    }
    let notePos = 0;
    for (const n of seed.notes) {
      await client.query(
        'INSERT INTO material_notes (program, text, position) VALUES ($1,$2,$3)',
        [n.program, n.text, notePos++],
      );
    }

    await client.query('COMMIT');
    console.log(
      `SEED_OK: ${seed.groups.length} grupos, ${seed.items.length} materiales, ` +
        `${seed.assignments.length} asignaciones, ${seed.kits.length} renglones de paquete, ` +
        `${seed.schedule.length} entradas de calendario`,
    );
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
    console.error(error);
    process.exit(1);
  });
}
