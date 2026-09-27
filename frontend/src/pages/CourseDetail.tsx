import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getAttendanceSummary, getCanMiss, AttendanceSummary, CanMissResult } from "../api";

function exportCsv(courseId: number, records: { date: string; status: string | null }[]) {
  const rows = records.filter((r) => r.status !== null);
  const header = "date,status";
  const body = rows.map((r) => `${r.date.slice(0, 10)},${r.status}`).join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendance_course_${courseId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CourseDetail() {
  const { id } = useParams();
  const courseId = Number(id);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [canMiss, setCanMiss] = useState<CanMissResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) return;
    Promise.all([getAttendanceSummary(courseId), getCanMiss(courseId)])
      .then(([s, c]) => {
        setSummary(s);
        setCanMiss(c);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [courseId]);

  if (loading) return <p className="page-subtitle">Loading...</p>;

  return (
    <div>
      <Link to="/" style={{ color: "var(--text-muted)", fontSize: 13 }}>
        ← Back
      </Link>
      <h2 className="page-title" style={{ marginTop: 12 }}>
        Course Attendance
      </h2>

      {error && (
        <div className="error-banner">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {summary && (
        <>
          <div className="card">
            <div style={{ fontSize: 32, fontWeight: 700 }}>
              {summary.percentage !== null ? `${summary.percentage.toFixed(1)}%` : "—"}
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
              {summary.present} present · {summary.absent} absent
            </div>
          </div>

          {canMiss !== null && (
            <div className="card">
              <div style={{ fontWeight: 700 }}>
                You can miss {canMiss.can_miss} more class{canMiss.can_miss === 1 ? "" : "es"}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
                and stay at or above {canMiss.target}% attendance
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24 }}>
            <h3 style={{ fontSize: 16, margin: 0 }}>History</h3>
            {summary.records && summary.records.some((r) => r.status !== null) && (
              <button className="btn" onClick={() => exportCsv(courseId, summary.records!)}>
                Export CSV
              </button>
            )}
          </div>
          {summary.records && summary.records.filter((r) => r.status !== null).length > 0 ? (
            summary.records
              .filter((r) => r.status !== null)
              .slice()
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .map((r) => (
                <div
                  className="card"
                  key={r.id}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <span>{r.date.slice(0, 10)}</span>
                  <span className="pill" style={{ color: r.status === "present" ? "var(--present)" : "var(--absent)" }}>
                    {r.status}
                  </span>
                </div>
              ))
          ) : (
            <p className="page-subtitle">No attendance recorded yet.</p>
          )}
        </>
      )}
    </div>
  );
}
