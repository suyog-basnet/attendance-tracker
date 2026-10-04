import { useEffect, useState } from "react";
import { getExams, createExam, updateExam, deleteExam, getCourses, Exam, Course } from "../api";

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export default function Exams() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [fullMarks, setFullMarks] = useState("");

  const [search, setSearch] = useState("");
  const [filterCourse, setFilterCourse] = useState<string>("all");
  const [filterMode, setFilterMode] = useState<"all" | "upcoming" | "past" | "graded" | "ungraded">("all");

  function load() {
    setLoading(true);
    Promise.all([getExams(), getCourses()])
      .then(([e, c]) => {
        setExams(e.slice().sort((a, b) => (a.exam_date < b.exam_date ? -1 : 1)));
        setCourses(c);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || !title.trim() || !examDate) return;
    await createExam({
      course_id: Number(courseId),
      title: title.trim(),
      exam_date: examDate,
      full_marks: fullMarks ? Number(fullMarks) : null,
    });
    setTitle("");
    setExamDate("");
    setFullMarks("");
    load();
  }

  async function saveMarks(id: number, obtained: string) {
    await updateExam(id, { obtained_marks: obtained === "" ? undefined : Number(obtained) });
    load();
  }

  async function remove(id: number) {
    await deleteExam(id);
    load();
  }

  if (loading) return <p className="page-subtitle">Loading...</p>;

  const upcoming = exams.filter((e) => daysUntil(e.exam_date) >= 0);
  const nearest = upcoming[0];

  const visibleExams = exams.filter((e) => {
    if (search.trim() && !e.title.toLowerCase().includes(search.trim().toLowerCase()) && !e.code?.toLowerCase().includes(search.trim().toLowerCase())) {
      return false;
    }
    if (filterCourse !== "all" && e.course_id !== Number(filterCourse)) return false;
    if (filterMode === "upcoming" && daysUntil(e.exam_date) < 0) return false;
    if (filterMode === "past" && daysUntil(e.exam_date) >= 0) return false;
    if (filterMode === "graded" && e.obtained_marks === null) return false;
    if (filterMode === "ungraded" && e.obtained_marks !== null) return false;
    return true;
  });

  return (
    <div>
      <h2 className="page-title">Exams</h2>
      <p className="page-subtitle">Internal exams, dates, and marks</p>

      {error && (
        <div className="error-banner">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {nearest && (
        <div className="card" style={{ background: "var(--due-soon-bg)", borderColor: "var(--warning)" }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>
            {daysUntil(nearest.exam_date) === 0
              ? "Today"
              : `${daysUntil(nearest.exam_date)} day${daysUntil(nearest.exam_date) === 1 ? "" : "s"}`}{" "}
            to {nearest.code} — {nearest.title}
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
            {nearest.exam_date} · {nearest.course_name}
          </div>
        </div>
      )}

      <form onSubmit={handleAdd} className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">Choose a course...</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.code}</option>
          ))}
        </select>
        <input type="text" placeholder="Title (e.g. First Internal)" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
        <input type="number" placeholder="Full marks" value={fullMarks} onChange={(e) => setFullMarks(e.target.value)} style={{ width: 100 }} />
        <button className="btn primary" type="submit">Schedule exam</button>
      </form>

      <div className="card" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Search exams..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 140 }}
        />
        <select value={filterCourse} onChange={(e) => setFilterCourse(e.target.value)}>
          <option value="all">All subjects</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.code}</option>
          ))}
        </select>
        <select value={filterMode} onChange={(e) => setFilterMode(e.target.value as any)}>
          <option value="all">All</option>
          <option value="upcoming">Upcoming</option>
          <option value="past">Past</option>
          <option value="graded">Graded</option>
          <option value="ungraded">Ungraded</option>
        </select>
      </div>

      {visibleExams.length === 0 ? (
        <div className="empty-state">
          <p>{exams.length === 0 ? "No exams scheduled yet." : "Nothing matches this filter."}</p>
        </div>
      ) : (
        visibleExams.map((e) => {
          const d = daysUntil(e.exam_date);
          return (
            <div key={e.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700 }}>
                  {e.code} — {e.title}
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 2 }}>
                  {e.exam_date} · {d >= 0 ? `in ${d} day${d === 1 ? "" : "s"}` : `${-d} day${-d === 1 ? "" : "s"} ago`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {e.full_marks && (
                  <MarksEditor
                    fullMarks={e.full_marks}
                    obtained={e.obtained_marks}
                    onSave={(v) => saveMarks(e.id, v)}
                  />
                )}
                <button className="btn" onClick={() => remove(e.id)}>Delete</button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function MarksEditor({
  fullMarks,
  obtained,
  onSave,
}: {
  fullMarks: string;
  obtained: string | null;
  onSave: (v: string) => void;
}) {
  const [value, setValue] = useState(obtained ?? "");

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <input
        type="number"
        placeholder="marks"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ width: 70 }}
      />
      <span style={{ color: "var(--text-muted)", fontSize: 13 }}>/ {Number(fullMarks)}</span>
      <button className="btn" onClick={() => onSave(value)}>Save</button>
    </div>
  );
}
