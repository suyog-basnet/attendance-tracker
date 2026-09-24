import { useEffect, useState } from "react";
import { getWeek, patchSlot, WeekDay } from "../api";

export default function Settings() {
  const [days, setDays] = useState<WeekDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  function load() {
    setLoading(true);
    getWeek()
      .then((data) => setDays(data.week))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleSave(slotId: number, start: string, end: string) {
    await patchSlot(slotId, { start_time: start, end_time: end });
    setSaved(slotId);
    setTimeout(() => setSaved(null), 1500);
  }

  if (loading) return <p className="page-subtitle">Loading...</p>;

  return (
    <div>
      <h2 className="page-title">Settings</h2>
      <p className="page-subtitle">Edit class times when your routine changes</p>

      {error && (
        <div className="error-banner">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {days.map((day) => (
        <div key={day.day_of_week} style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, color: "var(--text-muted)", marginBottom: 8 }}>{day.day_name}</h3>
          {day.slots.length === 0 ? (
            <p style={{ color: "var(--text-dim)", fontSize: 13 }}>No classes</p>
          ) : (
            day.slots.map((slot) => (
              <SlotEditor key={slot.slot_id} slot={slot} onSave={handleSave} justSaved={saved === slot.slot_id} />
            ))
          )}
        </div>
      ))}
    </div>
  );
}

function SlotEditor({
  slot,
  onSave,
  justSaved,
}: {
  slot: WeekDay["slots"][number];
  onSave: (id: number, start: string, end: string) => void;
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
      </div>
    </div>
  );
}
