const express = require('express');
const router = express.Router();
const db = require('../db');

// ─── GET /assignments ─────────────────────────────────────────────────────────
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT
         a.id,
         a.title,
         a.due_date,
         a.is_done,
         a.created_at,
         a.course_id,
         c.code   AS course_code,
         c.name   AS course_name
       FROM assignments a
       LEFT JOIN courses c ON c.id = a.course_id
       ORDER BY a.due_date ASC NULLS LAST, a.created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─── POST /assignments ────────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { title, course_id, due_date } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }

    const { rows } = await db.query(
      `INSERT INTO assignments (title, course_id, due_date)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [title.trim(), course_id || null, due_date || null]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /assignments/:id ───────────────────────────────────────────────────
// Uses "field present in body?" rather than COALESCE, so a client can
// explicitly clear course_id or due_date by sending { due_date: null }.
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body ?? {};

    const fieldMap = {
      title:     body.title !== undefined ? body.title?.trim() : undefined,
      course_id: body.course_id !== undefined ? body.course_id : undefined,
      due_date:  body.due_date !== undefined ? body.due_date : undefined,
      is_done:   body.is_done !== undefined ? body.is_done : undefined,
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

    if (!setClauses.length) {
      return res.status(400).json({ error: 'No updatable fields provided' });
    }

    values.push(id);

    const { rows } = await db.query(
      `UPDATE assignments SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );

    if (!rows.length) return res.status(404).json({ error: 'Assignment not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /assignments/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rowCount } = await db.query(
      `DELETE FROM assignments WHERE id = $1`,
      [id]
    );

    if (!rowCount) return res.status(404).json({ error: 'Assignment not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
