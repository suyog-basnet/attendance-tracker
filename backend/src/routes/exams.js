const express = require('express');
const router = express.Router();
const db = require('../db');

const EXAM_QUERY = `
  SELECT e.id, e.course_id, e.title, e.exam_date, e.full_marks, e.obtained_marks,
         c.code, c.name AS course_name
  FROM exams e
  JOIN courses c ON c.id = e.course_id
  JOIN semesters sem ON sem.id = c.semester_id AND sem.is_active = TRUE
`;

// ─── GET /exams — every exam in the active semester ───────────────────────────
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await db.query(`${EXAM_QUERY} ORDER BY e.exam_date ASC`);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─── GET /exams/upcoming — nearest exams from today onward, for a countdown ──
router.get('/upcoming', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `${EXAM_QUERY} WHERE e.exam_date >= CURRENT_DATE ORDER BY e.exam_date ASC LIMIT 5`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─── POST /exams — schedule a new exam ─────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { course_id, title, exam_date, full_marks } = req.body;
    if (!course_id || !title || !exam_date) {
      return res.status(400).json({ error: 'course_id, title, and exam_date are required' });
    }
    const { rows } = await db.query(
      `INSERT INTO exams (course_id, title, exam_date, full_marks)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [course_id, title.trim(), exam_date, full_marks ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /exams/:id — update marks, title, or date ──────────────────────────
router.patch('/:id', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const fieldMap = {
      title:          body.title !== undefined ? body.title?.trim() : undefined,
      exam_date:      body.exam_date !== undefined ? body.exam_date : undefined,
      full_marks:     body.full_marks !== undefined ? body.full_marks : undefined,
      obtained_marks: body.obtained_marks !== undefined ? body.obtained_marks : undefined,
    };

    const setClauses = [];
    const values = [];
    let i = 1;
    for (const [key, value] of Object.entries(fieldMap)) {
      if (value !== undefined) {
        setClauses.push(`${key} = $${i}`);
        values.push(value);
        i++;
      }
    }
    if (!setClauses.length) return res.status(400).json({ error: 'No updatable fields provided' });

    values.push(req.params.id);
    const { rows } = await db.query(
      `UPDATE exams SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Exam not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /exams/:id ─────────────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    await db.query(`DELETE FROM exams WHERE id = $1`, [req.params.id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;