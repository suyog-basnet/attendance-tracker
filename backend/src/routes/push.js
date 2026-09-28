const express = require('express');
const router = express.Router();
const db = require('../db');
const { isConfigured } = require('../services/webPush');

// ─── GET /push/vapid-public-key ────────────────────────────────────────────────
router.get('/vapid-public-key', (_req, res) => {
  res.json({
    publicKey: process.env.VAPID_PUBLIC_KEY || null,
    configured: isConfigured(),
  });
});

// ─── POST /push/subscribe ──────────────────────────────────────────────────────
// Body is the raw PushSubscription object from the browser:
// { endpoint, keys: { p256dh, auth } }
router.post('/subscribe', async (req, res, next) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription payload' });
    }
    await db.query(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth)
       VALUES ($1, $2, $3)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [endpoint, keys.p256dh, keys.auth]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /push/subscribe ────────────────────────────────────────────────────
router.delete('/subscribe', async (req, res, next) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
    await db.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;