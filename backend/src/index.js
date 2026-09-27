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
const { startNotificationJob } = require('./jobs/notificationJob');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date() }));

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ KU Tracker backend running on http://localhost:${PORT}`);
  startNotificationJob();
});

module.exports = app;
