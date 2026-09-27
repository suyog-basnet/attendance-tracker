-- KU Routine, Attendance & Assignment Tracker
-- Seed Data — IV/I CE Schedule (Elective: COMP 488 / E1)
-- Safe to re-run: uses ON CONFLICT DO NOTHING

-- ─────────────────────────────────────────
-- SEMESTER
-- Only seeds a default semester if none exist yet, so re-running this file
-- doesn't create duplicates or disturb whichever semester you've since
-- marked active.
-- ─────────────────────────────────────────
INSERT INTO semesters (name, is_active)
SELECT '7th Semester', TRUE
WHERE NOT EXISTS (SELECT 1 FROM semesters);

-- ─────────────────────────────────────────
-- COURSES
-- ─────────────────────────────────────────
INSERT INTO courses (code, name, instructor, room, semester_id)
SELECT v.code, v.name, v.instructor, v.room, s.id
FROM (VALUES
  ('COMP 401', 'Theory of Computation',            'Prof. Dr. Rabindra Bista',    '9-304'),
  ('COMP 407', 'Computer Graphics',                'Mr. Santosh Shaha',           '9-404'),
  ('COMP 409', 'Software Engineering',              'Mr. Sushil Nepal',            '9-304'),
  ('COMP 472', 'Database Management Systems',       'Dr. Rajani Chulyadyo',        '9-304'),
  ('COMP 488', 'Neural Network and Deep Learning',   'Prof. Dr. Bal Krishna Bal',   NULL),
  ('MGTS 403', 'Engineering Economics',              'Mr. Bishal Gurung',           '9-304')
) AS v(code, name, instructor, room)
CROSS JOIN (SELECT id FROM semesters WHERE is_active = TRUE LIMIT 1) AS s
ON CONFLICT (code, semester_id) DO NOTHING;

-- ─────────────────────────────────────────
-- SCHEDULE SLOTS
-- day_of_week: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri
-- NOTE: Times below were inferred from a scanned routine image and
--       may be off by up to an hour. Edit via the Settings screen.
-- ─────────────────────────────────────────

-- MONDAY (0)
INSERT INTO schedule_slots (course_id, day_of_week, start_time, end_time)
SELECT c.id, 0, '09:00', '10:00' FROM courses c WHERE c.code = 'COMP 401'
ON CONFLICT DO NOTHING;

INSERT INTO schedule_slots (course_id, day_of_week, start_time, end_time)
SELECT c.id, 0, '10:00', '12:00' FROM courses c WHERE c.code = 'COMP 407'
ON CONFLICT DO NOTHING;

INSERT INTO schedule_slots (course_id, day_of_week, start_time, end_time)
SELECT c.id, 0, '12:00', '14:00' FROM courses c WHERE c.code = 'COMP 472'
ON CONFLICT DO NOTHING;

INSERT INTO schedule_slots (course_id, day_of_week, start_time, end_time)
SELECT c.id, 0, '15:00', '17:00' FROM courses c WHERE c.code = 'MGTS 403'
ON CONFLICT DO NOTHING;

-- TUESDAY (1)
INSERT INTO schedule_slots (course_id, day_of_week, start_time, end_time)
SELECT c.id, 1, '09:00', '11:00' FROM courses c WHERE c.code = 'COMP 401'
ON CONFLICT DO NOTHING;

INSERT INTO schedule_slots (course_id, day_of_week, start_time, end_time)
SELECT c.id, 1, '12:00', '14:00' FROM courses c WHERE c.code = 'COMP 407'
ON CONFLICT DO NOTHING;

INSERT INTO schedule_slots (course_id, day_of_week, start_time, end_time)
SELECT c.id, 1, '15:00', '16:00' FROM courses c WHERE c.code = 'COMP 409'
ON CONFLICT DO NOTHING;

-- WEDNESDAY (2)
INSERT INTO schedule_slots (course_id, day_of_week, start_time, end_time)
SELECT c.id, 2, '12:00', '14:00' FROM courses c WHERE c.code = 'COMP 488'
ON CONFLICT DO NOTHING;

INSERT INTO schedule_slots (course_id, day_of_week, start_time, end_time)
SELECT c.id, 2, '15:00', '17:00' FROM courses c WHERE c.code = 'MGTS 403'
ON CONFLICT DO NOTHING;

-- THURSDAY (3)
INSERT INTO schedule_slots (course_id, day_of_week, start_time, end_time)
SELECT c.id, 3, '09:00', '10:00' FROM courses c WHERE c.code = 'COMP 409'
ON CONFLICT DO NOTHING;

INSERT INTO schedule_slots (course_id, day_of_week, start_time, end_time)
SELECT c.id, 3, '10:00', '12:00' FROM courses c WHERE c.code = 'COMP 472'
ON CONFLICT DO NOTHING;

INSERT INTO schedule_slots (course_id, day_of_week, start_time, end_time)
SELECT c.id, 3, '13:00', '15:00' FROM courses c WHERE c.code = 'COMP 488'
ON CONFLICT DO NOTHING;

-- FRIDAY (4) — No classes

-- Verify seed
SELECT
  c.code,
  CASE s.day_of_week
    WHEN 0 THEN 'Monday'
    WHEN 1 THEN 'Tuesday'
    WHEN 2 THEN 'Wednesday'
    WHEN 3 THEN 'Thursday'
    WHEN 4 THEN 'Friday'
  END AS day,
  s.start_time,
  s.end_time,
  c.instructor,
  c.room
FROM schedule_slots s
JOIN courses c ON c.id = s.course_id
ORDER BY s.day_of_week, s.start_time;