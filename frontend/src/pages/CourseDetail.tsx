import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getAttendanceSummary, getCanMiss, AttendanceSummary } from "../api";

export default function CourseDetail() {
  const { id } = useParams();
  const courseId = Number(id);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [canMiss, setCanMiss] = useState<number | null>(null);
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
                You can miss {canMiss} more class{canMiss === 1 ? "" : "es"}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
                and stay at or above 75% attendance
              </div>
            </div>
          )}

          <h3 style={{ marginTop: 24, fontSize: 16 }}>History</h3>
          {summary.records && summary.records.length > 0 ? (
            summary.records
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
