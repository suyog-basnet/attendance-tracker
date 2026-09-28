import { useEffect, useState } from "react";
import { getCourses, getExams, Course, Exam } from "./api";

interface Row {
  course: Course;
  gradedCount: number;
  obtained: number;
  full: number;
  pct: number;
}

// Per-course percentage across graded internal exams (total obtained / total
// full marks), then a credit-weighted average across courses. This is a
// percentage, not a grade-point conversion — KU's grade scale isn't encoded here.
export default function MarksSummary() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getCourses(), getExams()])
      .then(([courses, exams]: [Course[], Exam[]]) => {
        const out: Row[] = [];
        for (const course of courses) {
          const graded = exams.filter(
            (e) => e.course_id === course.id && e.obtained_marks !== null && Number(e.full_marks) > 0
          );
          if (!graded.length) continue;
          const obtained = graded.reduce((s, e) => s + Number(e.obtained_marks), 0);
          const full = graded.reduce((s, e) => s + Number(e.full_marks), 0);
          out.push({ course, gradedCount: graded.length, obtained, full, pct: (obtained / full) * 100 });
        }
        setRows(out.sort((a, b) => a.pct - b.pct));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  const totalCredits = rows.reduce((s, r) => s + r.course.credits, 0);
  const weighted = totalCredits > 0 ? rows.reduce((s, r) => s + r.pct * r.course.credits, 0) / totalCredits : null;

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 16, marginBottom: 8 }}>Internal marks</h3>
      {rows.length === 0 ? (
        <p className="page-subtitle">
          No graded exams yet. Add marks on the Exams tab and they'll show up here.
        </p>
      ) : (
        <>
          <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                {weighted !== null ? `${weighted.toFixed(1)}%` : "—"}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                Credit-weighted average · {rows.length} course{rows.length === 1 ? "" : "s"} graded, {totalCredits} credits
              </div>
            </div>
          </div>
          {rows.map((r) => (
            <div key={r.course.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700 }}>{r.course.code} — {r.course.name}</div>
                <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  {r.obtained} / {r.full} across {r.gradedCount} exam{r.gradedCount === 1 ? "" : "s"} · {r.course.credits} credits
                </div>
              </div>
              <span className="pill">{r.pct.toFixed(1)}%</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}