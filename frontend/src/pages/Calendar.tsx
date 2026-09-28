import { useEffect, useMemo, useState } from "react";
import {
  getWeek,
  getExams,
  getAssignments,
  getAttendanceByDate,
  todayLocal,
  WeekDay,
  Exam,
  Assignment,
  AttendanceByDate,
} from "../api";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Build 'YYYY-MM-DD' by hand. Going through Date/toISOString would shift the
// day for anyone not in UTC — the same off-by-one trap we already fixed once.
function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Schedule days are 0=Mon..4=Fri; JS getDay() is 0=Sun..6=Sat.
function scheduleIndex(jsDow: number): number {
  return jsDow >= 1 && jsDow <= 5 ? jsDow - 1 : -1;
}

function AttBadge({ status, reason }: { status: "present" | "absent" | "cancelled"; reason: string | null }) {
  const color = status === "present" ? "var(--present)" : status === "absent" ? "var(--absent)" : "var(--warning)";
  const label = status === "cancelled" ? `Not held${reason ? ` · ${reason}` : ""}` : status === "present" ? "Present" : "Absent";
  return (
    <span className="pill" style={{ color, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

export default function Calendar() {
  const todayStr = todayLocal();
  const [ty, tm] = todayStr.split("-").map(Number);
  const [year, setYear] = useState(ty);
  const [month, setMonth] = useState(tm - 1); // 0-based
  const [selected, setSelected] = useState<string>(todayStr);

  const [week, setWeek] = useState<WeekDay[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [attendance, setAttendance] = useState<AttendanceByDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getWeek(), getExams(), getAssignments()])
      .then(([w, e, a]) => {
        setWeek(w.week);
        setExams(e);
        setAssignments(a.filter((x) => !x.is_done));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Attendance is fetched per visible month, so paging through months stays cheap.
  useEffect(() => {
    const lastDay = new Date(year, month + 1, 0).getDate();
    getAttendanceByDate(ymd(year, month, 1), ymd(year, month, lastDay))
      .then(setAttendance)
      .catch(() => setAttendance([]));
  }, [year, month]);

  const attByDate = useMemo(() => {
    const m: Record<string, AttendanceByDate[]> = {};
    attendance.forEach((a) => (m[a.date] ||= []).push(a));
    return m;
  }, [attendance]);

  const examsByDate = useMemo(() => {
    const m: Record<string, Exam[]> = {};
    exams.forEach((e) => (m[e.exam_date] ||= []).push(e));
    return m;
  }, [exams]);

  const dueByDate = useMemo(() => {
    const m: Record<string, Assignment[]> = {};
    assignments.forEach((a) => a.due_date && (m[a.due_date] ||= []).push(a));
    return m;
  }, [assignments]);

  function classesOn(dateStr: string) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const idx = scheduleIndex(new Date(y, m - 1, d).getDay());
    return idx === -1 ? [] : week[idx]?.slots ?? [];
  }

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  function goToday() {
    setYear(ty);
    setMonth(tm - 1);
    setSelected(todayStr);
  }

  if (loading) return <p className="page-subtitle">Loading...</p>;

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const selClasses = classesOn(selected);
  const selExams = examsByDate[selected] ?? [];
  const selDue = dueByDate[selected] ?? [];
  const selAtt = attByDate[selected] ?? [];

  return (
    <div>
      <h2 className="page-title">Calendar</h2>
      <p className="page-subtitle">Classes, exams, and assignment deadlines in one view</p>

      {error && (
        <div className="error-banner">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => shiftMonth(-1)}>‹</button>
          <button className="btn" onClick={() => shiftMonth(1)}>›</button>
          <button className="btn" onClick={goToday}>Today</button>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>
          {MONTHS[month]} {year}
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
        <span><span style={{ color: "var(--absent)" }}>●</span> Exam</span>
        <span><span style={{ color: "var(--warning)" }}>●</span> Assignment due</span>
        <span><span style={{ color: "var(--primary)" }}>●</span> Classes</span>
        <span><span style={{ color: "var(--present)" }}>✓</span> Present</span>
        <span><span style={{ color: "var(--absent)" }}>✗</span> Absent</span>
        <span><span style={{ color: "var(--warning)" }}>⊘</span> Not held</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ textAlign: "center", fontSize: 12, color: "var(--text-dim)", padding: "4px 0" }}>
            {w}
          </div>
        ))}

        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const dateStr = ymd(year, month, day);
          const ex = examsByDate[dateStr] ?? [];
          const due = dueByDate[dateStr] ?? [];
          const classCount = classesOn(dateStr).length;
          const att = attByDate[dateStr] ?? [];
          const nPresent = att.filter((a) => a.status === "present").length;
          const nAbsent = att.filter((a) => a.status === "absent").length;
          const nHeld = att.filter((a) => a.status === "cancelled").length;
          const isToday = dateStr === todayStr;
          const isSel = dateStr === selected;
          return (
            <button
              key={i}
              onClick={() => setSelected(dateStr)}
              style={{
                minHeight: 74,
                textAlign: "left",
                padding: 6,
                borderRadius: "var(--radius-sm)",
                background: isSel ? "var(--bg-card-hov)" : "var(--bg-card)",
                border: `1px solid ${isToday ? "var(--primary)" : isSel ? "var(--border-light)" : "var(--border)"}`,
                color: "var(--text)",
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: isToday ? 700 : 500, color: isToday ? "var(--primary)" : "var(--text)" }}>
                {day}
              </span>
              {ex.length > 0 && (
                <span style={{ fontSize: 11, color: "var(--absent)" }}>● {ex.length} exam{ex.length > 1 ? "s" : ""}</span>
              )}
              {due.length > 0 && (
                <span style={{ fontSize: 11, color: "var(--warning)" }}>● {due.length} due</span>
              )}
              {classCount > 0 && (
                <span style={{ fontSize: 11, color: "var(--primary)" }}>● {classCount} class{classCount > 1 ? "es" : ""}</span>
              )}
              {att.length > 0 && (
                <span style={{ fontSize: 11, display: "flex", gap: 6 }}>
                  {nPresent > 0 && <span style={{ color: "var(--present)" }}>✓{nPresent}</span>}
                  {nAbsent > 0 && <span style={{ color: "var(--absent)" }}>✗{nAbsent}</span>}
                  {nHeld > 0 && <span style={{ color: "var(--warning)" }}>⊘{nHeld}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <h3 style={{ fontSize: 16, margin: "24px 0 4px" }}>{selected}</h3>
      {selAtt.length > 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 10px" }}>
          Attendance: {selAtt.filter((a) => a.status === "present").length} present ·{" "}
          {selAtt.filter((a) => a.status === "absent").length} absent ·{" "}
          {selAtt.filter((a) => a.status === "cancelled").length} not held
        </p>
      )}

      {selExams.length === 0 && selDue.length === 0 && selClasses.length === 0 && (
        <p className="page-subtitle">Nothing scheduled this day.</p>
      )}

      {selExams.map((e) => (
        <div key={`e${e.id}`} className="card" style={{ borderLeft: "3px solid var(--absent)" }}>
          <div style={{ fontWeight: 700 }}>{e.code} — {e.title}</div>
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Exam · {e.course_name}</div>
        </div>
      ))}

      {selDue.map((a) => (
        <div key={`a${a.id}`} className="card" style={{ borderLeft: "3px solid var(--warning)" }}>
          <div style={{ fontWeight: 700 }}>{a.title}</div>
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Assignment due{a.course_code ? ` · ${a.course_code}` : ""}
          </div>
        </div>
      ))}

      {selClasses.map((s) => {
        const rec = selAtt.find((a) => a.course_id === s.course_id);
        return (
          <div
            key={`c${s.slot_id}`}
            className="card"
            style={{ borderLeft: "3px solid var(--primary)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>{s.code} — {s.name}</div>
              <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} · {s.instructor}
                {s.room ? ` · ${s.room}` : ""}
              </div>
            </div>
            {rec ? (
              <AttBadge status={rec.status} reason={rec.reason} />
            ) : selected <= todayStr ? (
              <span className="pill" style={{ color: "var(--text-dim)" }}>Not marked</span>
            ) : null}
          </div>
        );
      })}

      {selAtt
        .filter((a) => !selClasses.some((s) => s.course_id === a.course_id))
        .map((a) => (
          <div
            key={`x${a.course_id}`}
            className="card"
            style={{ borderLeft: "3px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>{a.code} — {a.course_name}</div>
              <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Attendance record (not in the current weekly schedule)</div>
            </div>
            <AttBadge status={a.status} reason={a.reason} />
          </div>
        ))}
    </div>
  );
}
