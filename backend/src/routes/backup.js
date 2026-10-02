const express = require('express');
const router = express.Router();
const db = require('../db');

// Tables that make up "your data" for backup purposes, in parent-to-child
// order (the order safe to INSERT in). Restore deletes in the reverse order
// and re-inserts in this order. push_tokens (dead Expo-era table) and
// push_subscriptions (per-browser runtime state, not user data) are
// deliberately excluded — restoring someone's push subscription across
// machines makes no sense anyway.
const TABLES = [
  'semesters',
  'courses',
  'schedule_slots',
  'attendance_records',
  'assignments',
  'exams',
  'course_materials',
];

// Tables with a created_at column. Scoped here rather than as a global pg
// type-parser change, since the rest of the app relies on created_at coming
// back as a normal JS Date — this only affects the backup export/import path.
// TIMESTAMPTZ has microsecond precision; a plain JS Date (and therefore
// JSON.stringify) only holds milliseconds, so without this cast a round-trip
// through export/import would silently shave off sub-millisecond precision.
const HAS_CREATED_AT = new Set(['semesters', 'assignments', 'exams', 'course_materials']);

// ─── GET /backup/export ────────────────────────────────────────────────────────
router.get('/export', async (_req, res, next) => {
  try {
    const data = {};
    for (const table of TABLES) {
      const cols = HAS_CREATED_AT.has(table)
        ? `*, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at`
        : '*';
      const { rows } = await db.query(`SELECT ${cols} FROM ${table} ORDER BY id`);
      data[table] = rows;
    }

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ku-tracker-backup-${new Date().toISOString().slice(0, 10)}.json"`
    );
    res.json({
      exported_at: new Date().toISOString(),
      version: 1,
      note:
        'Uploaded files themselves (slides/PDFs) are NOT included here — back up ' +
        "the backend/uploads/ folder separately. This file only restores data, " +
        'not the files course_materials.stored_name points to.',
      data,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /backup/import ───────────────────────────────────────────────────────
// Destructive: replaces every row in every table listed above. Expects the
// exact shape GET /backup/export produces. All-or-nothing — if anything
// fails, the whole restore rolls back and your existing data is untouched.
router.post('/import', async (req, res, next) => {
  const payload = req.body?.data;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Expected { data: { semesters: [...], courses: [...], ... } }' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Delete children-first so FK constraints never block a delete.
    for (const table of [...TABLES].reverse()) {
      await client.query(`DELETE FROM ${table}`);
    }

    const counts = {};
    for (const table of TABLES) {
      const rows = Array.isArray(payload[table]) ? payload[table] : [];
      counts[table] = rows.length;
      if (!rows.length) continue;

      const columns = Object.keys(rows[0]);
      const colList = columns.map((c) => `"${c}"`).join(', ');
      for (const row of rows) {
        const values = columns.map((c) => row[c]);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(`INSERT INTO ${table} (${colList}) VALUES (${placeholders})`, values);
      }

      // Explicit IDs were just inserted, so the id sequence needs to catch
      // up or the next normal INSERT will collide with a restored row.
      await client.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), (SELECT MAX(id) FROM ${table}) IS NOT NULL)`,
        [table]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true, restored: counts });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;