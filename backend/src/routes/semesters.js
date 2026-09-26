const express = require('express');
const router = express.Router();
const db = require('../db');

// ─── GET /semesters — list all, active first ──────────────────────────────────
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, is_active, created_at
       FROM semesters
       ORDER BY is_active DESC, created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─── POST /semesters — create a new semester ──────────────────────────────────
// Does NOT activate it automatically — call PATCH /:id/activate for that,
// so you can set up a new semester's courses before switching over to it.
router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const { rows } = await db.query(
      `INSERT INTO semesters (name, is_active) VALUES ($1, FALSE) RETURNING *`,
      [name.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /semesters/:id/activate — switch the active semester ──────────────
// Every screen that lists courses/schedule filters by whichever semester is
// active, so this is how you switch the whole app over to a new term.
router.patch('/:id/activate', async (req, res, next) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE semesters SET is_active = FALSE WHERE is_active = TRUE`);
    const { rows } = await client.query(
      `UPDATE semesters SET is_active = TRUE WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Semester not found' });
    }
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;