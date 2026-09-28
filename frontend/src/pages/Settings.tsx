import { useEffect, useState } from "react";
import {
  getWeek,
  patchSlot,
  deleteSlot,
  getSemesters,
  createSemester,
  activateSemester,
  updateSemesterTarget,
  getCourses,
  createCourse,
  deleteCourse,
  createSlot,
  sendTestPush,
  PushTestResult,
  WeekDay,
  Semester,
  Course,
} from "../api";
import InstallPrompt from "../InstallPrompt";
import {
  enableNotifications,
  disableNotifications,
  getSubscriptionStatus,
  isPushSupported,
  showLocalTestNotification,
} from "../notifications";

const DAY_OPTIONS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export default function Settings() {
  const [days, setDays] = useState<WeekDay[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [newSemesterName, setNewSemesterName] = useState("");
  const [notifStatus, setNotifStatus] = useState<"unknown" | "on" | "off">("unknown");
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  function describeTest(r: PushTestResult): string {
    if (r.skipped) return r.skipped;
    if (!r.subscriptions) return "No browser is subscribed yet — turn notifications on first.";
    if (r.failed && !r.sent) {
      return `The server couldn't deliver it: ${r.errors?.[0] ?? "unknown error"}. If "Test in browser" works but this doesn't, the push service is being blocked — usually the network or an ad-blocker.`;
    }
    return `Sent to ${r.sent} browser${r.sent === 1 ? "" : "s"}.${r.preview ? ` Message: "${r.preview}"` : ""}`;
  }

  async function runTest(kind: "local" | "ping" | "schedule" | "assignments") {
    setTestBusy(kind);
    setTestMsg(null);
    try {
      if (kind === "local") {
        const r = await showLocalTestNotification();
        setTestMsg(
          r.ok
            ? "Sent — a notification should appear now. If it doesn't, check your system's Do Not Disturb / Focus mode."
            : r.reason ?? "Couldn't show a notification."
        );
      } else {
        setTestMsg(describeTest(await sendTestPush(kind)));
      }
    } catch (err: any) {
      setTestMsg(err.message ?? "Test failed.");
    } finally {
      setTestBusy(null);
    }
  }

  useEffect(() => {
    getSubscriptionStatus().then((sub) => setNotifStatus(sub ? "on" : "off"));
  }, []);

  async function handleToggleNotifications() {
    setNotifBusy(true);
    setNotifError(null);
    try {
      if (notifStatus === "on") {
        await disableNotifications();
        setNotifStatus("off");
      } else {
        const result = await enableNotifications();
        if (result.ok) {
          setNotifStatus("on");
        } else {
          setNotifError(result.reason ?? "Couldn't enable notifications.");
        }
      }
    } catch (err: any) {
      setNotifError(err.message ?? "Something went wrong.");
    } finally {
      setNotifBusy(false);
    }
  }

  function load() {
    setLoading(true);
    Promise.all([getWeek(), getSemesters(), getCourses()])
      .then(([week, sems, crs]) => {
        setDays(week.week);
        setSemesters(sems);
        setCourses(crs);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleSave(slotId: number, start: string, end: string) {
    await patchSlot(slotId, { start_time: start, end_time: end });
    setSaved(slotId);
    setTimeout(() => setSaved(null), 1500);
  }

  async function handleDeleteSlot(slotId: number) {
    await deleteSlot(slotId);
    load();
  }

  async function handleCreateSemester(e: React.FormEvent) {
    e.preventDefault();
    if (!newSemesterName.trim()) return;
    await createSemester(newSemesterName.trim());
    setNewSemesterName("");
    load();
  }

  async function handleActivate(id: number) {
    await activateSemester(id);
    load();
  }

  async function handleSaveTarget(id: number, target: string) {
    const n = Number(target);
    if (!n || n < 1 || n > 100) return;
    await updateSemesterTarget(id, n);
    load();
  }

  if (loading) return <p className="page-subtitle">Loading...</p>;

  const activeSemester = semesters.find((s) => s.is_active);

  return (
    <div>
      <h2 className="page-title">Settings</h2>
      <p className="page-subtitle">Semesters, courses, and class times</p>

      {error && (
        <div className="error-banner">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* ───────── Install ───────── */}
      <h3 style={{ fontSize: 16, marginBottom: 8 }}>App</h3>
      <InstallPrompt />

      {/* ───────── Notifications ───────── */}
      <h3 style={{ fontSize: 16, marginBottom: 8 }}>Notifications</h3>
      {!isPushSupported() ? (
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 24 }}>
          This browser doesn't support push notifications.
        </p>
      ) : (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700 }}>
                {notifStatus === "on" ? "Notifications are on" : "Get reminders in this browser"}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 2 }}>
                Tomorrow's schedule at 8 PM, assignment reminders at 8 AM
              </div>
            </div>
            <button
              className={"btn" + (notifStatus === "on" ? "" : " primary")}
              onClick={handleToggleNotifications}
              disabled={notifBusy || notifStatus === "unknown"}
            >
              {notifBusy ? "..." : notifStatus === "on" ? "Turn off" : "Turn on"}
            </button>
          </div>
          {notifError && (
            <div style={{ color: "var(--overdue-text)", fontSize: 13, marginTop: 8 }}>{notifError}</div>
          )}

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8 }}>TEST IT NOW</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" disabled={testBusy !== null} onClick={() => runTest("local")}>
                {testBusy === "local" ? "..." : "Test in browser"}
              </button>
              <button className="btn" disabled={testBusy !== null} onClick={() => runTest("ping")}>
                {testBusy === "ping" ? "..." : "Test from server"}
              </button>
              <button className="btn" disabled={testBusy !== null} onClick={() => runTest("schedule")}>
                {testBusy === "schedule" ? "..." : "Send tomorrow's schedule"}
              </button>
              <button className="btn" disabled={testBusy !== null} onClick={() => runTest("assignments")}>
                {testBusy === "assignments" ? "..." : "Send assignment reminder"}
              </button>
            </div>
            {testMsg && <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 10 }}>{testMsg}</div>}
          </div>
        </div>
      )}

      {/* ───────── Semesters ───────── */}
      <h3 style={{ fontSize: 16, marginBottom: 8 }}>Semesters</h3>
      {semesters.map((s) => (
        <div
          key={s.id}
          className="card"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <span style={{ fontWeight: s.is_active ? 700 : 400 }}>{s.name}</span>
          {s.is_active ? (
            <span className="pill" style={{ color: "var(--present)" }}>Active</span>
          ) : (
            <button className="btn" onClick={() => handleActivate(s.id)}>
              Switch to this semester
            </button>
          )}
        </div>
      ))}
      <form onSubmit={handleCreateSemester} className="card" style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          placeholder="New semester name (e.g. 8th Semester)"
          value={newSemesterName}
          onChange={(e) => setNewSemesterName(e.target.value)}
          style={{ flex: 1 }}
        />
        <button className="btn primary" type="submit">
          Create
        </button>
      </form>
      <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 16 }}>
        Creating a semester doesn't switch to it automatically — add its courses first
        (below), then switch when you're ready. Switching semesters doesn't delete
        anything; past semesters' courses, attendance, and assignments stay intact.
      </p>

      {activeSemester && (
        <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <div style={{ fontWeight: 700 }}>Attendance target</div>
            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Used for "classes you can miss" calculations in {activeSemester.name}
            </div>
          </div>
          <AttendanceTargetEditor
            semesterId={activeSemester.id}
            current={activeSemester.attendance_target}
            onSave={handleSaveTarget}
          />
        </div>
      )}

      {/* ───────── Courses in the active semester ───────── */}
      <h3 style={{ fontSize: 16, marginBottom: 8 }}>
        Courses in {activeSemester?.name ?? "the active semester"}
      </h3>
      {courses.length === 0 && (
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 12 }}>
          No courses yet — add one below.
        </p>
      )}
      {courses.map((c) => (
        <div key={c.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700 }}>{c.code} — {c.name}</div>
            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
              {c.instructor}{c.room ? ` · ${c.room}` : ""} · {c.credits} credits
            </div>
          </div>
          <button
            className="btn"
            onClick={async () => {
              if (confirm(`Delete ${c.code}? This also removes its schedule, attendance, and links to any assignments.`)) {
                await deleteCourse(c.id);
                load();
              }
            }}
          >
            Delete
          </button>
        </div>
      ))}
      <AddCourseForm onAdded={load} />

      {/* ───────── Weekly schedule for the active semester ───────── */}
      <h3 style={{ fontSize: 16, margin: "32px 0 8px" }}>Weekly schedule</h3>
      {days.map((day) => (
        <div key={day.day_of_week} style={{ marginBottom: 24 }}>
          <h4 style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 8 }}>{day.day_name}</h4>
          {day.slots.length === 0 ? (
            <p style={{ color: "var(--text-dim)", fontSize: 13 }}>No classes</p>
          ) : (
            day.slots.map((slot) => (
              <SlotEditor
                key={slot.slot_id}
                slot={slot}
                onSave={handleSave}
                onDelete={handleDeleteSlot}
                justSaved={saved === slot.slot_id}
              />
            ))
          )}
        </div>
      ))}
      <AddSlotForm courses={courses} onAdded={load} />
    </div>
  );
}

