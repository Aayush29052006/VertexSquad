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
Assess → Find Skill Gaps → Learn → Apply → Internship
       → Get Evaluated → Build Verified Portfolio → Get Placed
```

Unlike a keyword-based job board, every match score is computed and explained
server-side across four weighted dimensions, so a student can see the reasoning
behind their result rather than an opaque number.

The platform serves all four stakeholders the problem statement names — students,
academicians, industry and institutions — each with their own portal and their own
role-gated view of the same data.

### Demo accounts

Every account below uses the password `demo1234`, and the sign-in page pre-fills the
student one — open `/pages/login.html`, press **Log In**, and you are in. The chips
above the form switch to any other role in one click.

| Role | Email | Lands on |
|---|---|---|
| Student | `demo.student@careernexus.example.com` | Student dashboard |
| Recruiter | `recruiter@technova.example.com` | Recruiter portal |
| Faculty | `faculty@sscoetjalgaon.example.com` | Faculty portal |
| Institution | `tpo@sscoetjalgaon.example.com` | Institution analytics |
| Admin | `aayushswapnali@gmail.com` | Everything |

These five accounts are seeded on **every** database, so the sign-in shortcuts always
work. The separate ten-student demo *cohort* — used to make the institution analytics
look realistic — seeds **only into a local SQLite database**. Pointing `DATABASE_URL`
at a shared Postgres instance leaves real data untouched, so ten fabricated students
can never end up in the team's live analytics. Set `SEED_DEMO_COHORT=true` to override
that.

---

## Features

**For students**
- **Skill assessment** — a 26-question questionnaire across technical MCQs,
  aptitude and self-rated soft skills. Scored entirely server-side (the answer key
  never reaches the browser), producing a skill profile, a per-category strength/gap
  breakdown, and an attempt history. Demonstrated skills are merged into the profile
  and immediately drive every match score on the site
- **Personalised learning paths** — each gap is ranked by how many open roles that
  one skill would unlock, with courses attached: industry-published programs first
  (they come with a hiring partner), then curated NPTEL / SWAYAM / freeCodeCamp /
  Microsoft Learn / AWS courses
- **Jobs & opportunities** — internships, full-time roles, apprenticeships and live
  projects in one ranked feed, filterable by type and work mode
- **Verified digital portfolio** — a shareable public page (`portfolio.html?id=…`,
  no login required) where every skill, project, certificate and internship is
  marked either *verified* — carrying the name and role of the faculty member,
  institution or employer who signed it — or *self-declared*. A credibility score
  shows what share of the portfolio is independently vouched for
- **Internship progress tracking** — weekly logs with hours, reviewed by the mentor
  who posted the role, feeding a completion record that is signed into the portfolio
- **Secure documents** — certificates, internship reports and academic records,
  readable only by their owner and by verifying staff
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

**For industry (recruiters)**
- **Post any opportunity** — internships, jobs, apprenticeships, live projects, and
  the faculty track (FDPs, industrial training, consultancy) from one form
- **Candidate shortlisting** — applicants ranked by skill compatibility, with CGPA
  eligibility flagged against the posting's own cutoff, and a link straight to each
  candidate's verified portfolio. Scoped server-side, so one company can never see
  another's pipeline
- **Publish learning programs** — training, certifications, workshops and mentorship
  that appear against exactly the skill gap they close
- **Mentor feedback** — review an intern's weekly log, then sign off the completed
  internship into their portfolio

**For academia (faculty)**
- **Faculty opportunities** — faculty internships, industrial training and FDPs,
  matched to the academician's own profile
- **Verification queue** — work through students' unverified skills, projects and
  certificates. A verifier's name and role are attached to every stamp, and the
  backend refuses any attempt to verify your own portfolio
- **Collaboration calls** — guest lectures, workshops, live projects, innovation
  challenges, joint research and consultancy, with registration lists for whoever
  published them

**For institutions (placement cell)**
- **Cohort analytics** — placement readiness bands, assessment coverage,
  participation and placement rates, and an application funnel
- **Curriculum gaps** — every skill ranked by *impact*: how many of your students
  lack it, weighted by how many open roles demand it. The top row is the evidence
  for a syllabus change
- **Branch breakdown** — average readiness and participation per branch

**For admins / placement cell** — separate team sign-in at `/pages/admin-login.html`,
panel at `/pages/admin.html`, gated on `role = "admin"` server-side
- **Overview** — students, internships, applications, at-risk count, top colleges
- **Student management** — search, promote/demote admin, deactivate, delete
- **Internship management** — create / edit / delete postings, applicant counts
- **Application management** — filter by status, change any application's status
- **Skill-shortage report** — % of students missing each skill the internships ask for

**Official sources, not a walled garden**

Most of what this platform lists is run by somebody else — a government
scheme, a company's careers page, an official learning platform. Those
listings link to the real source instead of to a page of ours pretending to
own them.

- Every opportunity carries a `source_type`. `platform` means a recruiter
  posted it here and students apply through us, which is the product working
  as intended. `external` means it belongs to an official portal.
- An `external` listing shows **Official Website ↗** and never an Apply
  button. The apply endpoint rejects it server-side too, so nothing can
  record an application to an opportunity we do not run.
- Cards name the organisation behind the listing, and every outbound link
  opens in a new tab with the host named in its tooltip.
- URLs are validated as http(s) before they can become a link, on both the
  client and the server.
- Nothing in the catalogue is invented. Every URL was fetched and confirmed
  to return 200 before being added, and each points at the organisation's own
  site rather than an aggregator. When a link rots, fix the URL in
  `EXTERNAL_OPPORTUNITIES` / `EXTERNAL_LEARNING` — never substitute an
  unofficial mirror to make a card work.

The catalogue currently carries 17 official opportunities (PM Internship
Scheme, AICTE, NAPS, NCS, Smart India Hackathon, ISRO, Startup India, Digital
India, and student programmes at Google, Microsoft, Amazon, Apple, IBM,
NVIDIA, Adobe, Wipro and Google Summer of Code) and 19 official learning
platforms (NPTEL, SWAYAM, Skill India, Google Cloud Skills Boost, Google
Career Certificates, Microsoft Learn, AWS Skill Builder, IBM SkillsBuild,
Cisco NetAcad, freeCodeCamp, Kaggle, Infosys Springboard, TCS iON, GitHub
Education, MongoDB University, HackerRank, edX and others).

**Engineering**
- Central API layer (`frontend/js/api.js`) — no scattered `fetch()` calls
- Mock-data mode for frontend work without a running backend
- All untrusted data is HTML-escaped before DOM insertion (XSS hardened)
- User-supplied links are validated as http(s) on both sides before becoming an
  `href` - escaping alone does not stop a `javascript:` URL
- Uploaded documents are restricted to PDF and images, checked by both MIME type
  and extension: the viewer hands bytes to the browser as a blob URL, which
  inherits this app's origin, so a stored `.html` or `.svg` would otherwise run
  script in the session of any staff member who opened it
- Automatic DB seeding on startup, plus an offline SQLite fallback

---

## Problem statement coverage

Every requirement in SIH26044, and where it lives in the build.

| SIH26044 requirement | Where it is implemented |
|---|---|
| Skill assessment through questionnaires and aptitude tests | `assessment.html` · `POST /api/assessment/submit` |
| Skill profiling, technical and soft skill gaps | `_score_assessment()` — per-category breakdown, proven vs weak skills |
| Skill mapping to roles and programs | `GET /api/learning/recommendations` — gaps ranked by roles unlocked |
| Personalised learning recommendations & certifications | `learning.html` · industry programs + curated NPTEL/SWAYAM catalogue |
| Career guidance from skills, interests and demand | AI Career Assistant · match breakdown · What-If analysis |
| Student digital portfolios with verified items | `portfolio.html` · `VerificationModel` · public shareable link |
| Industries post internships with required skills | `post-opportunity.html` · `POST /api/opportunities` |
| Industries post jobs, apprenticeships, projects | Same endpoint — `opportunity_type` covers all four |
| Matching students to opportunities by skill profile | `calculate_match_score_breakdown()` — four weighted dimensions |
| Application and tracking system | `applications.html` · `GET /api/applications` |
| Faculty internships, industrial training, FDPs | `faculty.html` · `audience="faculty"` opportunity track |
| Progress tracking, mentor feedback, completion records | `ProgressLogModel` · `PATCH /api/progress/{id}/feedback` |
| Industry learning programs (training, certs, workshops, mentorship) | `LearningProgramModel` · `POST /api/learning/programs` |
| Candidate shortlisting by skill compatibility & eligibility | `recruiter.html` · `GET /api/recruiter/applicants` |
| Recruitment management for recruiters | `PATCH /api/recruiter/applications/{id}` |
| Institution dashboards & analytics | `institution.html` · `GET /api/institution/analytics` |
| Skill demand trends for policymakers | Curriculum-gap ranking by impact (students lacking × roles demanding) |
| Industry–academia collaboration (lectures, workshops, challenges, research) | `collaborations.html` · `CollaborationModel` |
| Role-based access for all four stakeholders | `require_roles()` on every endpoint · role-filtered navigation |
| Secure document management | `documents.html` · `DocumentModel` — owner + staff only |
| Integration with learning platforms | Curated catalogue links to NPTEL, SWAYAM, freeCodeCamp, MS Learn, AWS |

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
│   ├── serve.py                    #   Static server, directory listings off
│   ├── pages/                      #   Application pages
│   │   ├── login.html              #     Student authentication
│   │   ├── admin-login.html        #     Team / admin sign-in (separate door)
│   │   ├── register.html           #     Signup — picks one of four roles
│   │   │
│   │   │                           #   -- Student journey --
│   │   ├── dashboard.html          #     Student dashboard
│   │   ├── assessment.html         #     Skill assessment questionnaire
│   │   ├── profile.html
│   │   ├── resume.html             #     Upload + AI extraction
│   │   ├── skill-gap.html
│   │   ├── learning.html           #     Personalised learning paths
│   │   ├── internships.html        #     Discovery & filtering
│   │   ├── opportunities.html      #     Jobs, apprenticeships, projects, FDPs
│   │   ├── internship-details.html #     Match breakdown + apply
│   │   ├── what-if.html
│   │   ├── applications.html
│   │   ├── documents.html          #     Secure certificates & reports
│   │   ├── portfolio.html          #     Verified portfolio (+ public view)
│   │   │
│   │   │                           #   -- Industry & academia --
│   │   ├── recruiter.html          #     Postings + candidate shortlisting
│   │   ├── post-opportunity.html   #     Publish any opportunity type
│   │   ├── faculty.html            #     Faculty portal
│   │   ├── verify.html             #     Verification queue
│   │   ├── institution.html        #     Cohort analytics
│   │   ├── collaborations.html     #     Lectures, projects, research
│   │   │
│   │   ├── settings.html
│   │   └── admin.html              #     Admin panel (role = "admin" only)
│   ├── css/                        #   global · components · responsive · per-page
│   ├── js/
│   │   ├── config.js               #     API base URL & feature flags
│   │   ├── api.js                  #     Central API layer — all backend calls
│   │   ├── ui.js                   #     Shared components & helpers
│   │   ├── auth.js                 #     Login / register validation
│   │   ├── admin-auth.js           #     Team sign-in (role-gated)
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

**Two front doors, one auth system:**

| Page | For | URL |
|---|---|---|
| `login.html` | Students (+ Google sign-in, register) | `/pages/login.html` |
| `admin-login.html` | Team & admins only | `/pages/admin-login.html` |

The team sign-in page uses the same `/api/auth/login` endpoint, then **refuses
to keep the session unless `role == "admin"`** — a student's valid credentials
get "no team access" and nothing is stored. It's a cleaner front door, not the
lock: the real gate is the server-side `role` check on every `/api/admin/*`
request, so a hidden or guessed URL buys an attacker nothing.

The team page is `noindex` and not linked from the public site — bookmark it.
New accounts from the register page are always `student`; an admin promotes
them from the panel's Students tab. `ADMIN_EMAILS` seeds the first admin(s).

Passwords are hashed with PBKDF2-HMAC-SHA256 (260,000 iterations, per-user salt)
and are never stored in readable form.

### Terminal 2 — Frontend

The frontend is static. Run it from the `frontend/` folder with `serve.py`
(a thin wrapper over Python's `http.server` that **disables directory
listings** — a bare folder URL like `/pages/` returns 404 instead of showing
every file name):

```bash
cd frontend
python serve.py 5500
```

Open **http://localhost:5500** in your browser.

> Port **must** be `5500` — that origin is registered in the Google OAuth
> client and in `ALLOWED_ORIGINS`.
> Plain `python -m http.server 5500` also works but will list directory
> contents; real hosts (Netlify/Vercel/nginx) don't, so `serve.py` matches
> production.

### One-click (Windows)

`start.bat` in the repo root launches both servers and opens the browser.

### Admin tasks from the command line

For things there is no UI for yet, run `backend/manage.py` (venv active):

```bash
cd backend
python manage.py list-admins                     # who has admin access
python manage.py make-admin  teammate@email.com   # promote a registered account
python manage.py set-password you@email.com       # prompts for a new password (hidden)
```

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
- **The admin panel URL is not a secret and doesn't need to be.** Anyone can
  open `/pages/admin.html`; without an admin token every `/api/admin/*` request
  returns 401/403 and the page renders empty. Serve with `frontend/serve.py`
  (or a real host) so directory listings don't advertise the URL — but that is
  tidiness, not the security boundary
- **Validate uploads server-side** — never trust a browser-supplied filename or
  MIME type
- Rotate any credential that has been shared over chat or committed

---

## Team

Built by **Team VertexSquad** for Smart India Hackathon 2026 (SIH26044).
