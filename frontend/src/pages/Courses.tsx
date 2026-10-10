import { useEffect, useState } from "react";
import Materials from "../Materials";
import {
  getCourses,
  getAssignments,
  getAttendanceSummary,
  getNextClass,
  Course,
  Assignment,
  AttendanceSummary,
  NextClass,
  DAY_NAMES,
} from "../api";

interface CourseBundle {
  course: Course;
  pendingAssignments: Assignment[];
  summary: AttendanceSummary | null;
  next: NextClass | null;
}

export default function Courses() {
  const [bundles, setBundles] = useState<CourseBundle[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortByRisk, setSortByRisk] = useState(false);

  const displayed = sortByRisk
    ? [...bundles].sort((a, b) => {
        const pa = a.summary?.percentage ?? 100;
        const pb = b.summary?.percentage ?? 100;
        return pa - pb;
      })
    : bundles;

  useEffect(() => {
    (async () => {
      try {
        const [courses, assignments] = await Promise.all([getCourses(), getAssignments()]);

        const data = await Promise.all(
          courses.map(async (course) => {
            const [summary, nextRes] = await Promise.all([
              getAttendanceSummary(course.id).catch(() => null),
              getNextClass(course.id).catch(() => ({ next: null })),
            ]);
            return {
              course,
              pendingAssignments: assignments.filter((a) => a.course_id === course.id && !a.is_done),
              summary,
              next: nextRes.next,
            };
          })
        );

        setBundles(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="page-subtitle">Loading...</p>;

  return (
    <div>
      <h2 className="page-title">Courses</h2>
      <p className="page-subtitle">Everything for each subject, in one place</p>

      <button className="btn" style={{ marginBottom: 16 }} onClick={() => setSortByRisk((v) => !v)}>
        {sortByRisk ? "Sorted: lowest attendance first" : "Sort by lowest attendance"}
      </button>

      {error && (
        <div className="error-banner">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {displayed.map(({ course, pendingAssignments, summary, next }) => {
        const isOpen = expanded === course.id;
        return (
          <div className="card" key={course.id}>
            <div
              onClick={() => setExpanded(isOpen ? null : course.id)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  {course.code} — {course.name}
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 2 }}>{course.instructor}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {summary && summary.percentage !== null && (
                  <span className="pill">{summary.percentage.toFixed(0)}%</span>
                )}
                {pendingAssignments.length > 0 && (
                  <span className="pill" style={{ color: "var(--warning)" }}>
                    {pendingAssignments.length} due
                  </span>
                )}
                <span style={{ color: "var(--text-dim)" }}>{isOpen ? "▲" : "▼"}</span>
              </div>
            </div>

            {isOpen && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>
                    NEXT CLASS
                  </div>
                  {next ? (
                    <div>
                      {DAY_NAMES[next.day_of_week]} · {next.start_time.slice(0, 5)}–{next.end_time.slice(0, 5)}
                    </div>
                  ) : (
                    <div style={{ color: "var(--text-dim)" }}>No upcoming class scheduled</div>
                  )}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>
                    ATTENDANCE
                  </div>
                  {summary ? (
                    <div>
                      {summary.present} present · {summary.absent} absent
                      {summary.percentage !== null ? ` · ${summary.percentage.toFixed(1)}%` : ""}
                    </div>
                  ) : (
                    <div style={{ color: "var(--text-dim)" }}>No attendance recorded yet</div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>
                    ASSIGNMENTS LEFT TO DO ({pendingAssignments.length})
                  </div>
                  {pendingAssignments.length === 0 ? (
                    <div style={{ color: "var(--text-dim)" }}>Nothing pending</div>
                  ) : (
                    pendingAssignments.map((a) => (
                      <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                        <span>{a.title}</span>
                        {a.due_date && (
                          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>{a.due_date.slice(0, 10)}</span>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div style={{ marginTop: 16 }}>
                  <Materials courseId={course.id} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
