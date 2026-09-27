import { NavLink, Route, Routes } from "react-router-dom";
import Today from "./pages/Today";
import Week from "./pages/Week";
import CourseDetail from "./pages/CourseDetail";
import Courses from "./pages/Courses";
import Assignments from "./pages/Assignments";
import Stats from "./pages/Stats";
import Exams from "./pages/Exams";
import Settings from "./pages/Settings";

const links = [
  { to: "/", label: "Today" },
  { to: "/week", label: "Week" },
  { to: "/courses", label: "Courses" },
  { to: "/assignments", label: "Assignments" },
  { to: "/exams", label: "Exams" },
  { to: "/stats", label: "Stats" },
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
          <Route path="/courses" element={<Courses />} />
          <Route path="/course/:id" element={<CourseDetail />} />
          <Route path="/assignments" element={<Assignments />} />
          <Route path="/exams" element={<Exams />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
