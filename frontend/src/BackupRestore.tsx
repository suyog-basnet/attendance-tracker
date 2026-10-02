import { useRef, useState } from "react";
import { exportBackupUrl, importBackup } from "./api";

// Restore replaces every row in every table (see backend/src/routes/backup.js)
// — this two-step confirm exists so a misclick can't silently wipe real data.
export default function BackupRestore() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgIsError, setMsgIsError] = useState(false);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setMsg(null);
    if (file) setPendingFile(file);
  }

  async function confirmRestore() {
    if (!pendingFile) return;
    setBusy(true);
    setMsg(null);
    try {
      const result = await importBackup(pendingFile);
      const summary = Object.entries(result.restored)
        .map(([table, count]) => `${count} ${table.replace(/_/g, " ")}`)
        .join(", ");
      setMsg(`Restored: ${summary}. Reload the page to see it everywhere.`);
      setMsgIsError(false);
    } catch (err: any) {
      setMsg(err.message ?? "Restore failed.");
      setMsgIsError(true);
    } finally {
      setBusy(false);
      setPendingFile(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 700 }}>Backup & restore</div>
      <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 2, marginBottom: 12 }}>
        Exports every semester, course, attendance record, assignment, exam, and slide/note
        listing as one JSON file. Uploaded files themselves are not included — back up the
        server's <code>uploads/</code> folder separately for those.
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <a className="btn primary" href={exportBackupUrl()} download>
          Download backup
        </a>
        <input ref={fileInput} type="file" accept="application/json" onChange={pickFile} style={{ maxWidth: 220 }} />
      </div>

      {pendingFile && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: "var(--radius-sm)",
            background: "var(--overdue-bg)",
            border: "1px solid var(--absent)",
          }}
        >
          <div style={{ fontWeight: 700, color: "var(--overdue-text)" }}>
            This replaces ALL current data
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 10px" }}>
            Restoring "{pendingFile.name}" deletes every semester, course, attendance record,
            assignment, exam, and note currently in the database and replaces them with what's
            in this file. This can't be undone unless you have another backup of the current
            state. Uploaded files on disk are not touched either way.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn active-absent" disabled={busy} onClick={confirmRestore}>
              {busy ? "Restoring..." : "Yes, replace everything"}
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() => {
                setPendingFile(null);
                if (fileInput.current) fileInput.current.value = "";
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div style={{ marginTop: 10, fontSize: 13, color: msgIsError ? "var(--overdue-text)" : "var(--present)" }}>
          {msg}
        </div>
      )}
    </div>
  );
}