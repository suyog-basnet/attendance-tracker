const express = require('express');
const router = express.Router();
const db = require('../db');

// ─── POST /push-tokens ────────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { expo_push_token } = req.body;

    if (!expo_push_token?.trim()) {
      return res.status(400).json({ error: 'expo_push_token is required' });
    }

    const { rows } = await db.query(
      `INSERT INTO push_tokens (expo_push_token)
       VALUES ($1)
       ON CONFLICT (expo_push_token) DO UPDATE
         SET expo_push_token = EXCLUDED.expo_push_token  -- no-op, just return
       RETURNING *`,
      [expo_push_token.trim()]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── GET /push-tokens — internal utility ──────────────────────────────────────
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM push_tokens ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
