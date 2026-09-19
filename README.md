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
- **AIIA Hub** — every course, internship, training, research call, CME,
  workshop, conference, admission, job and notice the All India Institute of
  Ayurveda publishes, in one filterable place. Rendered from a local verified
  catalogue first, so the page works even when the API does not, with live
  notices layered on top. Applications always happen on AIIA's own site
- **Live Updates** — official notices, vacancies and tenders pulled
  automatically from AIIA's public JSON feeds every six hours, with real
  deadlines and a countdown. Idempotent upsert, so a corrected deadline
  upstream is followed rather than duplicated
- **Light & dark themes** — persisted per device
- **Resizable sidebar** — drag its right edge between 200 and 420px. The width
  is remembered per device and re-clamped to at most 34% of the viewport, so a
  width chosen on a large monitor cannot swallow the content area on a laptop.
  Keyboard accessible (arrows, Home/End, Enter to reset) and double-click to
  reset; below 768px the sidebar becomes an off-canvas drawer instead

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
- **Live Data** — one button that pulls AIIA's latest notices, vacancies, tenders and
  news from aiia.gov.in on demand, with the per-source result and any failure reason
- **Student management** — search, promote/demote admin, deactivate, delete
- **Internship management** — create / edit / delete postings, applicant counts
- **Application management** — filter by status, change any application's status
- **Skill-shortage report** — % of students missing each skill the internships ask for

**Search**

Two search surfaces, one vocabulary, no duplicated catalogue.

- **Global search** in the header understands intent rather than exact text.
  "make my cv" reaches the Resume page; "AI course" reaches machine-learning
  material. Results are grouped into Pages and catalogue sections, ranked by
  relevance, and clicking one opens the right place. Pages are ranked in the
  browser so they appear instantly; catalogue rows come from the API.
- **Opportunity Search** (`/pages/search.html`) searches the same rows the rest
  of the app renders, through one endpoint (`POST /api/search`). Filters for
  category, mode, location, provider, status and fee; sort by relevance,
  deadline or title; category chips with live counts; loading, empty and error
  states; load-more paging. Every card shows eligibility, location, mode,
  duration, fee, deadline, source and verified status — and says
  *"Not specified by the official source"* rather than inventing a value.
- **Scope is stated, not implied.** These search **CareerNexus's own verified
  opportunity database**. There is no live web search: no search API, no
  crawler, no scraping, and nothing is fabricated. The UI says so on every
  results page. Live internet search is a separate feature that has
  deliberately not been built.

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
  site rather than an aggregator. When a link rots, fix the URL — never
  substitute an unofficial mirror to make a card work.

**Team & Contact**

A permanent Team section and a working contact form at
[`/pages/team.html`](frontend/pages/team.html), reachable from the sidebar,
the landing-page navigation and the footer. **Public** — reaching the team
never requires an account, so the page renders a plain header when nobody is
signed in and the full app shell when someone is.

- **Name, work title and a one-line bio.** No photos, skills, profile links
  or personal contact details. That is a deliberate decision about what
  belongs on a public page, not an unfinished section — everyone reaches the
  team through the contact form.
- **Bios are short and sourced.** Each one describes what that person did on
  this project and is checkable against the repository's own history; a
  member with no bio yet simply shows name and title.
- **The list lives in [`frontend/data/team.json`](frontend/data/team.json).**
  Type a title into a member's `title` field and it appears on the next load;
  the order in the file is the order on the page. That is the only edit
  needed.
- **Titles are never invented.** A member with no title yet shows a muted,
  italic *"Work title to be added"* placeholder, which cannot be mistaken for
  a real job title.

The contact flow is the real one — form → API → SMTP → `CONTACT_TO`:

| | |
|---|---|
| `POST /api/contact` | public; validates, stores, then emails |
| `GET /api/contact/meta` | destination address and category list |
| `GET /api/admin/contact-messages` | **admin** — every message, delivered or not |

- **Every message is stored before the send is attempted**, so a wrong
  password or a down mail server costs delivery, not the message. Anything
  that failed to send is still readable at `GET /api/admin/contact-messages`.
- **The UI never claims an email was sent when it was not.** If the send
  fails the endpoint answers **502**, not 200, so a non-2xx cannot be
  rendered as success even if the page's own logic regressed. There is no
  "stored but not sent" state: green success only on confirmed delivery,
  red "Unable to send your message right now. Please try again." otherwise
  — and a failed attempt keeps what was typed so it can be retried.
