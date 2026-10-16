# 🏆 Playr-Pool

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)

**Live scores, team rosters, and tournament brackets — all in one place.**

Playr-Pool is a full-stack, real-time sports tournament platform built for campus and outdoor sports. Players form teams, admins run fixtures and score matches live, and everyone follows results, leaderboards, and brackets as they happen over WebSockets.

> Formerly known as **CampusClash** — some internal names and logs still reference the old brand.

🔗 **Live app:** https://playr-pool-two.vercel.app

---

## ✨ Features

**For players**

- Sign up, join a campus, and register for one or more sports
- Create or join a team, invite teammates, and manage a roster with sport-specific positions and roles (e.g. batting/bowling style in Cricket, playing position in Football)
- Request to join/leave teams, vote to remove an inactive team admin, and transfer ownership
- Browse other players and teams (Discover), and message players directly (Chat)
- Track live scores, match status, and full match history on the Schedule page
- Follow tournament standings on the Leaderboard and knockout progress on the Bracket
- Get real-time notifications for announcements and score updates
- Manage per-sport availability for upcoming matches

**For admins**

- Create match fixtures, assign teams, and toggle status between Upcoming / Live / Completed
- Record and broadcast live scores and individual player stats in real time
- Generate and advance knockout tournament brackets automatically from decisive results
- Publish tournament announcements and event updates (with optional attachments) to specific campuses
- Set per-sport registration open/close windows
- Manage sport-specific admin assignments (Sports Admins directory)
- Full admin audit log of every scoring and management action
- Export players, teams, fixtures, and scores to CSV

**Platform**

- Real-time updates everywhere via Socket.IO (scores, match status, announcements, notifications, chat)
- JWT authentication with role-based access (`player` / `admin`) and an admin signup code
- PostgreSQL persistence with an automatic in-memory fallback store for local development without a database
- SEO-ready: sitemap generation (including per-match deep links), robots.txt, and structured data
- Rate limiting on sensitive actions, security headers, and a global error boundary on the client

---

## 🧱 Tech Stack

| Layer      | Technology                                                                      |
| ---------- | ------------------------------------------------------------------------------- |
| Frontend   | React 18, Vite 6, Socket.IO client                                              |
| Backend    | Node.js, Express 4, Socket.IO                                                   |
| Database   | PostgreSQL (`pg`), with an in-memory fallback store                             |
| Auth       | JSON Web Tokens (`jsonwebtoken`), `bcryptjs` password hashing                   |
| Email      | Resend API (password-reset emails)                                              |
| Deployment | Vercel (client) + any persistent Node host with WebSocket support (e.g. Render) |

---

## 📁 Project Structure

```
project1/
├── client/                  # React + Vite frontend
│   └── src/
│       ├── components/      # Navbar, Alert/Toast, ErrorBoundary, ProtectedRoute, etc.
│       ├── context/         # AuthContext
│       ├── pages/           # Dashboard, Schedule, Leaderboard, Bracket, AdminDashboard, ...
│       └── utils/           # authFetch, sportRoles
├── server/                  # Express + Socket.IO backend
│   ├── config/               # db, env, cors, socket, sport role definitions
│   ├── controllers/          # Route handlers (auth, teams, admin, matches, chat, ...)
│   ├── middleware/           # JWT auth, admin guard, rate limiting, validation
│   ├── models/                # Data access layer
│   ├── routes/                # Express routers
│   └── db/schema.sql          # PostgreSQL schema (also auto-applied by initDb on boot)
├── test-*.js                 # Node-based integration/E2E test scripts
├── DEPLOYMENT.md              # Production deployment notes
└── package.json               # Root scripts for running client/server together
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- A PostgreSQL database (optional for local development — the server falls back to an in-memory store if `DATABASE_URL` isn't set)

### 1. Clone and install

```bash
git clone https://github.com/<your-username>/playr-pool.git
cd playr-pool
npm --prefix server install
npm --prefix client install
```

### 2. Configure environment variables

**`server/.env`** (copy from `server/.env.example`):

```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
JWT_SECRET=generate-a-long-random-secret
ADMIN_SIGNUP_CODE=replace-with-at-least-16-char-code
FRONTEND_ORIGIN=http://localhost:3000
FRONTEND_URL=http://localhost:3000
RESEND_API_KEY=re_xxxxxxxxx
PASSWORD_RESET_EMAIL_FROM=Playr-Pool <no-reply@example.edu>
TRUST_PROXY=false
```

> `DATABASE_URL` can be left unset locally — the app will run on an in-memory store automatically. It's required in production.

**`client/.env`** (copy from `client/.env.example`), only needed if the API is on a different origin than the frontend:

```env
VITE_SOCKET_URL=https://api.example.edu
```

### 3. Run in development

From the project root, in two terminals:

```bash
npm run server   # starts the API + Socket.IO on http://localhost:5000
npm run client   # starts the Vite dev server on http://localhost:3000 (proxies /api to the server)
```

### 4. Run in production

```bash
npm --prefix client run build
npm start          # runs server/server.js, which also serves as the API/socket host
```

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for full production deployment guidance (persistent hosting, environment variables, and reverse-proxy setup).

---

## 🧪 Testing

A set of Node-based integration/E2E scripts exercise the live API:

```bash
npm run test:auth     # authentication flows
npm run test:teams    # team creation, invites, roster management
npm run test:scores   # scoring and leaderboard behavior
node test-roles.js        # sport-specific player role validation
node test-e2e-suite.js    # full end-to-end suite across the app
```

These scripts run against a live server instance (local or deployed), not a mocked test harness.

---

## 🔌 API Overview

All routes are mounted under `/api`:

| Route                | Purpose                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| `/api/auth`          | Signup, login, password reset                                               |
| `/api/teams`         | Team CRUD, rosters, invites, join/leave requests, availability              |
| `/api/admin`         | Fixture, score, bracket, deadline, and announcement management (admin-only) |
| `/api/matches`       | Public match schedule and live scores                                       |
| `/api/leaderboard`   | Standings per sport                                                         |
| `/api/brackets`      | Public knockout bracket view                                                |
| `/api/announcements` | Tournament/event announcements                                              |
| `/api/notifications` | Per-user notifications                                                      |
| `/api/sports-admins` | Sport-specific admin directory                                              |
| `/api/player-sports` | A player's registered sports                                                |
| `/api/chat`          | Direct messaging between players                                            |
| `/api/health`        | Health check                                                                |

Real-time events are pushed over Socket.IO, including `match:score`, `match:status`, `announcement:new`, and chat/notification events.

---

## 🔐 Security Notes

- Admin signup requires a private `ADMIN_SIGNUP_CODE` — never commit this or `server/.env` (already gitignored).
- Rotate `DATABASE_URL`, `JWT_SECRET`, and `ADMIN_SIGNUP_CODE` before any production deployment; `JWT_SECRET` (>= 32 chars) and `ADMIN_SIGNUP_CODE` (>= 16 chars) are validated for minimum strength when `NODE_ENV=production`.
- Sensitive write actions (invites, team removal requests, admin-removal votes) are rate-limited.

---

## 📄 License

Licensed under the [Apache License 2.0](./LICENSE) © 2026 Utkarsh Anand.
