import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import MarksSummary from "../MarksSummary";
import { getCourses, getAssignments, getAttendanceSummary, getSemesters, Course, Assignment, AttendanceSummary } from "../api";

interface Row {
  course: Course;
  summary: AttendanceSummary | null;
}

export default function Stats() {
  const [rows, setRows] = useState<Row[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState(80);

  useEffect(() => {
    (async () => {
      try {
        const [courses, assignmentList, semesters] = await Promise.all([getCourses(), getAssignments(), getSemesters()]);
        const active = semesters.find((s) => s.is_active);
        if (active) setTarget(active.attendance_target);
        const data = await Promise.all(
          courses.map(async (course) => ({
            course,
            summary: await getAttendanceSummary(course.id).catch(() => null),
          }))
        );
        setRows(data);
        setAssignments(assignmentList);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="page-subtitle">Loading...</p>;

  const totalPresent = rows.reduce((sum, r) => sum + (r.summary?.present ?? 0), 0);
  const totalAbsent = rows.reduce((sum, r) => sum + (r.summary?.absent ?? 0), 0);
  const overallPct = totalPresent + totalAbsent > 0 ? (totalPresent / (totalPresent + totalAbsent)) * 100 : null;

  const atRisk = rows
    .filter((r) => r.summary?.percentage !== null && r.summary!.percentage! < target + 10)
    .sort((a, b) => (a.summary!.percentage! ?? 0) - (b.summary!.percentage! ?? 0));

  const pendingAssignments = assignments.filter((a) => !a.is_done);

  return (
    <div>
      <h2 className="page-title">Stats</h2>
      <p className="page-subtitle">Overall picture across every subject</p>

      {error && (
        <div className="error-banner">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <div className="card" style={{ flex: 1 }}>
          <div style={{ fontSize: 32, fontWeight: 700 }}>
            {overallPct !== null ? `${overallPct.toFixed(1)}%` : "—"}
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Overall attendance</div>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{totalPresent + totalAbsent}</div>
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Total classes recorded</div>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{pendingAssignments.length}</div>
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Assignments pending</div>
        </div>
      </div>

      <h3 style={{ fontSize: 16, marginBottom: 8 }}>Subjects closest to falling below {target}%</h3>
      {atRisk.length === 0 ? (
        <p className="page-subtitle">Nothing close to the line — you're in good shape.</p>
      ) : (
        atRisk.map((r) => {
          const pct = r.summary!.percentage!;
          const below = pct < target;
          return (
            <Link to={`/course/${r.course.id}`} key={r.course.id}>
              <div
                className="card"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: below ? "var(--overdue-bg)" : "var(--due-soon-bg)",
                }}
              >
                <span>
                  {r.course.code} — {r.course.name}
                </span>
                <span
                  className="pill"
                  style={{ color: below ? "var(--overdue-text)" : "var(--due-soon-text)" }}
                >
                  {pct.toFixed(1)}%
                </span>
              </div>
            </Link>
          );
        })
      )}

      <div style={{ marginTop: 24 }}>
        <MarksSummary />
      </div>

      <h3 style={{ fontSize: 16, margin: "24px 0 8px" }}>Pending assignments</h3>
      {pendingAssignments.length === 0 ? (
        <p className="page-subtitle">Nothing pending — you're all caught up.</p>
      ) : (
        pendingAssignments
          .slice()
          .sort((a, b) => {
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return a.due_date < b.due_date ? -1 : 1;
          })
          .map((a) => (
            <div className="card" key={a.id} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{a.title}</span>
              {a.due_date && <span style={{ color: "var(--text-muted)", fontSize: 13 }}>{a.due_date.slice(0, 10)}</span>}
            </div>
          ))
      )}
    </div>
  );
}