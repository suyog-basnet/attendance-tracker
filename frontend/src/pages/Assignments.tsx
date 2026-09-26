import { useEffect, useState } from "react";
import {
  getAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  getCourses,
  Assignment,
  Course,
} from "../api";

function urgency(due_date: string | null): "overdue" | "soon" | "normal" {
  if (!due_date) return "normal";
  const days = (new Date(due_date).getTime() - Date.now()) / 86400000;
  if (days < 0) return "overdue";
  if (days <= 2) return "soon";
  return "normal";
}

export default function Assignments() {
  const [items, setItems] = useState<Assignment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [courseId, setCourseId] = useState<string>("");

  const [search, setSearch] = useState("");
  const [filterCourse, setFilterCourse] = useState<string>("all");
  const [filterMode, setFilterMode] = useState<"all" | "overdue" | "pending">("all");

  const courseById = (id: number | null) =>
    id === null ? null : courses.find((c) => c.id === id) ?? null;

  const visibleItems = items.filter((a) => {
    if (search.trim() && !a.title.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (filterCourse !== "all") {
      if (filterCourse === "none" ? a.course_id !== null : a.course_id !== Number(filterCourse)) return false;
    }
    if (filterMode === "pending" && a.is_done) return false;
    if (filterMode === "overdue" && urgency(a.due_date) !== "overdue") return false;
    return true;
  });

  function load() {
    setLoading(true);
    getAssignments()
      .then((data) =>
        setItems(
          data.slice().sort((a, b) => {
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return a.due_date < b.due_date ? -1 : 1;
          })
        )
      )
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    getCourses().then(setCourses).catch(() => {});
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await createAssignment({
      title: title.trim(),
      due_date: dueDate || null,
      course_id: courseId ? Number(courseId) : null,
    });
    setTitle("");
    setDueDate("");
    setCourseId("");
    load();
  }

  async function toggleDone(a: Assignment) {
    await updateAssignment(a.id, { is_done: !a.is_done });
    load();
  }

  async function remove(id: number) {
    await deleteAssignment(id);
    load();
  }

  if (loading) return <p className="page-subtitle">Loading...</p>;

  return (
    <div>
      <h2 className="page-title">Assignments</h2>
      <p className="page-subtitle">Track deadlines across all courses</p>

      {error && (
        <div className="error-banner">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleAdd} className="card" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="text"
          placeholder="New assignment title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ flex: 1 }}
        />
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">No subject</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </select>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <button className="btn primary" type="submit">
          Add
        </button>
      </form>

      <div className="card" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search assignments..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        <select value={filterCourse} onChange={(e) => setFilterCourse(e.target.value)}>
          <option value="all">All subjects</option>
          <option value="none">No subject</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </select>
        <select value={filterMode} onChange={(e) => setFilterMode(e.target.value as any)}>
          <option value="all">All</option>
          <option value="pending">Pending only</option>
          <option value="overdue">Overdue only</option>
        </select>
      </div>

      {visibleItems.length === 0 ? (
        <div className="empty-state">
          <p>{items.length === 0 ? "No assignments yet. Add one above." : "Nothing matches this filter."}</p>
        </div>
      ) : (
        visibleItems.map((a) => {
          const u = urgency(a.due_date);
          return (
            <div
              className="card"
              key={a.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: u === "overdue" ? "var(--overdue-bg)" : u === "soon" ? "var(--due-soon-bg)" : undefined,
              }}
            >
              <label style={{ display: "flex", gap: 10, alignItems: "center", flex: 1 }}>
                <input type="checkbox" checked={a.is_done} onChange={() => toggleDone(a)} />
                <span style={{ textDecoration: a.is_done ? "line-through" : "none", opacity: a.is_done ? 0.5 : 1 }}>
                  {a.title}
                </span>
                {courseById(a.course_id) && (
                  <span className="pill">{courseById(a.course_id)!.code}</span>
                )}
              </label>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {a.due_date && (
                  <span
                    style={{
                      fontSize: 12,
                      color: u === "overdue" ? "var(--overdue-text)" : u === "soon" ? "var(--due-soon-text)" : "var(--text-muted)",
                    }}
                  >
                    {a.due_date.slice(0, 10)}
                  </span>
                )}
                <button className="btn" onClick={() => remove(a.id)}>
                  Delete
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