function AddCourseForm({ onAdded }: { onAdded: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [instructor, setInstructor] = useState("");
  const [room, setRoom] = useState("");
  const [credits, setCredits] = useState("3");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !name.trim() || !instructor.trim()) return;
    await createCourse({ code: code.trim(), name: name.trim(), instructor: instructor.trim(), room: room.trim() || undefined, credits: Number(credits) || 3 });
    setCode("");
    setName("");
    setInstructor("");
    setRoom("");
    setCredits("3");
    onAdded();
  }

  return (
    <form onSubmit={submit} className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <input type="text" placeholder="Code (e.g. COMP 501)" value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 140 }} />
      <input type="text" placeholder="Course name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
      <input type="text" placeholder="Instructor" value={instructor} onChange={(e) => setInstructor(e.target.value)} style={{ width: 160 }} />
      <input type="text" placeholder="Room (optional)" value={room} onChange={(e) => setRoom(e.target.value)} style={{ width: 100 }} />
      <input type="number" min={1} max={10} title="Credit hours" value={credits} onChange={(e) => setCredits(e.target.value)} style={{ width: 70 }} />
      <button className="btn primary" type="submit">Add course</button>
    </form>
  );
}

function AddSlotForm({ courses, onAdded }: { courses: Course[]; onAdded: () => void }) {
  const [courseId, setCourseId] = useState("");
  const [day, setDay] = useState("0");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId) return;
    await createSlot({ course_id: Number(courseId), day_of_week: Number(day), start_time: start, end_time: end });
    onAdded();
  }

  if (courses.length === 0) return null;

  return (
    <form onSubmit={submit} className="card" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
        <option value="">Choose a course...</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>{c.code}</option>
        ))}
      </select>
      <select value={day} onChange={(e) => setDay(e.target.value)}>
        {DAY_OPTIONS.map((d, i) => (
          <option key={i} value={i}>{d}</option>
        ))}
      </select>
      <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
      <span style={{ color: "var(--text-muted)" }}>–</span>
      <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
      <button className="btn primary" type="submit">Add class slot</button>
    </form>
  );
}