- **Over-length input is rejected, never truncated**, with the field and
  the limit named ("Your message is too long (9000 characters, maximum
  5000)"). Silently cutting the end off a message would leave the sender
  believing they sent something they did not.
- **Startup says whether email can work.** The log prints either
  `Contact email: enabled — smtp.gmail.com:587 as … → …` or
  `Contact email: DISABLED — SMTP_HOST, SMTP_USER, SMTP_PASSWORD not set`.
- **`python manage.py test-email` sends a real test message** using the
  live `.env` and prints the mail server's own error if it fails. This is
  the way to answer "is the contact form actually working".
- Reply-To is set to the sender, so pressing Reply answers the right person.
  CR/LF is stripped from every header value and the address is validated, so
  the form cannot be turned into an open relay by header injection.
- Protections: per-IP rate limit (20s between messages, 5 per hour, charged
  only on accepted submissions so a typo does not lock you out), a honeypot
  field, length caps, and server-side validation that does not trust the
  browser.
- **`X-Forwarded-For` is ignored unless `TRUST_PROXY_HEADERS=true`.**
  Honouring it by default would let anyone spoof the header and walk past the
  rate limit.

Run `python backend/test_contact.py` to exercise all of it — 50 checks
covering message format, Reply-To, header injection, the 502-on-failure
path, every validation rule, rate limiting and the honeypot.

> **The form cannot send until `SMTP_USER` and `SMTP_PASSWORD` are in
> `backend/.env`.** `.env` is gitignored, so copying the new keys out of
> `.env.example` is a manual step on every machine. Until then the page
> shows the red error rather than pretending — which is the intended
> behaviour, not a bug. Verify with `python manage.py test-email`.

**One file for every external link**

`frontend/data/website-links.json` is the register of every external website
the platform points at — 51 entries covering government portals, AIIA, company
career pages, universities and learning platforms.

- **This is the file to edit.** Change a URL there and both the frontend and
  the backend pick it up; nothing hard-codes these addresses any more. Adding a
  site means copying an entry, giving it a new `id`, and restarting the backend.
- Each entry carries name, organization, category, description, url, source
  type and purpose. The file opens with a `_readme` explaining the format.
- Read by the backend at startup (`site_url()`), by the browser via
  `js/website-links.js` (`siteUrl()`, `siteEntry()`, `sitesByCategory()`), and
  exposed at `GET /api/website-links`.
- It lives under `frontend/` rather than the repo root for one practical
  reason: `serve.py` serves that directory, so the browser can fetch the same
  file the backend reads. A repo-root copy would be unreachable from the page.
- Every URL in it returned HTTP 200 when it was added.

The searchable collection currently holds **74 verified entries**: government
schemes (PM Internship Scheme, AICTE, NAPS, NCS, Smart India Hackathon, ISRO,
Startup India, Digital India), company student programmes (Google, Microsoft,
Amazon, Apple, IBM, NVIDIA, Adobe, Wipro, Google Summer of Code), official
learning platforms (NPTEL, SWAYAM, Skill India, Microsoft Learn, Google Cloud
Skills Boost, AWS Skill Builder and Machine Learning University, IBM
SkillsBuild, Google ML Crash Course, Elements of AI, MDN, web.dev, Cisco
NetAcad, freeCodeCamp, Kaggle, Infosys Springboard, TCS iON, GitHub Education,
MongoDB University, HackerRank, edX), and AIIA's own courses, internships,
research calls and vacancies.

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
| Student digital portfolios with verified items | `profile.html` · `VerificationModel` · public shareable link at `portfolio.html?id=…` |
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

Passwords are hashed with `hashlib.pbkdf2_hmac` from the standard library, not
`passlib`. The Supabase Python SDK is not used either — the backend talks to
Supabase as an ordinary PostgreSQL database through SQLAlchemy. Both packages
were once listed in `requirements.txt` and installed for nothing; they have
been removed, and `cryptography` (which PyJWT needs for Google's RS256 tokens,
and which used to arrive transitively via `supabase`) is now pinned explicitly.

The frontend is intentionally dependency-free — no React, Vue, Tailwind, or
jQuery — so it runs from any static file server with zero build step.

---

## Project Structure

