import { useEffect, useRef, useState } from "react";
import {
  getMaterials,
  createNote,
  uploadMaterialFile,
  deleteMaterial,
  materialDownloadUrl,
  Material,
} from "./api";

function fmtSize(bytes: string | null): string {
  const n = Number(bytes);
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Slides/files and quick notes for one subject. Lives inside the expanded
// card on the Courses tab.
export default function Materials({ courseId }: { courseId: number }) {
  const [items, setItems] = useState<Material[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileTitle, setFileTitle] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function load() {
    getMaterials(courseId)
      .then(setItems)
      .catch((e) => setError(e.message));
  }

  useEffect(load, [courseId]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadMaterialFile(courseId, fileTitle, file);
      setFileTitle("");
      if (fileInput.current) fileInput.current.value = "";
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteTitle.trim() || !noteText.trim()) return;
    setError(null);
    try {
      await createNote({ course_id: courseId, title: noteTitle, note_text: noteText });
      setNoteTitle("");
      setNoteText("");
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function remove(m: Material) {
    if (!confirm(`Delete "${m.title}"?`)) return;
    await deleteMaterial(m.id);
    load();
  }

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>
        SLIDES & NOTES ({items.length})
      </div>

      {error && (
        <div className="error-banner" style={{ marginBottom: 8 }}>
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {items.map((m) => (
        <div
          key={m.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            padding: "8px 0",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            {m.kind === "file" ? (
              <a
                href={materialDownloadUrl(m.id)}
                style={{ color: "var(--info)", fontWeight: 600 }}
              >
                📎 {m.title}
              </a>
            ) : (
              <div style={{ fontWeight: 600 }}>📝 {m.title}</div>
            )}
            {m.kind === "file" ? (
              <div style={{ color: "var(--text-dim)", fontSize: 12 }}>
                {m.original_name} · {fmtSize(m.size_bytes)}
              </div>
            ) : (
              <div style={{ color: "var(--text-muted)", fontSize: 13, whiteSpace: "pre-wrap", marginTop: 2 }}>
                {m.note_text}
              </div>
            )}
          </div>
          <button className="btn" onClick={() => remove(m)}>
            Delete
          </button>
        </div>
      ))}

      <form onSubmit={handleUpload} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <input
          type="text"
          placeholder="Title (optional)"
          value={fileTitle}
          onChange={(e) => setFileTitle(e.target.value)}
          style={{ width: 160 }}
        />
        <input ref={fileInput} type="file" style={{ flex: 1, minWidth: 180, color: "var(--text-muted)" }} />
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Uploading..." : "Upload"}
        </button>
      </form>

      <form onSubmit={handleNote} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <input
          type="text"
          placeholder="Note title"
          value={noteTitle}
          onChange={(e) => setNoteTitle(e.target.value)}
          style={{ width: 160 }}
        />
        <input
          type="text"
          placeholder="Quick note, e.g. midterm covers chapters 1–4"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          style={{ flex: 1, minWidth: 180 }}
        />
        <button className="btn" type="submit">
          Add note
        </button>
      </form>
    </div>
  );
}