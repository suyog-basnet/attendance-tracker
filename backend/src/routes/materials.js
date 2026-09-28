const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const router = express.Router();
const db = require('../db');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_FILE_MB = 50;

// Files are saved under a random name, never the user's filename, so an
// upload can't overwrite anything or escape the uploads folder.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 12);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: MAX_FILE_MB * 1024 * 1024 } });

// ─── GET /materials?course_id=N — files and notes for a subject ──────────────
router.get('/', async (req, res, next) => {
  try {
    const { course_id } = req.query;
    const { rows } = await db.query(
      `SELECT id, course_id, kind, title, note_text, original_name, mime_type, size_bytes, created_at
       FROM course_materials
       WHERE ($1::int IS NULL OR course_id = $1)
       ORDER BY created_at DESC`,
      [course_id || null]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─── POST /materials/file — multipart: course_id, title (optional), file ─────
router.post('/file', upload.single('file'), async (req, res, next) => {
  try {
    const { course_id, title } = req.body;
    if (!req.file || !course_id) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'course_id and a file are required' });
    }
    const { rows } = await db.query(
      `INSERT INTO course_materials (course_id, kind, title, original_name, stored_name, mime_type, size_bytes)
       VALUES ($1, 'file', $2, $3, $4, $5, $6)
       RETURNING id, course_id, kind, title, original_name, mime_type, size_bytes, created_at`,
      [
        course_id,
        (title && title.trim()) || req.file.originalname,
        req.file.originalname,
        req.file.filename,
        req.file.mimetype,
        req.file.size,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(err);
  }
});

// ─── POST /materials/note — JSON: course_id, title, note_text ────────────────
router.post('/note', async (req, res, next) => {
  try {
    const { course_id, title, note_text } = req.body;
    if (!course_id || !title?.trim() || !note_text?.trim()) {
      return res.status(400).json({ error: 'course_id, title, and note_text are required' });
    }
    const { rows } = await db.query(
      `INSERT INTO course_materials (course_id, kind, title, note_text)
       VALUES ($1, 'note', $2, $3)
       RETURNING id, course_id, kind, title, note_text, created_at`,
      [course_id, title.trim(), note_text]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── GET /materials/:id/download ─────────────────────────────────────────────
router.get('/:id/download', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT stored_name, original_name FROM course_materials WHERE id = $1 AND kind = 'file'`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'File not found' });
    const filePath = path.join(UPLOAD_DIR, rows[0].stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File is missing on disk' });
    res.download(filePath, rows[0].original_name);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /materials/:id — removes the row and the file on disk ────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `DELETE FROM course_materials WHERE id = $1 RETURNING stored_name`,
      [req.params.id]
    );
    if (rows[0]?.stored_name) {
      fs.unlink(path.join(UPLOAD_DIR, rows[0].stored_name), () => {});
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Turn multer's file-size error into a readable 413 instead of a generic 500.
router.use((err, _req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File is too large (max ${MAX_FILE_MB} MB)` });
  }
  next(err);
});

module.exports = router;