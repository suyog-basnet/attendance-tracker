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
  created_at: string;
}

export const getSemesters = () => request<Semester[]>("/semesters");
export const createSemester = (name: string) =>
  request<Semester>("/semesters", { method: "POST", body: JSON.stringify({ name }) });
export const activateSemester = (id: number) =>
  request<Semester>(`/semesters/${id}/activate`, { method: "PATCH" });

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

// Client-side fallback if the backend has no dedicated can-miss endpoint.
// classes_can_miss = floor((present / 0.75) - (present + absent)), floored at 0
export function computeCanMiss(present: number, absent: number): number {
  const total = present + absent;
  if (total === 0) return 0;
  const canMiss = Math.floor(present / 0.75 - total);
  return Math.max(0, canMiss);
}

export async function getCanMiss(course_id: number): Promise<number> {
  try {
    const res = await request<{ can_miss: number }>(`/attendance/${course_id}/can-miss`);
    return res.can_miss;
  } catch {
    const summary = await getAttendanceSummary(course_id);
    return computeCanMiss(summary.present, summary.absent);
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

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
