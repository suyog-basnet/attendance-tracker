const express = require('express');
const router = express.Router();
const db = require('../db');

// ─── POST /attendance — mark present or absent (upsert) ──────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { course_id, date, status } = req.body;

    if (!course_id || !date || !status) {
      return res.status(400).json({ error: 'course_id, date, and status are required' });
    }
    if (!['present', 'absent'].includes(status)) {
      return res.status(400).json({ error: 'status must be "present" or "absent"' });
    }

    const { rows } = await db.query(
      `INSERT INTO attendance_records (course_id, date, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (course_id, date)
         DO UPDATE SET status = EXCLUDED.status
       RETURNING *`,
      [course_id, date, status]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /attendance — reset (remove record) ───────────────────────────────
router.delete('/', async (req, res, next) => {
  try {
    const { course_id, date } = req.body;

    if (!course_id || !date) {
      return res.status(400).json({ error: 'course_id and date are required' });
    }

    await db.query(
      `DELETE FROM attendance_records WHERE course_id = $1 AND date = $2`,
      [course_id, date]
    );

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─── GET /attendance/:course_id/summary ──────────────────────────────────────
router.get('/:course_id/summary', async (req, res, next) => {
  try {
    const { course_id } = req.params;

    // Count present / absent
    const { rows: counts } = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'present') AS present,
         COUNT(*) FILTER (WHERE status = 'absent')  AS absent
       FROM attendance_records
       WHERE course_id = $1`,
      [course_id]
    );

    const present = parseInt(counts[0].present, 10);
    const absent  = parseInt(counts[0].absent,  10);
    const total   = present + absent;
    const percentage = total > 0 ? Math.round((present / total) * 100) : null;

    // Full history
    const { rows: records } = await db.query(
      `SELECT date, status
       FROM attendance_records
       WHERE course_id = $1
       ORDER BY date DESC`,
      [course_id]
    );

    res.json({ course_id: parseInt(course_id, 10), present, absent, total, percentage, records });
  } catch (err) {
    next(err);
  }
});

// ─── GET /attendance/:course_id/can-miss ─────────────────────────────────────
// Returns how many more classes can be missed while staying >= 75%
router.get('/:course_id/can-miss', async (req, res, next) => {
  try {
    const { course_id } = req.params;

    const { rows } = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'present') AS present,
         COUNT(*) FILTER (WHERE status = 'absent')  AS absent
       FROM attendance_records
       WHERE course_id = $1`,
      [course_id]
    );

    const present = parseInt(rows[0].present, 10);
    const absent  = parseInt(rows[0].absent,  10);
    const total   = present + absent;

    // Formula: present / (total + x) >= 0.75  →  x <= (present - 0.75*total) / 0.75
    // x = floor((present - 0.75 * total) / 0.75)  → simplifies to floor((4*present - 3*total) / 3)
    const canMiss = total === 0
      ? null
      : Math.max(0, Math.floor((4 * present - 3 * total) / 3));

    res.json({
      course_id: parseInt(course_id, 10),
      present,
      absent,
      total,
      percentage: total > 0 ? Math.round((present / total) * 100) : null,
      can_miss: canMiss,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
