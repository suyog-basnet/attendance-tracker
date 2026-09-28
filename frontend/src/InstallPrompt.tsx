import { useEffect, useState } from "react";

// Chrome/Edge fire `beforeinstallprompt` when the app is installable.
// We stash the event and show our own button, since the browser's own
// install icon in the address bar is easy to miss.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(
    window.matchMedia("(display-mode: standalone)").matches
  );

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 24 }}>
        KU Tracker is running as an installed app.
      </p>
    );
  }

  if (!deferred) {
    return (
      <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 24 }}>
        Install option isn't available right now. In Chrome or Edge, look for the
        install icon in the address bar, or use the browser menu → "Install KU Tracker".
      </p>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ fontWeight: 700 }}>Install KU Tracker</div>
        <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 2 }}>
          Opens in its own window with an icon in your dock/taskbar
        </div>
      </div>
      <button
        className="btn primary"
        onClick={async () => {
          await deferred.prompt();
          await deferred.userChoice;
          setDeferred(null);
        }}
      >
        Install
      </button>
    </div>
  );
}