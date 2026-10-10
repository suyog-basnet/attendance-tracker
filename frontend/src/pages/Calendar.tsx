import { useEffect, useMemo, useState } from "react";
import {
  getWeek,
  getExams,
  getAssignments,
  getAttendanceByDate,
  markAttendance,
  resetAttendance,
  markDayHoliday,
  markHolidayRange,
  clearHolidayRange,
  NOT_HELD_REASONS,
  MAX_EDITS_PER_DAY,
  todayLocal,
  HolidayResult,
  WeekDay,
  Exam,
  Assignment,
  AttendanceByDate,
} from "../api";

type Status = "present" | "absent" | "cancelled";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const LOCK_MSG = "Already changed twice that day — it's locked.";

// Build 'YYYY-MM-DD' by hand. Going through Date/toISOString would shift the
// day for anyone not in UTC — the same off-by-one trap we already fixed once.
function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Schedule days are 0=Mon..4=Fri; JS getDay() is 0=Sun..6=Sat.
function scheduleIndex(jsDow: number): number {
  return jsDow >= 1 && jsDow <= 5 ? jsDow - 1 : -1;
}

// Inclusive day count between two YYYY-MM-DD strings.
function daysBetween(a: string, b: string): number {
  const t1 = new Date(`${a}T12:00:00Z`).getTime();
  const t2 = new Date(`${b}T12:00:00Z`).getTime();
  return Math.round((t2 - t1) / 86400000) + 1;
}

