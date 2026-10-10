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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Maps a 'YYYY-MM-DD' string to the schedule's 0=Mon..4=Fri (-1 for weekend).
// Parsed at UTC noon so no server timezone can shift it onto the wrong day.
function scheduleDayOfWeek(dateStr) {
  const jsDow = new Date(`${dateStr}T12:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
  const map = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };
  return map[jsDow] ?? -1;
}

// Every 'YYYY-MM-DD' from start to end, inclusive.
function datesInRange(start, end) {
  const out = [];
  const d = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// Marks every class scheduled on `date` as not held. `q` is db.query or a
// transaction client's query, so the same logic serves the single-day route
// and the all-or-nothing range route. Still goes through the per-class edit
// limit: a class already at the limit is reported back as locked, never
// forced, and a class already not-held isn't touched again (so repeating the
// action doesn't burn edits).
async function applyHolidayForDate(q, date, reason) {
  const dow = scheduleDayOfWeek(date);
  if (dow === -1) return { total_classes: 0, applied: [], already: [], locked: [] };

  const { rows: slots } = await q(
    `SELECT DISTINCT c.id AS course_id, c.code
     FROM schedule_slots s
     JOIN courses c ON c.id = s.course_id
     JOIN semesters sem ON sem.id = c.semester_id AND sem.is_active = TRUE
     WHERE s.day_of_week = $1
     ORDER BY c.code`,
    [dow]
  );

  const applied = [];
  const already = [];
  const locked = [];

  for (const slot of slots) {
    const { rows: existing } = await q(
      `SELECT status, edit_count FROM attendance_records WHERE course_id = $1 AND date = $2`,
      [slot.course_id, date]
    );

    if (existing.length && existing[0].status === 'cancelled') {
      already.push(slot.code);
      continue;
    }
    if (existing.length && existing[0].edit_count >= MAX_EDITS_PER_DAY) {
      locked.push(slot.code);
      continue;
    }

    await q(
      `INSERT INTO attendance_records (course_id, date, status, reason, edit_count)
       VALUES ($1, $2, 'cancelled', $3, 1)
       ON CONFLICT (course_id, date)
         DO UPDATE SET status = 'cancelled', reason = $3, edit_count = attendance_records.edit_count + 1`,
      [slot.course_id, date, reason]
    );
    applied.push(slot.code);
  }

  return { total_classes: slots.length, applied, already, locked };
}

function cleanReason(raw) {
  return String(raw ?? '').trim().slice(0, 100) || 'Holiday';
}

// ─── POST /attendance/holiday — mark every class that day as not held ────────
router.post('/holiday', async (req, res, next) => {
  try {
    const { date } = req.body;
    if (!date || !DATE_RE.test(date)) {
      return res.status(400).json({ error: 'date is required as YYYY-MM-DD' });
    }
    const result = await applyHolidayForDate((t, p) => db.query(t, p), date, cleanReason(req.body.reason));
    res.json({ date, ...result });
  } catch (err) {
    next(err);
  }
});

// A vacation is a few weeks, not a few years — and a typo'd year shouldn't
// quietly write thousands of rows.
const MAX_RANGE_DAYS = 400;

function parseRange(body) {
  const { start_date, end_date } = body ?? {};
  if (!DATE_RE.test(start_date || '') || !DATE_RE.test(end_date || '')) {
    return { error: 'start_date and end_date are required as YYYY-MM-DD' };
  }
  if (start_date > end_date) return { error: 'start_date must be on or before end_date' };
  const dates = datesInRange(start_date, end_date);
  if (dates.length > MAX_RANGE_DAYS) {
    return { error: `Range is too long (${dates.length} days, max ${MAX_RANGE_DAYS})` };
  }
  return { start_date, end_date, dates };
}

// ─── POST /attendance/holiday-range — mark a whole date range as not held ────
// For vacations. All-or-nothing: if anything fails partway, nothing is written.
router.post('/holiday-range', async (req, res, next) => {
  const range = parseRange(req.body);
  if (range.error) return res.status(400).json({ error: range.error });
  const reason = cleanReason(req.body.reason);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const q = (t, p) => client.query(t, p);

    let classDays = 0;
    let applied = 0;
    let already = 0;
    let lockedCount = 0;
    const lockedDetails = [];

    for (const date of range.dates) {
      const r = await applyHolidayForDate(q, date, reason);
      if (r.total_classes > 0) classDays++;
      applied += r.applied.length;
      already += r.already.length;
      if (r.locked.length) {
        lockedCount += r.locked.length;
        lockedDetails.push({ date, courses: r.locked });
      }
    }

    await client.query('COMMIT');
    res.json({
      start_date: range.start_date,
      end_date: range.end_date,
      total_days: range.dates.length,
      class_days: classDays,
      applied,
      already,
      locked: lockedCount,
      locked_details: lockedDetails,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ─── POST /attendance/holiday-range/clear — undo a holiday range ─────────────
// Removes the not-held marks that `holiday-range` (or the one-day button)
// created, restoring those days to untouched — including their edit allowance,
// so a cancelled vacation doesn't leave days stuck locked. Deliberately narrow:
// only rows that are still not-held, carry this reason, and were never edited
// afterwards (edit_count <= 1). Anything you've since changed by hand is left
// alone and counted in `kept_edited`.
router.post('/holiday-range/clear', async (req, res, next) => {
  try {
    const range = parseRange(req.body);
    if (range.error) return res.status(400).json({ error: range.error });
    const reason = cleanReason(req.body.reason);

    const { rows: keptRows } = await db.query(
      `SELECT count(*)::int AS n
       FROM attendance_records a
       JOIN courses c ON c.id = a.course_id
       JOIN semesters sem ON sem.id = c.semester_id AND sem.is_active = TRUE
       WHERE a.date BETWEEN $1 AND $2 AND a.status = 'cancelled' AND a.reason = $3 AND a.edit_count > 1`,
      [range.start_date, range.end_date, reason]
    );

    const { rowCount } = await db.query(
      `DELETE FROM attendance_records a
       USING courses c, semesters sem
       WHERE c.id = a.course_id
         AND sem.id = c.semester_id AND sem.is_active = TRUE
         AND a.date BETWEEN $1 AND $2
         AND a.status = 'cancelled' AND a.reason = $3 AND a.edit_count <= 1`,
      [range.start_date, range.end_date, reason]
    );

    res.json({
      start_date: range.start_date,
      end_date: range.end_date,
      removed: rowCount,
      kept_edited: keptRows[0].n,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /attendance/by-date?from=YYYY-MM-DD&to=YYYY-MM-DD ───────────────────
// Every class with attendance activity in the active semester within a date
// range — feeds the calendar. Includes rows that were marked and then reset
// (status NULL, edit_count > 0), because the calendar needs their edit_count
// to know a day is locked even though it currently shows as unmarked.
router.get('/by-date', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) {
      return res.status(400).json({ error: 'from and to are required as YYYY-MM-DD' });
    }
    const { rows } = await db.query(
      `SELECT a.date, a.course_id, a.status, a.reason, a.edit_count, c.code, c.name AS course_name
       FROM attendance_records a
       JOIN courses c ON c.id = a.course_id
       JOIN semesters sem ON sem.id = c.semester_id AND sem.is_active = TRUE
       WHERE (a.status IS NOT NULL OR a.edit_count > 0) AND a.date BETWEEN $1 AND $2
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
