# Productivity Companion

An AI-powered Chrome extension that helps users plan, prioritize, and actually complete tasks before deadlines are missed.

## Problem

Traditional productivity tools rely on passive reminders that are easy to ignore. They tell you a deadline exists but do nothing to help you act on it. Productivity Companion takes a different approach: it classifies your tasks, schedules them intelligently around your real calendar and availability, and intervenes directly when you're procrastinating instead of waiting for you to check a to-do list.

## Core Idea

Every task is different. A meeting tomorrow at 10am doesn't need a plan, it needs a reminder. A "learn DSA by December" goal doesn't need a single calendar block, it needs a recurring habit. Productivity Companion classifies every task into one of three execution types and handles each one the way it actually deserves to be handled, instead of forcing everything into the same generic to-do list format.

## How It Works

1. **Add a task.** Type what you need to do and a target date. Optionally attach a work resource URL (a LeetCode link, an assignment portal, a doc).
2. **AI classifies the task** into one of three types:
   - **Explicit** — a specific event with a known time (interview, meeting, appointment)
   - **One-off** — a single finite action with no fixed time (pay a bill, submit a form)
   - **Continuous** — an ongoing effort that needs repeated sessions (practice DSA, learn a skill)
3. **AI assigns a priority score (1–5)** based on the consequence of missing it, not just the deadline distance.
4. **Find the right time.** The backend intersects your declared availability windows with your actual Google Calendar free/busy data, then asks Gemini to rank the best slots based on task type (morning slots for focus work, consistent slots for habits).
5. **Confirm and schedule.** One tap creates the event on Google Calendar — a single event for one-off and explicit tasks, a recurring event with the right weekly pattern for continuous tasks.
6. **Build a plan instead, if needed.** For complex, undefined tasks, the user can request a phase-based plan rather than a single scheduling action. The plan defines what "done" looks like, the biggest risk to completion, and the very next concrete action.
7. **The interceptor watches your browsing.** If you land on a site you've personally flagged as distracting while a high-priority task is due soon, the extension intervenes directly in the browser with a specific, AI-generated message rather than a generic notification.

## Architecture

```
Chrome Extension (React + Vite, Manifest V3)
        |
        | HTTPS
        v
Node.js + Express backend (Render)
        |
        +--> Gemini 2.5 Flash (task classification, planning, slot ranking, intervention copy)
        +--> Google Calendar API (free/busy lookup, event creation)
        +--> Supabase (Postgres: tasks, user preferences)
        |
        v
Google OAuth (via Chrome Identity API)
```

## Tech Stack

| Layer | Choice |
|---|---|
| Extension | React, Vite, Manifest V3 |
| Backend | Node.js, Express |
| Hosting | Render (backend), Chrome Web Store-ready build (extension) |
| Database | Supabase (Postgres) |
| AI | Gemini 2.5 Flash |
| Auth | Google OAuth via Chrome Identity API |
| Calendar | Google Calendar API |

## Key Backend Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /classify-intent` | Classifies a task into explicit/one-off/continuous, assigns a priority score, saves it to Supabase |
| `POST /parse-task` | Generates a phase-based execution plan for complex or undefined tasks |
| `POST /find-slots` | Intersects user availability with Google Calendar free/busy, returns AI-ranked time slot suggestions |
| `POST /confirm-task` | Finalizes a task's schedule and creates the corresponding Google Calendar event (single or recurring) |
| `GET /preferences` `POST /preferences` | Reads and writes a user's availability windows and distraction site list |

## Database Schema

**tasks** — title, target date, execution type, priority score, status, daily/duration minutes, frequency per week, event time, calendar event id, work URL.

**user_preferences** — availability windows (custom time ranges the user defines), distraction site list, keyed by Google account ID.

Row-level security is enabled on both tables.

## What Makes This Different

Most submissions for this kind of challenge build a to-do list with a chat window attached. This project instead treats task scheduling as a classification problem first: the AI decides how a task should be handled before anything gets put on a calendar. The interceptor then closes the loop by acting at the moment of distraction rather than relying on the user to check the app.

## Status

This is a hackathon prototype built under a one-week solo timeline. The core scheduling and classification pipeline is functional end to end. Calendar slot finding, task confirmation, and the browser interceptor are built and being refined for the demo.

## Setup

**Backend**
```bash
cd backend
npm install
# add GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY to .env
node index.js
```

**Extension**
```bash
cd chrome-extension-boilerplate-react-vite
pnpm install
pnpm build
# load the dist/ folder as an unpacked extension in chrome://extensions
```

Both the extension's `.env` and the backend's `.env` require a Google OAuth Client ID configured for a Chrome Extension application type, with Calendar API scope enabled.
