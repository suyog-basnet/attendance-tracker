const express = require('express');
const router = express.Router();
const db = require('../db');

// Shared helper: find the currently active semester's id.
async function getActiveSemesterId() {
  const { rows } = await db.query(`SELECT id FROM semesters WHERE is_active = TRUE LIMIT 1`);
  return rows[0]?.id ?? null;
}

// ─── GET /courses — courses in the active semester ────────────────────────────
// Pass ?semester_id=N to look at a different (e.g. past) semester's courses.
router.get('/', async (req, res, next) => {
  try {
    const semesterId = req.query.semester_id || (await getActiveSemesterId());
    if (!semesterId) return res.json([]); // no semester set up yet

    const { rows } = await db.query(
      `SELECT id, code, name, instructor, room, credits, semester_id
       FROM courses WHERE semester_id = $1 ORDER BY code`,
      [semesterId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─── POST /courses — add a course to the active semester (or a given one) ─────
router.post('/', async (req, res, next) => {
  try {
    const { code, name, instructor, room, credits, semester_id } = req.body;
    if (!code || !name || !instructor) {
      return res.status(400).json({ error: 'code, name, and instructor are required' });
    }
    const targetSemester = semester_id || (await getActiveSemesterId());
    if (!targetSemester) {
      return res.status(400).json({ error: 'No active semester — create one first' });
    }

    const { rows } = await db.query(
      `INSERT INTO courses (code, name, instructor, room, credits, semester_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (code, semester_id) DO NOTHING
       RETURNING *`,
      [code.trim(), name.trim(), instructor.trim(), room?.trim() || null, Number(credits) || 3, targetSemester]
    );

    if (!rows.length) {
      return res.status(409).json({ error: 'A course with this code already exists in this semester' });
    }
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /courses/:id — remove a course (cascades slots/attendance) ───────
router.delete('/:id', async (req, res, next) => {
  try {
    await db.query(`DELETE FROM courses WHERE id = $1`, [req.params.id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─── GET /courses/:id/next-class — nearest upcoming slot for one course ───────
// Looks at today's remaining slots first, then the rest of the week, wrapping
// back to Monday if nothing is left this week.
router.get('/:id/next-class', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await db.query(
      `SELECT day_of_week, start_time, end_time
       FROM schedule_slots
       WHERE course_id = $1
       ORDER BY day_of_week, start_time`,
      [id]
    );

    if (!rows.length) return res.json({ next: null });

    const now = new Date();
    const nepaliNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' }));
    const jsDow = nepaliNow.getDay(); // 0=Sun..6=Sat
    const map = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };
    const todayIdx = map[jsDow] ?? -1; // -1 = weekend
    const nowTime = nepaliNow.toTimeString().slice(0, 8);

    let next = rows.find(
      (r) => todayIdx !== -1 && r.day_of_week === todayIdx && r.start_time > nowTime
    );
    if (!next) {
      next = rows.find((r) => todayIdx !== -1 && r.day_of_week > todayIdx);
    }
    if (!next) {
      next = rows[0]; // wrap to the earliest slot next week
    }

    res.json({ next });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
