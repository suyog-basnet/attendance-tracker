# KU Tracker

A routine, attendance, and assignment tracker for KU CE students. This version
runs as a **backend API + a React web app**, both local to your laptop — no
mobile app, no Expo, no Xcode.

## Structure

```
backend/    — Node.js + Express + Postgres API
frontend/        — React (Vite + TypeScript) web app
docker-compose.yml — Postgres, run this first
```

## First-time setup

```bash
# 1. Start Postgres
docker-compose up -d

# 2. Configure and start the backend
cd backend
cp .env.example .env
# edit .env if needed — it should already match docker-compose.yml:
#   DATABASE_URL=postgresql://kutracker:kutracker_secret@localhost:5433/ku_tracker
npm install
npm run dev

# 3. In a second terminal, start the web app
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Every time you want to use it after that

```bash
docker ps                     # confirm ku_tracker_db is "Up" — if not: docker-compose up -d
cd backend && npm run dev     # in one terminal
cd frontend && npm run dev         # in another terminal
```

## Notes

- **Schedule and course data** live in Postgres, not in code — edit them any
  time from the web app's Settings page (class times) or directly via `psql`
  for bigger changes (new courses, name corrections), and they take effect
  immediately without any rebuild.
- **No push notifications** in this version — that was a mobile-only feature
  tied to Expo's push service. If you want notifications back, that would
  need to be a separate mobile or browser-notification build later.
- The backend still has a `push_tokens` table and a daily cron job left over
  from the mobile version. They're harmless (no tokens will ever be
  registered without a mobile app), but you can ignore or remove them later
  if you want to fully clean up unused code.
