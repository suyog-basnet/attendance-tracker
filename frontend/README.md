# KU Tracker — Web

A standalone React (Vite + TypeScript) version of KU Tracker. Runs locally in
your browser and talks to the same backend as the mobile app. No push
notifications here (browser-only limitation) — everything else is included:
today's schedule with attendance marking, full week view, per-course
attendance history + "classes you can miss" calculator, assignments todo
list, and a settings screen to edit class times.

## Prerequisites

The backend and database must be running first:

```bash
# from the project root
docker-compose up -d          # starts Postgres
cd backend
npm run dev                   # starts the API on http://localhost:3000
```

## Run the web app

```bash
cd web
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`).

## Changing the backend URL

If your backend runs on a different host or port, edit the one line at the
top of `src/api.ts`:

```ts
const API_BASE = "http://localhost:3000";
```

## Project structure

```
web/
  src/
    api.ts              — every backend call, in one place
    theme.css            — dark theme, same palette as the mobile app
    App.tsx               — sidebar nav + routes
    pages/
      Today.tsx            — today's classes, mark present/absent/reset
      Week.tsx              — full week, tab per day
      CourseDetail.tsx       — attendance history + can-miss calculator
      Assignments.tsx         — todo list with due dates
      Settings.tsx              — edit class start/end times
```
