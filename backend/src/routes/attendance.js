const express = require('express');
const router = express.Router();
const db = require('../db');

// A day's attendance state can change at most this many times: the initial
// mark counts as 1, one correction (including a Reset) counts as the 2nd.
// After that it's locked until the next calendar day.
const MAX_EDITS_PER_DAY = 2;

// 'cancelled' = the class wasn't held (teacher absent, clash, holiday...).
// It's stored for the record but excluded from the attendance percentage,
// since a class that never happened shouldn't count for or against you.
const VALID_STATUSES = ['present', 'absent', 'cancelled'];

// ─── POST /attendance — mark present or absent (upsert, rate-limited) ────────
router.post('/', async (req, res, next) => {
  try {
    const { course_id, date, status } = req.body;

    if (!course_id || !date || !status) {
      return res.status(400).json({ error: 'course_id, date, and status are required' });
    }
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'status must be "present", "absent" or "cancelled"' });
    }
    // A reason only makes sense for a cancelled class; ignore it otherwise.
    const reason = status === 'cancelled' ? (String(req.body.reason ?? '').trim().slice(0, 100) || null) : null;

    const { rows: existingRows } = await db.query(
      `SELECT edit_count FROM attendance_records WHERE course_id = $1 AND date = $2`,
      [course_id, date]
    );

    if (existingRows.length && existingRows[0].edit_count >= MAX_EDITS_PER_DAY) {
      return res.status(409).json({
        error: 'Locked: attendance for this day has already been changed the maximum number of times.',
        edit_count: existingRows[0].edit_count,
      });
    }

    const { rows } = await db.query(
      `INSERT INTO attendance_records (course_id, date, status, reason, edit_count)
       VALUES ($1, $2, $3, $4, 1)
       ON CONFLICT (course_id, date)
         DO UPDATE SET status = EXCLUDED.status,
                       reason = EXCLUDED.reason,
                       edit_count = attendance_records.edit_count + 1
       RETURNING *`,
      [course_id, date, status, reason]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /attendance — reset to unmarked (counts as a change, not free) ───
router.delete('/', async (req, res, next) => {
  try {
    const { course_id, date } = req.body;

    if (!course_id || !date) {
      return res.status(400).json({ error: 'course_id and date are required' });
    }

    const { rows: existingRows } = await db.query(
      `SELECT edit_count FROM attendance_records WHERE course_id = $1 AND date = $2`,
      [course_id, date]
    );

    // Nothing recorded yet for this day — nothing to reset, and shouldn't burn an edit.
    if (!existingRows.length) {
      return res.status(204).send();
    }

    if (existingRows[0].edit_count >= MAX_EDITS_PER_DAY) {
      return res.status(409).json({
        error: 'Locked: attendance for this day has already been changed the maximum number of times.',
        edit_count: existingRows[0].edit_count,
      });
    }

    // Set status back to NULL rather than deleting the row, so the edit_count
    // (and therefore the lock) survives a reset instead of resetting to 0.
    await db.query(
      `UPDATE attendance_records
         SET status = NULL, reason = NULL, edit_count = edit_count + 1
       WHERE course_id = $1 AND date = $2`,
      [course_id, date]
    );

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─── GET /attendance/by-date?from=YYYY-MM-DD&to=YYYY-MM-DD ───────────────────
// Every marked class in the active semester within a date range — feeds the
// calendar. Unmarked (reset) rows are left out.
router.get('/by-date', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) {
      return res.status(400).json({ error: 'from and to are required as YYYY-MM-DD' });
    }
    const { rows } = await db.query(
      `SELECT a.date, a.course_id, a.status, a.reason, c.code, c.name AS course_name
       FROM attendance_records a
       JOIN courses c ON c.id = a.course_id
       JOIN semesters sem ON sem.id = c.semester_id AND sem.is_active = TRUE
       WHERE a.status IS NOT NULL AND a.date BETWEEN $1 AND $2
       ORDER BY a.date, c.code`,
      [from, to]
    );
    res.json(rows);
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
         COUNT(*) FILTER (WHERE status = 'present')   AS present,
         COUNT(*) FILTER (WHERE status = 'absent')    AS absent,
         COUNT(*) FILTER (WHERE status = 'cancelled') AS not_held
       FROM attendance_records
       WHERE course_id = $1`,
      [course_id]
    );

    const present = parseInt(counts[0].present, 10);
    const absent  = parseInt(counts[0].absent,  10);
    const notHeld = parseInt(counts[0].not_held, 10);
    const total   = present + absent; // 'not held' deliberately excluded
    const percentage = total > 0 ? Math.round((present / total) * 100) : null;

    // Full history
    const { rows: records } = await db.query(
      `SELECT date, status, reason, edit_count
       FROM attendance_records
       WHERE course_id = $1
       ORDER BY date DESC`,
      [course_id]
    );

    res.json({ course_id: parseInt(course_id, 10), present, absent, not_held: notHeld, total, percentage, records });
  } catch (err) {
    next(err);
  }
});

// ─── GET /attendance/:course_id/can-miss ─────────────────────────────────────
// Returns how many more classes can be missed while staying at/above the
// active semester's attendance target (defaults to 80%, editable in Settings).
router.get('/:course_id/can-miss', async (req, res, next) => {
  try {
    const { course_id } = req.params;

    const { rows: targetRows } = await db.query(
      `SELECT sem.attendance_target
       FROM courses c
       JOIN semesters sem ON sem.id = c.semester_id
       WHERE c.id = $1`,
      [course_id]
    );
    const target = targetRows[0]?.attendance_target ?? 80;
    const t = target / 100;

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

    // present / (total + x) >= t  →  x <= present/t - total
    const canMiss = total === 0
      ? null
      : Math.max(0, Math.floor(present / t - total));

    res.json({
      course_id: parseInt(course_id, 10),
      present,
      absent,
      total,
      percentage: total > 0 ? Math.round((present / total) * 100) : null,
      target,
      can_miss: canMiss,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;