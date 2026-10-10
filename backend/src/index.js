require('dotenv').config();
const express = require('express');
const cors = require('cors');

const scheduleRoutes    = require('./routes/schedule');
const attendanceRoutes  = require('./routes/attendance');
const assignmentRoutes  = require('./routes/assignments');
const pushTokenRoutes   = require('./routes/pushTokens');
const courseRoutes      = require('./routes/courses');
const semesterRoutes    = require('./routes/semesters');
const examRoutes        = require('./routes/exams');
const pushRoutes        = require('./routes/push');
const materialRoutes    = require('./routes/materials');
const backupRoutes      = require('./routes/backup');
const { startWebPushJobs } = require('./jobs/webPushJobs');

const app = express();
const PORT = process.env.PORT || 7391;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/schedule',    scheduleRoutes);
app.use('/attendance',  attendanceRoutes);
app.use('/assignments', assignmentRoutes);
app.use('/push-tokens', pushTokenRoutes);
app.use('/courses',     courseRoutes);
app.use('/semesters',   semesterRoutes);
app.use('/exams',       examRoutes);
app.use('/push',        pushRoutes);
app.use('/materials',   materialRoutes);
app.use('/backup',      backupRoutes);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date() }));

// ─── Serve the built frontend (optional) ──────────────────────────────────────
// Lets ONE process (this one) serve both the API and the web app on the same
// port, instead of needing `npm run dev` running separately for the frontend.
// Only kicks in if frontend/dist actually exists (i.e. you've run `npm run
// build` in frontend/) — harmless if it doesn't, just skipped with a note.
const path = require('path');
const fs = require('fs');
const FRONTEND_DIST = process.env.FRONTEND_DIST || path.join(__dirname, '..', '..', 'frontend', 'dist');
const API_PREFIXES = [
  '/schedule', '/attendance', '/assignments', '/push-tokens', '/courses',
  '/semesters', '/exams', '/push', '/materials', '/backup', '/health',
];

if (fs.existsSync(path.join(FRONTEND_DIST, 'index.html'))) {
  app.use(express.static(FRONTEND_DIST));
  // Anything that isn't an API route and isn't a real static file (JS, CSS,
  // icons, etc. — already served above) falls through to index.html, so
  // React Router's client-side routes work on a hard refresh too.
  app.get('*', (req, res, next) => {
    if (API_PREFIXES.some((p) => req.path.startsWith(p))) return next();
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
  console.log(`🖥️  Serving built frontend from ${FRONTEND_DIST}`);
} else {
  console.log(
    `ℹ️  No built frontend found at ${FRONTEND_DIST} — API-only mode. ` +
    `Run "npm run build" in frontend/ to also serve the web app from this process.`
  );
}

// 404 handler (API routes that matched no prefix above, or frontend-less mode)
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ KU Tracker backend running on http://localhost:${PORT}`);
  startWebPushJobs();
});

module.exports = app;
