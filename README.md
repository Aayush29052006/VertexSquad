<div align="center">
  <img src="frontend/assets/logos/careernexus-logo.png" alt="CareerNexus" width="96" />
  <h1>CareerNexus</h1>
  <p><strong>AI-powered Academia–Industry Collaboration Portal</strong></p>
  <p>Smart India Hackathon 2026 · Problem Statement <strong>SIH26044</strong> · Team VertexSquad</p>
</div>

---

## Overview

Students often can't tell how their skills line up against what companies actually
hire for. CareerNexus closes that gap.

A student uploads their resume, the platform extracts their skills using AI, then
matches them against real internship listings — showing a transparent match score,
explaining *why* they matched, and identifying exactly which skills to learn next
to unlock better opportunities.

The core flow:

```
Profile → Resume → AI Skill Extraction → Recommendations
       → Match Score → Skill Gap → Apply → Track
```

Unlike a keyword-based job board, every match score is computed and explained
server-side across four weighted dimensions, so a student can see the reasoning
behind their result rather than an opaque number.

---

## Features

**For students**
- **AI resume parsing** — extracts technical skills, soft skills, projects, and
  certifications from an uploaded PDF/DOCX via the Gemini API, with a rule-based
  fallback when AI is unavailable
- **Skill confirmation** — AI results are always reviewable; students can keep,
  remove, or add skills before they're saved (no blind trust in AI output)
- **Transparent match scores** — every internship shows a full breakdown across
  Required Skills, Education Eligibility, Preferences, and Projects
- **Skill gap analysis** — see precisely which required skills are missing, ranked
  by priority
- **What-if analysis** — "if I learn TypeScript, what happens to my match?" —
  scored by the backend, never guessed in the browser
- **Application tracking** — statuses from Applied through Selected/Rejected
- **Light & dark themes** — persisted per device

**For admins / placement cell** (`/pages/admin.html`, `role = "admin"`)
- **Overview** — students, internships, applications, at-risk count, top colleges
- **Student management** — search, promote/demote admin, deactivate, delete
- **Internship management** — create / edit / delete postings, applicant counts
- **Application management** — filter by status, change any application's status
- **Skill-shortage report** — % of students missing each skill the internships ask for

**Engineering**
- Central API layer (`frontend/js/api.js`) — no scattered `fetch()` calls
- Mock-data mode for frontend work without a running backend
- All untrusted data is HTML-escaped before DOM insertion (XSS hardened)
- Automatic DB seeding on startup, plus an offline SQLite fallback

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, vanilla JavaScript (no framework) |
| Backend / API | Python, FastAPI |
| Database | Supabase PostgreSQL (SQLite fallback for offline dev) |
| Authentication | JWT (PyJWT) |
| AI | Google Gemini API |
| Resume parsing | pypdf |
| ORM | SQLAlchemy |

The frontend is intentionally dependency-free — no React, Vue, Tailwind, or
jQuery — so it runs from any static file server with zero build step.

---

## Project Structure

```
VertexSquad/
├── README.md
├── start.bat                       # One-click: starts both servers (Windows)
│
├── frontend/                       # Static site — no build step, no npm
│   ├── index.html                  #   Landing page
│   ├── pages/                      #   Application pages
│   │   ├── login.html              #     Authentication
│   │   ├── register.html
│   │   ├── dashboard.html          #     Student dashboard
│   │   ├── profile.html
│   │   ├── resume.html             #     Upload + AI extraction
│   │   ├── internships.html        #     Discovery & filtering
│   │   ├── internship-details.html #     Match breakdown + apply
│   │   ├── skill-gap.html
│   │   ├── what-if.html
│   │   ├── applications.html
│   │   ├── settings.html
│   │   └── admin.html              #     Admin panel (role = "admin" only)
│   ├── css/                        #   global · components · responsive · per-page
│   ├── js/
│   │   ├── config.js               #     API base URL & feature flags
│   │   ├── api.js                  #     Central API layer — all backend calls
│   │   ├── ui.js                   #     Shared components & helpers
│   │   ├── auth.js                 #     Login / register validation
│   │   ├── admin.js                #     Admin panel controller
│   │   ├── theme.js                #     Light / dark theme
│   │   ├── mock-data.js            #     Offline demo data
│   │   └── ...                     #     One controller per page
│   └── assets/logos/
│
└── backend/                        # FastAPI service
    ├── app/main.py                 #   Routes, models, matching engine, admin API
    ├── requirements.txt            #   Python dependencies
    └── .env.example                #   Environment variable template
```

---

## Installation & Setup

