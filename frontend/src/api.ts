// Single source of truth for the backend URL.
// Change this if your backend runs on a different host/port.
const API_BASE = "http://localhost:3000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${body ? `: ${body}` : ""}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---------- Types ----------
export interface CourseSlot {
  slot_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  course_id: number;
  code: string;
  name: string;
  instructor: string;
  room: string | null;
}

export interface TodaySchedule {
  day: number | "weekend";
  slots: CourseSlot[];
}

export interface WeekDay {
  day_of_week: number;
  day_name: string;
  slots: CourseSlot[];
}

export interface WeekSchedule {
  week: WeekDay[];
}

export interface AttendanceRecord {
  id: number;
  course_id: number;
  date: string;
  status: "present" | "absent" | null;
  edit_count: number;
}

export const MAX_EDITS_PER_DAY = 2;

export interface AttendanceSummary {
  present: number;
  absent: number;
  percentage: number | null;
  records?: AttendanceRecord[];
}

export interface Course {
  id: number;
  code: string;
  name: string;
  instructor: string;
  room: string | null;
}

export interface NextClass {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface Semester {
  id: number;
  name: string;
  is_active: boolean;
  attendance_target: number;
  created_at: string;
}

export const getSemesters = () => request<Semester[]>("/semesters");
export const createSemester = (name: string) =>
  request<Semester>("/semesters", { method: "POST", body: JSON.stringify({ name }) });
export const activateSemester = (id: number) =>
  request<Semester>(`/semesters/${id}/activate`, { method: "PATCH" });
export const updateSemesterTarget = (id: number, attendance_target: number) =>
  request<Semester>(`/semesters/${id}/target`, {
    method: "PATCH",
    body: JSON.stringify({ attendance_target }),
  });

export const createCourse = (body: { code: string; name: string; instructor: string; room?: string }) =>
  request<Course>("/courses", { method: "POST", body: JSON.stringify(body) });
export const deleteCourse = (id: number) => request(`/courses/${id}`, { method: "DELETE" });

export const createSlot = (body: { course_id: number; day_of_week: number; start_time: string; end_time: string }) =>
  request("/schedule", { method: "POST", body: JSON.stringify(body) });
export const deleteSlot = (id: number) => request(`/schedule/${id}`, { method: "DELETE" });

export const getCourses = () => request<Course[]>("/courses");
export const getNextClass = (course_id: number) =>
  request<{ next: NextClass | null }>(`/courses/${course_id}/next-class`);

export interface Assignment {
  id: number;
  course_id: number | null;
  title: string;
  due_date: string | null;
  is_done: boolean;
}

// ---------- Schedule ----------
export const getToday = () => request<TodaySchedule>("/schedule/today");
export const getWeek = () => request<WeekSchedule>("/schedule/week");
export const patchSlot = (id: number, body: { start_time?: string; end_time?: string }) =>
  request(`/schedule/${id}`, { method: "PATCH", body: JSON.stringify(body) });

// ---------- Attendance ----------
export const markAttendance = (course_id: number, date: string, status: "present" | "absent") =>
  request("/attendance", { method: "POST", body: JSON.stringify({ course_id, date, status }) });

export const resetAttendance = (course_id: number, date: string) =>
  request("/attendance", { method: "DELETE", body: JSON.stringify({ course_id, date }) });

export const getAttendanceSummary = (course_id: number) =>
  request<AttendanceSummary>(`/attendance/${course_id}/summary`);

// Client-side fallback if the backend can-miss endpoint is unreachable.
// Default target 80% -- the backend's real answer uses the semester's
// actual configured target and should be preferred whenever available.
export function computeCanMiss(present: number, absent: number, targetPct = 80): number {
  const total = present + absent;
  if (total === 0) return 0;
  const canMiss = Math.floor(present / (targetPct / 100) - total);
  return Math.max(0, canMiss);
}

export interface CanMissResult {
  can_miss: number;
  target: number;
}

export async function getCanMiss(course_id: number): Promise<CanMissResult> {
  try {
    const res = await request<{ can_miss: number; target: number }>(`/attendance/${course_id}/can-miss`);
    return { can_miss: res.can_miss, target: res.target };
  } catch {
    const summary = await getAttendanceSummary(course_id);
    return { can_miss: computeCanMiss(summary.present, summary.absent), target: 80 };
  }
}

// ---------- Assignments ----------
export const getAssignments = () => request<Assignment[]>("/assignments");

export const createAssignment = (body: {
  title: string;
  course_id?: number | null;
  due_date?: string | null;
}) => request<Assignment>("/assignments", { method: "POST", body: JSON.stringify(body) });

export const updateAssignment = (id: number, body: Partial<Assignment>) =>
  request<Assignment>(`/assignments/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteAssignment = (id: number) =>
  request(`/assignments/${id}`, { method: "DELETE" });

export function todayLocal(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
}

// ---------- Exams ----------
export interface Exam {
  id: number;
  course_id: number;
  title: string;
  exam_date: string;
  full_marks: string | null;
  obtained_marks: string | null;
  code?: string;
  course_name?: string;
}

export const getExams = () => request<Exam[]>("/exams");
export const getUpcomingExams = () => request<Exam[]>("/exams/upcoming");

export const createExam = (body: {
  course_id: number;
  title: string;
  exam_date: string;
  full_marks?: number | null;
}) => request<Exam>("/exams", { method: "POST", body: JSON.stringify(body) });

export const updateExam = (
  id: number,
  body: { title?: string; exam_date?: string; full_marks?: number | null; obtained_marks?: number | null }
) => request<Exam>(`/exams/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteExam = (id: number) => request(`/exams/${id}`, { method: "DELETE" });

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
