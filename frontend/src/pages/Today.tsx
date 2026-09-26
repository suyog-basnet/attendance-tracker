import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  getToday,
  markAttendance,
  resetAttendance,
  getAttendanceSummary,
  todayLocal,
  DAY_NAMES,
  CourseSlot,
  MAX_EDITS_PER_DAY,
} from "../api";

interface AttendanceState {
  status: "present" | "absent" | null;
  percentage: number | null;
  editCount: number;
}

export default function Today() {
  const [slots, setSlots] = useState<CourseSlot[]>([]);
  const [isWeekend, setIsWeekend] = useState(false);
  const [dayName, setDayName] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<Record<number, AttendanceState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getToday();
      if (data.day === "weekend") {
        setIsWeekend(true);
        setSlots([]);
        return;
      }
      setIsWeekend(false);
      setDayName(DAY_NAMES[data.day as number] ?? null);
      setSlots(data.slots);

      const today = todayLocal();
      const entries = await Promise.all(
        data.slots.map(async (s) => {
          try {
            const summary = await getAttendanceSummary(s.course_id);
            const todayRecord = summary.records?.find((r) => r.date.slice(0, 10) === today);
            return [
              s.course_id,
              {
                status: todayRecord?.status ?? null,
                percentage: summary.percentage,
                editCount: todayRecord?.edit_count ?? 0,
              },
            ] as const;
          } catch {
            return [s.course_id, { status: null, percentage: null, editCount: 0 }] as const;
          }
        })
      );
      setAttendance(Object.fromEntries(entries));
    } catch (err: any) {
      setError(
        err?.message?.includes("Failed to fetch")
          ? "Can't reach the backend. Make sure it's running on http://localhost:3000 (cd backend && npm run dev) and Postgres is up (docker-compose up -d)."
          : `Something went wrong loading today's schedule: ${err.message}`
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleMark(course_id: number, status: "present" | "absent") {
    const today = todayLocal();
    try {
      await markAttendance(course_id, today, status);
      const summary = await getAttendanceSummary(course_id);
      const todayRecord = summary.records?.find((r) => r.date.slice(0, 10) === today);
      setAttendance((prev) => ({
        ...prev,
        [course_id]: { status, percentage: summary.percentage, editCount: todayRecord?.edit_count ?? 0 },
      }));
    } catch (err: any) {
      window.alert(err.message?.includes("409") || err.message?.includes("Locked")
        ? "Already changed twice today — locked until tomorrow."
        : `Couldn't update attendance: ${err.message}`);
    }
  }

  async function handleReset(course_id: number) {
    const today = todayLocal();
    try {
      await resetAttendance(course_id, today);
      const summary = await getAttendanceSummary(course_id);
      const todayRecord = summary.records?.find((r) => r.date.slice(0, 10) === today);
      setAttendance((prev) => ({
        ...prev,
        [course_id]: { status: null, percentage: summary.percentage, editCount: todayRecord?.edit_count ?? prev[course_id]?.editCount ?? 0 },
      }));
    } catch (err: any) {
      window.alert(err.message?.includes("409") || err.message?.includes("Locked")
        ? "Already changed twice today — locked until tomorrow."
        : `Couldn't reset attendance: ${err.message}`);
    }
  }

  if (loading) return <p className="page-subtitle">Loading...</p>;

  return (
    <div>
      <h2 className="page-title">{dayName ?? "Today"}</h2>
      <p className="page-subtitle">
        {new Date().toLocaleDateString("en-US", {
          weekday: undefined,
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone: "Asia/Kathmandu",
        })}
      </p>

      {error && (
        <div className="error-banner">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {isWeekend ? (
        <div className="empty-state">
          <p>No classes today. Enjoy the break.</p>
        </div>
      ) : slots.length === 0 && !error ? (
        <div className="empty-state">
          <p>No classes scheduled.</p>
        </div>
      ) : (
        slots.map((slot) => {
          const state = attendance[slot.course_id] ?? { status: null, percentage: null, editCount: 0 };
          const locked = state.editCount >= MAX_EDITS_PER_DAY;
          const remaining = Math.max(0, MAX_EDITS_PER_DAY - state.editCount);
          return (
            <div className="card" key={slot.slot_id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <Link to={`/course/${slot.course_id}`} style={{ fontWeight: 700, fontSize: 16 }}>
                    {slot.code} — {slot.name}
                  </Link>
                  <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
                    {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)} · {slot.instructor}
                    {slot.room ? ` · ${slot.room}` : ""}
                  </div>
                </div>
                {state.percentage !== null && (
                  <span className="pill">{state.percentage.toFixed(0)}% attended</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
                <button
                  className={"btn" + (state.status === "present" ? " active-present" : "")}
                  onClick={() => handleMark(slot.course_id, "present")}
                  disabled={locked}
                  style={locked ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                >
                  Present
                </button>
                <button
                  className={"btn" + (state.status === "absent" ? " active-absent" : "")}
                  onClick={() => handleMark(slot.course_id, "absent")}
                  disabled={locked}
                  style={locked ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                >
                  Absent
                </button>
                <button
                  className="btn"
                  onClick={() => handleReset(slot.course_id)}
                  disabled={locked}
                  style={locked ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                >
                  Reset
                </button>
                <span style={{ fontSize: 12, color: "var(--text-dim)", marginLeft: 4 }}>
                  {locked ? "🔒 Locked for today" : `${remaining} change${remaining === 1 ? "" : "s"} left today`}
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}