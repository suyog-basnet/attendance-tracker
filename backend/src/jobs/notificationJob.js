const cron = require('node-cron');
const { Expo } = require('expo-server-sdk');
const db = require('../db');

const expo = new Expo();

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

/**
 * Get "tomorrow" day-of-week in Nepal time (0=Mon … 4=Fri, -1=weekend).
 */
function getTomorrowDayOfWeek() {
  const now = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' })
  );
  const jsDow = now.getDay(); // 0=Sun … 6=Sat

  // Tomorrow's JS day
  const tomorrowJs = (jsDow + 1) % 7;
  const map = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };
  return map[tomorrowJs] ?? -1;
}

/**
 * Format HH:MM from postgres TIME string
 */
function fmtTime(t) {
  return t.slice(0, 5); // "09:00:00" → "09:00"
}

/**
 * Build the push notification message for tomorrow's classes
 */
async function buildMessage(tomorrowDay) {
  if (tomorrowDay === -1) return null;

  const { rows } = await db.query(
    `SELECT
       c.code,
       c.name,
       s.start_time,
       s.end_time
     FROM schedule_slots s
     JOIN courses c ON c.id = s.course_id
     WHERE s.day_of_week = $1
     ORDER BY s.start_time`,
    [tomorrowDay]
  );

  if (!rows.length) return null;

  const dayName = DAY_NAMES[tomorrowDay];
  const classList = rows
    .map((r) => `${r.code} ${fmtTime(r.start_time)}–${fmtTime(r.end_time)}`)
    .join(', ');

  return {
    title: `📅 Tomorrow (${dayName})`,
    body: classList,
  };
}

/**
 * Send push notifications to all registered Expo tokens
 */
async function sendNotifications() {
  console.log(`[NotificationJob] Running at ${new Date().toISOString()}`);

  const tomorrowDay = getTomorrowDayOfWeek();

  if (tomorrowDay === -1) {
    // Weekend tomorrow — send a rest-day message
    const { rows: tokens } = await db.query(`SELECT expo_push_token FROM push_tokens`);
    if (!tokens.length) return;

    const messages = tokens.map(({ expo_push_token }) => ({
      to: expo_push_token,
      title: '🎉 No Classes Tomorrow!',
      body: 'Enjoy your rest day. See you next week!',
    }));

    await sendChunked(messages);
    return;
  }

  const msgContent = await buildMessage(tomorrowDay);
  if (!msgContent) {
    console.log('[NotificationJob] No slots for tomorrow. Skipping.');
    return;
  }

  const { rows: tokens } = await db.query(`SELECT expo_push_token FROM push_tokens`);
  if (!tokens.length) {
    console.log('[NotificationJob] No registered push tokens. Skipping.');
    return;
  }

  const messages = tokens
    .filter(({ expo_push_token }) => Expo.isExpoPushToken(expo_push_token))
    .map(({ expo_push_token }) => ({
      to: expo_push_token,
      sound: 'default',
      title: msgContent.title,
      body: msgContent.body,
      data: { type: 'tomorrow_classes', day: tomorrowDay },
    }));

  if (!messages.length) {
    console.log('[NotificationJob] No valid Expo push tokens found.');
    return;
  }

  await sendChunked(messages);
}

async function sendChunked(messages) {
  const chunks = expo.chunkPushNotifications(messages);
  const receipts = [];

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      receipts.push(...ticketChunk);
      console.log('[NotificationJob] Sent chunk:', ticketChunk);
    } catch (err) {
      console.error('[NotificationJob] Failed to send chunk:', err);
    }
  }
}

/**
 * Start the cron job — runs every day at 20:00 Nepal time.
 * node-cron uses server local time; ensure TZ=Asia/Kathmandu in .env
 */
function startNotificationJob() {
  // "At 20:00 every day"
  cron.schedule('0 20 * * *', () => {
    sendNotifications().catch((err) =>
      console.error('[NotificationJob] Unhandled error:', err)
    );
  }, {
    scheduled: true,
    timezone: 'Asia/Kathmandu',
  });

  console.log('⏰ Notification cron job scheduled (daily at 20:00 NPT)');
}

module.exports = { startNotificationJob, sendNotifications };