```
VertexSquad/
├── README.md
├── start.bat                       # One-click: starts both servers (Windows)
├── stop.bat                        # Stops both servers and frees the ports
│
├── frontend/                       # Static site — no build step, no npm
│   ├── index.html                  #   Landing page
│   ├── serve.py                    #   Static server, directory listings off
│   ├── data/
│   │   ├── website-links.json      #   ★ EDIT HERE to change any external URL
│   │   └── team.json               #   ★ EDIT HERE for team names & titles
│   ├── pages/                      #   Application pages
│   │   ├── login.html              #     Student authentication
│   │   ├── admin-login.html        #     Team / admin sign-in (separate door)
│   │   ├── register.html           #     Signup — picks one of four roles
│   │   │
│   │   │                           #   -- Student journey --
│   │   ├── dashboard.html          #     Student dashboard
│   │   ├── assessment.html         #     Skill assessment questionnaire
│   │   ├── profile.html            #     Editable profile + verified portfolio
│   │   ├── resume.html             #     Upload + AI extraction
│   │   ├── skill-gap.html
│   │   ├── learning.html           #     Personalised learning paths
│   │   ├── opportunities.html      #     Internships, jobs, apprenticeships, projects, FDPs
│   │   ├── internship-details.html #     Match breakdown + apply
│   │   ├── what-if.html
│   │   ├── applications.html
│   │   ├── documents.html          #     Secure certificates & reports
│   │   ├── portfolio.html          #     Public share view only (?id=…) — the
│   │   │                           #     private view lives on profile.html
│   │   ├── search.html             #     Opportunity Search + filters
│   │   ├── team.html               #     Meet the Team + Contact form (public)
│   │   ├── aiia.html               #     AIIA Opportunity Hub
│   │   ├── updates.html            #     Live official feeds & deadlines
│   │   │
│   │   │                           #   -- Industry & academia --
│   │   ├── recruiter.html          #     Postings + candidate shortlisting
│   │   ├── post-opportunity.html   #     Publish any opportunity type
│   │   ├── faculty.html            #     Faculty portal
│   │   ├── verify.html             #     Verification queue
│   │   ├── institution.html        #     Cohort analytics
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
│   │   ├── website-links.js        #     Reads data/website-links.json
│   │   ├── search-core.js          #     Search vocabulary + page ranking
│   │   ├── aiia-data.js            #     Verified AIIA catalogue
│   │   ├── mock-data.js            #     Offline demo data
│   │   └── ...                     #     One controller per page
│   └── assets/logos/
│
└── backend/                        # FastAPI service
    ├── app/main.py                 #   Routes, models, matching engine, admin API
    ├── test_contact.py             #   Contact-form / email test suite
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
the API server, SQLAlchemy and `psycopg2-binary` for the database, PyJWT plus
`cryptography` for authentication (the latter is what verifies Google's RS256
tokens), `pypdf` for resume text extraction, and `python-dotenv` for config
loading. Every entry is annotated in the file with why it is needed.

To verify the install succeeded:

```bash
pip list
```

If you later add a new package, add **just that line** to `requirements.txt`
with a pinned version — import it somewhere first.

Avoid `pip freeze > requirements.txt`: it writes out every transitive
dependency in your venv as a direct one, which is how `passlib` and `supabase`
ended up listed here despite never being imported. To check a change is
complete, install it into a throwaway venv and import the app:

```bash
python -m venv /tmp/check
/tmp/check/bin/pip install -r requirements.txt
/tmp/check/bin/python -c "import app.main"
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
| `CONTACT_TO` | Where contact-form messages are delivered (default: `aayushswapnali@gmail.com`) |
| `SMTP_HOST` `SMTP_PORT` | Mail server. Gmail: `smtp.gmail.com` / `587` |
| `SMTP_USER` `SMTP_PASSWORD` | **Gmail needs an [App Password](https://myaccount.google.com/apppasswords), not your account password** — turn on 2-Step Verification first. Leave blank and the form still stores every message; it just does not email, and the page says so instead of pretending. |
| `RESEND_API_KEY` | Sends contact email over HTTPS through [Resend](https://resend.com) instead of SMTP, and is used first when set. **Needed on Render's free plan, which blocks the SMTP ports (25/465/587).** Sign up at Resend with the same address as `CONTACT_TO` (its shared sender can only mail your own address until you verify a domain). `RESEND_FROM` overrides the sender; default `CareerNexus <onboarding@resend.dev>`. |
| `TRUST_PROXY_HEADERS` | Only `true` behind a proxy you control that sets `X-Forwarded-For`. Otherwise the contact rate limit can be bypassed by spoofing the header. |

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

`start.bat` in the repo root launches both servers and opens the site in a
Chrome incognito window, so a demo never picks up a stale login or cached
assets from the last run. If Chrome is not installed it says so and prints
the URL instead of falling back to another browser.

It waits for the backend to actually answer before opening the browser. A
cold start takes over a minute because the app connects to Supabase first,
and opening the site early meant every page loaded against a dead API. If
the backend never comes up, or a previous run still holds a port, the
script says so instead of opening a broken page.
`stop.bat` shuts them down again — it frees ports 8000 and 5500 and closes
the two server windows, so you can restart cleanly without hunting for them.

### Admin tasks from the command line

For things there is no UI for yet, run `backend/manage.py` (venv active):

```bash
cd backend
python manage.py list-admins                     # who has admin access
python manage.py reseed                          # clear the seed marker
python manage.py make-admin  teammate@email.com  # promote a registered account
python manage.py set-password you@email.com      # prompts for a new password (hidden)
```

### Test suites

Run the API and security suites against a THROWAWAY database, never the
shared one — they create accounts and post messages:

```bash
cd backend
set DATABASE_URL=sqlite:///./qa_test.db
venv\Scripts\python -m uvicorn app.main:app --port 8100
venv\Scripts\python test_api_qa.py        # 69 checks: auth, RBAC, IDOR, injection
venv\Scripts\python test_upload_ai_qa.py  # 18 checks: upload allowlist, AI endpoint
venv\Scripts\python test_contact.py       # 50 checks: contact form
```

`test_contact.py` brings its own app up in-process, so it only needs
`DATABASE_URL` set. The other two talk to a running server on port 8100.

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
| `POST` | `/search` | Search the verified opportunity collection (filters, sort, paging) |
| `GET` | `/team` | Team VertexSquad (public) |
| `GET` | `/contact/meta` | Contact destination + categories (public) |
| `POST` | `/contact` | Submit a contact message (public) |
| `GET` | `/admin/contact-messages` | **admin** — every message received |
| `GET` | `/website-links` | The central external-website register (public) |
| `GET` | `/aiia` | AIIA opportunity hub |
| `GET` | `/feeds/items` | Official notices, vacancies and tenders |
| `POST` | `/feeds/sync` | **admin** — pull the official feeds now |
| `GET` | `/deadlines` | Combined deadline board with days remaining |
| `GET` | `/opportunities` | Jobs, apprenticeships, projects, FDPs |
| `GET` `POST` | `/learning/programs` | Industry learning programmes |
| `GET` | `/learning/recommendations` | Gaps ranked by roles unlocked |
| `GET` | `/institution/analytics` | Cohort analytics for a placement cell |
| `GET` `POST` `DELETE` | `/documents[/{id}]` | Secure document store |
| `GET` `POST` | `/portfolio` | Verified portfolio + verification |
| `GET` | `/verify/pending` | Verification queue (staff) |

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

## Design System

One set of tokens in [`frontend/css/global.css`](frontend/css/global.css) drives
both themes; components read them via `var()`, so nothing is styled per page.

| | Value |
|---|---|
| Accent | `#4aab95` dark · `#2f7d6c` light |
| Page background (dark) | `#0d1116` — deep charcoal with a slight navy cast |
| Surface / sidebar (dark) | `#171c25` |
| Radius | 6px small · 8px buttons · 10px cards |
| Type scale | Page 20–24px · Section 17–19px · Card 16px · Body 14px · Meta 12px |

Deliberate choices worth keeping:

- **The emoji navigation is part of the product identity.** 📊 Dashboard,
  🎓 Learning Paths, 💼 Internships, 🌿 AIIA Hub and the rest stay as emoji —
  they are not to be swapped for an icon font or SVG set.
- **The accent is used sparingly** — active navigation, primary buttons,
  important links and focus states. Not every element is teal.
- **Cards are bordered containers, not floating panels**: no drop shadow, no
  hover lift. Hover changes the border and background only.
- **Motion is functional only** — loading, modals, hover and focus. The
  staggered card entrances and hover lifts were removed; they cost a frame on
  every page load and made the interface feel generated.
- **Every colour pair meets WCAG AA** (4.5:1 minimum) in both themes; the
  lowest is 4.8:1. Check any new colour before adding it.

Bump the `?v=` cache stamp in every page's `<link>`/`<script>` tags whenever a
CSS or JS file changes, or browsers will serve the old one.

---

## Deploying to Render

The repo ships a [`render.yaml`](render.yaml) Blueprint that deploys two
services from this one repo — the FastAPI backend as a Python web service,
and the static frontend as a static site. The database stays on the existing
Supabase project; Render hosts no database of its own here.

1. **Push to GitHub** (already done if you're reading this from the repo).
2. On [Render](https://dashboard.render.com), **New +** → **Blueprint** →
   connect this repo. Render reads `render.yaml` and proposes both services —
   `careernexus-api` and `careernexus`.
3. Render will prompt for every value marked `sync: false` in the Blueprint
   before the first deploy. Have these ready:
   - `DATABASE_URL` — the Supabase **connection pooler** URI (dashboard →
     Settings → Database → Connection Pooling → URI), same format as
     `backend/.env`.
   - `RESEND_API_KEY` — optional but needed for the contact form to email
     you: Render's free plan blocks the SMTP ports, so `SMTP_USER` /
     `SMTP_PASSWORD` cannot work there. Leave blank and the form still
     stores every message, it just answers "Unable to send" instead of
     emailing it.
   - `GEMINI_API_KEY` — optional; leave blank and resume parsing falls back
     to keyword extraction.
   - `JWT_SECRET_KEY` is generated automatically — you won't be asked.
4. Deploy. Both services build and go live at `https://careernexus-api.onrender.com`
   and `https://careernexus.onrender.com` **if those names are free** — Render
   service names are global, so a taken name gets an auto-suffixed URL instead.
   On this project's own deploy, `careernexus` was already taken and Render
   assigned `https://careernexus-w8rh.onrender.com` — `render.yaml`'s
   `ALLOWED_ORIGINS` already points at that real URL, so a fresh Blueprint
   deploy from this repo works as-is. **If your own deploy gets different
   URLs than what's in render.yaml:**
   - Edit `PROD_API_BASE_URL` in [`frontend/js/config.js`](frontend/js/config.js)
     to the real backend URL and push — the static site redeploys automatically.
   - Edit `ALLOWED_ORIGINS` on the `careernexus-api` service (dashboard → that
     service → Environment) to the real frontend URL, then redeploy the
     backend — CORS will otherwise reject every request from the frontend.
5. **Google Sign-In** needs one manual step Render can't do for you: add the
   deployed frontend's exact origin (`https://careernexus-w8rh.onrender.com`, no
   trailing slash) to **Authorized JavaScript origins** on the OAuth client at
   [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials).
   Without this, the Google button fails with a generic sign-in error — email
   login is unaffected.
6. Work through the **Security Notes** checklist below before calling it
   launched — Row Level Security on Supabase in particular, since Render
   changes nothing about that.
7. Sign in with the demo account (below) on the live URL to confirm the
   deploy actually works end to end, not just that the build succeeded.
8. **Check the Team page and any AIIA/external "official link" buttons.**
   `careernexus-api`'s `rootDir` is `backend`, but two endpoints
   (`/api/team`, and the AIIA link register) read JSON files from
   `frontend/data/` by walking up from `app/main.py` — correct for the local
   monorepo checkout, and Render documents that the full repo is checked out
   regardless of `rootDir`, but it's worth confirming on the live URL rather
   than assuming: both endpoints degrade to an empty result rather than
   erroring if the file isn't where they expect, so a silent gap here is easy
   to miss.

Render's free-tier web services spin down after 15 minutes of no traffic and
take up to a minute to wake back up on the next request — expect a slow first
load after any idle period. The static site has no such delay.

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
- **`file://` is not supported and that is deliberate.** Opening a page by
  double-clicking it sends `Origin: null`, which is not in the CORS allowlist,
  and `localStorage` is per-origin so the session is invisible. The page detects
  this and explains it rather than rendering blank. Do not add `"null"` to
  `ALLOWED_ORIGINS` to "fix" it — that would let any HTML file on the machine
  call the API

---

## Team

Built by **Team VertexSquad** for Smart India Hackathon 2026 (SIH26044).
