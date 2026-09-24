const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * Helper: get Nepal's current day-of-week (0=Mon … 4=Fri).
 * JavaScript Date.getDay() gives 0=Sun … 6=Sat, so we shift.
 */
function getNepaliDayOfWeek(date = new Date()) {
  // Use Asia/Kathmandu locale
  const jsDow = new Date(
    date.toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' })
  ).getDay(); // 0=Sun, 1=Mon … 6=Sat

  // Map Sunday(0)->-1 (weekend), Monday(1)->0, … Friday(5)->4, Saturday(6)->-1
  const map = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };
  return map[jsDow] ?? -1; // -1 = weekend, no classes
}

const SLOT_QUERY = `
  SELECT
    s.id          AS slot_id,
    s.day_of_week,
    s.start_time,
    s.end_time,
    c.id          AS course_id,
    c.code,
    c.name,
    c.instructor,
    c.room
  FROM schedule_slots s
  JOIN courses c ON c.id = s.course_id
`;

// ─── GET /schedule/today ──────────────────────────────────────────────────────
router.get('/today', async (_req, res, next) => {
  try {
    const day = getNepaliDayOfWeek();

    if (day === -1) {
      return res.json({ day: 'weekend', slots: [] });
    }

    const { rows } = await db.query(
      `${SLOT_QUERY} WHERE s.day_of_week = $1 ORDER BY s.start_time`,
      [day]
    );

    res.json({ day, slots: rows });
  } catch (err) {
    next(err);
  }
});

// ─── GET /schedule/week ───────────────────────────────────────────────────────
router.get('/week', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `${SLOT_QUERY} ORDER BY s.day_of_week, s.start_time`
    );

    // Group by day
    const days = [[], [], [], [], []];
    rows.forEach((r) => days[r.day_of_week].push(r));

    res.json({
      week: days.map((slots, idx) => ({
        day_of_week: idx,
        day_name: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][idx],
        slots,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /schedule/:id — edit slot time (Settings screen) ──────────────────
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { start_time, end_time } = req.body;

    if (!start_time && !end_time) {
      return res.status(400).json({ error: 'Provide start_time and/or end_time' });
    }

    const { rows } = await db.query(
      `UPDATE schedule_slots
         SET start_time = COALESCE($1, start_time),
             end_time   = COALESCE($2, end_time)
       WHERE id = $3
       RETURNING *`,
      [start_time || null, end_time || null, id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Slot not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
