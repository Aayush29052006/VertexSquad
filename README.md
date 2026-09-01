<div align="center">
  <img src="assets/logos/careernexus-logo.png" alt="CareerNexus" width="96" />
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

**Engineering**
- Central API layer (`js/api.js`) — no scattered `fetch()` calls
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
├── index.html                  # Landing page
├── pages/                      # Application pages
│   ├── login.html              #   Authentication
│   ├── register.html
│   ├── dashboard.html          #   Student dashboard
│   ├── profile.html
│   ├── resume.html             #   Upload + AI extraction
│   ├── internships.html        #   Discovery & filtering
│   ├── internship-details.html #   Match breakdown + apply
│   ├── skill-gap.html
│   ├── what-if.html
│   ├── applications.html
│   └── settings.html
│
├── css/
│   ├── global.css              # Design tokens (light + dark themes)
│   ├── components.css          # Buttons, cards, badges, modals
│   ├── responsive.css          # Breakpoints
│   └── ...                     # Page-specific styles
│
├── js/
│   ├── config.js               # API base URL & feature flags
│   ├── api.js                  # Central API layer — all backend calls
│   ├── ui.js                   # Shared components & helpers
│   ├── auth.js                 # Login/register validation
│   ├── theme.js                # Light/dark theme controller
│   ├── mock-data.js            # Offline demo data
│   └── ...                     # Page controllers
│
├── assets/logos/
│
└── backend/
    ├── app/main.py             # FastAPI app: routes, models, matching engine
    ├── requirements.txt        # Python dependencies
    └── .env.example            # Environment variable template
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

Copy the template and fill in your own values:

```bash
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
| `JWT_SECRET_KEY` | Any long random string used to sign login tokens |

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

| Email | Password |
|---|---|
| `aayushswapnali@gmail.com` | `demo1234` |

Or create your own account from the register page. Passwords are hashed with
PBKDF2-HMAC-SHA256 (260,000 iterations, per-user salt) and are never stored in
readable form.

### Terminal 2 — Frontend

The frontend is static, so any file server works:

```bash
python -m http.server 5500
```

Open **http://localhost:5500** in your browser.

> Run this from the **repository root**, not from `backend/`.
> On Windows Command Prompt you can target it directly:
> `python -m http.server 5500 --directory "C:\path\to\VertexSquad"`

### Running the frontend without a backend

Set `USE_MOCK_DATA: true` in [`js/config.js`](js/config.js) to browse the full
UI against local demo data with no server running — useful for design work.

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

Authenticated endpoints expect an `Authorization: Bearer <token>` header.

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
configurable in [`js/config.js`](js/config.js).

---

## Security Notes

This is a hackathon prototype. Before any real deployment:

- **Enable Row Level Security** on all Supabase tables — the anon key is public
  by design, so RLS is what actually protects the data
- **Set a strong `JWT_SECRET_KEY`** — anyone who knows the signing secret can
  forge login tokens
- **Restrict CORS** — currently `allow_origins=["*"]` for local development
- **Validate uploads server-side** — never trust a browser-supplied filename or
  MIME type
- Rotate any credential that has been shared over chat or committed

---

## Team

Built by **Team VertexSquad** for Smart India Hackathon 2026 (SIH26044).
