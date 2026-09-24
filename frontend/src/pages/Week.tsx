import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getWeek, WeekDay } from "../api";

export default function Week() {
  const [days, setDays] = useState<WeekDay[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWeek()
      .then((data) => setDays(data.week))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="page-subtitle">Loading...</p>;

  return (
    <div>
      <h2 className="page-title">Week</h2>
      <p className="page-subtitle">Full weekly schedule</p>

      {error && (
        <div className="error-banner">
          <span>⚠️</span>
          <span>Can't load the week: {error}</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {days.map((d, i) => (
          <button
            key={d.day_of_week}
            className={"btn" + (active === i ? " primary" : "")}
            onClick={() => setActive(i)}
          >
            {d.day_name.slice(0, 3)}
          </button>
        ))}
      </div>

      {days[active]?.slots.length === 0 ? (
        <div className="empty-state">
          <p>No classes on {days[active]?.day_name}.</p>
        </div>
      ) : (
        days[active]?.slots.map((slot) => (
          <div className="card" key={slot.slot_id}>
            <Link to={`/course/${slot.course_id}`} style={{ fontWeight: 700, fontSize: 16 }}>
              {slot.code} — {slot.name}
            </Link>
            <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
              {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)} · {slot.instructor}
              {slot.room ? ` · ${slot.room}` : ""}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
