import { useEffect, useState } from "react";
import { getAttendanceByDate, getAssignments, getExams, todayLocal } from "./api";

// Returns [mondayStr, sundayStr] for the week containing todayLocal().
// Parsed at UTC noon so no server/browser timezone can shift the calendar day.
function weekRange(todayStr: string): [string, string] {
  const d = new Date(`${todayStr}T12:00:00Z`);
  const jsDow = d.getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = jsDow === 0 ? -6 : 1 - jsDow;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  return [fmt(monday), fmt(sunday)];
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export default function WeeklySummary() {
  const [loading, setLoading] = useState(true);
  const [present, setPresent] = useState(0);
  const [marked, setMarked] = useState(0); // present + absent (not-held excluded, same rule as everywhere else)
  const [assignDone, setAssignDone] = useState(0);
  const [assignTotal, setAssignTotal] = useState(0);
  const [examsSoon, setExamsSoon] = useState(0);

  useEffect(() => {
    const today = todayLocal();
    const [start, end] = weekRange(today);

    Promise.all([getAttendanceByDate(start, end), getAssignments(), getExams()])
      .then(([att, assignments, exams]) => {
        const p = att.filter((a) => a.status === "present").length;
        const a = att.filter((a) => a.status === "absent").length;
        setPresent(p);
        setMarked(p + a);

        const dueThisWeek = assignments.filter((x) => x.due_date && x.due_date >= start && x.due_date <= end);
        setAssignTotal(dueThisWeek.length);
        setAssignDone(dueThisWeek.filter((x) => x.is_done).length);

        setExamsSoon(exams.filter((e) => { const d = daysUntil(e.exam_date); return d >= 0 && d <= 7; }).length);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (marked === 0 && assignTotal === 0 && examsSoon === 0) return null;

  const parts: string[] = [];
  if (marked > 0) parts.push(`${present}/${marked} classes attended`);
  if (assignTotal > 0) parts.push(`${assignDone}/${assignTotal} assignments due this week done`);
  if (examsSoon > 0) parts.push(`${examsSoon} exam${examsSoon === 1 ? "" : "s"} coming up in 7 days`);

  return (
    <div className="card" style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>THIS WEEK</span>
      {parts.map((p, i) => (
        <span key={i} className="pill">{p}</span>
      ))}
    </div>
  );
}