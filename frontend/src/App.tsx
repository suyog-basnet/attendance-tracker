import { NavLink, Route, Routes } from "react-router-dom";
import Today from "./pages/Today";
import Week from "./pages/Week";
import CourseDetail from "./pages/CourseDetail";
import Assignments from "./pages/Assignments";
import Settings from "./pages/Settings";

const links = [
  { to: "/", label: "Today" },
  { to: "/week", label: "Week" },
  { to: "/assignments", label: "Assignments" },
  { to: "/settings", label: "Settings" },
];

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>KU Tracker</h1>
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === "/"}
            className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
          >
            {l.label}
          </NavLink>
        ))}
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/week" element={<Week />} />
          <Route path="/course/:id" element={<CourseDetail />} />
          <Route path="/assignments" element={<Assignments />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
