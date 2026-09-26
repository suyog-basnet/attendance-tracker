-- KU Routine, Attendance & Assignment Tracker
-- Schema v1

-- Enable UUID extension (optional, we use SERIAL PKs here)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────
-- 0. SEMESTERS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS semesters (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  status     VARCHAR(10) CHECK (status IN ('present', 'absent')), -- NULL = reset/unmarked
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