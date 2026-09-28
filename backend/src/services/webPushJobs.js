const cron = require('node-cron');
const db = require('../db');
const { sendToAll } = require('../services/webPush');

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function getTomorrowDayOfWeek() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' }));
  const jsDow = now.getDay(); // 0=Sun..6=Sat
  const tomorrowJs = (jsDow + 1) % 7;
  const map = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };
  return map[tomorrowJs] ?? -1; // -1 = weekend
}

function fmtTime(t) {
  return t.slice(0, 5);
}

function todayNepal() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' });
}

// ─── Job 1: tomorrow's classes, scoped to the active semester ─────────────────
async function sendTomorrowSchedule() {
  const tomorrowDay = getTomorrowDayOfWeek();

  if (tomorrowDay === -1) {
    console.log('[WebPush] Tomorrow is a weekend — skipping schedule notification.');
    return { skipped: 'Tomorrow has no classes (weekend/Sunday), so there is nothing to send.' };
  }

  const { rows } = await db.query(
    `SELECT c.code, s.start_time, s.end_time
     FROM schedule_slots s
     JOIN courses c ON c.id = s.course_id
     JOIN semesters sem ON sem.id = c.semester_id AND sem.is_active = TRUE
     WHERE s.day_of_week = $1
     ORDER BY s.start_time`,
    [tomorrowDay]
  );

  if (!rows.length) {
    console.log('[WebPush] No classes scheduled tomorrow — skipping.');
    return { skipped: 'No classes scheduled tomorrow, so there is nothing to send.' };
  }

  const classList = rows.map((r) => `${r.code} ${fmtTime(r.start_time)}–${fmtTime(r.end_time)}`).join(', ');

  const result = await sendToAll({
    title: `📅 Tomorrow (${DAY_NAMES[tomorrowDay]})`,
    body: classList,
    tag: 'tomorrow-schedule',
    url: '/week',
  });

  console.log(`[WebPush] Tomorrow-schedule sent to ${result.sent}, pruned ${result.pruned}`);
  return { ...result, preview: classList };
}

// ─── Job 2: assignments due today or tomorrow, scoped to the active semester ─
async function sendAssignmentReminders() {
  const today = todayNepal();

  const { rows } = await db.query(
    `SELECT a.title, a.due_date, c.code
     FROM assignments a
     LEFT JOIN courses c ON c.id = a.course_id
     WHERE a.is_done = FALSE
       AND a.due_date IN ($1, $1::date + 1)
     ORDER BY a.due_date ASC`,
    [today]
  );

  if (!rows.length) {
    console.log('[WebPush] No assignments due today/tomorrow — skipping.');
    return { skipped: 'No pending assignments are due today or tomorrow, so there is nothing to send.' };
  }

  const list = rows
    .map((r) => `${r.code ? `${r.code}: ` : ''}${r.title} (${r.due_date === today ? 'today' : 'tomorrow'})`)
    .join('; ');

  const result = await sendToAll({
    title: '📝 Assignments due soon',
    body: list,
    tag: 'assignment-reminder',
    url: '/assignments',
  });

  console.log(`[WebPush] Assignment reminder sent to ${result.sent}, pruned ${result.pruned}`);
  return { ...result, preview: list };
}

function startWebPushJobs() {
  // 20:00 NPT — tomorrow's classes
  cron.schedule('0 20 * * *', () => {
    sendTomorrowSchedule().catch((err) => console.error('[WebPush] Tomorrow-schedule job error:', err));
  }, { scheduled: true, timezone: 'Asia/Kathmandu' });

  // 08:00 NPT — assignments due today/tomorrow
  cron.schedule('0 8 * * *', () => {
    sendAssignmentReminders().catch((err) => console.error('[WebPush] Assignment-reminder job error:', err));
  }, { scheduled: true, timezone: 'Asia/Kathmandu' });

  console.log('⏰ Web push jobs scheduled (tomorrow\'s schedule 20:00 NPT, assignment reminders 08:00 NPT)');
}

module.exports = { startWebPushJobs, sendTomorrowSchedule, sendAssignmentReminders };