### Prerequisites

- **Python 3.10+** (developed on 3.13)
- A **Supabase** project — optional; the app falls back to local SQLite
- A **Google Gemini API key** — optional; falls back to rule-based parsing

### 1. Clone the repository

```bash
git clone https://github.com/snehaajadhav06/VertexSquad.git
cd VertexSquad
```

### 2. Create a virtual environment

A virtual environment keeps this project's packages isolated from your system
Python.

```bash
cd backend
python -m venv venv
```

Activate it:

```bash
# Windows (Command Prompt / PowerShell)
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

> Create the virtual environment on **your own machine** — a `venv/` folder
> copied from someone else's computer contains hardcoded absolute paths and
> will not work.

### 3. Install dependencies using `requirements.txt`

`requirements.txt` lists every Python package the backend needs, with exact
pinned versions so every team member runs an identical environment. Install
them all in one command:

```bash
pip install -r requirements.txt
```

This reads the file and installs each package listed — FastAPI and Uvicorn for
the API server, SQLAlchemy and `psycopg2-binary` for the database, PyJWT for
authentication, `pypdf` for resume text extraction, and `python-dotenv` for
config loading.

To verify the install succeeded:

```bash
pip list
```

If you later add a new package to the project, record it for everyone else with:

```bash
pip freeze > requirements.txt
```

### 4. Configure environment variables

The file lives at **`backend/.env`** (i.e. `CareerNexus-Frontend/backend/.env`).
It is gitignored — every developer keeps their own. Copy the template and fill it in:

```bash
cd backend

# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Then open `backend/.env` and set:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase public anon key |
| `DATABASE_URL` | PostgreSQL connection string (see note below) |
| `GEMINI_API_KEY` | Google Gemini key from [AI Studio](https://aistudio.google.com/apikey) |
| `GOOGLE_CLIENT_ID` | OAuth Web client ID — **must match `GOOGLE_CLIENT_ID` in `frontend/js/config.js`** |
| `JWT_SECRET_KEY` | Long random string that signs login tokens. Generate: `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Falls back to an insecure dev key (with a startup warning) if unset. |
| `ALLOWED_ORIGINS` | Comma-separated browser origins allowed to call the API. Default: `http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000` |
| `ADMIN_EMAILS` | Comma-separated emails auto-promoted to `role = "admin"` on startup (default: `aayushswapnali@gmail.com`) |

> **Already have a `.env` from before the admin panel?** Add the three new keys —
> `JWT_SECRET_KEY`, `ALLOWED_ORIGINS`, `ADMIN_EMAILS` — from `.env.example`.
> Setting (or changing) `JWT_SECRET_KEY` logs everyone out; they just sign in again.

> **Use the Connection Pooler URI for `DATABASE_URL`**
> Supabase dashboard → Settings → Database → **Connection Pooling** → URI.
> The username is `postgres.<project-ref>` (not just `postgres`) and the port is
> `6543`. The "Direct connection" string (`db.<ref>.supabase.co:5432`) is
> IPv6-only and fails to resolve on most networks.

**Everything is optional.** Leave `DATABASE_URL` blank and the backend
automatically uses a local SQLite file. Leave `GEMINI_API_KEY` blank and resume
parsing falls back to rule-based keyword extraction. The app runs either way.

`.env` is gitignored and must never be committed.

---

## Running the Project

Two servers run side by side.

### Terminal 1 — Backend API

```bash
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

The API is now at **http://localhost:8000**, with interactive Swagger
documentation at **http://localhost:8000/docs**.

On first start the backend automatically creates its tables and seeds sample
internships and a demo student — no manual database import needed.

**Demo login**

| Email | Password | Role |
|---|---|---|
| `aayushswapnali@gmail.com` | `demo1234` | admin |

The demo account is an admin (it's in `ADMIN_EMAILS`), so after logging in an
**Admin Panel** item appears in the sidebar → `/pages/admin.html`. New accounts
from the register page are always regular students; an admin promotes them from
the Students tab.

Passwords are hashed with PBKDF2-HMAC-SHA256 (260,000 iterations, per-user salt)
and are never stored in readable form.

### Terminal 2 — Frontend

The frontend is static, so any file server works. Run it from the `frontend/`
folder:

```bash
cd frontend
python -m http.server 5500
```

Open **http://localhost:5500** in your browser.

> The static server's root **must** be `frontend/` (that's where `index.html`
> lives) and the port **must** be `5500` — that origin is what's registered in
> the Google OAuth client and in `ALLOWED_ORIGINS`.
> From anywhere you can also target it directly:
> `python -m http.server 5500 --directory "C:\path\to\VertexSquad\frontend"`

### One-click (Windows)

`start.bat` in the repo root launches both servers and opens the browser.

### Running the frontend without a backend

Set `USE_MOCK_DATA: true` in [`frontend/js/config.js`](frontend/js/config.js) to
browse the full UI against local demo data with no server running.

---

## Team Workflow

We all push to `main`. To avoid overwriting each other:

```bash
git pull                 # 1. before you start — get everyone's latest
# ... make your changes ...
git add -A
git commit -m "clear message of what changed"
git pull                 # 2. before you push — in case someone pushed meanwhile
git push                 # 3. normal push
```

**Rules**

- **Never `git push --force` / `--force-with-lease` on `main`.** It deletes
  commits other people pushed. A force-push already wiped this repo's history
  once (2026-09-02) — it had to be manually stitched back.
- **Never commit a `venv/` folder or a `.env` file.** Both are gitignored;
  everyone creates their own (`.env` from `backend/.env.example`).
- If `git pull` reports a **CONFLICT**, don't force past it — open the marked
  files, keep both people's changes, `git add`, `git commit`, then push. Ask in
  the group if unsure.
- Big change or risky refactor → do it on a branch and open a Pull Request:
  `git checkout -b my-feature` … `git push -u origin my-feature`.
- Pull once at the **start of every work session**, even if you pulled yesterday.

---

## API Reference

All endpoints are prefixed with `/api`. Full interactive docs at `/docs`.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/register` | Create an account |
| `POST` | `/auth/login` | Authenticate, returns JWT |
| `GET` | `/student/profile` | Fetch current student profile |
| `PUT` | `/student/profile` | Update profile |
| `POST` | `/resume/upload` | Upload & parse a resume |
| `GET` | `/resume/status` | Current resume metadata |
| `GET` | `/resume/extracted-skills` | AI-extracted skills |
| `POST` | `/resume/confirm-skills` | Save reviewed skills |
| `GET` | `/internships/recommendations` | Ranked matches (supports filters) |
| `GET` | `/internships/{id}` | Internship detail + match breakdown |
| `GET` | `/internships/{id}/match-score` | Score & breakdown only |
| `GET` | `/internships/{id}/skill-gap` | Missing skills, prioritised |
| `POST` | `/internships/{id}/apply` | Submit an application |
| `POST` | `/internships/{id}/what-if` | Recompute score with added skills |
| `GET` | `/applications` | Application history |
| `GET` | `/admin/stats` | **admin** — platform overview |
| `GET` | `/admin/skill-gaps` | **admin** — skill shortage across students |
| `GET` `PATCH` `DELETE` | `/admin/students[/{id}]` | **admin** — manage students |
| `GET` `POST` `PUT` `DELETE` | `/admin/internships[/{id}]` | **admin** — manage postings |
| `GET` `PATCH` | `/admin/applications[/{id}]` | **admin** — review applications |

Authenticated endpoints expect an `Authorization: Bearer <token>` header.
`/admin/*` additionally requires the token's account to have `role = "admin"` —
the check is enforced on every request, not just hidden in the UI.

---

## How Match Scoring Works

Scores are computed entirely server-side and weighted across four dimensions:

| Dimension | Weight |
|---|---|
| Required skills overlap | 50% |
| Preferences (work mode, location) | 20% |
| Education eligibility (CGPA) | 15% |
| Project relevance | 15% |

The frontend renders whatever breakdown the backend returns — it never computes
or invents a score. Score bands (Excellent / Good / Moderate / Low) are
configurable in [`frontend/js/config.js`](frontend/js/config.js).

---

## Security Notes

This is a hackathon prototype. Before any real deployment:

- **Enable Row Level Security** on all Supabase tables — the anon key is public
  by design, so RLS is what actually protects the data
- **Set a strong `JWT_SECRET_KEY`** — anyone who knows the signing secret can
  forge login tokens (the app warns loudly if it falls back to the dev key)
- **Restrict CORS** — set `ALLOWED_ORIGINS` in `.env` to your real frontend
  origin(s); the API no longer accepts `*`
- **Frontend code is always visible** (F12) — that is normal for every website.
  Security lives in the backend: JWT verification, the `role = "admin"` check on
  every `/admin/*` call, Pydantic validation, and never trusting client input
- **Validate uploads server-side** — never trust a browser-supplied filename or
  MIME type
- Rotate any credential that has been shared over chat or committed

---

## Team

Built by **Team VertexSquad** for Smart India Hackathon 2026 (SIH26044).
