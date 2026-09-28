-- KU Routine, Attendance & Assignment Tracker
-- Schema v1

-- Enable UUID extension (optional, we use SERIAL PKs here)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────
-- 0. SEMESTERS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS semesters (
  id                 SERIAL PRIMARY KEY,
  name               VARCHAR(100) NOT NULL,
  is_active          BOOLEAN NOT NULL DEFAULT FALSE,
  attendance_target  SMALLINT NOT NULL DEFAULT 80 CHECK (attendance_target BETWEEN 1 AND 100),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one semester can be active at a time. Enforced with a partial unique
-- index rather than application logic alone, so it holds even under races.
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_semester
  ON semesters ((is_active)) WHERE is_active = TRUE;

-- ─────────────────────────────────────────
-- 1. COURSES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(20)  NOT NULL,
  name         VARCHAR(120) NOT NULL,
  instructor   VARCHAR(100) NOT NULL,
  room         VARCHAR(30),
  credits      SMALLINT NOT NULL DEFAULT 3 CHECK (credits BETWEEN 1 AND 10),
  semester_id  INTEGER REFERENCES semesters(id) ON DELETE CASCADE,
  UNIQUE (code, semester_id)
);

CREATE INDEX IF NOT EXISTS idx_courses_semester ON courses(semester_id);

-- ─────────────────────────────────────────
-- 2. SCHEDULE SLOTS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedule_slots (
  id           SERIAL PRIMARY KEY,
  course_id    INTEGER      NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  day_of_week  SMALLINT     NOT NULL CHECK (day_of_week BETWEEN 0 AND 4), -- 0=Mon … 4=Fri
  start_time   TIME         NOT NULL,
  end_time     TIME         NOT NULL,
  CONSTRAINT chk_times CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_slots_day ON schedule_slots(day_of_week);
CREATE INDEX IF NOT EXISTS idx_slots_course ON schedule_slots(course_id);

-- ─────────────────────────────────────────
-- 3. ATTENDANCE RECORDS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_records (
  id         SERIAL PRIMARY KEY,
  course_id  INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  date       DATE    NOT NULL,
  status     VARCHAR(10) CHECK (status IN ('present', 'absent', 'cancelled')), -- NULL = reset/unmarked; cancelled = class not held
  reason     VARCHAR(100), -- why a class wasn't held (only set when status = 'cancelled')
  edit_count SMALLINT NOT NULL DEFAULT 0, -- caps how many times this day's state can change
  UNIQUE (course_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_course ON attendance_records(course_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date   ON attendance_records(date);

-- ─────────────────────────────────────────
-- 4. ASSIGNMENTS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assignments (
  id         SERIAL PRIMARY KEY,
  course_id  INTEGER     REFERENCES courses(id) ON DELETE SET NULL,
  title      VARCHAR(200) NOT NULL,
  due_date   DATE,
  is_done    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignments_due ON assignments(due_date ASC NULLS LAST);

-- ─────────────────────────────────────────
-- 5. PUSH TOKENS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_tokens (
  id               SERIAL PRIMARY KEY,
  expo_push_token  VARCHAR(200) NOT NULL UNIQUE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- 6. EXAMS
-- Internal exams/tests, with optional marks once graded.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exams (
  id              SERIAL PRIMARY KEY,
  course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title           VARCHAR(100) NOT NULL, -- e.g. "First Internal", "Final"
  exam_date       DATE NOT NULL,
  full_marks      NUMERIC(6,2),
  obtained_marks  NUMERIC(6,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (obtained_marks IS NULL OR full_marks IS NULL OR obtained_marks <= full_marks)
);

CREATE INDEX IF NOT EXISTS idx_exams_course ON exams(course_id);
CREATE INDEX IF NOT EXISTS idx_exams_date   ON exams(exam_date);

-- ─────────────────────────────────────────
-- 7. PUSH SUBSCRIPTIONS (Web Push, browser-based)
-- Distinct from the old push_tokens table above, which was for the
-- (now removed) Expo mobile app and can be dropped later.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         SERIAL PRIMARY KEY,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- 8. COURSE MATERIALS (slides/files and quick notes, per subject)
-- Files live on disk in backend/uploads/; only metadata is stored here.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS course_materials (
  id             SERIAL PRIMARY KEY,
  course_id      INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  kind           VARCHAR(10) NOT NULL CHECK (kind IN ('file', 'note')),
  title          VARCHAR(200) NOT NULL,
  note_text      TEXT,
  original_name  VARCHAR(255),
  stored_name    VARCHAR(255),
  mime_type      VARCHAR(150),
  size_bytes     BIGINT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (kind = 'note' AND note_text IS NOT NULL) OR
    (kind = 'file' AND stored_name IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_materials_course ON course_materials(course_id);
