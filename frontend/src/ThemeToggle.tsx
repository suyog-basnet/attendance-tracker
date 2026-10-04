import { useEffect, useState } from "react";

type Theme = "dark" | "light";
const STORAGE_KEY = "ku-tracker-theme";

function getInitialTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  // Fall back to the OS/browser preference on first visit.
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme: Theme) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return (
    <button
      className="nav-link"
      style={{ textAlign: "left", border: "none", background: "transparent", cursor: "pointer" }}
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
    >
      {theme === "dark" ? "☀️ Light mode" : "🌙 Dark mode"}
    </button>
  );
}