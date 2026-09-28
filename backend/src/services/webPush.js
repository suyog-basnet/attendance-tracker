const webpush = require('web-push');
const db = require('../db');

const publicKey  = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject    = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
} else {
  console.warn('⚠️  VAPID keys not set — web push notifications are disabled. See .env.example.');
}

// Sends `payload` (an object, will be JSON-stringified) to every subscribed
// browser. Automatically removes subscriptions that are no longer valid
// (410 Gone / 404 Not Found — the browser unsubscribed or the sub expired).
async function sendToAll(payload) {
  if (!publicKey || !privateKey) return { sent: 0, pruned: 0 };

  const { rows: subs } = await db.query(`SELECT id, endpoint, p256dh, auth FROM push_subscriptions`);
  let sent = 0;
  let pruned = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        );
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await db.query(`DELETE FROM push_subscriptions WHERE id = $1`, [sub.id]);
          pruned++;
        } else {
          console.error('Push send failed:', err.statusCode, err.message);
        }
      }
    })
  );

  return { sent, pruned };
}

module.exports = { sendToAll, isConfigured: () => Boolean(publicKey && privateKey) };