function SlotEditor({
  slot,
  onSave,
  onDelete,
  justSaved,
}: {
  slot: WeekDay["slots"][number];
  onSave: (id: number, start: string, end: string) => void;
  onDelete: (id: number) => void;
  justSaved: boolean;
}) {
  const [start, setStart] = useState(slot.start_time.slice(0, 5));
  const [end, setEnd] = useState(slot.end_time.slice(0, 5));

  return (
    <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ fontWeight: 700 }}>{slot.code} — {slot.name}</div>
        <div style={{ color: "var(--text-muted)", fontSize: 13 }}>{slot.instructor}</div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        <span style={{ color: "var(--text-muted)" }}>–</span>
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        <button className="btn primary" onClick={() => onSave(slot.slot_id, start, end)}>
          {justSaved ? "Saved" : "Save"}
        </button>
        <button className="btn" onClick={() => onDelete(slot.slot_id)}>
          Remove
        </button>
      </div>
    </div>
  );
}

function AttendanceTargetEditor({
  semesterId,
  current,
  onSave,
}: {
  semesterId: number;
  current: number;
  onSave: (id: number, value: string) => void;
}) {
  const [value, setValue] = useState(String(current));

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input
        type="number"
        min={1}
        max={100}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ width: 70 }}
      />
      <span style={{ color: "var(--text-muted)" }}>%</span>
      <button className="btn primary" onClick={() => onSave(semesterId, value)}>
        Save
      </button>
    </div>
  );
}