function AttBadge({ status, reason }: { status: Status; reason: string | null }) {
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
  const [holidayBusy, setHolidayBusy] = useState(false);

  // course_id whose "why wasn't it held?" picker is open
  const [pickingReason, setPickingReason] = useState<number | null>(null);

  // holiday / vacation range
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [rangeReason, setRangeReason] = useState("Holiday");
  const [rangeBusy, setRangeBusy] = useState(false);
  const [rangeMsg, setRangeMsg] = useState<{ text: string; error: boolean } | null>(null);

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
  function refreshAttendance() {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return getAttendanceByDate(ymd(year, month, 1), ymd(year, month, lastDay))
      .then(setAttendance)
      .catch(() => setAttendance([]));
  }

  useEffect(() => {
    refreshAttendance();
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

  // ── marking attendance on ANY selected day ────────────────────────────────
  async function handleMark(course_id: number, status: Status, reason?: string) {
    try {
      await markAttendance(course_id, selected, status, reason);
    } catch (err: any) {
      window.alert(/409|Locked/i.test(err.message) ? LOCK_MSG : `Couldn't update attendance: ${err.message}`);
    }
    await refreshAttendance();
  }

  async function handleReset(course_id: number) {
    try {
      await resetAttendance(course_id, selected);
    } catch (err: any) {
      window.alert(/409|Locked/i.test(err.message) ? LOCK_MSG : `Couldn't reset: ${err.message}`);
    }
    await refreshAttendance();
  }

  function describeHoliday(r: HolidayResult): string {
    const bits = [];
    if (r.applied.length) bits.push(`marked not held: ${r.applied.join(", ")}`);
    if (r.already.length) bits.push(`already not held: ${r.already.join(", ")}`);
    if (r.locked.length) bits.push(`couldn't change (already edited twice that day): ${r.locked.join(", ")}`);
    return bits.length ? bits.join(" · ") : "No classes scheduled that day.";
  }

  async function handleHoliday() {
    const classCount = classesOn(selected).length;
    if (!window.confirm(`Mark all ${classCount} class${classCount === 1 ? "" : "es"} on ${selected} as not held?`)) {
      return;
    }
    setHolidayBusy(true);
    try {
      window.alert(describeHoliday(await markDayHoliday(selected, "Holiday")));
      await refreshAttendance();
    } catch (err: any) {
      window.alert(`Couldn't mark the day as a holiday: ${err.message}`);
    } finally {
      setHolidayBusy(false);
    }
  }

  // ── holiday / vacation range ──────────────────────────────────────────────
  const rangeValid = Boolean(rangeStart && rangeEnd && rangeStart <= rangeEnd);
  const rangeDays = rangeValid ? daysBetween(rangeStart, rangeEnd) : 0;
  const rangeReasonClean = rangeReason.trim() || "Holiday";

  async function handleRangeApply() {
    if (!rangeValid) return;
    if (
      !window.confirm(
        `Mark every class from ${rangeStart} to ${rangeEnd} (${rangeDays} day${rangeDays === 1 ? "" : "s"}) as not held — "${rangeReasonClean}"?\n\nThese days won't count for or against your attendance.`
      )
    ) {
      return;
    }
    setRangeBusy(true);
    setRangeMsg(null);
    try {
      const r = await markHolidayRange(rangeStart, rangeEnd, rangeReasonClean);
      let text = `Marked ${r.applied} class${r.applied === 1 ? "" : "es"} across ${r.class_days} class day${
        r.class_days === 1 ? "" : "s"
      } as not held (“${rangeReasonClean}”).`;
      if (r.already) text += ` ${r.already} ${r.already === 1 ? "was" : "were"} already not held.`;
      if (r.locked) {
        text += ` ${r.locked} couldn't be changed (already edited twice): ${r.locked_details
          .map((d) => `${d.date} ${d.courses.join(", ")}`)
          .join("; ")}.`;
      }
      setRangeMsg({ text, error: false });
      await refreshAttendance();
    } catch (err: any) {
      setRangeMsg({ text: `Couldn't mark the range: ${err.message}`, error: true });
    } finally {
      setRangeBusy(false);
    }
  }

  async function handleRangeClear() {
    if (!rangeValid) return;
    if (
      !window.confirm(
        `Remove the “${rangeReasonClean}” not-held marks from ${rangeStart} to ${rangeEnd}?\n\nDays you've since changed by hand, and not-held days with a different reason, are left alone.`
      )
    ) {
      return;
    }
    setRangeBusy(true);
    setRangeMsg(null);
    try {
      const r = await clearHolidayRange(rangeStart, rangeEnd, rangeReasonClean);
      let text = `Removed ${r.removed} “${rangeReasonClean}” mark${r.removed === 1 ? "" : "s"}; those days are back to unmarked.`;
      if (r.kept_edited) text += ` Kept ${r.kept_edited} you'd edited by hand.`;
      setRangeMsg({ text, error: false });
      await refreshAttendance();
    } catch (err: any) {
      setRangeMsg({ text: `Couldn't remove the marks: ${err.message}`, error: true });
    } finally {
      setRangeBusy(false);
    }
  }

  // Moving to another month moves the selection with it, so the details panel
  // (and its marking buttons) always belong to a month whose data is loaded.
  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setSelected(ymd(d.getFullYear(), d.getMonth(), 1));
    setPickingReason(null);
  }

  function goToday() {
    setYear(ty);
    setMonth(tm - 1);
    setSelected(todayStr);
    setPickingReason(null);
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
  const selIsFuture = selected > todayStr;

  return (
    <div>
      <h2 className="page-title">Calendar</h2>
      <p className="page-subtitle">Classes, exams, deadlines — and fix attendance on any day</p>

      {error && (
        <div className="error-banner">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* ───────── Holiday / vacation range ───────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700 }}>🏖️ Holiday / vacation range</div>
        <div style={{ color: "var(--text-muted)", fontSize: 13, margin: "2px 0 10px" }}>
          Marks every class between two dates as not held in one go — they won't count for or against your
          attendance. Pick the dates below, or click a day on the calendar and use “Use selected day”.
        </div>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
            From
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} aria-label="Range start" />
              <button className="btn" type="button" onClick={() => setRangeStart(selected)}>Use selected day</button>
            </div>
          </label>
          <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
            To
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} aria-label="Range end" />
              <button className="btn" type="button" onClick={() => setRangeEnd(selected)}>Use selected day</button>
            </div>
          </label>
          <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Reason
            <div style={{ marginTop: 4 }}>
              <input
                type="text"
                value={rangeReason}
                maxLength={100}
                onChange={(e) => setRangeReason(e.target.value)}
                placeholder="Holiday"
                style={{ width: 160 }}
                aria-label="Range reason"
              />
            </div>
          </label>
        </div>

        {rangeStart && rangeEnd && rangeStart > rangeEnd && (
          <div style={{ color: "var(--overdue-text)", fontSize: 13, marginTop: 8 }}>
            The start date has to be on or before the end date.
          </div>
        )}
        {rangeValid && (
          <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8 }}>
            {rangeDays} day{rangeDays === 1 ? "" : "s"} selected — highlighted on the calendar below.
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button className="btn primary" disabled={!rangeValid || rangeBusy} onClick={handleRangeApply}>
            {rangeBusy ? "Working..." : "Mark range as holiday"}
          </button>
          <button className="btn" disabled={!rangeValid || rangeBusy} onClick={handleRangeClear}>
            Remove these holiday marks
          </button>
          {(rangeStart || rangeEnd) && (
            <button
              className="btn"
              disabled={rangeBusy}
              onClick={() => {
                setRangeStart("");
                setRangeEnd("");
                setRangeMsg(null);
              }}
            >
              Clear dates
            </button>
          )}
        </div>

        {rangeMsg && (
          <div style={{ marginTop: 10, fontSize: 13, color: rangeMsg.error ? "var(--overdue-text)" : "var(--present)" }}>
            {rangeMsg.text}
          </div>
        )}
      </div>

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

      <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--text-muted)", marginBottom: 8, flexWrap: "wrap" }}>
        <span><span style={{ color: "var(--absent)" }}>●</span> Exam</span>
        <span><span style={{ color: "var(--warning)" }}>●</span> Assignment due</span>
        <span><span style={{ color: "var(--primary)" }}>●</span> Classes</span>
        <span><span style={{ color: "var(--present)" }}>✓</span> Present</span>
        <span><span style={{ color: "var(--absent)" }}>✗</span> Absent</span>
        <span><span style={{ color: "var(--warning)" }}>⊘</span> Not held</span>
        {rangeValid && <span><span style={{ color: "var(--warning)" }}>▮</span> Selected range</span>}
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
          const inRange = rangeValid && dateStr >= rangeStart && dateStr <= rangeEnd;
          return (
            <button
              key={i}
              data-date={dateStr}
              data-in-range={inRange ? "true" : undefined}
              onClick={() => {
                setSelected(dateStr);
                setPickingReason(null);
              }}
              style={{
                minHeight: 74,
                textAlign: "left",
                padding: 6,
                borderRadius: "var(--radius-sm)",
                background: inRange ? "var(--due-soon-bg)" : isSel ? "var(--bg-card-hov)" : "var(--bg-card)",
                border: `1px solid ${isToday ? "var(--primary)" : isSel ? "var(--border-light)" : inRange ? "var(--warning)" : "var(--border)"}`,
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
              {att.length > 0 && (nPresent > 0 || nAbsent > 0 || nHeld > 0) && (
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "24px 0 4px" }}>
        <h3 style={{ fontSize: 16, margin: 0 }}>{selected}</h3>
        {selClasses.length > 0 && (
          <button className="btn" disabled={holidayBusy} onClick={handleHoliday}>
            {holidayBusy ? "..." : "📅 Mark this day as holiday"}
          </button>
        )}
      </div>
      {selAtt.some((a) => a.status !== null) && (
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 10px" }}>
          Attendance: {selAtt.filter((a) => a.status === "present").length} present ·{" "}
          {selAtt.filter((a) => a.status === "absent").length} absent ·{" "}
          {selAtt.filter((a) => a.status === "cancelled").length} not held
        </p>
      )}
      {selIsFuture && selClasses.length > 0 && (
        <p style={{ color: "var(--text-dim)", fontSize: 12, margin: "0 0 10px" }}>
          This day hasn't happened yet — you can mark it “Not held” in advance (e.g. a planned holiday).
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
        const status = rec?.status ?? null;
        const editCount = rec?.edit_count ?? 0;
        const locked = editCount >= MAX_EDITS_PER_DAY;
        const remaining = Math.max(0, MAX_EDITS_PER_DAY - editCount);
        const disabledStyle = locked ? { opacity: 0.4, cursor: "not-allowed" } : undefined;
        return (
          <div
            key={`c${s.slot_id}`}
            className="card"
            data-course={s.code}
            style={{ borderLeft: "3px solid var(--primary)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{s.code} — {s.name}</div>
                <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} · {s.instructor}
                  {s.room ? ` · ${s.room}` : ""}
                </div>
              </div>
              {status ? (
                <AttBadge status={status} reason={rec?.reason ?? null} />
              ) : !selIsFuture ? (
                <span className="pill" style={{ color: "var(--text-dim)" }}>Not marked</span>
              ) : null}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
              {!selIsFuture && (
                <>
                  <button
                    className={"btn" + (status === "present" ? " active-present" : "")}
                    disabled={locked}
                    style={disabledStyle}
                    onClick={() => handleMark(s.course_id, "present")}
                  >
                    Present
                  </button>
                  <button
                    className={"btn" + (status === "absent" ? " active-absent" : "")}
                    disabled={locked}
                    style={disabledStyle}
                    onClick={() => handleMark(s.course_id, "absent")}
                  >
                    Absent
                  </button>
                </>
              )}
              <button
                className={"btn" + (status === "cancelled" ? " active-cancelled" : "")}
                disabled={locked}
                style={disabledStyle}
                title="Class wasn't held — doesn't count for or against your attendance"
                onClick={() => setPickingReason(pickingReason === s.course_id ? null : s.course_id)}
              >
                Not held
              </button>
              {status !== null && (
                <button className="btn" disabled={locked} style={disabledStyle} onClick={() => handleReset(s.course_id)}>
                  Reset
                </button>
              )}
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                {locked ? "🔒 Locked for this day" : `${remaining} change${remaining === 1 ? "" : "s"} left`}
              </span>
            </div>

            {pickingReason === s.course_id && !locked && (
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Why wasn't it held?</span>
                {NOT_HELD_REASONS.map((r) => (
                  <button
                    key={r}
                    className="btn"
                    onClick={() => {
                      setPickingReason(null);
                      handleMark(s.course_id, "cancelled", r);
                    }}
                  >
                    {r}
                  </button>
                ))}
                <button className="btn" onClick={() => setPickingReason(null)}>Cancel</button>
              </div>
            )}
          </div>
        );
      })}

      {selAtt
        .filter((a) => a.status !== null && !selClasses.some((s) => s.course_id === a.course_id))
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
            <AttBadge status={a.status as Status} reason={a.reason} />
          </div>
        ))}
    </div>
  );
}
