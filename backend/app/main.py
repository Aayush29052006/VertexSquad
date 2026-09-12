import os
import re
import json
import pathlib
import smtplib
from email.message import EmailMessage
from email_validator import validate_email as _validate_email
import jwt
import datetime
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from sqlalchemy import create_engine, Column, String, Integer, Float, ForeignKey, Text, text, or_ as sa_or
from sqlalchemy import inspect as sa_inspect
from sqlalchemy import func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
import io
import pypdf
import urllib.request
import time
import urllib.parse

# Load environment variables FIRST — every os.environ read below depends on it.
from dotenv import load_dotenv

# Pinned to backend/.env rather than bare load_dotenv(), which searches
# upward from the current working directory: launch uvicorn from the repo
# root instead of backend/ and it silently finds nothing, leaving every
# credential empty with no error.
#
# override stays False (the default) on purpose. A real environment
# variable must beat the file, because that is how a deploy injects
# config and how a one-off run overrides it. Setting override=True made
# .env win over the shell, which quietly redirected a local SQLite run at
# the production database.
_ENV_PATH = pathlib.Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_ENV_PATH)
if not _ENV_PATH.exists():
    print(f"Config: no {_ENV_PATH} - using defaults (local SQLite, no Google, no contact email)")

# Initialize FastAPI app
app = FastAPI(title="CareerNexus Backend", version="1.0")

# --- CORS ---
# Only these origins may call the API from a browser. Override in production by
# setting ALLOWED_ORIGINS in .env to a comma-separated list of full origins,
# e.g. ALLOWED_ORIGINS=https://careernexus.example.com
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "ALLOWED_ORIGINS",
        "http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# JWT Configurations
# Read the signing secret from the environment so it is never committed to the
# repo. The fallback keeps local development working out of the box, but any
# real deployment MUST set JWT_SECRET_KEY in .env — anyone who knows the
# signing secret can forge a login token.
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "careernexus-local-dev-only-change-me")
ALGORITHM = "HS256"
if SECRET_KEY == "careernexus-local-dev-only-change-me":
    print(
        "WARNING: JWT_SECRET_KEY not set — using the insecure dev fallback. "
        "Generate one with:  python -c \"import secrets; print(secrets.token_urlsafe(48))\""
    )

# Database Configuration
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./careernexus.db")

# Fallback to SQLite if DATABASE_URL contains placeholder template text
if "[project-id]" in DATABASE_URL or "[password]" in DATABASE_URL or "your-project" in DATABASE_URL:
    DATABASE_URL = "sqlite:///./careernexus.db"

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(
        DATABASE_URL,
        pool_size=10,
        max_overflow=20,
        pool_recycle=300,
        pool_pre_ping=True
    )
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

security = HTTPBearer()

# --- GOOGLE SIGN-IN KEY CACHE ---
# One shared client for the whole process. Google's public keys are fetched
# once and reused for an hour, so a sign-in no longer depends on a live
# network round-trip to Google succeeding at that exact moment — which is
# what made Google login work intermittently on flaky Wi-Fi.
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError

GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_JWKS = PyJWKClient(
    GOOGLE_CERTS_URL,
    cache_keys=True,
    cache_jwk_set=True,
    lifespan=3600,   # re-fetch at most once an hour
    timeout=10,      # fail fast instead of hanging the request
)


def warm_google_keys():
    """Pull Google's signing keys at startup so the first login is fast.

    Never fatal: without internet the app still starts, and Google sign-in
    simply fetches the keys on first use instead.
    """
    try:
        GOOGLE_JWKS.get_jwk_set()
        print("Google sign-in: signing keys cached")
    except Exception as e:
        print(f"Google sign-in: could not pre-fetch signing keys ({e}); will retry on first login")

# --- PASSWORD HASHING ---
# PBKDF2-HMAC-SHA256 from the standard library: no extra dependency to install
# and no bcrypt/passlib version pitfalls. Passwords are never stored in
# readable form.
import hashlib
import secrets
import hmac as _hmac

PBKDF2_ITERATIONS = 260000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Check a password against a stored hash.

    Also accepts legacy plaintext values left over from the early prototype so
    existing accounts keep working; those are re-hashed on next login.
    """
    if not stored:
        return False
    if stored.startswith("pbkdf2_sha256$"):
        try:
            _, iterations, salt, digest = stored.split("$")
            dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), int(iterations))
            return _hmac.compare_digest(dk.hex(), digest)
        except Exception:
            return False
    # Legacy plaintext row — compare in constant time, then the caller upgrades it.
    return _hmac.compare_digest(password, stored)


def needs_rehash(stored: str) -> bool:
    return not (stored or "").startswith("pbkdf2_sha256$")


def new_id(prefix: str) -> str:
    """A collision-proof primary key.

    A plain second-resolution timestamp is not unique: two people signing up
    in the same second, or one student submitting two assessments in a row,
    both produce the same id and the insert fails on the primary key. The
    millisecond clock plus random bytes removes that whole class of bug.
    """
    return f"{prefix}_{int(datetime.datetime.now().timestamp() * 1000)}{secrets.token_hex(3)}"

# --- DB MODELS ---

class StudentModel(Base):
    __tablename__ = "students"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    # One of: student, faculty, recruiter, institution, admin — the four
    # stakeholder types the problem statement names, plus the platform
    # operator. Admin unlocks the /api/admin/* endpoints and the admin panel.
    # Never settable from a normal signup — only promoted by another admin or
    # by the ADMIN_EMAILS bootstrap on startup.
    role = Column(String, nullable=False, default="student")
    # Organisation identity. A recruiter belongs to a company; a faculty
    # member and an institution account belong to a college.
    org_name = Column(String, nullable=True, default="")
    department = Column(String, nullable=True, default="")
    designation = Column(String, nullable=True, default="")
    # Deactivated accounts keep their data but cannot log in or call the API.
    is_active = Column(Integer, nullable=False, default=1)
    phone = Column(String, nullable=True)
    location = Column(String, nullable=True)
    photo_url = Column(String, nullable=True, default="")
    college = Column(String, nullable=True)
    degree = Column(String, nullable=True)
    branch = Column(String, nullable=True)
    current_year = Column(String, nullable=True)
    graduation_year = Column(Integer, nullable=True)
    cgpa = Column(Float, nullable=True)
    skills = Column(Text, default="[]")  # JSON string
    soft_skills = Column(Text, default="[]")  # JSON string
    projects = Column(Text, default="[]")  # JSON string
    certifications = Column(Text, default="[]")  # JSON string
    experience = Column(Text, default="[]")  # JSON string
    preferred_roles = Column(Text, default="[]")  # JSON string
    preferred_locations = Column(Text, default="[]")  # JSON string
    work_mode = Column(String, nullable=True, default="Hybrid")
    duration = Column(String, nullable=True, default="3-6 months")
    profile_completion = Column(Integer, default=80)
    placement_readiness = Column(Integer, default=70)
    # Connected Profiles. Links only - never a credential, never a scraped
    # copy of the profile itself. GitHub's public repos can additionally be
    # imported into `projects` below, one at a time, with the student's
    # explicit selection; LinkedIn has no equivalent public API, so it stays
    # a link plus manual entry into the fields that already exist.
    linkedin_url = Column(String, nullable=True, default="")
    github_url = Column(String, nullable=True, default="")


class InternshipModel(Base):
    """Every opportunity on the platform, whatever its shape.

    One table carries internships, full-time jobs, apprenticeships and live
    projects for students, and faculty internships, industrial training and
    FDPs for academicians. `opportunity_type` and `audience` are what tell
    them apart — the matching engine is identical for all of them.
    """
    __tablename__ = "internships"

    id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False)
    company = Column(String, nullable=False)
    location = Column(String, nullable=False)
    work_mode = Column(String, nullable=False)
    stipend = Column(String, nullable=True)
    duration = Column(String, nullable=True)
    deadline = Column(String, nullable=True)
    required_skills = Column(Text, default="[]")  # JSON string
    # internship | job | apprenticeship | project | fdp | training
    opportunity_type = Column(String, nullable=True, default="internship")
    audience = Column(String, nullable=True, default="student")  # student | faculty
    description = Column(Text, nullable=True, default="")
    min_cgpa = Column(Float, nullable=True, default=0.0)
    openings = Column(Integer, nullable=True, default=1)
    posted_by = Column(String, nullable=True)  # students.id of the publisher
    # Where this listing actually lives.
    #   "platform" — a recruiter posted it here, so students apply through us
    #                and the application record we create is the real one.
    #   "external" — it belongs to an official portal (a government scheme, a
    #                company's own careers page). We only surface it; the
    #                student applies on the official site, and offering an
    #                in-app "Apply" for one would be a lie, so we don't.
    source_type = Column(String, nullable=True, default="platform")
    official_url = Column(String, nullable=True, default="")
    source_name = Column(String, nullable=True, default="")   # e.g. "Government of India"
    eligibility = Column(String, nullable=True, default="")


class ApplicationModel(Base):
    __tablename__ = "applications"

    id = Column(String, primary_key=True, index=True)
    student_id = Column(String, ForeignKey("students.id"), nullable=False)
    internship_id = Column(String, ForeignKey("internships.id"), nullable=False)
    applied_on = Column(String, nullable=False)
    status = Column(String, default="applied")  # applied, shortlisted, under_review, rejected
    match_score = Column(Integer, default=0)


class ResumeModel(Base):
    __tablename__ = "resumes"

    student_id = Column(String, ForeignKey("students.id"), primary_key=True)
    file_name = Column(String, nullable=False)
    file_size_kb = Column(Integer, nullable=False)
    uploaded_at = Column(String, nullable=False)
    status = Column(String, default="processed")
    extracted_skills = Column(Text, default="[]")  # JSON string list


class AssessmentModel(Base):
    """One completed skill assessment.

    Every attempt is kept so a student can see improvement over time; the
    most recent one is what drives their skill profile and gap analysis.
    """
    __tablename__ = "assessments"

    id = Column(String, primary_key=True, index=True)
    student_id = Column(String, ForeignKey("students.id"), nullable=False, index=True)
    submitted_at = Column(String, nullable=False)
    technical_score = Column(Integer, default=0)   # 0-100
    soft_score = Column(Integer, default=0)        # 0-100
    aptitude_score = Column(Integer, default=0)    # 0-100
    overall_score = Column(Integer, default=0)     # 0-100
    category_scores = Column(Text, default="{}")   # {"Web Development": 66, ...}
    answers = Column(Text, default="{}")           # {question_id: answer}


class LearningProgramModel(Base):
    """A course, certification, workshop or mentorship offer.

    Industry partners publish these; students meet them attached to the
    exact skill gap the program closes.
    """
    __tablename__ = "learning_programs"

    id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False)
    provider = Column(String, nullable=False)
    program_type = Column(String, nullable=False, default="course")  # course|certification|workshop|mentorship
    description = Column(Text, default="")
    skills_covered = Column(Text, default="[]")   # JSON list
    url = Column(String, default="")
    duration = Column(String, default="")
    cost = Column(String, default="Free")
    audience = Column(String, default="student")  # student|faculty|both
    posted_by = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    eligibility = Column(String, default="")
    certificate = Column(Integer, default=0)   # 1 when it awards a certificate
    # "official" for a first-party platform (NPTEL, Microsoft Learn, AWS),
    # "industry" for something a recruiter published here.
    source_type = Column(String, default="industry")


class CollaborationModel(Base):
    """Industry-academia collaboration calls: guest lectures, workshops,
    live projects, innovation challenges, consultancy and joint research."""
    __tablename__ = "collaborations"

    id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False)
    organisation = Column(String, nullable=False)
    collab_type = Column(String, nullable=False, default="workshop")
    description = Column(Text, default="")
    skills_involved = Column(Text, default="[]")
    mode = Column(String, default="Hybrid")
    location = Column(String, default="")
    starts_on = Column(String, default="")
    seats = Column(Integer, default=0)            # 0 = unlimited
    audience = Column(String, default="both")     # student|faculty|both
    posted_by = Column(String, nullable=True)
    created_at = Column(String, nullable=False)


class CollabInterestModel(Base):
    """A student or faculty member registering for a collaboration."""
    __tablename__ = "collab_interests"

    id = Column(String, primary_key=True, index=True)
    collab_id = Column(String, ForeignKey("collaborations.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("students.id"), nullable=False, index=True)
    registered_at = Column(String, nullable=False)
    note = Column(Text, default="")


class ProgressLogModel(Base):
    """Weekly internship progress. The intern writes the entry; the mentor
    (whoever posted the role) adds feedback and a rating."""
    __tablename__ = "progress_logs"

    id = Column(String, primary_key=True, index=True)
    application_id = Column(String, ForeignKey("applications.id"), nullable=False, index=True)
    week = Column(Integer, default=1)
    summary = Column(Text, default="")
    hours = Column(Integer, default=0)
    created_at = Column(String, nullable=False)
    mentor_feedback = Column(Text, default="")
    mentor_rating = Column(Integer, default=0)    # 0 = not yet reviewed, else 1-5
    reviewed_at = Column(String, nullable=True)


class VerificationModel(Base):
    """A verification stamp on one portfolio item.

    This is what makes the portfolio *verified* rather than self-claimed: a
    faculty member, the institution, or the company that hosted the
    internship signs off on a skill, certificate, project or placement.
    """
    __tablename__ = "verifications"

    id = Column(String, primary_key=True, index=True)
    student_id = Column(String, ForeignKey("students.id"), nullable=False, index=True)
    item_type = Column(String, nullable=False)    # skill|certification|project|internship
    item_key = Column(String, nullable=False)     # skill name / cert title / project title / application id
    verified_by = Column(String, nullable=True)
    verifier_name = Column(String, default="")
    verifier_role = Column(String, default="")
    verified_at = Column(String, nullable=False)
    note = Column(Text, default="")


class DocumentModel(Base):
    """Secure document store for certificates, internship reports and
    academic records. Bytes live in the row so a fresh clone needs no
    object storage; only the owner and staff can read one back."""
    __tablename__ = "documents"

    id = Column(String, primary_key=True, index=True)
    student_id = Column(String, ForeignKey("students.id"), nullable=False, index=True)
    doc_type = Column(String, nullable=False, default="certificate")
    title = Column(String, nullable=False)
    file_name = Column(String, nullable=False)
    content_type = Column(String, default="application/pdf")
    size_kb = Column(Integer, default=0)
    uploaded_at = Column(String, nullable=False)
    data_b64 = Column(Text, default="")


class AppMetaModel(Base):
    """One-row-per-key scratchpad for the app's own bookkeeping.

    Currently holds only the seed marker (see SEED_VERSION). Deliberately
    tiny and generic so a future "last feed sync" style flag has somewhere
    to live without another table.
    """
    __tablename__ = "app_meta"

    key = Column(String, primary_key=True, index=True)
    value = Column(String, default="")


# Bump this whenever the seed data below changes - the catalogue, the demo
# accounts, the learning programmes, anything the seed_* functions write.
# Startup compares it against what is recorded in app_meta and re-runs the
# seeders only when the two differ.
SEED_VERSION = "2026-09-10b"


# Create tables
def create_missing_tables():
    """Create any table that does not exist yet, in ONE round trip.

    Base.metadata.create_all() asks the server "does this table exist?" for
    every table separately. That is 38 queries, and against a remote Supabase
    instance at ~350ms each it was adding twelve seconds to every startup to
    confirm nothing had changed. One reflection call answers it all, and
    checkfirst=False is then safe because we already know what is missing.
    """
    try:
        existing = set(sa_inspect(engine).get_table_names())
    except Exception:
        Base.metadata.create_all(bind=engine)   # reflection failed; slow path
        return
    missing = [t for name, t in Base.metadata.tables.items() if name not in existing]
    if missing:
        Base.metadata.create_all(bind=engine, tables=missing, checkfirst=False)


create_missing_tables()


# --- LIGHTWEIGHT MIGRATIONS ---
# create_all() never ALTERs an existing table, so columns added after a table
# was first created (role, is_active) have to be back-filled by hand. This runs
# on every startup and is a no-op once the columns exist.
def run_migrations():
    is_sqlite = DATABASE_URL.startswith("sqlite")
    add_columns = [
        ("students", "role", "VARCHAR DEFAULT 'student'"),
        ("students", "is_active", "INTEGER DEFAULT 1"),
        # Added with the multi-stakeholder build.
        ("students", "org_name", "VARCHAR DEFAULT ''"),
        ("students", "department", "VARCHAR DEFAULT ''"),
        ("students", "designation", "VARCHAR DEFAULT ''"),
        # Connected Profiles (LinkedIn / GitHub) - see /api/social/github-import.
        ("students", "linkedin_url", "VARCHAR DEFAULT ''"),
        ("students", "github_url", "VARCHAR DEFAULT ''"),
        ("internships", "opportunity_type", "VARCHAR DEFAULT 'internship'"),
        ("internships", "audience", "VARCHAR DEFAULT 'student'"),
        ("internships", "description", "TEXT DEFAULT ''"),
        ("internships", "min_cgpa", "FLOAT DEFAULT 0"),
        ("internships", "openings", "INTEGER DEFAULT 1"),
        ("internships", "posted_by", "VARCHAR"),
        # Official-source linking.
        ("internships", "source_type", "VARCHAR DEFAULT 'platform'"),
        ("internships", "official_url", "VARCHAR DEFAULT ''"),
        ("internships", "source_name", "VARCHAR DEFAULT ''"),
        ("internships", "eligibility", "VARCHAR DEFAULT ''"),
        ("learning_programs", "eligibility", "VARCHAR DEFAULT ''"),
        ("learning_programs", "certificate", "INTEGER DEFAULT 0"),
        ("learning_programs", "source_type", "VARCHAR DEFAULT 'industry'"),
    ]
    backfills = (
        "UPDATE students SET role = 'student' WHERE role IS NULL",
        "UPDATE students SET is_active = 1 WHERE is_active IS NULL",
        "UPDATE internships SET opportunity_type = 'internship' WHERE opportunity_type IS NULL",
        "UPDATE internships SET audience = 'student' WHERE audience IS NULL",
        "UPDATE internships SET source_type = 'platform' WHERE source_type IS NULL",
        "UPDATE learning_programs SET source_type = 'industry' WHERE source_type IS NULL",
    )

    with engine.connect() as conn:
        if is_sqlite:
            # SQLite has no ADD COLUMN IF NOT EXISTS, so each one has to be
            # attempted on its own and the "duplicate column" error swallowed.
            # It is a local file, so the round trips cost nothing.
            for table, column, ddl in add_columns:
                try:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
                    conn.commit()
                except Exception:
                    conn.rollback()  # column already exists
            for stmt in backfills:
                try:
                    conn.execute(text(stmt))
                    conn.commit()
                except Exception:
                    conn.rollback()
            return

        # PostgreSQL: every statement here is idempotent, so the whole set can
        # go in ONE round trip instead of 24. That matters more than it looks -
        # against a remote Supabase instance a round trip costs ~350ms, so
        # sending these one at a time was adding ~20 seconds to every startup
        # for work that is a no-op after the first run.
        script = ";\n".join(
            [f"ALTER TABLE {t} ADD COLUMN IF NOT EXISTS {c} {d}" for t, c, d in add_columns]
            + list(backfills)
        )
        try:
            conn.exec_driver_sql(script)
            conn.commit()
        except Exception as exc:
            # One bad statement rolls back the whole script, so fall back to
            # the slow path rather than leaving the schema half-patched.
            conn.rollback()
            print(f"Schema patch: batch failed ({exc}); applying one at a time")
            for table, column, ddl in add_columns:
                try:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {ddl}"))
                    conn.commit()
                except Exception:
                    conn.rollback()
            for stmt in backfills:
                try:
                    conn.execute(text(stmt))
                    conn.commit()
                except Exception:
                    conn.rollback()


run_migrations()

# Emails in ADMIN_EMAILS (comma-separated, from .env) are promoted to admin on
# startup so there is always a way in. Everyone else stays a student.
# Shortest password a new account may be created with. Checked only at
# registration, so no existing account is ever locked out by it.
MIN_PASSWORD_LENGTH = 8

ADMIN_EMAILS = [
    e.strip().lower()
    for e in os.environ.get("ADMIN_EMAILS", "aayushswapnali@gmail.com").split(",")
    if e.strip()
]


def bootstrap_admins():
    if not ADMIN_EMAILS:
        return
    db = SessionLocal()
    try:
        for email in ADMIN_EMAILS:
            student = db.query(StudentModel).filter(StudentModel.email == email).first()
            if student and student.role != "admin":
                student.role = "admin"
        db.commit()
    finally:
        db.close()


# --- DB SEEDING (ON STARTUP) ---

def seed_database():
    db = SessionLocal()
    try:
        # Check if internships are empty
        if db.query(InternshipModel).count() == 0:
            mock_internships = [
                InternshipModel(
                    id="int_1",
                    title="Frontend Developer Intern",
                    company="CareerNexus Demo Employer",
                    location="Pune",
                    work_mode="Hybrid",
                    stipend="₹15,000/month",
                    duration="3 months",
                    deadline="2026-09-15",
                    required_skills=json.dumps(["JavaScript", "HTML", "CSS", "React", "TypeScript"])
                ),
                InternshipModel(
                    id="int_2",
                    title="Full Stack Engineer Intern",
                    company="CareerNexus Demo Employer",
                    location="Bengaluru",
                    work_mode="Remote",
                    stipend="₹20,000/month",
                    duration="6 months",
                    deadline="2026-09-22",
                    required_skills=json.dumps(["Python", "FastAPI", "React", "SQL", "Docker"])
                ),
                InternshipModel(
                    id="int_3",
                    title="Data Analyst Intern",
                    company="CareerNexus Demo Employer",
                    location="Remote",
                    work_mode="Remote",
                    stipend="₹12,000/month",
                    duration="3 months",
                    deadline="2026-09-10",
                    required_skills=json.dumps(["Python", "SQL", "Excel", "Power BI"])
                ),
                InternshipModel(
                    id="int_4",
                    title="Backend Developer Intern",
                    company="CareerNexus Demo Employer",
                    location="Hyderabad",
                    work_mode="On-site",
                    stipend="₹18,000/month",
                    duration="4 months",
                    deadline="2026-10-01",
                    required_skills=json.dumps(["Python", "FastAPI", "PostgreSQL", "AWS", "Docker"])
                ),
                InternshipModel(
                    id="int_5",
                    title="UI/UX Design Intern",
                    company="CareerNexus Demo Employer",
                    location="Mumbai",
                    work_mode="Hybrid",
                    stipend="₹10,000/month",
                    duration="3 months",
                    deadline="2026-09-18",
                    required_skills=json.dumps(["Figma", "Adobe XD", "CSS", "User Research"])
                )
            ]
            db.add_all(mock_internships)
            db.commit()

        # Seed default mock student if empty
        if db.query(StudentModel).filter(StudentModel.email == "aayushswapnali@gmail.com").first() is None:
            # We seed the default student with Aayush's profile details
            default_student = StudentModel(
                id="stu_1001",
                email="aayushswapnali@gmail.com",
                # Demo account password: demo1234 (documented in the README)
                password_hash=hash_password("demo1234"),
                full_name="Aayush Chaudhari",
                role="admin",
                is_active=1,
                phone="+91 98765 43210",
                location="Jalgaon, Maharashtra",
                photo_url="",
                college="Shram Sadhana Bombay Trust's College of Engineering & Technology, Jalgaon",
                degree="B.Tech",
                branch="Computer Engineering",
                current_year="3rd Year",
                graduation_year=2027,
                cgpa=8.6,
                skills=json.dumps(["Python", "JavaScript", "React", "SQL", "Git", "FastAPI", "HTML", "CSS"]),
                soft_skills=json.dumps(["Communication", "Leadership", "Problem Solving", "Teamwork"]),
                projects=json.dumps([
                    {"id": 1, "title": "Campus Skill Tracker", "description": "A web app to track student skills and certifications for placement readiness.", "tech": ["React", "Node.js", "MongoDB"], "link": ""},
                    {"id": 2, "title": "AI Resume Parser", "description": "Extracts skills and experience from PDF resumes using NLP.", "tech": ["Python", "spaCy"], "link": ""}
                ]),
                certifications=json.dumps([
                    {"id": 1, "title": "Google Data Analytics Certificate", "issuer": "Google", "year": 2025},
                    {"id": 2, "title": "AWS Cloud Practitioner", "issuer": "Amazon Web Services", "year": 2025}
                ]),
                experience=json.dumps([
                    {"id": 1, "role": "Web Development Intern", "org": "CodeCraft Labs", "duration": "May 2025 – Jul 2025", "description": "Built and shipped internal dashboard components using React."}
                ]),
                preferred_roles=json.dumps(["Frontend Developer", "Full Stack Developer"]),
                preferred_locations=json.dumps(["Pune", "Bengaluru", "Remote"]),
                work_mode="Hybrid",
                duration="3-6 months",
                profile_completion=82,
                placement_readiness=78
            )
            db.add(default_student)
            db.commit()

            # Seed default application records
            if db.query(ApplicationModel).count() == 0:
                apps = [
                    ApplicationModel(id="app_1", student_id="stu_1001", internship_id="int_1", applied_on="2026-08-18", status="shortlisted", match_score=91),
                    ApplicationModel(id="app_2", student_id="stu_1001", internship_id="int_2", applied_on="2026-08-15", status="under_review", match_score=78),
                    ApplicationModel(id="app_3", student_id="stu_1001", internship_id="int_4", applied_on="2026-08-10", status="rejected", match_score=55),
                    ApplicationModel(id="app_4", student_id="stu_1001", internship_id="int_3", applied_on="2026-08-05", status="applied", match_score=64)
                ]
                db.add_all(apps)
                db.commit()
    finally:
        db.close()

def seeds_are_current() -> bool:
    """Has this database already been seeded at SEED_VERSION?

    The seed functions are idempotent, so re-running them is harmless - but
    against a remote Supabase instance they cost around twenty seconds of
    round trips to establish that nothing needs changing. One query answers
    the same question. A fresh database has no marker and seeds normally, so
    nobody has to remember to run a setup step.
    """
    if os.environ.get("CN_FORCE_RESEED", "").strip().lower() in ("1", "true", "yes"):
        return False
    db = SessionLocal()
    try:
        row = db.query(AppMetaModel).filter(AppMetaModel.key == "seed_version").first()
        return bool(row and row.value == SEED_VERSION)
    except Exception:
        return False          # no marker table yet, or unreadable: seed
    finally:
        db.close()


def mark_seeds_current():
    """Record that the seeders have run at this SEED_VERSION."""
    db = SessionLocal()
    try:
        row = db.query(AppMetaModel).filter(AppMetaModel.key == "seed_version").first()
        if row is None:
            db.add(AppMetaModel(key="seed_version", value=SEED_VERSION))
        else:
            row.value = SEED_VERSION
        db.commit()
    except Exception as exc:
        db.rollback()
        # Not fatal: the next startup just seeds again, which is the old
        # behaviour rather than a broken one.
        print(f"Seed marker: could not record version ({exc})")
    finally:
        db.close()


SEEDS_CURRENT = seeds_are_current()
if SEEDS_CURRENT:
    print(f"Seed data: already at {SEED_VERSION}, skipping seeders")

if not SEEDS_CURRENT:
    seed_database()
bootstrap_admins()
warm_google_keys()

# --- DB HELPERS ---

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- AUTH UTILS ---

def get_student_from_token(token: str, db: Session) -> StudentModel:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    
    student = db.query(StudentModel).filter(StudentModel.email == email).first()
    if student is None:
        raise HTTPException(status_code=404, detail="Student profile not found")
    if student.is_active == 0:
        raise HTTPException(status_code=403, detail="This account has been deactivated")
    return student

def get_current_student(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)) -> StudentModel:
    token = credentials.credentials
    return get_student_from_token(token, db)

def get_current_admin(student: StudentModel = Depends(get_current_student)) -> StudentModel:
    """Same as get_current_student, but rejects anyone who is not an admin.

    This is the ONLY thing standing between a normal user and the admin API —
    hiding the admin link in the frontend is cosmetic; this check is the wall.
    """
    if (student.role or "student") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return student


# --- ROLES ---
# A person holds exactly one role. The first four are the stakeholder types
# the problem statement names; "admin" is the platform operator, who can do
# anything any of the others can.
ROLE_STUDENT = "student"
ROLE_FACULTY = "faculty"
ROLE_RECRUITER = "recruiter"
ROLE_INSTITUTION = "institution"
ROLE_ADMIN = "admin"
VALID_ROLES = {ROLE_STUDENT, ROLE_FACULTY, ROLE_RECRUITER, ROLE_INSTITUTION, ROLE_ADMIN}

# Who may publish opportunities, learning programs and collaboration calls.
POSTER_ROLES = {ROLE_RECRUITER, ROLE_INSTITUTION, ROLE_FACULTY, ROLE_ADMIN}
# Who may stamp a portfolio item as verified. Deliberately excludes the
# student themselves — a self-signed verification would be worthless.
VERIFIER_ROLES = {ROLE_FACULTY, ROLE_INSTITUTION, ROLE_RECRUITER, ROLE_ADMIN}


def require_roles(*allowed: str):
    """Build a dependency that admits only the listed roles.

    Admin is always admitted. Like get_current_admin, this is the real wall —
    hiding a link in the frontend is only cosmetic.
    """
    allowed_set = set(allowed) | {ROLE_ADMIN}

    def _dep(user: StudentModel = Depends(get_current_student)) -> StudentModel:
        if (user.role or ROLE_STUDENT) not in allowed_set:
            raise HTTPException(
                status_code=403,
                detail=f"This action is available to: {', '.join(sorted(allowed))}",
            )
        return user

    return _dep


def user_role(user: StudentModel) -> str:
    return user.role or ROLE_STUDENT

# --- PAIRED ALGORITHMS ---

def calculate_match_score_breakdown(student: StudentModel, internship: InternshipModel):
    # 1. Required Skills Match (50% weight - see the 0.5 multiplier below;
    #    this comment previously said 60%, which the code never did)
    req_skills = json.loads(internship.required_skills)
    stu_skills = json.loads(student.skills)
    
    matched_skills = [s for s in req_skills if s.lower() in [sk.lower() for sk in stu_skills]]
    missing_skills = [s for s in req_skills if s.lower() not in [sk.lower() for sk in stu_skills]]
    
    skill_pct = (len(matched_skills) / len(req_skills)) * 100 if req_skills else 100.0

    # 2. Preferences (20% weight)
    # Work Mode match
    mode_score = 0
    if internship.work_mode.lower() == student.work_mode.lower():
        mode_score = 100
    elif (internship.work_mode.lower() in ["hybrid", "remote"]) and (student.work_mode.lower() in ["hybrid", "remote"]):
        mode_score = 50
        
    # Location match
    loc_score = 0
    pref_locations = [loc.lower() for loc in json.loads(student.preferred_locations)]
    if internship.work_mode.lower() == "remote":
        loc_score = 100
    elif internship.location.lower() in pref_locations:
        loc_score = 100
    elif any(pref in internship.location.lower() for pref in pref_locations):
        loc_score = 75
    else:
        loc_score = 30
        
    preferences_score = (mode_score + loc_score) / 2

    # 3. Education Eligibility (15% weight)
    cgpa = student.cgpa or 0.0
    if cgpa >= 8.5:
        education_score = 100
    elif cgpa >= 7.0:
        education_score = 90
    elif cgpa >= 6.0:
        education_score = 80
    else:
        education_score = 50

    # 4. Projects relevance (15% weight)
    projects = json.loads(student.projects)
    project_skills_count = 0
    for proj in projects:
        tech_list = [t.lower() for t in proj.get("tech", [])]
        for s in req_skills:
            if s.lower() in tech_list or s.lower() in proj.get("description", "").lower() or s.lower() in proj.get("title", "").lower():
                project_skills_count += 1
                break
    
    if len(projects) == 0:
        project_score = 60
    else:
        project_score = min(60 + (project_skills_count * 20), 100)

    # Calculate overall weighted score
    match_score = int((skill_pct * 0.5) + (preferences_score * 0.2) + (education_score * 0.15) + (project_score * 0.15))
    
    # Cap between 10 and 100
    match_score = max(10, min(100, match_score))

    breakdown = {
        "Required Skills": int(skill_pct),
        "Education Eligibility": int(education_score),
        "Preferences": int(preferences_score),
        "Projects": int(project_score)
    }

    return {
        "match_score": match_score,
        "breakdown": breakdown,
        "matched_skills": matched_skills,
        "missing_skills": missing_skills
    }

# --- KEYWORD SKILLS DICTIONARY FOR PARSING ---
TECH_KEYWORDS = [
    "Python", "JavaScript", "React", "SQL", "Git", "FastAPI", "HTML", "CSS", "TypeScript", 
    "Docker", "PostgreSQL", "AWS", "Figma", "Adobe XD", "Excel", "Power BI", "Node.js", 
    "Express", "MongoDB", "C++", "Java", "C#", "Next.js", "Vue", "Angular", "Tailwind"
]

SOFT_KEYWORDS = [
    "Communication", "Leadership", "Problem Solving", "Teamwork", "Time Management", 
    "Adaptability", "Critical Thinking", "Creativity"
]

# --- PYDANTIC SCHEMAS ---

class LoginPayload(BaseModel):
    email: EmailStr
    password: str

class RegisterPayload(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    college: Optional[str] = ""
    branch: Optional[str] = ""
    current_year: Optional[str] = ""
    graduation_year: Optional[int] = datetime.datetime.now().year + 2
    cgpa: Optional[float] = 0.0
    # Which stakeholder is signing up. "admin" is deliberately not accepted
    # here — see the check in register().
    role: Optional[str] = "student"
    org_name: Optional[str] = ""
    department: Optional[str] = ""
    designation: Optional[str] = ""

class ProfileUpdatePayload(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    college: Optional[str] = None
    degree: Optional[str] = None
    branch: Optional[str] = None
    current_year: Optional[str] = None
    graduation_year: Optional[int] = None
    cgpa: Optional[float] = None
    skills: Optional[List[str]] = None
    soft_skills: Optional[List[str]] = None
    projects: Optional[List[dict]] = None
    certifications: Optional[List[dict]] = None
    experience: Optional[List[dict]] = None
    preferred_roles: Optional[List[str]] = None
    preferred_locations: Optional[List[str]] = None
    work_mode: Optional[str] = None
    duration: Optional[str] = None
    org_name: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None

class ConfirmSkillsPayload(BaseModel):
    skills: List[str] = []

class WhatIfPayload(BaseModel):
    skills: List[str] = []

# --- API ENDPOINTS ---

@app.post("/api/auth/login")
def login(payload: LoginPayload, db: Session = Depends(get_db)):
    # Case-insensitive: a mailbox is the same mailbox however it was typed.
    # Matching on lower() rather than forcing the stored value keeps any
    # pre-existing mixed-case row working instead of locking it out.
    student = db.query(StudentModel).filter(
        func.lower(StudentModel.email) == (payload.email or "").strip().lower()
    ).first()

    # Verify the password. The same generic message is returned whether the
    # email is unknown or the password is wrong, so this endpoint cannot be
    # used to discover which email addresses have accounts.
    if not student or not verify_password(payload.password, student.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Transparently upgrade legacy plaintext rows to a real hash on first
    # successful login, so old accounts keep working without a manual reset.
    if needs_rehash(student.password_hash):
        student.password_hash = hash_password(payload.password)
        db.commit()
        db.refresh(student)

    # Generate JWT token
    token = jwt.encode(
        {"sub": student.email, "exp": datetime.datetime.utcnow() + datetime.timedelta(days=7)},
        SECRET_KEY,
        algorithm=ALGORITHM
    )

    # Convert JSON text to python objects for output response matching MOCK.student
    student_dict = {
        "id": student.id,
        "full_name": student.full_name,
        "email": student.email,
        "role": student.role or "student",
        "org_name": student.org_name or "",
        "department": student.department or "",
        "designation": student.designation or "",
        "phone": student.phone or "",
        "location": student.location or "",
        "photo_url": student.photo_url or "",
        "linkedin_url": student.linkedin_url or "",
        "github_url": student.github_url or "",
        "college": student.college or "",
        "degree": student.degree or "",
        "branch": student.branch or "",
        "current_year": student.current_year or "",
        "graduation_year": student.graduation_year or 0,
        "cgpa": student.cgpa or 0.0,
        "profile_completion": student.profile_completion,
        "placement_readiness": student.placement_readiness,
        "skills": json.loads(student.skills),
        "soft_skills": json.loads(student.soft_skills),
        "projects": json.loads(student.projects),
        "certifications": json.loads(student.certifications),
        "experience": json.loads(student.experience),
        "preferences": {
            "preferred_roles": json.loads(student.preferred_roles),
            "preferred_locations": json.loads(student.preferred_locations),
            "work_mode": student.work_mode,
            "duration": student.duration
        }
    }

    return {"token": token, "student": student_dict}


@app.post("/api/auth/register")
def register(payload: RegisterPayload, db: Session = Depends(get_db)):
    # Email is an identity, and mailboxes are not case sensitive. Storing it
    # as typed let Foo@x.com and foo@x.com become two separate accounts for
    # one real person - and the ADMIN_EMAILS bootstrap, which lowercases,
    # would then match only one of them.
    email = (payload.email or "").strip().lower()

    existing = db.query(StudentModel).filter(
        func.lower(StudentModel.email) == email
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # A password short enough to guess protects nothing. Checked here rather
    # than in the model so the message says what to do about it.
    if len(payload.password or "") < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters.",
        )

    # Anyone may sign up as a student, faculty member, recruiter or
    # institution. Admin is never self-assignable — it is granted only by an
    # existing admin or the ADMIN_EMAILS bootstrap, so an open signup form can
    # never be used to mint a platform operator.
    requested_role = (payload.role or "student").strip().lower()
    if requested_role == "admin" or requested_role not in {
        "student",
        "faculty",
        "recruiter",
        "institution",
    }:
        requested_role = "student"

    student_id = new_id("stu")
    student = StudentModel(
        id=student_id,
        email=email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=requested_role,
        org_name=(payload.org_name or "").strip(),
        department=(payload.department or "").strip(),
        designation=(payload.designation or "").strip(),
        college=payload.college or "",
        branch=payload.branch or "",
        current_year=payload.current_year or "",
        graduation_year=payload.graduation_year or 0,
        cgpa=payload.cgpa or 0.0,
        skills=json.dumps([]),
        soft_skills=json.dumps([]),
        projects=json.dumps([]),
        certifications=json.dumps([]),
        experience=json.dumps([]),
        preferred_roles=json.dumps([]),
        preferred_locations=json.dumps([]),
        work_mode="",
        duration="",
        profile_completion=20,
        placement_readiness=0
    )
    
    db.add(student)
    db.commit()
    db.refresh(student)

    # Generate JWT
    token = jwt.encode(
        {"sub": student.email, "exp": datetime.datetime.utcnow() + datetime.timedelta(days=7)},
        SECRET_KEY,
        algorithm=ALGORITHM
    )

    student_dict = {
        "id": student.id,
        "full_name": student.full_name,
        "email": student.email,
        "role": student.role or "student",
        "org_name": student.org_name or "",
        "department": student.department or "",
        "designation": student.designation or "",
        "phone": student.phone or "",
        "location": student.location or "",
        "photo_url": student.photo_url or "",
        "linkedin_url": student.linkedin_url or "",
        "github_url": student.github_url or "",
        "college": student.college or "",
        "degree": student.degree or "",
        "branch": student.branch or "",
        "current_year": student.current_year or "",
        "graduation_year": student.graduation_year or 0,
        "cgpa": student.cgpa or 0.0,
        "profile_completion": student.profile_completion,
        "placement_readiness": student.placement_readiness,
        "skills": json.loads(student.skills),
        "soft_skills": json.loads(student.soft_skills),
        "projects": json.loads(student.projects),
        "certifications": json.loads(student.certifications),
        "experience": json.loads(student.experience),
        "preferences": {
            "preferred_roles": json.loads(student.preferred_roles),
            "preferred_locations": json.loads(student.preferred_locations),
            "work_mode": student.work_mode,
            "duration": student.duration
        }
    }

    return {"token": token, "student": student_dict}


class GooglePayload(BaseModel):
    credential: str


@app.post("/api/auth/google")
def google_login(payload: GooglePayload, db: Session = Depends(get_db)):
    """Sign in with Google.

    The browser sends the ID token issued by Google Identity Services. We
    verify that token's signature server-side against Google's public keys
    before trusting any of its claims — without this check anyone could POST
    an arbitrary email and be issued a session.
    """
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    if not client_id:
        raise HTTPException(
            status_code=503,
            detail="Google sign-in is not configured on the server. Set GOOGLE_CLIENT_ID in .env",
        )

    # Fetch Google's signing key. The client is a module-level singleton so the
    # key set is cached — otherwise every sign-in makes a live HTTPS call to
    # Google and fails whenever the network hiccups. One retry covers a cache
    # miss caused by Google rotating its keys.
    try:
        signing_key = GOOGLE_JWKS.get_signing_key_from_jwt(payload.credential)
    except PyJWKClientConnectionError as first_error:
        # Genuinely could not reach Google — worth one retry, then say so
        # plainly instead of blaming the user's account.
        try:
            signing_key = GOOGLE_JWKS.get_signing_key_from_jwt(payload.credential)
        except Exception as e:
            print(f"Google sign-in: cannot reach Google's key server ({first_error} / {e})")
            raise HTTPException(
                status_code=503,
                detail="Could not reach Google to verify your sign-in. Check your internet connection and try again.",
            )
    except Exception as e:
        # Malformed or unsigned token — a client problem, not a network one.
        print(f"Google sign-in: bad token ({type(e).__name__}: {e})")
        raise HTTPException(status_code=401, detail="Google sign-in failed. Please try again.")

    try:
        claims = jwt.decode(
            payload.credential,
            signing_key.key,
            algorithms=["RS256"],
            audience=client_id,
            issuer=["https://accounts.google.com", "accounts.google.com"],
        )
    except Exception as e:
        print(f"Google sign-in: token rejected ({type(e).__name__}: {e})")
        raise HTTPException(status_code=401, detail="Google sign-in failed. Please try again.")

    email = claims.get("email")
    if not email or not claims.get("email_verified", False):
        raise HTTPException(status_code=401, detail="Google account has no verified email address")

    student = db.query(StudentModel).filter(StudentModel.email == email).first()
    if student is None:
        student = StudentModel(
            id=new_id("stu"),
            email=email,
            password_hash="google_oauth",  # no local password for Google accounts
            full_name=claims.get("name") or email.split("@")[0].title(),
            photo_url=claims.get("picture", ""),
            skills=json.dumps([]),
            soft_skills=json.dumps([]),
            projects=json.dumps([]),
            certifications=json.dumps([]),
            experience=json.dumps([]),
            preferred_roles=json.dumps([]),
            preferred_locations=json.dumps(["Remote"]),
            work_mode="Remote",
            duration="3 months",
            profile_completion=30,
            placement_readiness=40,
        )
        db.add(student)
        db.commit()
        db.refresh(student)
    elif claims.get("picture") and not student.photo_url:
        student.photo_url = claims["picture"]
        db.commit()
        db.refresh(student)

    token = jwt.encode(
        {"sub": student.email, "exp": datetime.datetime.utcnow() + datetime.timedelta(days=7)},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )
    return {"token": token, "student": get_profile(student)}


@app.get("/api/student/profile")
def get_profile(student: StudentModel = Depends(get_current_student)):
    return {
        "id": student.id,
        "full_name": student.full_name,
        "email": student.email,
        "role": student.role or "student",
        "org_name": student.org_name or "",
        "department": student.department or "",
        "designation": student.designation or "",
        "phone": student.phone or "",
        "location": student.location or "",
        "photo_url": student.photo_url or "",
        "linkedin_url": student.linkedin_url or "",
        "github_url": student.github_url or "",
        "college": student.college or "",
        "degree": student.degree or "",
        "branch": student.branch or "",
        "current_year": student.current_year or "",
        "graduation_year": student.graduation_year or 0,
        "cgpa": student.cgpa or 0.0,
        "profile_completion": student.profile_completion,
        "placement_readiness": student.placement_readiness,
        "skills": json.loads(student.skills),
        "soft_skills": json.loads(student.soft_skills),
        "projects": json.loads(student.projects),
        "certifications": json.loads(student.certifications),
        "experience": json.loads(student.experience),
        "preferences": {
            "preferred_roles": json.loads(student.preferred_roles),
            "preferred_locations": json.loads(student.preferred_locations),
            "work_mode": student.work_mode,
            "duration": student.duration
        }
    }


@app.put("/api/student/profile")
def update_profile(payload: ProfileUpdatePayload, student: StudentModel = Depends(get_current_student), db: Session = Depends(get_db)):
    # Update simple scalar attributes if provided
    if payload.full_name is not None: student.full_name = payload.full_name
    if payload.phone is not None: student.phone = payload.phone
    if payload.location is not None: student.location = payload.location
    if payload.college is not None: student.college = payload.college
    if payload.degree is not None: student.degree = payload.degree
    if payload.branch is not None: student.branch = payload.branch
    if payload.current_year is not None: student.current_year = payload.current_year
    if payload.graduation_year is not None: student.graduation_year = payload.graduation_year
    if payload.cgpa is not None: student.cgpa = payload.cgpa
    if payload.work_mode is not None: student.work_mode = payload.work_mode
    if payload.duration is not None: student.duration = payload.duration
    if payload.org_name is not None: student.org_name = payload.org_name
    if payload.department is not None: student.department = payload.department
    if payload.designation is not None: student.designation = payload.designation
    if payload.linkedin_url is not None:
        student.linkedin_url = _validate_social_url(payload.linkedin_url, "linkedin_url", "linkedin.com")
    if payload.github_url is not None:
        student.github_url = _validate_social_url(payload.github_url, "github_url", "github.com")

    # Update list properties (serialized as JSON strings)
    if payload.skills is not None: student.skills = json.dumps(payload.skills)
    if payload.soft_skills is not None: student.soft_skills = json.dumps(payload.soft_skills)
    if payload.projects is not None: student.projects = json.dumps(payload.projects)
    if payload.certifications is not None: student.certifications = json.dumps(payload.certifications)
    if payload.experience is not None: student.experience = json.dumps(payload.experience)
    if payload.preferred_roles is not None: student.preferred_roles = json.dumps(payload.preferred_roles)
    if payload.preferred_locations is not None: student.preferred_locations = json.dumps(payload.preferred_locations)

    # Dynamic calculation of Profile Completion
    # Check populated fields
    fields_to_check = [
        student.full_name, student.phone, student.location, student.college,
        student.degree, student.branch, student.cgpa
    ]
    filled = sum(1 for f in fields_to_check if f)
    
    # Check lists
    if json.loads(student.skills): filled += 1
    if json.loads(student.projects): filled += 1
    if json.loads(student.experience): filled += 1
    
    student.profile_completion = min(40 + int((filled / 10) * 60), 100)

    # Dynamic Placement Readiness based on skills count, projects and CGPA
    readiness = 40
    readiness += min(len(json.loads(student.skills)) * 4, 30)
    readiness += min(len(json.loads(student.projects)) * 10, 20)
    if student.cgpa and student.cgpa >= 8.0:
        readiness += 10
    
    student.placement_readiness = min(readiness, 100)

    db.commit()
    db.refresh(student)

    # Return updated profile
    return get_profile(student)


# =====================================================================
# CONNECTED PROFILES — GitHub import
#
# GitHub's public REST API needs no key or OAuth for public data, so this
# calls it directly, server-side, and returns exactly what GitHub returned
# — no description, language or topic here is generated, only read.
#
# LinkedIn has no equivalent. Its official API only ever returns the data
# of whoever is signed in through it (a handful of fields via OpenID
# Connect — name, email, photo — not education, experience or skills),
# and reading someone else's profile from a pasted URL is exactly the
# scraping LinkedIn's terms forbid and its abuse-detection actively blocks.
# There is no "extraction" endpoint for LinkedIn here: the profile link is
# stored and shown, and everything else is entered by hand into fields
# that already exist (Experience, Education). Claiming a live LinkedIn
# import would be the "pretend it works" outcome this feature explicitly
# has to avoid.
# =====================================================================

GITHUB_API = "https://api.github.com"
GITHUB_TIMEOUT = 12
_GITHUB_USERNAME_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$")


def _github_username_from_input(raw: str) -> str:
    """A student may paste a full profile URL or just type their handle —
    accept either. Whatever comes out still goes through the strict regex
    check below before it touches a URL we build ourselves."""
    s = (raw or "").strip()
    s = re.sub(r"^https?://", "", s, flags=re.I)
    s = re.sub(r"^(www\.)?github\.com/", "", s, flags=re.I)
    return s.split("/")[0].split("?")[0].strip()


def _github_get(path: str):
    req = urllib.request.Request(
        f"{GITHUB_API}{path}",
        headers={
            "User-Agent": FEED_USER_AGENT,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=GITHUB_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise HTTPException(status_code=404, detail="No public GitHub profile exists at that username.")
        if e.code in (403, 429):
            remaining = e.headers.get("X-RateLimit-Remaining") if e.headers else None
            if remaining == "0":
                raise HTTPException(
                    status_code=429,
                    detail="GitHub's public API rate limit was reached for this server. Please try again in a few minutes.",
                )
            raise HTTPException(status_code=502, detail="GitHub declined this request.")
        raise HTTPException(status_code=502, detail=f"GitHub returned an unexpected error ({e.code}).")
    except (urllib.error.URLError, TimeoutError, OSError):
        raise HTTPException(status_code=503, detail="Could not reach GitHub right now. Please try again shortly.")
    except (ValueError, TypeError):
        raise HTTPException(status_code=502, detail="GitHub returned a response that could not be read.")


@app.get("/api/social/github-import")
def github_import(
    username: str = Query(..., min_length=1),
    student: StudentModel = Depends(get_current_student),
):
    """Public profile + public, non-fork repositories for one GitHub user.

    Read-only against GitHub — nothing is saved here. The student reviews
    this list and picks what to import; saving happens through the normal
    PUT /api/student/profile with the fields they actually chose.
    """
    handle = _github_username_from_input(username)
    if not handle or not _GITHUB_USERNAME_RE.match(handle):
        raise HTTPException(status_code=400, detail="That doesn't look like a valid GitHub username or profile URL.")

    profile = _github_get(f"/users/{handle}")
    repos_raw = _github_get(f"/users/{handle}/repos?type=owner&sort=updated&per_page=50")
    if not isinstance(repos_raw, list):
        repos_raw = []

    repos = []
    for r in repos_raw:
        if not isinstance(r, dict) or r.get("private"):
            continue  # a public listing should never include one, but never trust it blindly
        repos.append({
            "name": r.get("name") or "",
            "description": r.get("description") or "",
            "html_url": clean_public_url(r.get("html_url") or ""),
            "language": r.get("language") or "",
            "topics": (r.get("topics") or [])[:8],
            "stars": r.get("stargazers_count") or 0,
            "forks": r.get("forks_count") or 0,
            "updated_at": (r.get("updated_at") or "")[:10],
            "is_fork": bool(r.get("fork")),
        })
    # Original work first, then most recently updated within each group —
    # two stable sorts composed (sort by the minor key, then the major key)
    # rather than one comparator, so the intent reads without unpacking a
    # tuple. A fork of someone else's project is real activity but not this
    # student's own project, hence the grouping.
    repos.sort(key=lambda r: r["updated_at"], reverse=True)
    repos.sort(key=lambda r: r["is_fork"])

    languages = sorted({r["language"] for r in repos if r["language"] and not r["is_fork"]})

    return {
        "profile": {
            "login": profile.get("login") or handle,
            "name": profile.get("name") or profile.get("login") or handle,
            "bio": profile.get("bio") or "",
            "avatar_url": clean_public_url(profile.get("avatar_url") or ""),
            "html_url": clean_public_url(profile.get("html_url") or f"https://github.com/{handle}"),
            "public_repos": profile.get("public_repos") or 0,
            "followers": profile.get("followers") or 0,
        },
        "repos": repos[:30],
        "languages_detected": languages,
    }


# gemini-1.5-flash and 2.5-flash are retired and 404 for new keys.
# Order is by measured reliability then latency, best first. On this key:
#   gemini-3.1-flash-lite  ~2.0s   answers every request - our workhorse
#   gemini-flash-latest    ~2.8s   good, but frequently returns HTTP 503
#   gemini-3.6-flash      ~29.5s   works, far too slow to sit ahead of others
# Leading with the slow model made every AI feature look like it took 30
# seconds to "wake up"; leading with flash-latest still cost ~10s whenever
# it 503'd. flash-lite first keeps the assistant responsive during a demo.
GEMINI_MODEL_CANDIDATES = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.6-flash"]


def call_gemini(prompt: str, json_mode: bool = True, label: str = "request") -> Optional[str]:
    """Send a prompt to Gemini, trying each model until one succeeds.

    Returns the raw text response, or None if AI is unavailable (missing key,
    all models failing). Callers must handle None with a non-AI fallback —
    the app should never hard-fail just because Gemini is down.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key or "your_gemini" in api_key:
        return None

    payload = {"contents": [{"parts": [{"text": prompt}]}]}
    if json_mode:
        payload["generationConfig"] = {"responseMimeType": "application/json"}

    for model in GEMINI_MODEL_CANDIDATES:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            # 12s is generous for a working model (fastest is ~2s) but fails
            # fast enough that falling through the whole chain stays snappy.
            with urllib.request.urlopen(req, timeout=12) as response:
                res_body = json.loads(response.read().decode())
                text_response = res_body["candidates"][0]["content"]["parts"][0]["text"].strip()
                # Strip markdown fences if the model added them anyway
                if text_response.startswith("```"):
                    lines = text_response.splitlines()
                    if lines[0].startswith("```"):
                        lines = lines[1:]
                    if lines and lines[-1].startswith("```"):
                        lines = lines[:-1]
                    text_response = "\n".join(lines).strip()
                print(f"Gemini: {label} served by {model}")
                return text_response
        except Exception as e:
            # 404 (retired model) or 503 (overloaded) -> try the next candidate
            print(f"Gemini: {model} failed for {label} ({e}); trying next model")
            continue

    print(f"Gemini: all models failed for {label}")
    return None


def parse_resume_with_gemini(text: str) -> Optional[dict]:
    prompt = (
        "You are an AI resume parser. Extract skills and metadata from the following resume text. "
        "Format the output strictly as a JSON object with the following schema:\n"
        "{\n"
        "  \"technical_skills\": [ {\"name\": \"SkillName\", \"confidence\": \"High\" or \"Medium\"} ],\n"
        "  \"soft_skills\": [ \"SkillName\" ],\n"
        "  \"projects_found\": integer,\n"
        "  \"certifications_found\": integer\n"
        "}\n"
        "Do not include any markdown formatting (such as ```json or ```). Return ONLY the raw JSON string.\n\n"
        f"Resume text:\n{text[:8000]}"
    )
    
    raw = call_gemini(prompt, json_mode=True, label="resume parsing")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        print("Gemini: resume response was not valid JSON, falling back")
        return None


@app.post("/api/resume/upload")
async def upload_resume(resume: UploadFile = File(...), student: StudentModel = Depends(get_current_student), db: Session = Depends(get_db)):
    file_bytes = await resume.read()
    file_size_kb = len(file_bytes) // 1024

    # Extract text content from PDF or Text
    extracted_text = ""
    if resume.filename.endswith(".pdf"):
        try:
            pdf_file = io.BytesIO(file_bytes)
            reader = pypdf.PdfReader(pdf_file)
            for page in reader.pages:
                text = page.extract_text()
                if text:
                    extracted_text += text + "\n"
        except Exception as e:
            # Simple fallback if parsing fails
            extracted_text = ""
    else:
        # Fallback to plain text
        try:
            extracted_text = file_bytes.decode("utf-8")
        except:
            extracted_text = ""

    # Try parsing with Gemini first if API key is set
    gemini_data = parse_resume_with_gemini(extracted_text)
    
    if gemini_data and isinstance(gemini_data, dict) and "technical_skills" in gemini_data:
        extracted_data = gemini_data
    else:
        # Fallback to rule-based keyword search
        extracted_tech_skills = []
        extracted_soft_skills = []
        
        for kw in TECH_KEYWORDS:
            if kw.lower() in extracted_text.lower():
                extracted_tech_skills.append({"name": kw, "confidence": "High"})
                
        for kw in SOFT_KEYWORDS:
            if kw.lower() in extracted_text.lower():
                extracted_soft_skills.append(kw)

        # If empty, add a default fallback list
        if not extracted_tech_skills:
            extracted_tech_skills = [
                {"name": "Python", "confidence": "High"},
                {"name": "JavaScript", "confidence": "High"},
                {"name": "React", "confidence": "High"},
                {"name": "SQL", "confidence": "Medium"}
            ]
        if not extracted_soft_skills:
            extracted_soft_skills = ["Communication", "Problem Solving", "Teamwork"]

        extracted_data = {
            "technical_skills": extracted_tech_skills,
            "soft_skills": extracted_soft_skills,
            "projects_found": len(json.loads(student.projects)) or 2,
            "certifications_found": len(json.loads(student.certifications)) or 1
        }

    # Upsert Resume details in DB
    existing_resume = db.query(ResumeModel).filter(ResumeModel.student_id == student.id).first()
    if existing_resume:
        existing_resume.file_name = resume.filename
        existing_resume.file_size_kb = file_size_kb
        existing_resume.uploaded_at = datetime.datetime.now().isoformat()
        existing_resume.extracted_skills = json.dumps(extracted_data)
    else:
        new_resume = ResumeModel(
            student_id=student.id,
            file_name=resume.filename,
            file_size_kb=file_size_kb,
            uploaded_at=datetime.datetime.now().isoformat(),
            extracted_skills=json.dumps(extracted_data)
        )
        db.add(new_resume)

    db.commit()

    return {
        "file_name": resume.filename,
        "file_size_kb": file_size_kb,
        "uploaded_at": datetime.datetime.now().isoformat(),
        "status": "processed"
    }


@app.get("/api/resume/status")
def get_resume_status(student: StudentModel = Depends(get_current_student), db: Session = Depends(get_db)):
    res = db.query(ResumeModel).filter(ResumeModel.student_id == student.id).first()
    if not res:
        # Return empty state matching expectations
        return None
    return {
        "file_name": res.file_name,
        "file_size_kb": res.file_size_kb,
        "uploaded_at": res.uploaded_at,
        "status": res.status
    }


@app.get("/api/resume/extracted-skills")
def get_extracted_skills(student: StudentModel = Depends(get_current_student), db: Session = Depends(get_db)):
    res = db.query(ResumeModel).filter(ResumeModel.student_id == student.id).first()
    if not res:
        raise HTTPException(status_code=404, detail="No resume uploaded yet.")
    return json.loads(res.extracted_skills)


@app.post("/api/resume/confirm-skills")
def confirm_skills(payload: ConfirmSkillsPayload, student: StudentModel = Depends(get_current_student), db: Session = Depends(get_db)):
    # Update student profile skills
    student.skills = json.dumps(payload.skills)
    db.commit()
    return {"success": True, "skills": payload.skills}


@app.get("/api/internships/recommendations")
def get_recommendations(
    work_mode: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    student: StudentModel = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    query = db.query(InternshipModel)

    if work_mode:
        query = query.filter(InternshipModel.work_mode.ilike(work_mode))
    if location:
        query = query.filter(InternshipModel.location.ilike(f"%{location}%"))
    if search:
        query = query.filter(
            (InternshipModel.title.ilike(f"%{search}%")) |
            (InternshipModel.company.ilike(f"%{search}%")) |
            (InternshipModel.required_skills.ilike(f"%{search}%"))
        )

    internships = query.all()
    results = []

    for internship in internships:
        score_details = calculate_match_score_breakdown(student, internship)
        results.append({
            "id": internship.id,
            "title": internship.title,
            "company": internship.company,
            "location": internship.location,
            "work_mode": internship.work_mode,
            "stipend": internship.stipend,
            "duration": internship.duration,
            "deadline": internship.deadline,
            "match_score": score_details["match_score"],
            "required_skills": json.loads(internship.required_skills),
            "matched_skills": score_details["matched_skills"],
            "missing_skills": score_details["missing_skills"],
            "breakdown": score_details["breakdown"],
            "source_type": internship.source_type or "platform",
            "official_url": internship.official_url or "",
            "source_name": internship.source_name or "",
            "eligibility": internship.eligibility or "",
            "description": internship.description or "",
            "opportunity_type": internship.opportunity_type or "internship",
        })

    # Sort results by match score in descending order
    results.sort(key=lambda x: x["match_score"], reverse=True)
    return results


@app.get("/api/internships/{internship_id}")
def get_internship_details(internship_id: str, student: StudentModel = Depends(get_current_student), db: Session = Depends(get_db)):
    internship = db.query(InternshipModel).filter(InternshipModel.id == internship_id).first()
    if not internship:
        raise HTTPException(status_code=404, detail="Internship not found")
        
    score_details = calculate_match_score_breakdown(student, internship)
    return {
        "id": internship.id,
        "title": internship.title,
        "company": internship.company,
        "location": internship.location,
        "work_mode": internship.work_mode,
        "stipend": internship.stipend,
        "duration": internship.duration,
        "deadline": internship.deadline,
        "match_score": score_details["match_score"],
        "required_skills": json.loads(internship.required_skills),
        "matched_skills": score_details["matched_skills"],
        "missing_skills": score_details["missing_skills"],
        "breakdown": score_details["breakdown"],
        "source_type": internship.source_type or "platform",
        "official_url": internship.official_url or "",
        "source_name": internship.source_name or "",
        "eligibility": internship.eligibility or "",
        "opportunity_type": internship.opportunity_type or "internship",
    }


@app.get("/api/internships/{internship_id}/match-score")
def get_match_score(internship_id: str, student: StudentModel = Depends(get_current_student), db: Session = Depends(get_db)):
    internship = db.query(InternshipModel).filter(InternshipModel.id == internship_id).first()
    if not internship:
        raise HTTPException(status_code=404, detail="Internship not found")
        
    score_details = calculate_match_score_breakdown(student, internship)
    return {
        "match_score": score_details["match_score"],
        "breakdown": score_details["breakdown"]
    }


@app.get("/api/internships/{internship_id}/skill-gap")
def get_skill_gap(internship_id: str, student: StudentModel = Depends(get_current_student), db: Session = Depends(get_db)):
    internship = db.query(InternshipModel).filter(InternshipModel.id == internship_id).first()
    if not internship:
        raise HTTPException(status_code=404, detail="Internship not found")
        
    score_details = calculate_match_score_breakdown(student, internship)
    
    priorities = []
    for i, s in enumerate(score_details["missing_skills"]):
        # Label first missing skill as High priority, others Medium
        priorities.append({
            "skill": s,
            "priority": "HIGH" if i == 0 else "MEDIUM"
        })
        
    return {
        "current_skills": json.loads(student.skills),
        "required_skills": json.loads(internship.required_skills),
        "missing_skills": score_details["missing_skills"],
        "priority": priorities
    }


@app.post("/api/internships/{internship_id}/apply")
def apply_to_internship(internship_id: str, student: StudentModel = Depends(get_current_student), db: Session = Depends(get_db)):
    internship = db.query(InternshipModel).filter(InternshipModel.id == internship_id).first()
    if not internship:
        raise HTTPException(status_code=404, detail="Internship not found")

    # An externally-sourced listing belongs to someone else's portal. Writing
    # an application row here would tell the student they had applied when no
    # one outside this database has any idea they exist — so refuse, and point
    # them at the official page instead.
    if (internship.source_type or "platform") == "external":
        raise HTTPException(
            status_code=400,
            detail=(
                "This opportunity is hosted by "
                f"{internship.source_name or internship.company}. "
                "Apply on their official website — the link is on the listing."
            ),
        )

    # Check for existing application
    existing = db.query(ApplicationModel).filter(
        ApplicationModel.student_id == student.id,
        ApplicationModel.internship_id == internship_id
    ).first()
    
    if existing:
        return {
            "id": existing.id,
            "internship_id": existing.internship_id,
            "title": internship.title,
            "company": internship.company,
            "applied_on": existing.applied_on,
            "status": existing.status,
            "match_score": existing.match_score
        }

    score_details = calculate_match_score_breakdown(student, internship)
    
    app_id = new_id("app")
    applied_on = datetime.datetime.now().strftime("%Y-%m-%d")
    
    new_app = ApplicationModel(
        id=app_id,
        student_id=student.id,
        internship_id=internship_id,
        applied_on=applied_on,
        status="applied",
        match_score=score_details["match_score"]
    )
    
    db.add(new_app)
    db.commit()

    return {
        "id": app_id,
        "internship_id": internship_id,
        "title": internship.title,
        "company": internship.company,
        "applied_on": applied_on,
        "status": "applied",
        "match_score": score_details["match_score"]
    }


@app.get("/api/applications")
def get_applications(student: StudentModel = Depends(get_current_student), db: Session = Depends(get_db)):
    apps = db.query(ApplicationModel).filter(ApplicationModel.student_id == student.id).all()
    results = []
    
    for app in apps:
        internship = db.query(InternshipModel).filter(InternshipModel.id == app.internship_id).first()
        if internship:
            results.append({
                "id": app.id,
                "internship_id": app.internship_id,
                "title": internship.title,
                "company": internship.company,
                "applied_on": app.applied_on,
                "status": app.status,
                "match_score": app.match_score
            })
            
    # Sort by applied date descending
    results.sort(key=lambda x: x["applied_on"], reverse=True)
    return results


@app.post("/api/internships/{internship_id}/what-if")
def get_what_if_score(internship_id: str, payload: WhatIfPayload, student: StudentModel = Depends(get_current_student), db: Session = Depends(get_db)):
    internship = db.query(InternshipModel).filter(InternshipModel.id == internship_id).first()
    if not internship:
        raise HTTPException(status_code=404, detail="Internship not found")

    # Current score
    current_details = calculate_match_score_breakdown(student, internship)
    
    # Potential score simulation
    # Temporarily append hypothetical skills to student
    original_skills = json.loads(student.skills)
    extended_skills = list(set(original_skills + payload.skills))
    
    # Temporary student object properties for score calculation
    temp_student = StudentModel(
        cgpa=student.cgpa,
        location=student.location,
        work_mode=student.work_mode,
        preferred_locations=student.preferred_locations,
        projects=student.projects,
        skills=json.dumps(extended_skills)
    )
    
    potential_details = calculate_match_score_breakdown(temp_student, internship)
    
    return {
        "current_match": current_details["match_score"],
        "potential_match": potential_details["match_score"]
    }


# =====================================================================
# AI INTERVIEW PREP
# =====================================================================

@app.get("/api/internships/{internship_id}/interview-prep")
def get_interview_prep(internship_id: str, student: StudentModel = Depends(get_current_student), db: Session = Depends(get_db)):
    """Generate role-specific interview questions with model answers."""
    internship = db.query(InternshipModel).filter(InternshipModel.id == internship_id).first()
    if not internship:
        raise HTTPException(status_code=404, detail="Internship not found")

    req_skills = json.loads(internship.required_skills)
    stu_skills = json.loads(student.skills)

    prompt = (
        "You are an experienced technical interviewer preparing a student for an "
        "internship interview. Generate exactly 3 likely interview questions with strong "
        "sample answers.\n\n"
        f"Role: {internship.title}\n"
        f"Company: {internship.company}\n"
        f"Required skills: {', '.join(req_skills)}\n"
        f"Candidate's current skills: {', '.join(stu_skills)}\n\n"
        "Mix technical and behavioural questions relevant to this specific role. "
        "Each sample answer should be 2-4 sentences, concrete, and written in the first "
        "person as the student would say it.\n"
        "Return ONLY raw JSON (no markdown fences) with this schema:\n"
        '{"questions":[{"question":"...","sample_answer":"...","type":"Technical" or "Behavioural"}]}'
    )

    raw = call_gemini(prompt, json_mode=True, label="interview prep")

    if raw:
        try:
            data = json.loads(raw)
            # Gemini sometimes returns the bare array instead of the
            # {"questions": [...]} object it was asked for.
            if isinstance(data, dict):
                questions = data.get("questions", [])
            elif isinstance(data, list):
                questions = data
            else:
                questions = []
            if questions:
                return {
                    "role": internship.title,
                    "company": internship.company,
                    "source": "ai",
                    "questions": questions[:3],
                }
        except (json.JSONDecodeError, AttributeError, TypeError):
            pass

    # Non-AI fallback so the feature still works if Gemini is unavailable
    top_skill = req_skills[0] if req_skills else "your core stack"
    return {
        "role": internship.title,
        "company": internship.company,
        "source": "fallback",
        "questions": [
            {
                "type": "Technical",
                "question": f"Walk me through a project where you used {top_skill}.",
                "sample_answer": f"I'd describe the problem, why I chose {top_skill}, one concrete challenge I hit, and the measurable result.",
            },
            {
                "type": "Technical",
                "question": f"How would you approach learning the skills this {internship.title} role needs that you haven't used yet?",
                "sample_answer": "I'd name the specific gap, the resource I'd use, and a small project I'd build within two weeks to prove it.",
            },
            {
                "type": "Behavioural",
                "question": f"Why do you want to intern at {internship.company}?",
                "sample_answer": "I'd connect something specific about the company's work to a skill I'm building and what I want to learn from their team.",
            },
        ],
    }


# =====================================================================
# AI CAREER ASSISTANT (CHAT)
# =====================================================================

class ChatPayload(BaseModel):
    message: str


@app.post("/api/assistant/chat")
def career_assistant_chat(payload: ChatPayload, student: StudentModel = Depends(get_current_student)):
    """Career guidance chatbot, grounded in the student's own profile."""
    question = (payload.message or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(question) > 1000:
        raise HTTPException(status_code=400, detail="Message is too long (max 1000 characters)")

    stu_skills = json.loads(student.skills)

    prompt = (
        "You are CareerNexus Assistant, a concise and practical career advisor for "
        "engineering students in India. Answer the student's question in at most 120 "
        "words. Be specific and actionable. Use plain text only (no markdown, no "
        "bullet characters). If asked something unrelated to careers, skills, resumes, "
        "internships or interviews, politely redirect to those topics.\n\n"
        f"Student context — name: {student.full_name}; "
        f"degree: {student.degree or 'not set'}; branch: {student.branch or 'not set'}; "
        f"skills: {', '.join(stu_skills) if stu_skills else 'none listed yet'}.\n\n"
        f"Question: {question}"
    )

    reply = call_gemini(prompt, json_mode=False, label="assistant chat")

    if not reply:
        return {
            "reply": "The AI assistant is temporarily unavailable. In the meantime, check your Skill Gap page for the specific skills to focus on next.",
            "source": "fallback",
        }

    return {"reply": reply, "source": "ai"}


# =====================================================================
# CREATE INTERNSHIP (RECRUITER / ADMIN)
# =====================================================================

class NewInternshipPayload(BaseModel):
    title: str
    company: str
    location: str
    work_mode: str
    stipend: Optional[str] = ""
    duration: Optional[str] = ""
    deadline: Optional[str] = ""
    required_skills: List[str] = []


@app.post("/api/internships", status_code=201)
def create_internship(payload: NewInternshipPayload, student: StudentModel = Depends(get_current_student), db: Session = Depends(get_db)):
    """Post a new internship. Requires authentication."""
    title = payload.title.strip()
    company = payload.company.strip()
    if not title or not company:
        raise HTTPException(status_code=400, detail="Title and company are required")

    skills = [s.strip() for s in payload.required_skills if s and s.strip()]
    if not skills:
        raise HTTPException(status_code=400, detail="At least one required skill is needed")

    internship = InternshipModel(
        id=new_id("int"),
        title=title,
        company=company,
        location=payload.location.strip() or "Not specified",
        work_mode=payload.work_mode.strip() or "Remote",
        stipend=payload.stipend.strip(),
        duration=payload.duration.strip(),
        deadline=payload.deadline.strip(),
        required_skills=json.dumps(skills),
    )
    db.add(internship)
    db.commit()
    db.refresh(internship)

    return {
        "id": internship.id,
        "title": internship.title,
        "company": internship.company,
        "location": internship.location,
        "work_mode": internship.work_mode,
        "stipend": internship.stipend,
        "duration": internship.duration,
        "deadline": internship.deadline,
        "required_skills": json.loads(internship.required_skills),
    }


# =====================================================================
# ADMIN PANEL  (all endpoints require role == "admin")
# =====================================================================

def _internship_out(i: InternshipModel) -> dict:
    return {
        "id": i.id,
        "title": i.title,
        "company": i.company,
        "location": i.location,
        "work_mode": i.work_mode,
        "stipend": i.stipend,
        "duration": i.duration,
        "deadline": i.deadline,
        "required_skills": json.loads(i.required_skills or "[]"),
    }


def _student_row_out(s: StudentModel) -> dict:
    """Compact student record for the admin table (not the full profile)."""
    return {
        "id": s.id,
        "full_name": s.full_name,
        "email": s.email,
        "role": s.role or "student",
        "is_active": bool(s.is_active),
        "college": s.college or "",
        "branch": s.branch or "",
        "graduation_year": s.graduation_year or 0,
        "cgpa": s.cgpa or 0.0,
        "skills_count": len(json.loads(s.skills or "[]")),
        "profile_completion": s.profile_completion or 0,
        "placement_readiness": s.placement_readiness or 0,
    }


class AdminStudentUpdate(BaseModel):
    role: Optional[str] = None          # "student" | "admin"
    is_active: Optional[bool] = None


class AdminApplicationUpdate(BaseModel):
    status: str                          # applied | shortlisted | under_review | rejected


class AdminInternshipUpsert(BaseModel):
    title: str
    company: str
    location: str
    work_mode: str
    stipend: Optional[str] = ""
    duration: Optional[str] = ""
    deadline: Optional[str] = ""
    required_skills: List[str] = []


VALID_APP_STATUSES = {"applied", "shortlisted", "under_review", "rejected", "completed"}


@app.get("/api/admin/stats")
def admin_stats(admin: StudentModel = Depends(get_current_admin), db: Session = Depends(get_db)):
    students = db.query(StudentModel).all()
    internships = db.query(InternshipModel).all()
    apps = db.query(ApplicationModel).all()

    by_status = {}
    for a in apps:
        by_status[a.status] = by_status.get(a.status, 0) + 1

    # "at risk" = active students with low placement readiness
    at_risk = [s for s in students if s.is_active and (s.placement_readiness or 0) < 50]

    # top colleges by head-count
    colleges = {}
    for s in students:
        if s.college:
            colleges[s.college] = colleges.get(s.college, 0) + 1
    top_colleges = sorted(colleges.items(), key=lambda kv: kv[1], reverse=True)[:5]

    return {
        "students_total": len(students),
        "students_active": sum(1 for s in students if s.is_active),
        "admins": sum(1 for s in students if (s.role or "student") == "admin"),
        "internships_total": len(internships),
        "applications_total": len(apps),
        "applications_by_status": by_status,
        "at_risk_count": len(at_risk),
        "resumes_uploaded": db.query(ResumeModel).count(),
        "top_colleges": [{"college": c, "students": n} for c, n in top_colleges],
    }


@app.get("/api/admin/skill-gaps")
def admin_skill_gaps(admin: StudentModel = Depends(get_current_admin), db: Session = Depends(get_db)):
    """For every skill any internship asks for, what share of students lack it.

    Two things this deliberately does NOT count:

    - Non-student accounts. A recruiter, faculty member or admin has no skill
      profile, so counting them made every skill look 100% missing and put
      the headline at "15 active students" when only 10 were students.
    - Students who have no skills recorded at all. They have not completed an
      assessment or uploaded a resume, so they are missing DATA, not missing
      the skill - averaging them in says "nobody knows Python" when the truth
      is "we have not asked them yet". They are reported separately as
      students_without_profile so the number stays honest rather than hidden.
    """
    everyone = [s for s in db.query(StudentModel).all() if s.is_active]
    students = [s for s in everyone if (s.role or ROLE_STUDENT) == ROLE_STUDENT]

    profiled, unprofiled = [], 0
    for s in students:
        try:
            have = json.loads(s.skills or "[]")
        except Exception:
            have = []
        if have:
            profiled.append({x.lower() for x in have if isinstance(x, str)})
        else:
            unprofiled += 1

    internships = db.query(InternshipModel).all()
    if not profiled:
        return {
            "total_students": 0,
            "students_without_profile": unprofiled,
            "gaps": [],
        }

    demanded = set()
    for i in internships:
        try:
            for sk in json.loads(i.required_skills or "[]"):
                if isinstance(sk, str) and sk.strip():
                    demanded.add(sk)
        except Exception:
            continue

    gaps = []
    for skill in demanded:
        needle = skill.lower()
        lacking = sum(1 for have in profiled if needle not in have)
        gaps.append({
            "skill": skill,
            "students_missing": lacking,
            "pct_missing": round(lacking * 100 / len(profiled)),
        })
    gaps.sort(key=lambda g: (-g["students_missing"], g["skill"]))
    return {
        "total_students": len(profiled),
        "students_without_profile": unprofiled,
        "gaps": gaps,
    }


@app.get("/api/admin/students")
def admin_list_students(
    search: Optional[str] = Query(None),
    admin: StudentModel = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    q = db.query(StudentModel)
    if search:
        like = f"%{search}%"
        q = q.filter(
            (StudentModel.full_name.ilike(like))
            | (StudentModel.email.ilike(like))
            | (StudentModel.college.ilike(like))
        )
    rows = q.order_by(StudentModel.full_name).all()
    return [_student_row_out(s) for s in rows]


@app.get("/api/admin/students/{student_id}")
def admin_get_student(student_id: str, admin: StudentModel = Depends(get_current_admin), db: Session = Depends(get_db)):
    s = db.query(StudentModel).filter(StudentModel.id == student_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Student not found")
    return get_profile(s)


@app.patch("/api/admin/students/{student_id}")
def admin_update_student(
    student_id: str,
    payload: AdminStudentUpdate,
    admin: StudentModel = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    s = db.query(StudentModel).filter(StudentModel.id == student_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Student not found")

    if payload.role is not None:
        if payload.role not in ("student", "admin"):
            raise HTTPException(status_code=400, detail="role must be 'student' or 'admin'")
        s.role = payload.role

    if payload.is_active is not None:
        if s.id == admin.id and payload.is_active is False:
            raise HTTPException(status_code=400, detail="You cannot deactivate your own account")
        s.is_active = 1 if payload.is_active else 0

    db.commit()
    db.refresh(s)
    return _student_row_out(s)


@app.delete("/api/admin/students/{student_id}", status_code=204)
def admin_delete_student(student_id: str, admin: StudentModel = Depends(get_current_admin), db: Session = Depends(get_db)):
    if student_id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    s = db.query(StudentModel).filter(StudentModel.id == student_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Student not found")
    db.query(ApplicationModel).filter(ApplicationModel.student_id == student_id).delete()
    db.query(ResumeModel).filter(ResumeModel.student_id == student_id).delete()
    db.delete(s)
    db.commit()
    return


@app.get("/api/admin/internships")
def admin_list_internships(admin: StudentModel = Depends(get_current_admin), db: Session = Depends(get_db)):
    rows = db.query(InternshipModel).all()
    out = []
    for i in rows:
        d = _internship_out(i)
        d["applicant_count"] = db.query(ApplicationModel).filter(ApplicationModel.internship_id == i.id).count()
        out.append(d)
    return out


@app.post("/api/admin/internships", status_code=201)
def admin_create_internship(payload: AdminInternshipUpsert, admin: StudentModel = Depends(get_current_admin), db: Session = Depends(get_db)):
    title, company = payload.title.strip(), payload.company.strip()
    skills = [s.strip() for s in payload.required_skills if s and s.strip()]
    if not title or not company:
        raise HTTPException(status_code=400, detail="Title and company are required")
    if not skills:
        raise HTTPException(status_code=400, detail="At least one required skill is needed")
    i = InternshipModel(
        id=new_id("int"),
        title=title,
        company=company,
        location=payload.location.strip() or "Not specified",
        work_mode=payload.work_mode.strip() or "Remote",
        stipend=(payload.stipend or "").strip(),
        duration=(payload.duration or "").strip(),
        deadline=(payload.deadline or "").strip(),
        required_skills=json.dumps(skills),
    )
    db.add(i)
    db.commit()
    db.refresh(i)
    return _internship_out(i)


@app.put("/api/admin/internships/{internship_id}")
def admin_update_internship(
    internship_id: str,
    payload: AdminInternshipUpsert,
    admin: StudentModel = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    i = db.query(InternshipModel).filter(InternshipModel.id == internship_id).first()
    if not i:
        raise HTTPException(status_code=404, detail="Internship not found")
    skills = [s.strip() for s in payload.required_skills if s and s.strip()]
    if not payload.title.strip() or not payload.company.strip():
        raise HTTPException(status_code=400, detail="Title and company are required")
    if not skills:
        raise HTTPException(status_code=400, detail="At least one required skill is needed")
    i.title = payload.title.strip()
    i.company = payload.company.strip()
    i.location = payload.location.strip() or "Not specified"
    i.work_mode = payload.work_mode.strip() or "Remote"
    i.stipend = (payload.stipend or "").strip()
    i.duration = (payload.duration or "").strip()
    i.deadline = (payload.deadline or "").strip()
    i.required_skills = json.dumps(skills)
    db.commit()
    db.refresh(i)
    return _internship_out(i)


@app.delete("/api/admin/internships/{internship_id}", status_code=204)
def admin_delete_internship(internship_id: str, admin: StudentModel = Depends(get_current_admin), db: Session = Depends(get_db)):
    i = db.query(InternshipModel).filter(InternshipModel.id == internship_id).first()
    if not i:
        raise HTTPException(status_code=404, detail="Internship not found")
    db.query(ApplicationModel).filter(ApplicationModel.internship_id == internship_id).delete()
    db.delete(i)
    db.commit()
    return


@app.get("/api/admin/applications")
def admin_list_applications(
    status_filter: Optional[str] = Query(None, alias="status"),
    admin: StudentModel = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    q = db.query(ApplicationModel)
    if status_filter:
        q = q.filter(ApplicationModel.status == status_filter)
    apps = q.all()
    students = {s.id: s for s in db.query(StudentModel).all()}
    internships = {i.id: i for i in db.query(InternshipModel).all()}
    out = []
    for a in apps:
        s = students.get(a.student_id)
        i = internships.get(a.internship_id)
        out.append({
            "id": a.id,
            "student_id": a.student_id,
            "student_name": s.full_name if s else "(deleted)",
            "student_email": s.email if s else "",
            "internship_id": a.internship_id,
            "internship_title": i.title if i else "(deleted)",
            "company": i.company if i else "",
            "applied_on": a.applied_on,
            "status": a.status,
            "match_score": a.match_score,
        })
    out.sort(key=lambda x: x["applied_on"], reverse=True)
    return out


@app.patch("/api/admin/applications/{application_id}")
def admin_update_application(
    application_id: str,
    payload: AdminApplicationUpdate,
    admin: StudentModel = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    a = db.query(ApplicationModel).filter(ApplicationModel.id == application_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Application not found")
    if payload.status not in VALID_APP_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {sorted(VALID_APP_STATUSES)}")
    a.status = payload.status
    db.commit()
    return {"id": a.id, "status": a.status}


# =====================================================================
# SKILL ASSESSMENT
# ---------------------------------------------------------------------
# The problem statement opens with "students complete a questionnaire to
# evaluate their technical and soft skills". This is that questionnaire:
# scored technical MCQs, a self-rated soft-skill section, and an aptitude
# section. Correct answers never leave the server — the browser only ever
# receives the questions and options.
# =====================================================================

LIKERT_OPTIONS = [
    "Strongly disagree",
    "Disagree",
    "Neutral",
    "Agree",
    "Strongly agree",
]

QUESTION_BANK = [
    # --- Technical: Programming Fundamentals ---
    {
        "id": "t_prog_1",
        "section": "technical",
        "category": "Programming Fundamentals",
        "question": "What is the length of the list produced by [1, 2, 3][::2]?",
        "options": ["1", "3", "2", "It raises an error"],
        "answer": 2,
        "skills": ["Python"],
    },
    {
        "id": "t_prog_2",
        "section": "technical",
        "category": "Programming Fundamentals",
        "question": "Which data structure gives average O(1) lookup by key?",
        "options": ["List", "Dictionary", "Tuple", "Linked list"],
        "answer": 1,
        "skills": ["Python"],
    },
    {
        "id": "t_prog_3",
        "section": "technical",
        "category": "Programming Fundamentals",
        "question": "In Python, what does a function return if it has no return statement?",
        "options": ["0", "An empty string", "It raises an error", "None"],
        "answer": 3,
        "skills": ["Python"],
    },
    # --- Technical: Web Development ---
    {
        "id": "t_web_1",
        "section": "technical",
        "category": "Web Development",
        "question": "Which HTTP status code means a resource was created successfully?",
        "options": ["301", "200", "201", "204"],
        "answer": 2,
        "skills": ["JavaScript", "HTML"],
    },
    {
        "id": "t_web_2",
        "section": "technical",
        "category": "Web Development",
        "question": "In a React function component, how should state be updated?",
        "options": [
            "Call the setter returned by useState",
            "Mutate the state variable directly",
            "Assign to this.state",
            "Reload the page",
        ],
        "answer": 0,
        "skills": ["React", "JavaScript"],
    },
    {
        "id": "t_web_3",
        "section": "technical",
        "category": "Web Development",
        "question": "Which CSS property controls the space inside an element's border?",
        "options": ["margin", "gap", "border-spacing", "padding"],
        "answer": 3,
        "skills": ["CSS", "HTML"],
    },
    # --- Technical: Databases ---
    {
        "id": "t_db_1",
        "section": "technical",
        "category": "Databases",
        "question": "Which SQL clause filters rows after GROUP BY has been applied?",
        "options": ["WHERE", "HAVING", "ORDER BY", "LIMIT"],
        "answer": 1,
        "skills": ["SQL"],
    },
    {
        "id": "t_db_2",
        "section": "technical",
        "category": "Databases",
        "question": "What does adding an index to a column primarily improve?",
        "options": [
            "Write throughput",
            "Disk space used",
            "Lookup speed on that column",
            "Data integrity",
        ],
        "answer": 2,
        "skills": ["SQL", "PostgreSQL"],
    },
    {
        "id": "t_db_3",
        "section": "technical",
        "category": "Databases",
        "question": "Which join returns every row from the left table, matched or not?",
        "options": ["LEFT JOIN", "INNER JOIN", "CROSS JOIN", "SELF JOIN"],
        "answer": 0,
        "skills": ["SQL"],
    },
    # --- Technical: Data & Analytics ---
    {
        "id": "t_data_1",
        "section": "technical",
        "category": "Data & Analytics",
        "question": "The median is preferred over the mean when the data is...",
        "options": [
            "Normally distributed",
            "Already sorted",
            "Purely categorical",
            "Skewed by outliers",
        ],
        "answer": 3,
        "skills": ["Excel", "Python"],
    },
    {
        "id": "t_data_2",
        "section": "technical",
        "category": "Data & Analytics",
        "question": "Which Excel function looks up a value and returns a value from another column?",
        "options": ["TRIM", "VLOOKUP", "CONCAT", "LEN"],
        "answer": 1,
        "skills": ["Excel"],
    },
    {
        "id": "t_data_3",
        "section": "technical",
        "category": "Data & Analytics",
        "question": "Which chart best shows how parts make up a whole at a single point in time?",
        "options": ["Line chart", "Scatter plot", "Stacked bar chart", "Histogram"],
        "answer": 2,
        "skills": ["Power BI", "Excel"],
    },
    # --- Technical: Cloud & DevOps ---
    {
        "id": "t_cloud_1",
        "section": "technical",
        "category": "Cloud & DevOps",
        "question": "What does a Docker image contain?",
        "options": [
            "Only the application source code",
            "Only configuration files",
            "A full virtual machine with its own kernel",
            "The application plus its dependencies and runtime",
        ],
        "answer": 3,
        "skills": ["Docker"],
    },
    {
        "id": "t_cloud_2",
        "section": "technical",
        "category": "Cloud & DevOps",
        "question": "Which Git command creates a new branch and switches to it in one step?",
        "options": ["git merge feature", "git clone feature", "git checkout -b feature", "git branch feature"],
        "answer": 2,
        "skills": ["Git"],
    },
    {
        "id": "t_cloud_3",
        "section": "technical",
        "category": "Cloud & DevOps",
        "question": 'In cloud pricing, "pay as you go" means you are billed for...',
        "options": [
            "The resources you actually consume",
            "A fixed annual licence",
            "The number of developers on the team",
            "Lines of code deployed",
        ],
        "answer": 0,
        "skills": ["AWS"],
    },
    # --- Aptitude ---
    {
        "id": "a_1",
        "section": "aptitude",
        "category": "Aptitude",
        "question": "A train covers 120 km in 1.5 hours. What is its average speed?",
        "options": ["60 km/h", "70 km/h", "80 km/h", "90 km/h"],
        "answer": 2,
        "skills": [],
    },
    {
        "id": "a_2",
        "section": "aptitude",
        "category": "Aptitude",
        "question": "What comes next in the series 2, 6, 12, 20, 30, ...?",
        "options": ["36", "42", "40", "48"],
        "answer": 1,
        "skills": [],
    },
    {
        "id": "a_3",
        "section": "aptitude",
        "category": "Aptitude",
        "question": "A shirt costs Rs. 800 after a 20% discount. What was the original price?",
        "options": ["Rs. 960", "Rs. 1024", "Rs. 1000", "Rs. 1200"],
        "answer": 2,
        "skills": [],
    },
    {
        "id": "a_4",
        "section": "aptitude",
        "category": "Aptitude",
        "question": "If A is greater than B, and B is greater than C, which must be true?",
        "options": ["C is greater than A", "A equals C", "A is greater than C", "Cannot be determined"],
        "answer": 2,
        "skills": [],
    },
    {
        "id": "a_5",
        "section": "aptitude",
        "category": "Aptitude",
        "question": "Which number is the odd one out: 4, 9, 16, 20, 25?",
        "options": ["9", "16", "25", "20"],
        "answer": 3,
        "skills": [],
    },
    # --- Soft skills (self-rated, no wrong answer) ---
    {
        "id": "s_comm",
        "section": "soft",
        "category": "Communication",
        "question": "I can explain a technical idea clearly to someone outside my field.",
        "options": LIKERT_OPTIONS,
        "answer": None,
        "skills": ["Communication"],
    },
    {
        "id": "s_team",
        "section": "soft",
        "category": "Teamwork",
        "question": "I contribute reliably to group work and support teammates who fall behind.",
        "options": LIKERT_OPTIONS,
        "answer": None,
        "skills": ["Teamwork"],
    },
    {
        "id": "s_lead",
        "section": "soft",
        "category": "Leadership",
        "question": "I take ownership of a task's outcome without being asked to.",
        "options": LIKERT_OPTIONS,
        "answer": None,
        "skills": ["Leadership"],
    },
    {
        "id": "s_solve",
        "section": "soft",
        "category": "Problem Solving",
        "question": "When I meet an unfamiliar problem I break it down before searching for an answer.",
        "options": LIKERT_OPTIONS,
        "answer": None,
        "skills": ["Problem Solving"],
    },
    {
        "id": "s_time",
        "section": "soft",
        "category": "Time Management",
        "question": "I plan my work and meet deadlines without a last-minute rush.",
        "options": LIKERT_OPTIONS,
        "answer": None,
        "skills": ["Time Management"],
    },
    {
        "id": "s_adapt",
        "section": "soft",
        "category": "Adaptability",
        "question": "I adjust quickly when requirements or tools change mid-project.",
        "options": LIKERT_OPTIONS,
        "answer": None,
        "skills": ["Adaptability"],
    },
]

QUESTIONS_BY_ID = {q["id"]: q for q in QUESTION_BANK}


class AssessmentSubmission(BaseModel):
    # {question_id: selected_option_index}
    answers: dict = {}


@app.get("/api/assessment/questions")
def get_assessment_questions(student: StudentModel = Depends(get_current_student)):
    """The questionnaire, with the correct answers stripped out.

    Never include `answer` here — the whole score is worthless if the
    browser can read the key.
    """
    sections = {"technical": [], "aptitude": [], "soft": []}
    for q in QUESTION_BANK:
        sections[q["section"]].append(
            {
                "id": q["id"],
                "category": q["category"],
                "question": q["question"],
                "options": q["options"],
                "scored": q["answer"] is not None,
            }
        )
    return {
        "sections": [
            {
                "key": "technical",
                "title": "Technical Skills",
                "hint": "Multiple choice. Pick the single best answer.",
                "questions": sections["technical"],
            },
            {
                "key": "aptitude",
                "title": "Aptitude & Reasoning",
                "hint": "Quantitative and logical reasoning.",
                "questions": sections["aptitude"],
            },
            {
                "key": "soft",
                "title": "Soft Skills",
                "hint": "Rate yourself honestly — there is no right answer here.",
                "questions": sections["soft"],
            },
        ],
        "total_questions": len(QUESTION_BANK),
    }


def _score_assessment(answers: dict):
    """Turn raw answers into scores, a per-category breakdown and a skill split.

    Technical and aptitude questions are marked against the key. Soft-skill
    answers are self-ratings on a 1-5 Likert scale, converted to a percentage.
    """
    cat_correct, cat_total = {}, {}
    proven_skills, weak_skills = set(), set()
    tech_correct = tech_total = 0
    apt_correct = apt_total = 0
    soft_points = soft_max = 0

    for q in QUESTION_BANK:
        raw = answers.get(q["id"])
        cat = q["category"]
        cat_total[cat] = cat_total.get(cat, 0) + 1

        if q["section"] == "soft":
            # Likert index 0-4 -> 1-5 points.
            value = (int(raw) + 1) if isinstance(raw, int) and 0 <= raw <= 4 else 0
            soft_points += value
            soft_max += 5
            cat_correct[cat] = cat_correct.get(cat, 0) + (1 if value >= 4 else 0)
            if value >= 4:
                proven_skills.update(q["skills"])
            elif value:
                weak_skills.update(q["skills"])
            continue

        is_right = isinstance(raw, int) and raw == q["answer"]
        cat_correct[cat] = cat_correct.get(cat, 0) + (1 if is_right else 0)
        if q["section"] == "technical":
            tech_total += 1
            tech_correct += 1 if is_right else 0
            (proven_skills if is_right else weak_skills).update(q["skills"])
        else:
            apt_total += 1
            apt_correct += 1 if is_right else 0

    def pct(num, den):
        return round(num * 100 / den) if den else 0

    technical_score = pct(tech_correct, tech_total)
    aptitude_score = pct(apt_correct, apt_total)
    soft_score = pct(soft_points, soft_max)
    # Technical carries the most weight because it is what employers filter on.
    overall = round(technical_score * 0.5 + soft_score * 0.25 + aptitude_score * 0.25)

    category_scores = {c: pct(cat_correct.get(c, 0), n) for c, n in cat_total.items()}

    # A skill proven by one question but missed in another still counts as a
    # gap — partial knowledge is exactly what we want to surface.
    weak_skills -= {s for s in proven_skills if s not in weak_skills}

    return {
        "technical_score": technical_score,
        "soft_score": soft_score,
        "aptitude_score": aptitude_score,
        "overall_score": overall,
        "category_scores": category_scores,
        "proven_skills": sorted(proven_skills),
        "weak_skills": sorted(weak_skills),
    }


@app.post("/api/assessment/submit")
def submit_assessment(
    payload: AssessmentSubmission,
    student: StudentModel = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    """Score the questionnaire and fold the result into the skill profile.

    Skills the student demonstrated are added to their profile, which then
    feeds straight into match scores and the gap analysis. Nothing is ever
    removed — a missed question marks a gap, it does not delete a skill.
    """
    if not payload.answers:
        raise HTTPException(status_code=400, detail="No answers were submitted")

    result = _score_assessment(payload.answers)

    record = AssessmentModel(
        id=new_id("asm"),
        student_id=student.id,
        submitted_at=datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        technical_score=result["technical_score"],
        soft_score=result["soft_score"],
        aptitude_score=result["aptitude_score"],
        overall_score=result["overall_score"],
        category_scores=json.dumps(result["category_scores"]),
        answers=json.dumps(payload.answers),
    )
    db.add(record)

    # Merge the demonstrated technical skills into the profile.
    existing = json.loads(student.skills or "[]")
    lower = {s.lower() for s in existing}
    for skill in result["proven_skills"]:
        if skill.lower() not in lower and skill not in SOFT_KEYWORDS:
            existing.append(skill)
            lower.add(skill.lower())
    student.skills = json.dumps(existing)

    existing_soft = json.loads(student.soft_skills or "[]")
    soft_lower = {s.lower() for s in existing_soft}
    for skill in result["proven_skills"]:
        if skill in SOFT_KEYWORDS and skill.lower() not in soft_lower:
            existing_soft.append(skill)
            soft_lower.add(skill.lower())
    student.soft_skills = json.dumps(existing_soft)

    # A completed assessment is a real signal of placement readiness.
    student.placement_readiness = max(student.placement_readiness or 0, result["overall_score"])
    student.profile_completion = min(100, (student.profile_completion or 0) + 10)

    db.commit()

    return {
        **result,
        "id": record.id,
        "submitted_at": record.submitted_at,
        "skills_added": result["proven_skills"],
    }


@app.get("/api/assessment/result")
def get_assessment_result(student: StudentModel = Depends(get_current_student), db: Session = Depends(get_db)):
    """The latest assessment, plus every earlier attempt for the trend line."""
    rows = (
        db.query(AssessmentModel)
        .filter(AssessmentModel.student_id == student.id)
        .order_by(AssessmentModel.submitted_at.desc())
        .all()
    )
    if not rows:
        return {"has_assessment": False, "history": []}

    latest = rows[0]
    return {
        "has_assessment": True,
        "id": latest.id,
        "submitted_at": latest.submitted_at,
        "technical_score": latest.technical_score,
        "soft_score": latest.soft_score,
        "aptitude_score": latest.aptitude_score,
        "overall_score": latest.overall_score,
        "category_scores": json.loads(latest.category_scores or "{}"),
        "attempts": len(rows),
        "history": [
            {"submitted_at": r.submitted_at, "overall_score": r.overall_score}
            for r in reversed(rows)
        ],
    }


# =====================================================================
# LEARNING PROGRAMS & PERSONALISED RECOMMENDATIONS
# =====================================================================

# A curated fallback catalogue so a fresh install still has something to
# recommend before any industry partner has published a program. Every URL
# is a stable course-catalogue landing page rather than a deep link, which
# would rot between semesters.
CURATED_LEARNING = {
    "Python": [
        ("Programming, Data Structures and Algorithms using Python", "NPTEL", "certification", "https://nptel.ac.in/courses", "12 weeks"),
        ("Python for Everybody", "SWAYAM", "course", "https://swayam.gov.in", "8 weeks"),
    ],
    "JavaScript": [
        ("JavaScript Algorithms and Data Structures", "freeCodeCamp", "certification", "https://www.freecodecamp.org/learn/", "Self-paced"),
    ],
    "React": [
        ("Front End Development Libraries", "freeCodeCamp", "certification", "https://www.freecodecamp.org/learn/", "Self-paced"),
    ],
    "HTML": [
        ("Responsive Web Design", "freeCodeCamp", "certification", "https://www.freecodecamp.org/learn/", "Self-paced"),
    ],
    "CSS": [
        ("Responsive Web Design", "freeCodeCamp", "certification", "https://www.freecodecamp.org/learn/", "Self-paced"),
    ],
    "SQL": [
        ("Database Management System", "NPTEL", "certification", "https://nptel.ac.in/courses", "12 weeks"),
        ("Relational Databases", "SWAYAM", "course", "https://swayam.gov.in", "8 weeks"),
    ],
    "PostgreSQL": [
        ("Database Management System", "NPTEL", "certification", "https://nptel.ac.in/courses", "12 weeks"),
    ],
    "Docker": [
        ("Docker Get Started", "Docker", "course", "https://docs.docker.com/get-started/", "Self-paced"),
    ],
    "AWS": [
        ("AWS Cloud Practitioner Essentials", "AWS Skill Builder", "certification", "https://skillbuilder.aws/", "Self-paced"),
    ],
    "Git": [
        ("Introduction to Git and GitHub", "Microsoft Learn", "course", "https://learn.microsoft.com/training/", "Self-paced"),
    ],
    "Power BI": [
        ("Microsoft Power BI Data Analyst", "Microsoft Learn", "certification", "https://learn.microsoft.com/training/", "Self-paced"),
    ],
    "Excel": [
        ("Excel for Data Analysis", "Microsoft Learn", "course", "https://learn.microsoft.com/training/", "Self-paced"),
    ],
    "Figma": [
        ("Figma Learn — Design Basics", "Figma", "course", "https://help.figma.com/hc/en-us/categories/360002051613", "Self-paced"),
    ],
    "TypeScript": [
        ("TypeScript Handbook", "Microsoft Learn", "course", "https://learn.microsoft.com/training/", "Self-paced"),
    ],
    "Node.js": [
        ("Back End Development and APIs", "freeCodeCamp", "certification", "https://www.freecodecamp.org/learn/", "Self-paced"),
    ],
    "MongoDB": [
        ("MongoDB Basics", "MongoDB University", "certification", "https://learn.mongodb.com/", "Self-paced"),
    ],
    "FastAPI": [
        ("FastAPI Official Tutorial", "FastAPI", "course", "https://fastapi.tiangolo.com/tutorial/", "Self-paced"),
    ],
    "Communication": [
        ("Developing Soft Skills and Personality", "NPTEL", "certification", "https://nptel.ac.in/courses", "8 weeks"),
    ],
    "Leadership": [
        ("Leadership and Team Effectiveness", "SWAYAM", "course", "https://swayam.gov.in", "8 weeks"),
    ],
}


def _program_out(p: LearningProgramModel) -> dict:
    return {
        "id": p.id,
        "title": p.title,
        "provider": p.provider,
        "program_type": p.program_type,
        "description": p.description or "",
        "skills_covered": json.loads(p.skills_covered or "[]"),
        "url": p.url or "",
        "duration": p.duration or "",
        "cost": p.cost or "Free",
        "audience": p.audience or "student",
        "eligibility": p.eligibility or "",
        "certificate": bool(p.certificate),
        "source": p.source_type or "industry",
    }


class LearningProgramPayload(BaseModel):
    title: str
    provider: str
    program_type: str = "course"
    description: Optional[str] = ""
    skills_covered: List[str] = []
    url: Optional[str] = ""
    duration: Optional[str] = ""
    cost: Optional[str] = "Free"
    audience: Optional[str] = "student"


VALID_PROGRAM_TYPES = {"course", "certification", "workshop", "mentorship"}


def clean_public_url(url: str) -> str:
    """Accept only http(s) links, and drop anything else silently.

    A program URL is rendered as a link for every student who sees it, so a
    "javascript:" or "data:" URL here would be stored XSS: the browser runs
    it in the reader's session the moment they click. HTML-escaping does not
    help — those URLs contain no HTML characters. The frontend checks this
    too; this is the authoritative one.
    """
    raw = (url or "").strip()
    if not raw:
        return ""
    return raw if raw.lower().startswith(("http://", "https://")) else ""


def _validate_social_url(url: str, field_name: str, required_domain: str) -> str:
    """Same http(s)-only rule as clean_public_url, plus a domain check so a
    LinkedIn field cannot silently hold a github.com link (or vice versa) -
    every other page that reads linkedin_url/github_url assumes it got the
    platform it asked for. An empty string clears the field, which is the
    only way to disconnect a profile."""
    raw = clean_public_url(url)
    if not raw:
        return ""
    host = urllib.parse.urlparse(raw).netloc.lower()
    if not (host == required_domain or host.endswith("." + required_domain)):
        raise HTTPException(
            status_code=400,
            detail=f"{field_name} must be a {required_domain} link.",
        )
    return raw


@app.get("/api/learning/programs")
def list_learning_programs(
    audience: Optional[str] = Query(None),
    skill: Optional[str] = Query(None),
    user: StudentModel = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    """Everything industry partners have published, newest first."""
    q = db.query(LearningProgramModel)
    rows = q.order_by(LearningProgramModel.created_at.desc()).all()
    out = [_program_out(p) for p in rows]

    # Default to the caller's own track so a student never has to wade past
    # faculty development programmes. Staff see everything unless they ask
    # for a specific audience.
    role = user_role(user)
    if not audience and role in (ROLE_STUDENT, ROLE_FACULTY):
        audience = ROLE_FACULTY if role == ROLE_FACULTY else "student"
    if audience:
        out = [p for p in out if p["audience"] in (audience, "both")]
    if skill:
        out = [p for p in out if any(s.lower() == skill.lower() for s in p["skills_covered"])]
    return out


@app.post("/api/learning/programs", status_code=201)
def create_learning_program(
    payload: LearningProgramPayload,
    user: StudentModel = Depends(require_roles(ROLE_RECRUITER, ROLE_INSTITUTION, ROLE_FACULTY)),
    db: Session = Depends(get_db),
):
    if not payload.title.strip() or not payload.provider.strip():
        raise HTTPException(status_code=400, detail="Title and provider are required")
    if payload.program_type not in VALID_PROGRAM_TYPES:
        raise HTTPException(status_code=400, detail=f"program_type must be one of {sorted(VALID_PROGRAM_TYPES)}")

    program = LearningProgramModel(
        id=new_id("lp"),
        title=payload.title.strip(),
        provider=payload.provider.strip(),
        program_type=payload.program_type,
        description=(payload.description or "").strip(),
        skills_covered=json.dumps([s.strip() for s in payload.skills_covered if s and s.strip()]),
        url=clean_public_url(payload.url),
        duration=(payload.duration or "").strip(),
        cost=(payload.cost or "Free").strip(),
        audience=payload.audience or "student",
        posted_by=user.id,
        created_at=datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
    )
    db.add(program)
    db.commit()
    return _program_out(program)


@app.delete("/api/learning/programs/{program_id}", status_code=204)
def delete_learning_program(
    program_id: str,
    user: StudentModel = Depends(require_roles(ROLE_RECRUITER, ROLE_INSTITUTION, ROLE_FACULTY)),
    db: Session = Depends(get_db),
):
    p = db.query(LearningProgramModel).filter(LearningProgramModel.id == program_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Program not found")
    # You can only take down what you published — unless you are the admin.
    if p.posted_by != user.id and user_role(user) != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="You can only remove programs you published")
    db.delete(p)
    db.commit()
    return None


@app.get("/api/learning/recommendations")
def learning_recommendations(student: StudentModel = Depends(get_current_student), db: Session = Depends(get_db)):
    """Courses aimed squarely at this student's actual gaps.

    A gap is any skill an open opportunity asks for that the student does
    not have. Gaps are ranked by how many opportunities want that skill, so
    the first recommendation is always the one that unlocks the most doors.
    """
    have = {s.lower() for s in json.loads(student.skills or "[]")}
    have |= {s.lower() for s in json.loads(student.soft_skills or "[]")}

    audience = ROLE_FACULTY if user_role(student) == ROLE_FACULTY else "student"
    opportunities = (
        db.query(InternshipModel)
        .filter((InternshipModel.audience == audience) | (InternshipModel.audience.is_(None)))
        .all()
    )

    demand = {}
    for opp in opportunities:
        for skill in json.loads(opp.required_skills or "[]"):
            if skill.lower() not in have:
                demand[skill] = demand.get(skill, 0) + 1

    ranked = sorted(demand.items(), key=lambda kv: kv[1], reverse=True)

    # Only programs aimed at this reader. A faculty development programme is
    # not a useful recommendation for an undergraduate, and vice versa.
    industry = [
        p
        for p in db.query(LearningProgramModel).all()
        if (p.audience or "student") in (audience, "both")
    ]

    recommendations = []
    for skill, count in ranked:
        programs = []
        # Industry-published programs come first — they are the ones with a
        # hiring partner attached.
        for p in industry:
            if any(s.lower() == skill.lower() for s in json.loads(p.skills_covered or "[]")):
                programs.append(_program_out(p))

        # Several sources can point at the same page — the official catalogue
        # and CURATED_LEARNING overlap, and a partner program may cite a
        # public course. Dedupe the whole group on URL so one course is never
        # listed twice under a single skill.
        deduped, seen_urls = [], set()
        for prog in programs:
            key = (prog.get("url") or "").rstrip("/").lower()
            if key and key in seen_urls:
                continue
            if key:
                seen_urls.add(key)
            deduped.append(prog)
        programs = deduped
        for title, provider, ptype, url, duration in CURATED_LEARNING.get(skill, []):
            if url.rstrip("/").lower() in seen_urls:
                continue
            seen_urls.add(url.rstrip("/").lower())
            programs.append(
                {
                    "id": f"curated_{skill}_{provider}".replace(" ", "_").lower(),
                    "title": title,
                    "provider": provider,
                    "program_type": ptype,
                    "description": "",
                    "skills_covered": [skill],
                    "url": url,
                    "duration": duration,
                    "cost": "Free",
                    "audience": "student",
                    "source": "curated",
                }
            )
        if programs:
            recommendations.append(
                {
                    "skill": skill,
                    "opportunities_unlocked": count,
                    "priority": "HIGH" if count >= 3 else "MEDIUM" if count == 2 else "LOW",
                    "programs": programs,
                }
            )

    return {
        "gaps_found": len(ranked),
        "recommendations": recommendations,
    }


# =====================================================================
# OPPORTUNITIES  (internships, jobs, apprenticeships, projects, FDPs)
# ---------------------------------------------------------------------
# The same matching engine drives all of them; only the type and audience
# filters differ. Students see student-facing roles, faculty see faculty
# internships, industrial training and FDPs.
# =====================================================================

VALID_OPPORTUNITY_TYPES = {"internship", "job", "apprenticeship", "project", "fdp", "training"}
FACULTY_TYPES = {"fdp", "training", "project"}


def _opportunity_out(i: InternshipModel, score_details: Optional[dict] = None) -> dict:
    out = {
        "id": i.id,
        "title": i.title,
        "company": i.company,
        "location": i.location,
        "work_mode": i.work_mode,
        "stipend": i.stipend or "",
        "duration": i.duration or "",
        "deadline": i.deadline or "",
        "description": i.description or "",
        "opportunity_type": i.opportunity_type or "internship",
        "audience": i.audience or "student",
        "min_cgpa": i.min_cgpa or 0.0,
        "openings": i.openings or 1,
        "required_skills": json.loads(i.required_skills or "[]"),
        "source_type": i.source_type or "platform",
        "official_url": i.official_url or "",
        "source_name": i.source_name or "",
        "eligibility": i.eligibility or "",
    }
    if score_details:
        out.update(
            {
                "match_score": score_details["match_score"],
                "matched_skills": score_details["matched_skills"],
                "missing_skills": score_details["missing_skills"],
                "breakdown": score_details["breakdown"],
            }
        )
    return out


@app.get("/api/opportunities")
def list_opportunities(
    opportunity_type: Optional[str] = Query(None),
    work_mode: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    user: StudentModel = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    """Every opportunity this user is eligible to see, ranked by match.

    Faculty accounts see the faculty track (FDPs, industrial training,
    research projects); everyone else sees the student track.
    """
    audience = ROLE_FACULTY if user_role(user) == ROLE_FACULTY else "student"

    q = db.query(InternshipModel)
    if opportunity_type:
        q = q.filter(InternshipModel.opportunity_type == opportunity_type)
    if work_mode:
        q = q.filter(InternshipModel.work_mode.ilike(work_mode))
    if location:
        q = q.filter(InternshipModel.location.ilike(f"%{location}%"))
    if search:
        like = f"%{search}%"
        q = q.filter(
            InternshipModel.title.ilike(like)
            | InternshipModel.company.ilike(like)
            | InternshipModel.required_skills.ilike(like)
        )

    results = []
    for opp in q.all():
        # Rows created before the audience column existed default to student.
        if (opp.audience or "student") != audience:
            continue
        results.append(_opportunity_out(opp, calculate_match_score_breakdown(user, opp)))

    results.sort(key=lambda x: x["match_score"], reverse=True)
    return results


class OpportunityPayload(BaseModel):
    title: str
    company: str
    location: str
    work_mode: str
    opportunity_type: str = "internship"
    audience: str = "student"
    description: Optional[str] = ""
    stipend: Optional[str] = ""
    duration: Optional[str] = ""
    deadline: Optional[str] = ""
    min_cgpa: Optional[float] = 0.0
    openings: Optional[int] = 1
    required_skills: List[str] = []


@app.post("/api/opportunities", status_code=201)
def create_opportunity(
    payload: OpportunityPayload,
    user: StudentModel = Depends(require_roles(ROLE_RECRUITER, ROLE_INSTITUTION, ROLE_FACULTY)),
    db: Session = Depends(get_db),
):
    """Publish an internship, job, apprenticeship, project, FDP or training."""
    if not payload.title.strip() or not payload.company.strip():
        raise HTTPException(status_code=400, detail="Title and organisation are required")
    if payload.opportunity_type not in VALID_OPPORTUNITY_TYPES:
        raise HTTPException(
            status_code=400, detail=f"opportunity_type must be one of {sorted(VALID_OPPORTUNITY_TYPES)}"
        )
    skills = [s.strip() for s in payload.required_skills if s and s.strip()]
    if not skills:
        raise HTTPException(status_code=400, detail="At least one required skill is needed")

    audience = ROLE_FACULTY if payload.audience == ROLE_FACULTY else "student"

    opp = InternshipModel(
        id=new_id("opp"),
        title=payload.title.strip(),
        company=payload.company.strip(),
        location=payload.location.strip() or "Not specified",
        work_mode=payload.work_mode.strip() or "Remote",
        stipend=(payload.stipend or "").strip(),
        duration=(payload.duration or "").strip(),
        deadline=(payload.deadline or "").strip(),
        description=(payload.description or "").strip(),
        opportunity_type=payload.opportunity_type,
        audience=audience,
        min_cgpa=payload.min_cgpa or 0.0,
        openings=payload.openings or 1,
        posted_by=user.id,
        required_skills=json.dumps(skills),
    )
    db.add(opp)
    db.commit()
    db.refresh(opp)
    return _opportunity_out(opp)


# =====================================================================
# RECRUITER PORTAL
# ---------------------------------------------------------------------
# What a company sees: the roles it posted, who applied, how well each
# applicant matches, and the controls to shortlist or reject them.
# =====================================================================

@app.get("/api/recruiter/postings")
def recruiter_postings(
    user: StudentModel = Depends(require_roles(ROLE_RECRUITER, ROLE_INSTITUTION, ROLE_FACULTY)),
    db: Session = Depends(get_db),
):
    """Every opportunity this account published, with its applicant count."""
    q = db.query(InternshipModel)
    if user_role(user) != ROLE_ADMIN:
        q = q.filter(InternshipModel.posted_by == user.id)
    rows = q.all()

    out = []
    for opp in rows:
        apps = db.query(ApplicationModel).filter(ApplicationModel.internship_id == opp.id).all()
        record = _opportunity_out(opp)
        record["applicants"] = len(apps)
        record["shortlisted"] = sum(1 for a in apps if a.status == "shortlisted")
        out.append(record)
    out.sort(key=lambda x: x["applicants"], reverse=True)
    return out


@app.get("/api/recruiter/applicants")
def recruiter_applicants(
    opportunity_id: Optional[str] = Query(None),
    min_match: int = Query(0),
    user: StudentModel = Depends(require_roles(ROLE_RECRUITER, ROLE_INSTITUTION, ROLE_FACULTY)),
    db: Session = Depends(get_db),
):
    """Candidate shortlisting: applicants ranked by skill compatibility.

    Only applicants to this account's own postings are ever returned, so one
    company can never browse another company's pipeline.
    """
    own = db.query(InternshipModel)
    if user_role(user) != ROLE_ADMIN:
        own = own.filter(InternshipModel.posted_by == user.id)
    own_ids = {o.id: o for o in own.all()}
    if opportunity_id:
        if opportunity_id not in own_ids:
            raise HTTPException(status_code=404, detail="Opportunity not found")
        own_ids = {opportunity_id: own_ids[opportunity_id]}
    if not own_ids:
        return []

    apps = (
        db.query(ApplicationModel)
        .filter(ApplicationModel.internship_id.in_(list(own_ids.keys())))
        .all()
    )

    out = []
    for a in apps:
        applicant = db.query(StudentModel).filter(StudentModel.id == a.student_id).first()
        if not applicant:
            continue
        opp = own_ids[a.internship_id]
        details = calculate_match_score_breakdown(applicant, opp)
        if details["match_score"] < min_match:
            continue
        eligible = (applicant.cgpa or 0) >= (opp.min_cgpa or 0)
        out.append(
            {
                "application_id": a.id,
                "status": a.status,
                "applied_on": a.applied_on,
                "opportunity_id": opp.id,
                "opportunity_title": opp.title,
                "student_id": applicant.id,
                "student_name": applicant.full_name,
                "email": applicant.email,
                "college": applicant.college or "",
                "branch": applicant.branch or "",
                "cgpa": applicant.cgpa or 0.0,
                "graduation_year": applicant.graduation_year or 0,
                "match_score": details["match_score"],
                "matched_skills": details["matched_skills"],
                "missing_skills": details["missing_skills"],
                "meets_cgpa": eligible,
            }
        )
    out.sort(key=lambda x: x["match_score"], reverse=True)
    return out


@app.patch("/api/recruiter/applications/{application_id}")
def recruiter_update_application(
    application_id: str,
    payload: AdminApplicationUpdate,
    user: StudentModel = Depends(require_roles(ROLE_RECRUITER, ROLE_INSTITUTION, ROLE_FACULTY)),
    db: Session = Depends(get_db),
):
    """Shortlist, reject or advance an applicant to one of your own postings."""
    a = db.query(ApplicationModel).filter(ApplicationModel.id == application_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Application not found")
    if payload.status not in VALID_APP_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {sorted(VALID_APP_STATUSES)}")

    opp = db.query(InternshipModel).filter(InternshipModel.id == a.internship_id).first()
    if user_role(user) != ROLE_ADMIN and (not opp or opp.posted_by != user.id):
        raise HTTPException(status_code=403, detail="This application is not for one of your postings")

    a.status = payload.status
    db.commit()
    return {"id": a.id, "status": a.status}


# =====================================================================
# INTERNSHIP PROGRESS TRACKING & MENTOR FEEDBACK
# =====================================================================

class ProgressLogPayload(BaseModel):
    week: int = 1
    summary: str
    hours: Optional[int] = 0


class MentorFeedbackPayload(BaseModel):
    mentor_feedback: str
    mentor_rating: int = 0


def _progress_out(p: ProgressLogModel) -> dict:
    return {
        "id": p.id,
        "application_id": p.application_id,
        "week": p.week,
        "summary": p.summary or "",
        "hours": p.hours or 0,
        "created_at": p.created_at,
        "mentor_feedback": p.mentor_feedback or "",
        "mentor_rating": p.mentor_rating or 0,
        "reviewed_at": p.reviewed_at or "",
    }


def _application_or_404(application_id: str, db: Session) -> ApplicationModel:
    a = db.query(ApplicationModel).filter(ApplicationModel.id == application_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Application not found")
    return a


def _can_see_application(user: StudentModel, a: ApplicationModel, db: Session) -> bool:
    """The intern, the mentor who posted the role, and admins. Nobody else."""
    if a.student_id == user.id or user_role(user) == ROLE_ADMIN:
        return True
    opp = db.query(InternshipModel).filter(InternshipModel.id == a.internship_id).first()
    return bool(opp and opp.posted_by == user.id)


@app.get("/api/applications/{application_id}/progress")
def list_progress(
    application_id: str,
    user: StudentModel = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    a = _application_or_404(application_id, db)
    if not _can_see_application(user, a, db):
        raise HTTPException(status_code=403, detail="You cannot view this internship log")

    rows = (
        db.query(ProgressLogModel)
        .filter(ProgressLogModel.application_id == application_id)
        .order_by(ProgressLogModel.week)
        .all()
    )
    reviewed = [r for r in rows if r.mentor_rating]
    return {
        "application_id": application_id,
        "status": a.status,
        "weeks_logged": len(rows),
        "total_hours": sum(r.hours or 0 for r in rows),
        "average_rating": round(sum(r.mentor_rating for r in reviewed) / len(reviewed), 1) if reviewed else 0,
        "logs": [_progress_out(r) for r in rows],
    }


@app.post("/api/applications/{application_id}/progress", status_code=201)
def add_progress(
    application_id: str,
    payload: ProgressLogPayload,
    user: StudentModel = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    """The intern logs a week's work. Only the intern can write these."""
    a = _application_or_404(application_id, db)
    if a.student_id != user.id:
        raise HTTPException(status_code=403, detail="Only the intern can add a progress entry")
    if not payload.summary.strip():
        raise HTTPException(status_code=400, detail="Write a short summary of the week's work")

    existing = (
        db.query(ProgressLogModel)
        .filter(ProgressLogModel.application_id == application_id, ProgressLogModel.week == payload.week)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail=f"Week {payload.week} has already been logged")

    log = ProgressLogModel(
        id=new_id("plog"),
        application_id=application_id,
        week=max(1, payload.week),
        summary=payload.summary.strip(),
        hours=max(0, payload.hours or 0),
        created_at=datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
    )
    db.add(log)
    db.commit()
    return _progress_out(log)


@app.patch("/api/progress/{log_id}/feedback")
def add_mentor_feedback(
    log_id: str,
    payload: MentorFeedbackPayload,
    user: StudentModel = Depends(require_roles(ROLE_RECRUITER, ROLE_INSTITUTION, ROLE_FACULTY)),
    db: Session = Depends(get_db),
):
    """The mentor reviews one weekly entry."""
    log = db.query(ProgressLogModel).filter(ProgressLogModel.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Progress entry not found")
    if not 0 <= payload.mentor_rating <= 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    a = _application_or_404(log.application_id, db)
    opp = db.query(InternshipModel).filter(InternshipModel.id == a.internship_id).first()
    if user_role(user) != ROLE_ADMIN and (not opp or opp.posted_by != user.id):
        raise HTTPException(status_code=403, detail="You are not the mentor for this internship")

    log.mentor_feedback = payload.mentor_feedback.strip()
    log.mentor_rating = payload.mentor_rating
    log.reviewed_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    db.commit()
    return _progress_out(log)


@app.post("/api/applications/{application_id}/complete")
def complete_internship(
    application_id: str,
    user: StudentModel = Depends(require_roles(ROLE_RECRUITER, ROLE_INSTITUTION, ROLE_FACULTY)),
    db: Session = Depends(get_db),
):
    """Mark an internship finished and issue the verified completion record.

    This is the moment a line on a CV stops being a claim and becomes
    something a future employer can check: the company that hosted the
    internship signs it, and it lands in the student's portfolio.
    """
    a = _application_or_404(application_id, db)
    opp = db.query(InternshipModel).filter(InternshipModel.id == a.internship_id).first()
    if user_role(user) != ROLE_ADMIN and (not opp or opp.posted_by != user.id):
        raise HTTPException(status_code=403, detail="You did not host this internship")

    a.status = "completed"

    already = (
        db.query(VerificationModel)
        .filter(
            VerificationModel.student_id == a.student_id,
            VerificationModel.item_type == "internship",
            VerificationModel.item_key == a.id,
        )
        .first()
    )
    if not already:
        db.add(
            VerificationModel(
                id=new_id("ver"),
                student_id=a.student_id,
                item_type="internship",
                item_key=a.id,
                verified_by=user.id,
                verifier_name=user.full_name,
                verifier_role=user_role(user),
                verified_at=datetime.datetime.now().strftime("%Y-%m-%d"),
                note=f"Completed {opp.title} at {opp.company}" if opp else "Internship completed",
            )
        )

    db.commit()
    return {"id": a.id, "status": a.status, "verified": True}


# =====================================================================
# VERIFIED DIGITAL PORTFOLIO
# =====================================================================

class VerifyPayload(BaseModel):
    student_id: str
    item_type: str      # skill | certification | project | internship
    item_key: str
    note: Optional[str] = ""


VALID_ITEM_TYPES = {"skill", "certification", "project", "internship"}


def _verification_index(student_id: str, db: Session) -> dict:
    """{(item_type, lowercased key): verification dict} for quick lookups."""
    index = {}
    for v in db.query(VerificationModel).filter(VerificationModel.student_id == student_id).all():
        index[(v.item_type, v.item_key.lower())] = {
            "verified_by": v.verifier_name or "",
            "verifier_role": v.verifier_role or "",
            "verified_at": v.verified_at,
            "note": v.note or "",
        }
    return index


def _build_portfolio(s: StudentModel, db: Session) -> dict:
    """Assemble the portfolio, marking every item verified or self-declared."""
    index = _verification_index(s.id, db)

    def stamp(item_type, key):
        return index.get((item_type, str(key).lower()))

    skills = [
        {"name": name, "verification": stamp("skill", name)}
        for name in json.loads(s.skills or "[]")
    ]
    certifications = [
        {**c, "verification": stamp("certification", c.get("title", ""))}
        for c in json.loads(s.certifications or "[]")
    ]
    projects = [
        {**p, "verification": stamp("project", p.get("title", ""))}
        for p in json.loads(s.projects or "[]")
    ]

    internships = []
    for a in db.query(ApplicationModel).filter(ApplicationModel.student_id == s.id).all():
        if a.status not in ("completed", "shortlisted"):
            continue
        opp = db.query(InternshipModel).filter(InternshipModel.id == a.internship_id).first()
        if not opp:
            continue
        logs = db.query(ProgressLogModel).filter(ProgressLogModel.application_id == a.id).all()
        reviewed = [x for x in logs if x.mentor_rating]
        internships.append(
            {
                "title": opp.title,
                "company": opp.company,
                "duration": opp.duration or "",
                "status": a.status,
                "weeks_logged": len(logs),
                "total_hours": sum(x.hours or 0 for x in logs),
                "mentor_rating": round(sum(x.mentor_rating for x in reviewed) / len(reviewed), 1) if reviewed else 0,
                "verification": stamp("internship", a.id),
            }
        )

    latest = (
        db.query(AssessmentModel)
        .filter(AssessmentModel.student_id == s.id)
        .order_by(AssessmentModel.submitted_at.desc())
        .first()
    )

    verified_count = sum(
        1
        for group in (skills, certifications, projects, internships)
        for item in group
        if item.get("verification")
    )
    total_items = len(skills) + len(certifications) + len(projects) + len(internships)

    return {
        "student": {
            "id": s.id,
            "full_name": s.full_name,
            "college": s.college or "",
            "degree": s.degree or "",
            "branch": s.branch or "",
            "graduation_year": s.graduation_year or 0,
            "location": s.location or "",
            "photo_url": s.photo_url or "",
        },
        "skills": skills,
        "soft_skills": json.loads(s.soft_skills or "[]"),
        "certifications": certifications,
        "projects": projects,
        "internships": internships,
        "assessment": (
            {
                "overall_score": latest.overall_score,
                "technical_score": latest.technical_score,
                "soft_score": latest.soft_score,
                "aptitude_score": latest.aptitude_score,
                "submitted_at": latest.submitted_at,
            }
            if latest
            else None
        ),
        "verified_items": verified_count,
        "total_items": total_items,
        "credibility": round(verified_count * 100 / total_items) if total_items else 0,
    }


@app.get("/api/portfolio/me")
def my_portfolio(student: StudentModel = Depends(get_current_student), db: Session = Depends(get_db)):
    return _build_portfolio(student, db)


@app.get("/api/portfolio/{student_id}")
def public_portfolio(student_id: str, db: Session = Depends(get_db)):
    """The shareable version — no authentication, so a recruiter can open it
    from a link. Deliberately excludes email, phone, CGPA and every other
    contact detail; a portfolio proves competence, it is not a directory."""
    s = db.query(StudentModel).filter(StudentModel.id == student_id).first()
    if not s or not s.is_active:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return _build_portfolio(s, db)


@app.post("/api/portfolio/verify", status_code=201)
def verify_portfolio_item(
    payload: VerifyPayload,
    user: StudentModel = Depends(require_roles(ROLE_FACULTY, ROLE_INSTITUTION, ROLE_RECRUITER)),
    db: Session = Depends(get_db),
):
    """Sign off on one portfolio item.

    A student can never verify their own work — that is the entire point of
    the stamp, and it is enforced here rather than in the UI.
    """
    if payload.item_type not in VALID_ITEM_TYPES:
        raise HTTPException(status_code=400, detail=f"item_type must be one of {sorted(VALID_ITEM_TYPES)}")
    if payload.student_id == user.id:
        raise HTTPException(status_code=403, detail="You cannot verify your own portfolio")

    target = db.query(StudentModel).filter(StudentModel.id == payload.student_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Student not found")

    existing = (
        db.query(VerificationModel)
        .filter(
            VerificationModel.student_id == payload.student_id,
            VerificationModel.item_type == payload.item_type,
            VerificationModel.item_key == payload.item_key,
        )
        .first()
    )
    if existing:
        return {"id": existing.id, "already_verified": True}

    v = VerificationModel(
        id=new_id("ver"),
        student_id=payload.student_id,
        item_type=payload.item_type,
        item_key=payload.item_key,
        verified_by=user.id,
        verifier_name=user.full_name,
        verifier_role=user_role(user),
        verified_at=datetime.datetime.now().strftime("%Y-%m-%d"),
        note=(payload.note or "").strip(),
    )
    db.add(v)
    db.commit()
    return {"id": v.id, "already_verified": False}


@app.delete("/api/portfolio/verify/{verification_id}", status_code=204)
def revoke_verification(
    verification_id: str,
    user: StudentModel = Depends(require_roles(ROLE_FACULTY, ROLE_INSTITUTION, ROLE_RECRUITER)),
    db: Session = Depends(get_db),
):
    v = db.query(VerificationModel).filter(VerificationModel.id == verification_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Verification not found")
    if v.verified_by != user.id and user_role(user) != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Only the verifier can revoke this")
    db.delete(v)
    db.commit()
    return None


@app.get("/api/verify/pending")
def pending_verifications(
    user: StudentModel = Depends(require_roles(ROLE_FACULTY, ROLE_INSTITUTION, ROLE_RECRUITER)),
    db: Session = Depends(get_db),
):
    """Students whose claims are still unverified, so a verifier has a queue
    to work through instead of having to go looking."""
    out = []
    for s in db.query(StudentModel).filter(StudentModel.role == ROLE_STUDENT).all():
        if not s.is_active:
            continue
        # An institution account only sees its own college's students.
        if user_role(user) == ROLE_INSTITUTION and user.org_name and not _same_institution(s.college, user.org_name):
            continue
        index = _verification_index(s.id, db)
        pending = []
        for name in json.loads(s.skills or "[]"):
            if ("skill", name.lower()) not in index:
                pending.append({"item_type": "skill", "item_key": name, "label": name})
        for c in json.loads(s.certifications or "[]"):
            title = c.get("title", "")
            if title and ("certification", title.lower()) not in index:
                pending.append({"item_type": "certification", "item_key": title, "label": f"{title} — {c.get('issuer', '')}"})
        for p in json.loads(s.projects or "[]"):
            title = p.get("title", "")
            if title and ("project", title.lower()) not in index:
                pending.append({"item_type": "project", "item_key": title, "label": title})
        if pending:
            out.append(
                {
                    "student_id": s.id,
                    "student_name": s.full_name,
                    "college": s.college or "",
                    "branch": s.branch or "",
                    "pending_count": len(pending),
                    "items": pending,
                }
            )
    out.sort(key=lambda x: x["pending_count"], reverse=True)
    return out


# =====================================================================
# INDUSTRY-ACADEMIA COLLABORATION
# =====================================================================

VALID_COLLAB_TYPES = {
    "guest_lecture",
    "workshop",
    "live_project",
    "innovation_challenge",
    "mentorship",
    "research",
    "consultancy",
}


class CollaborationPayload(BaseModel):
    title: str
    organisation: str
    collab_type: str = "workshop"
    description: Optional[str] = ""
    skills_involved: List[str] = []
    mode: Optional[str] = "Hybrid"
    location: Optional[str] = ""
    starts_on: Optional[str] = ""
    seats: Optional[int] = 0
    audience: Optional[str] = "both"


class CollabInterestPayload(BaseModel):
    note: Optional[str] = ""


def _collab_out(c: CollaborationModel, registered: int = 0, mine: bool = False) -> dict:
    return {
        "id": c.id,
        "title": c.title,
        "organisation": c.organisation,
        "collab_type": c.collab_type,
        "description": c.description or "",
        "skills_involved": json.loads(c.skills_involved or "[]"),
        "mode": c.mode or "",
        "location": c.location or "",
        "starts_on": c.starts_on or "",
        "seats": c.seats or 0,
        "audience": c.audience or "both",
        "created_at": c.created_at,
        "registered": registered,
        "seats_left": max(0, (c.seats or 0) - registered) if c.seats else None,
        "i_registered": mine,
    }


@app.get("/api/collaborations")
def list_collaborations(
    collab_type: Optional[str] = Query(None),
    user: StudentModel = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    role = user_role(user)
    audience = ROLE_FACULTY if role == ROLE_FACULTY else "student"

    q = db.query(CollaborationModel)
    if collab_type:
        q = q.filter(CollaborationModel.collab_type == collab_type)
    rows = q.order_by(CollaborationModel.created_at.desc()).all()

    my_ids = {
        i.collab_id
        for i in db.query(CollabInterestModel).filter(CollabInterestModel.user_id == user.id).all()
    }

    out = []
    for c in rows:
        # Staff see everything; students and faculty see their own track.
        if role in (ROLE_STUDENT, ROLE_FACULTY) and (c.audience or "both") not in (audience, "both"):
            continue
        count = db.query(CollabInterestModel).filter(CollabInterestModel.collab_id == c.id).count()
        out.append(_collab_out(c, count, c.id in my_ids))
    return out


@app.post("/api/collaborations", status_code=201)
def create_collaboration(
    payload: CollaborationPayload,
    user: StudentModel = Depends(require_roles(ROLE_RECRUITER, ROLE_INSTITUTION, ROLE_FACULTY)),
    db: Session = Depends(get_db),
):
    if not payload.title.strip() or not payload.organisation.strip():
        raise HTTPException(status_code=400, detail="Title and organisation are required")
    if payload.collab_type not in VALID_COLLAB_TYPES:
        raise HTTPException(status_code=400, detail=f"collab_type must be one of {sorted(VALID_COLLAB_TYPES)}")

    c = CollaborationModel(
        id=new_id("col"),
        title=payload.title.strip(),
        organisation=payload.organisation.strip(),
        collab_type=payload.collab_type,
        description=(payload.description or "").strip(),
        skills_involved=json.dumps([s.strip() for s in payload.skills_involved if s and s.strip()]),
        mode=(payload.mode or "Hybrid").strip(),
        location=(payload.location or "").strip(),
        starts_on=(payload.starts_on or "").strip(),
        seats=max(0, payload.seats or 0),
        audience=payload.audience or "both",
        posted_by=user.id,
        created_at=datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
    )
    db.add(c)
    db.commit()
    return _collab_out(c)


@app.post("/api/collaborations/{collab_id}/register", status_code=201)
def register_for_collaboration(
    collab_id: str,
    payload: CollabInterestPayload,
    user: StudentModel = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    c = db.query(CollaborationModel).filter(CollaborationModel.id == collab_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Collaboration not found")

    existing = (
        db.query(CollabInterestModel)
        .filter(CollabInterestModel.collab_id == collab_id, CollabInterestModel.user_id == user.id)
        .first()
    )
    if existing:
        return {"id": existing.id, "already_registered": True}

    if c.seats:
        taken = db.query(CollabInterestModel).filter(CollabInterestModel.collab_id == collab_id).count()
        if taken >= c.seats:
            raise HTTPException(status_code=400, detail="This session is full")

    i = CollabInterestModel(
        id=new_id("ci"),
        collab_id=collab_id,
        user_id=user.id,
        registered_at=datetime.datetime.now().strftime("%Y-%m-%d"),
        note=(payload.note or "").strip(),
    )
    db.add(i)
    db.commit()
    return {"id": i.id, "already_registered": False}


@app.get("/api/collaborations/{collab_id}/registrations")
def collaboration_registrations(
    collab_id: str,
    user: StudentModel = Depends(require_roles(ROLE_RECRUITER, ROLE_INSTITUTION, ROLE_FACULTY)),
    db: Session = Depends(get_db),
):
    c = db.query(CollaborationModel).filter(CollaborationModel.id == collab_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Collaboration not found")
    if c.posted_by != user.id and user_role(user) != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="You did not publish this collaboration")

    out = []
    for i in db.query(CollabInterestModel).filter(CollabInterestModel.collab_id == collab_id).all():
        p = db.query(StudentModel).filter(StudentModel.id == i.user_id).first()
        if p:
            out.append(
                {
                    "name": p.full_name,
                    "email": p.email,
                    "role": p.role or ROLE_STUDENT,
                    "college": p.college or p.org_name or "",
                    "registered_at": i.registered_at,
                    "note": i.note or "",
                }
            )
    return out


# =====================================================================
# SECURE DOCUMENT MANAGEMENT
# ---------------------------------------------------------------------
# Certificates, internship reports and academic records. Files are held as
# base64 in the row: no object storage to configure, and a fresh clone
# works offline. A document is readable only by its owner and by staff.
# =====================================================================

import base64

VALID_DOC_TYPES = {"certificate", "report", "academic_record", "other"}
MAX_DOC_BYTES = 5 * 1024 * 1024  # 5 MB

# What may be stored at all. Staff open other people's documents, and the
# frontend hands the bytes to the browser as a blob URL — which inherits the
# app's own origin. An uploaded .html or .svg would therefore run script with
# access to the viewer's session, so those types never reach the database.
ALLOWED_DOC_MIME = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
}
ALLOWED_DOC_EXTENSIONS = (".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp")


@app.get("/api/documents")
def list_documents(student: StudentModel = Depends(get_current_student), db: Session = Depends(get_db)):
    rows = (
        db.query(DocumentModel)
        .filter(DocumentModel.student_id == student.id)
        .order_by(DocumentModel.uploaded_at.desc())
        .all()
    )
    # The bytes themselves are never included in a listing.
    return [
        {
            "id": d.id,
            "doc_type": d.doc_type,
            "title": d.title,
            "file_name": d.file_name,
            "size_kb": d.size_kb,
            "uploaded_at": d.uploaded_at,
        }
        for d in rows
    ]


@app.post("/api/documents", status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    doc_type: str = Form("certificate"),
    student: StudentModel = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    if doc_type not in VALID_DOC_TYPES:
        raise HTTPException(status_code=400, detail=f"doc_type must be one of {sorted(VALID_DOC_TYPES)}")

    declared = (file.content_type or "").split(";")[0].strip().lower()
    name = (file.filename or "").lower()
    # Check both, because either one alone is trivial for a client to lie about.
    if declared not in ALLOWED_DOC_MIME or not name.endswith(ALLOWED_DOC_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail="Only PDF and image files (PNG, JPG, GIF, WebP) can be uploaded",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The file is empty")
    if len(content) > MAX_DOC_BYTES:
        raise HTTPException(status_code=400, detail="Files must be 5 MB or smaller")

    doc = DocumentModel(
        id=new_id("doc"),
        student_id=student.id,
        doc_type=doc_type,
        title=title.strip() or file.filename,
        file_name=file.filename,
        content_type=declared,
        size_kb=max(1, len(content) // 1024),
        uploaded_at=datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        data_b64=base64.b64encode(content).decode("ascii"),
    )
    db.add(doc)
    db.commit()
    return {
        "id": doc.id,
        "doc_type": doc.doc_type,
        "title": doc.title,
        "file_name": doc.file_name,
        "size_kb": doc.size_kb,
        "uploaded_at": doc.uploaded_at,
    }


@app.get("/api/documents/{document_id}")
def download_document(
    document_id: str,
    user: StudentModel = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    """Read a document back. Owner and staff only — never another student."""
    d = db.query(DocumentModel).filter(DocumentModel.id == document_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    if d.student_id != user.id and user_role(user) not in VERIFIER_ROLES:
        raise HTTPException(status_code=403, detail="You cannot read this document")
    return {
        "id": d.id,
        "title": d.title,
        "file_name": d.file_name,
        "content_type": d.content_type,
        "data_b64": d.data_b64,
    }


@app.delete("/api/documents/{document_id}", status_code=204)
def delete_document(
    document_id: str,
    user: StudentModel = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    d = db.query(DocumentModel).filter(DocumentModel.id == document_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    if d.student_id != user.id and user_role(user) != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="You can only delete your own documents")
    db.delete(d)
    db.commit()
    return None


# =====================================================================
# INSTITUTION ANALYTICS
# ---------------------------------------------------------------------
# What a college needs to answer: are our students placement-ready, which
# skills are we not teaching, and where is the cohort stuck?
# =====================================================================

# Students type their college by hand, so the same institution turns up as
# "ssbt coet", "ssbt coet jalgaon" and the full legal name. An exact string
# comparison would report a cohort of zero for a college that actually has
# dozens of students, so match on a normalised form and accept either name
# containing the other.
_INSTITUTION_NOISE = {
    "college", "of", "engineering", "and", "technology", "institute",
    "the", "trust", "trusts", "s",
}


def _institution_words(name: str) -> list:
    """Every word of the name, lowercased, punctuation stripped, in order."""
    cleaned = "".join(ch.lower() if (ch.isalnum() or ch.isspace()) else " " for ch in (name or ""))
    return [w for w in cleaned.split() if w]


def _institution_key(name: str) -> set:
    return {w for w in _institution_words(name) if w not in _INSTITUTION_NOISE}


def _institution_acronym(name: str) -> str:
    """First letters of the full name, e.g. the Jalgaon college -> "ssbtcoetj".

    Built from the raw words, noise included, because the noise words are
    exactly the ones the acronym is made of: the COET in "SSBT COET" is
    College Of Engineering and Technology.
    """
    return "".join(w[0] for w in _institution_words(name) if w not in ("and", "the"))


def _same_institution(a: str, b: str) -> bool:
    """Do these two free-text college names refer to the same institution?

    Students type their college by hand, so one college arrives as "ssbt
    coet", "ssbt coet jalgaon" and its full legal name. An exact comparison
    reports a cohort of zero for a college that actually has dozens of
    students, so match on a normalised form.
    """
    ka, kb = _institution_key(a), _institution_key(b)
    if not ka or not kb:
        return False

    # One name's words being a subset of the other's covers the plain
    # shortening case, without matching two genuinely different colleges
    # that happen to share a single word.
    if ka <= kb or kb <= ka:
        return True

    # Indian colleges are usually written as an acronym, and an acronym
    # shares no whole words with the name it stands for. Treat the shorter
    # name as a match when each of its parts is either a word of the longer
    # name or a run of initials inside it — "ssbt coet" against
    # "Shram Sadhana Bombay Trust's College of Engineering & Technology".
    short, long_ = (a, b) if len(_institution_words(a)) <= len(_institution_words(b)) else (b, a)
    short_tokens = _institution_key(short)
    long_words = set(_institution_words(long_))
    acronym = _institution_acronym(long_)
    # A single letter or two would match almost anything; require some length.
    return all(
        t in long_words or (len(t) >= 3 and t in acronym)
        for t in short_tokens
    )


@app.get("/api/institution/analytics")
def institution_analytics(
    user: StudentModel = Depends(require_roles(ROLE_INSTITUTION, ROLE_FACULTY)),
    db: Session = Depends(get_db),
):
    """Cohort-level analytics, scoped to the caller's own college.

    An institution account with no org_name set (or an admin) sees the whole
    platform; otherwise the numbers cover that college only.
    """
    students = [s for s in db.query(StudentModel).filter(StudentModel.role == ROLE_STUDENT).all() if s.is_active]
    scope = user.org_name or (user.college if user_role(user) == ROLE_FACULTY else "")
    if scope and user_role(user) != ROLE_ADMIN:
        students = [s for s in students if _same_institution(s.college, scope)]

    total = len(students)
    if not total:
        return {
            "scope": scope or "All institutions",
            "students_total": 0,
            "message": "No student records for this institution yet.",
        }

    student_ids = {s.id for s in students}
    apps = [a for a in db.query(ApplicationModel).all() if a.student_id in student_ids]
    assessed_ids = {
        a.student_id for a in db.query(AssessmentModel).filter(AssessmentModel.student_id.in_(list(student_ids))).all()
    }

    # Placement readiness bands.
    bands = {"ready": 0, "developing": 0, "at_risk": 0}
    for s in students:
        r = s.placement_readiness or 0
        bands["ready" if r >= 70 else "developing" if r >= 40 else "at_risk"] += 1

    by_status = {}
    for a in apps:
        by_status[a.status] = by_status.get(a.status, 0) + 1

    applied_ids = {a.student_id for a in apps}
    placed_ids = {a.student_id for a in apps if a.status in ("shortlisted", "completed")}

    # Which skills is the cohort short of, weighted by industry demand.
    demand = {}
    for opp in db.query(InternshipModel).all():
        for sk in json.loads(opp.required_skills or "[]"):
            demand[sk] = demand.get(sk, 0) + 1

    curriculum_gaps = []
    for skill, wanted_by in demand.items():
        lacking = sum(
            1 for s in students if skill.lower() not in {x.lower() for x in json.loads(s.skills or "[]")}
        )
        curriculum_gaps.append(
            {
                "skill": skill,
                "students_missing": lacking,
                "pct_missing": round(lacking * 100 / total),
                "openings_requiring": wanted_by,
                # High impact = lots of students short of a skill lots of
                # employers want. That is the one to add to the syllabus.
                "impact": round(lacking * wanted_by / total, 1),
            }
        )
    curriculum_gaps.sort(key=lambda g: g["impact"], reverse=True)

    # Branch is free text, so the same branch arrives as "Computer
    # Engineering" and "Computer engineering". Group case-insensitively and
    # label each group with its most common spelling, so one branch is not
    # split across three rows. Genuinely different text stays separate —
    # guessing that "computer" means "Computer Engineering" is not this
    # function's job.
    by_branch = {}
    for s in students:
        label = (s.branch or "").strip() or "Unspecified"
        key = label.lower()
        entry = by_branch.setdefault(
            key, {"students": 0, "readiness_sum": 0, "applied": 0, "labels": {}}
        )
        entry["students"] += 1
        entry["readiness_sum"] += s.placement_readiness or 0
        entry["labels"][label] = entry["labels"].get(label, 0) + 1
        if s.id in applied_ids:
            entry["applied"] += 1
    branch_rows = [
        {
            "branch": max(e["labels"].items(), key=lambda kv: kv[1])[0],
            "students": e["students"],
            "avg_readiness": round(e["readiness_sum"] / e["students"]),
            "applied": e["applied"],
            "participation_pct": round(e["applied"] * 100 / e["students"]),
        }
        for e in by_branch.values()
    ]
    branch_rows.sort(key=lambda r: r["avg_readiness"], reverse=True)

    return {
        "scope": scope or "All institutions",
        "students_total": total,
        "assessments_completed": len(assessed_ids),
        "assessment_coverage_pct": round(len(assessed_ids) * 100 / total),
        "avg_readiness": round(sum(s.placement_readiness or 0 for s in students) / total),
        "avg_cgpa": round(sum(s.cgpa or 0 for s in students) / total, 2),
        "readiness_bands": bands,
        "applications_total": len(apps),
        "applications_by_status": by_status,
        "students_applied": len(applied_ids),
        "participation_pct": round(len(applied_ids) * 100 / total),
        "students_placed": len(placed_ids),
        "placement_pct": round(len(placed_ids) * 100 / total),
        "curriculum_gaps": curriculum_gaps[:12],
        "by_branch": branch_rows,
    }


# =====================================================================
# SEED DATA FOR THE NEW SURFACES
# ---------------------------------------------------------------------
# A fresh clone should demo the whole platform, not an empty shell. These
# only run when the relevant table is empty, so they never overwrite real
# data or duplicate themselves on restart.
# =====================================================================

# The student account the login page pre-fills. Kept next to the seeding code
# so the two can never drift apart; frontend/js/demo-accounts.js must match.
DEMO_STUDENT_EMAIL = "demo.student@careernexus.example.com"


def seed_platform_v2():
    db = SessionLocal()
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    try:
        # --- One account per stakeholder role, so every portal is reachable.
        demo_accounts = [
            {
                "id": "rec_2001",
                "email": "recruiter@technova.example.com",
                "full_name": "Priya Nair",
                "role": ROLE_RECRUITER,
                "org_name": "CareerNexus Demo Employer",
                "designation": "Campus Hiring Lead",
                "location": "Pune, Maharashtra",
            },
            {
                "id": "fac_3001",
                "email": "faculty@sscoetjalgaon.example.com",
                "full_name": "Dr. Rajesh Deshmukh",
                "role": ROLE_FACULTY,
                "org_name": "Shram Sadhana Bombay Trust's College of Engineering & Technology, Jalgaon",
                "college": "Shram Sadhana Bombay Trust's College of Engineering & Technology, Jalgaon",
                "department": "Computer Engineering",
                "designation": "Associate Professor",
                "location": "Jalgaon, Maharashtra",
            },
            {
                "id": "ins_4001",
                "email": "tpo@sscoetjalgaon.example.com",
                "full_name": "Placement Cell",
                "role": ROLE_INSTITUTION,
                "org_name": "Shram Sadhana Bombay Trust's College of Engineering & Technology, Jalgaon",
                "college": "Shram Sadhana Bombay Trust's College of Engineering & Technology, Jalgaon",
                "designation": "Training & Placement Officer",
                "location": "Jalgaon, Maharashtra",
            },
        ]
        # The login page offers one-click sign-in for each stakeholder, so a
        # student account has to exist wherever the app runs — including a
        # shared Postgres, where the ten-student demo cohort below is
        # deliberately skipped. This is one clearly-labelled demo login, not
        # fabricated cohort data.
        if db.query(StudentModel).filter(StudentModel.email == DEMO_STUDENT_EMAIL).first() is None:
            db.add(
                StudentModel(
                    id="stu_demo",
                    email=DEMO_STUDENT_EMAIL,
                    password_hash=hash_password("demo1234"),
                    full_name="Demo Student",
                    role=ROLE_STUDENT,
                    is_active=1,
                    phone="",
                    location="Jalgaon, Maharashtra",
                    college="Shram Sadhana Bombay Trust's College of Engineering & Technology, Jalgaon",
                    degree="B.Tech",
                    branch="Computer Engineering",
                    current_year="3rd Year",
                    graduation_year=2027,
                    cgpa=8.4,
                    skills=json.dumps(["Python", "JavaScript", "React", "SQL", "Git", "HTML", "CSS"]),
                    soft_skills=json.dumps(["Communication", "Teamwork"]),
                    projects=json.dumps([
                        {
                            "id": 1,
                            "title": "Campus Placement Tracker",
                            "description": "A web app that tracks student applications and placement outcomes for a college placement cell.",
                            "tech": ["React", "Python", "SQL"],
                            "link": "",
                        }
                    ]),
                    certifications=json.dumps([
                        {"id": 1, "title": "Responsive Web Design", "issuer": "freeCodeCamp", "year": 2025}
                    ]),
                    experience=json.dumps([]),
                    preferred_roles=json.dumps(["Frontend Developer", "Full Stack Developer"]),
                    preferred_locations=json.dumps(["Pune", "Bengaluru", "Remote"]),
                    work_mode="Hybrid",
                    duration="3-6 months",
                    profile_completion=78,
                    placement_readiness=72,
                )
            )
            db.commit()

        for acc in demo_accounts:
            if db.query(StudentModel).filter(StudentModel.email == acc["email"]).first():
                continue
            db.add(
                StudentModel(
                    id=acc["id"],
                    email=acc["email"],
                    # Demo password for all three portal accounts: demo1234
                    password_hash=hash_password("demo1234"),
                    full_name=acc["full_name"],
                    role=acc["role"],
                    is_active=1,
                    org_name=acc.get("org_name", ""),
                    department=acc.get("department", ""),
                    designation=acc.get("designation", ""),
                    college=acc.get("college", ""),
                    location=acc.get("location", ""),
                    skills=json.dumps([]),
                    soft_skills=json.dumps([]),
                    projects=json.dumps([]),
                    certifications=json.dumps([]),
                    experience=json.dumps([]),
                    preferred_roles=json.dumps([]),
                    preferred_locations=json.dumps([]),
                    work_mode="Hybrid",
                    duration="",
                    profile_completion=90,
                    placement_readiness=0,
                )
            )
        db.commit()

        # Attribute the original seed internships to the demo recruiter so the
        # recruiter portal has a pipeline to show on first run.
        #
        # Only rows this seeder owns. Catalogue rows are deliberately left
        # unattributed - seed_external_catalogue() sets their posted_by back to
        # None, so claiming them here started a tug of war that rewrote every
        # external row twice on EVERY startup for no net change. It also would
        # have been a false attribution: an AICTE listing was not posted by our
        # demo recruiter.
        OWNED_BY_SEED = ("", "platform")
        for opp in db.query(InternshipModel).filter(
            InternshipModel.posted_by.is_(None),
            sa_or(
                InternshipModel.source_type.is_(None),
                InternshipModel.source_type.in_(OWNED_BY_SEED),
            ),
        ).all():
            opp.posted_by = "rec_2001"
            if not opp.opportunity_type:
                opp.opportunity_type = "internship"
            if not opp.audience:
                opp.audience = "student"
        db.commit()

        # --- Full-time jobs and apprenticeships (the placement half of the PS).
        if db.query(InternshipModel).filter(InternshipModel.id == "opp_job_1").first() is None:
            db.add_all(
                [
                    InternshipModel(
                        id="opp_job_1",
                        title="Graduate Software Engineer",
                        company="CareerNexus Demo Employer",
                        location="Bengaluru",
                        work_mode="Hybrid",
                        stipend="Rs. 8,00,000/year",
                        duration="Full-time",
                        deadline="2026-11-30",
                        description="Entry-level engineering role on the payments platform. Open to 2026 and 2027 graduates.",
                        opportunity_type="job",
                        audience="student",
                        min_cgpa=7.0,
                        openings=12,
                        posted_by="rec_2001",
                        required_skills=json.dumps(["Python", "SQL", "Git", "FastAPI", "Docker"]),
                    ),
                    InternshipModel(
                        id="opp_job_2",
                        title="Associate Data Analyst",
                        company="CareerNexus Demo Employer",
                        location="Remote",
                        work_mode="Remote",
                        stipend="Rs. 6,50,000/year",
                        duration="Full-time",
                        deadline="2026-10-20",
                        description="Own reporting for one business line end to end, from SQL through to the dashboard.",
                        opportunity_type="job",
                        audience="student",
                        min_cgpa=6.5,
                        openings=5,
                        posted_by="rec_2001",
                        required_skills=json.dumps(["SQL", "Excel", "Power BI", "Python"]),
                    ),
                    InternshipModel(
                        id="opp_app_1",
                        title="Cloud Support Apprentice (NAPS)",
                        company="CareerNexus Demo Employer",
                        location="Hyderabad",
                        work_mode="On-site",
                        stipend="Rs. 14,000/month",
                        duration="12 months",
                        deadline="2026-10-05",
                        description="Twelve-month apprenticeship under the National Apprenticeship Promotion Scheme, with a full-time offer on successful completion.",
                        opportunity_type="apprenticeship",
                        audience="student",
                        min_cgpa=6.0,
                        openings=20,
                        posted_by="rec_2001",
                        required_skills=json.dumps(["AWS", "Docker", "Git", "Communication"]),
                    ),
                    # --- The faculty track.
                    InternshipModel(
                        id="opp_fdp_1",
                        title="FDP: Applied Machine Learning for Engineering Faculty",
                        company="CareerNexus Demo Employer",
                        location="Pune",
                        work_mode="Hybrid",
                        stipend="Sponsored",
                        duration="2 weeks",
                        deadline="2026-10-15",
                        description="AICTE-aligned Faculty Development Programme covering applied ML with an industry case study. Certificate on completion.",
                        opportunity_type="fdp",
                        audience="faculty",
                        openings=40,
                        posted_by="rec_2001",
                        required_skills=json.dumps(["Python", "Communication"]),
                    ),
                    InternshipModel(
                        id="opp_fac_1",
                        title="Faculty Summer Internship — Platform Engineering",
                        company="CareerNexus Demo Employer",
                        location="Bengaluru",
                        work_mode="On-site",
                        stipend="Rs. 60,000/month",
                        duration="6 weeks",
                        deadline="2026-11-10",
                        description="Six weeks embedded with a production engineering team, so what you teach next semester matches what the industry actually runs.",
                        opportunity_type="training",
                        audience="faculty",
                        openings=6,
                        posted_by="rec_2001",
                        required_skills=json.dumps(["Python", "SQL", "Docker"]),
                    ),
                    InternshipModel(
                        id="opp_proj_1",
                        title="Live Industry Project — Campus Placement Analytics",
                        company="CareerNexus Demo Employer",
                        location="Remote",
                        work_mode="Remote",
                        stipend="Rs. 1,50,000 consultancy grant",
                        duration="4 months",
                        deadline="2026-10-25",
                        description="Joint consultancy project with a faculty lead and a student team building a placement-prediction model on anonymised data.",
                        opportunity_type="project",
                        audience="faculty",
                        openings=3,
                        posted_by="rec_2001",
                        required_skills=json.dumps(["Python", "SQL", "Power BI"]),
                    ),
                ]
            )
            db.commit()

        # --- A real student cohort.
        # Institution analytics, the curriculum-gap ranking and the
        # verification queue are all cohort-level views: with a single
        # student on the platform they render a page of zeroes. These are
        # spread across branches, CGPA bands and skill levels so the
        # analytics show a realistic distribution.
        #
        # Only ever on a local SQLite file — i.e. a fresh clone someone just
        # ran start_first_time.bat on. A shared Postgres database has real
        # accounts in it, and injecting ten fabricated students into a team's
        # live data would corrupt everyone's analytics. Set
        # SEED_DEMO_COHORT=true to force it on anyway.
        wants_cohort = os.environ.get("SEED_DEMO_COHORT", "").strip().lower() in ("1", "true", "yes")
        local_sqlite = DATABASE_URL.startswith("sqlite")
        if (local_sqlite or wants_cohort) and db.query(StudentModel).filter(
            StudentModel.role == ROLE_STUDENT
        ).count() < 5:
            college = "Shram Sadhana Bombay Trust's College of Engineering & Technology, Jalgaon"
            cohort = [
                ("Sneha Jadhav", "Computer Engineering", 8.9, ["Python", "JavaScript", "React", "SQL", "Git", "HTML", "CSS"], ["Communication", "Teamwork"], 88),
                ("Rohan Patil", "Computer Engineering", 7.8, ["Python", "SQL", "Git", "HTML"], ["Teamwork"], 64),
                ("Aditi Kulkarni", "Information Technology", 9.1, ["Python", "JavaScript", "SQL", "Docker", "AWS", "Git"], ["Leadership", "Communication", "Problem Solving"], 92),
                ("Vikram Shinde", "Information Technology", 6.4, ["HTML", "CSS"], [], 32),
                ("Neha Bhosale", "Electronics & Telecommunication", 8.2, ["Python", "Excel", "SQL"], ["Communication"], 71),
                ("Karan Mehta", "Computer Engineering", 7.1, ["Java", "SQL", "Git"], ["Teamwork", "Adaptability"], 58),
                ("Pooja Sawant", "Information Technology", 8.6, ["Python", "Power BI", "Excel", "SQL"], ["Problem Solving", "Communication"], 79),
                ("Arjun Deshpande", "Mechanical Engineering", 6.9, ["Excel", "Python"], ["Teamwork"], 41),
                ("Ishita Rane", "Computer Engineering", 9.3, ["Python", "React", "JavaScript", "TypeScript", "Node.js", "SQL", "Git", "Docker"], ["Leadership", "Communication", "Creativity"], 95),
                ("Sahil Wagh", "Electronics & Telecommunication", 5.8, ["C++"], [], 24),
            ]
            for idx, (name, branch, cgpa, skills, soft, readiness) in enumerate(cohort, start=1):
                handle = name.split()[0].lower() + "." + name.split()[-1].lower()
                email = f"{handle}@sscoetjalgaon.example.com"
                if db.query(StudentModel).filter(StudentModel.email == email).first():
                    continue
                db.add(
                    StudentModel(
                        id=f"stu_20{idx:03d}",
                        email=email,
                        # Demo cohort password: demo1234
                        password_hash=hash_password("demo1234"),
                        full_name=name,
                        role=ROLE_STUDENT,
                        is_active=1,
                        college=college,
                        degree="B.Tech",
                        branch=branch,
                        current_year="3rd Year" if idx % 2 else "Final Year",
                        graduation_year=2027 if idx % 2 else 2026,
                        cgpa=cgpa,
                        location="Jalgaon, Maharashtra",
                        skills=json.dumps(skills),
                        soft_skills=json.dumps(soft),
                        projects=json.dumps([]),
                        certifications=json.dumps([]),
                        experience=json.dumps([]),
                        preferred_roles=json.dumps(["Software Developer"]),
                        preferred_locations=json.dumps(["Pune", "Bengaluru", "Remote"]),
                        work_mode="Hybrid",
                        duration="3-6 months",
                        profile_completion=min(100, 40 + len(skills) * 6),
                        placement_readiness=readiness,
                    )
                )
            db.commit()

            # Give the cohort an application history, so participation and
            # placement percentages are real numbers rather than zeroes.
            seeded_apps = [
                ("stu_20001", "int_1", "shortlisted"),
                ("stu_20001", "opp_job_1", "under_review"),
                ("stu_20003", "opp_job_1", "shortlisted"),
                ("stu_20003", "int_2", "completed"),
                ("stu_20005", "int_3", "applied"),
                ("stu_20007", "opp_job_2", "shortlisted"),
                ("stu_20007", "int_3", "under_review"),
                ("stu_20009", "int_1", "completed"),
                ("stu_20009", "opp_job_1", "shortlisted"),
                ("stu_20002", "int_4", "rejected"),
                ("stu_20006", "opp_app_1", "applied"),
            ]
            for n, (sid, oid, st) in enumerate(seeded_apps, start=100):
                if db.query(ApplicationModel).filter(
                    ApplicationModel.student_id == sid, ApplicationModel.internship_id == oid
                ).first():
                    continue
                learner = db.query(StudentModel).filter(StudentModel.id == sid).first()
                opp = db.query(InternshipModel).filter(InternshipModel.id == oid).first()
                if not learner or not opp:
                    continue
                db.add(
                    ApplicationModel(
                        id=f"app_{n}",
                        student_id=sid,
                        internship_id=oid,
                        applied_on="2026-08-%02d" % (10 + (n % 18)),
                        status=st,
                        match_score=calculate_match_score_breakdown(learner, opp)["match_score"],
                    )
                )
            db.commit()

        # --- Industry learning programs.
        if db.query(LearningProgramModel).filter(LearningProgramModel.id == "lp_seed_1").first() is None:
            db.add_all(
                [
                    LearningProgramModel(
                        id="lp_seed_1",
                        title="Sample Frontend Bootcamp",
                        provider="CareerNexus Demo Employer",
                        program_type="workshop",
                        description="Four weekends of React and TypeScript taught by the engineers who run our web platform. Top performers are fast-tracked to interview.",
                        skills_covered=json.dumps(["React", "TypeScript", "JavaScript", "CSS"]),
                        url="",
                        duration="4 weekends",
                        cost="Free",
                        audience="student",
                        posted_by="rec_2001",
                        created_at=now,
                    ),
                    LearningProgramModel(
                        id="lp_seed_2",
                        title="Sample Cloud Foundations Certification",
                        provider="CareerNexus Demo Employer",
                        program_type="certification",
                        description="Prepares you for the AWS Cloud Practitioner exam. Exam voucher sponsored for students who complete every module.",
                        skills_covered=json.dumps(["AWS", "Docker"]),
                        url="",
                        duration="6 weeks",
                        cost="Free (sponsored voucher)",
                        audience="student",
                        posted_by="rec_2001",
                        created_at=now,
                    ),
                    LearningProgramModel(
                        id="lp_seed_3",
                        title="Sample Data Mentorship",
                        provider="CareerNexus Demo Employer",
                        program_type="mentorship",
                        description="Eight weeks paired one-to-one with a senior data analyst. Fortnightly calls and one portfolio project reviewed in detail.",
                        skills_covered=json.dumps(["SQL", "Python", "Power BI", "Communication"]),
                        url="",
                        duration="8 weeks",
                        cost="Free",
                        audience="student",
                        posted_by="rec_2001",
                        created_at=now,
                    ),
                    LearningProgramModel(
                        id="lp_seed_4",
                        title="Teaching Modern Backend Engineering",
                        provider="CareerNexus Demo Employer",
                        program_type="workshop",
                        description="A faculty-facing workshop on bringing containers, CI and API design into an undergraduate syllabus.",
                        skills_covered=json.dumps(["Docker", "FastAPI", "Git"]),
                        url="",
                        duration="3 days",
                        cost="Free",
                        audience="faculty",
                        posted_by="rec_2001",
                        created_at=now,
                    ),
                ]
            )
            db.commit()

        # --- Collaboration calls.
        if db.query(CollaborationModel).filter(CollaborationModel.id == "col_seed_1").first() is None:
            db.add_all(
                [
                    CollaborationModel(
                        id="col_seed_1",
                        title="Guest Lecture: What a Production Codebase Actually Looks Like",
                        organisation="CareerNexus Demo Employer",
                        collab_type="guest_lecture",
                        description="A working engineer walks through a real repository — reviews, tests, deploys and all — for final-year students.",
                        skills_involved=json.dumps(["Git", "Python", "Communication"]),
                        mode="On-site",
                        location="Jalgaon",
                        starts_on="2026-10-12",
                        seats=120,
                        audience="both",
                        posted_by="rec_2001",
                        created_at=now,
                    ),
                    CollaborationModel(
                        id="col_seed_2",
                        title="Innovation Challenge: Rural Healthcare Access",
                        organisation="CareerNexus Demo Employer",
                        collab_type="innovation_challenge",
                        description="Six-week challenge open to student teams of three to five. Winning team gets a paid pilot and internship offers.",
                        skills_involved=json.dumps(["Python", "SQL", "Problem Solving"]),
                        mode="Remote",
                        location="Remote",
                        starts_on="2026-10-20",
                        seats=0,
                        audience="student",
                        posted_by="rec_2001",
                        created_at=now,
                    ),
                    CollaborationModel(
                        id="col_seed_3",
                        title="Joint Research: Skill-Demand Forecasting for Tier-2 Campuses",
                        organisation="CareerNexus Demo Employer",
                        collab_type="research",
                        description="Co-authored research with a faculty lead on predicting regional skill demand. Data and compute provided.",
                        skills_involved=json.dumps(["Python", "SQL"]),
                        mode="Hybrid",
                        location="Bengaluru",
                        starts_on="2026-11-01",
                        seats=4,
                        audience="faculty",
                        posted_by="rec_2001",
                        created_at=now,
                    ),
                    CollaborationModel(
                        id="col_seed_4",
                        title="Live Project: Campus Energy Dashboard",
                        organisation="CareerNexus Demo Employer",
                        collab_type="live_project",
                        description="Build and ship a real dashboard for campus energy use, mentored by an industry engineer. Counts as a verified portfolio project.",
                        skills_involved=json.dumps(["React", "Power BI", "SQL"]),
                        mode="Hybrid",
                        location="Jalgaon",
                        starts_on="2026-10-08",
                        seats=15,
                        audience="student",
                        posted_by="rec_2001",
                        created_at=now,
                    ),
                ]
            )
            db.commit()

        # Give the demo student a small application history and one verified
        # skill, so the account the login page pre-fills opens onto a populated
        # dashboard rather than a set of empty states.
        demo_student = db.query(StudentModel).filter(StudentModel.email == DEMO_STUDENT_EMAIL).first()
        if demo_student:
            for n, (oid, st) in enumerate([("int_1", "shortlisted"), ("int_3", "applied")], start=1):
                if db.query(ApplicationModel).filter(
                    ApplicationModel.student_id == demo_student.id,
                    ApplicationModel.internship_id == oid,
                ).first():
                    continue
                opp = db.query(InternshipModel).filter(InternshipModel.id == oid).first()
                if not opp:
                    continue
                db.add(
                    ApplicationModel(
                        id=f"app_demo_{n}",
                        student_id=demo_student.id,
                        internship_id=oid,
                        applied_on="2026-08-2%d" % n,
                        status=st,
                        match_score=calculate_match_score_breakdown(demo_student, opp)["match_score"],
                    )
                )
            if not db.query(VerificationModel).filter(
                VerificationModel.student_id == demo_student.id
            ).first():
                db.add(
                    VerificationModel(
                        id="ver_demo_1",
                        student_id=demo_student.id,
                        item_type="skill",
                        item_key="Python",
                        verified_by="fac_3001",
                        verifier_name="Dr. Rajesh Deshmukh",
                        verifier_role=ROLE_FACULTY,
                        verified_at="2026-08-24",
                        note="Demonstrated in the Data Structures lab.",
                    )
                )
            db.commit()

        # --- A worked example of the progress + verification chain, so the
        # portfolio has something verified on it the first time it opens.
        demo = db.query(StudentModel).filter(StudentModel.id == "stu_1001").first()
        first_app = db.query(ApplicationModel).filter(ApplicationModel.id == "app_1").first()
        # Guard on this block's own rows, not a global count: another seed
        # step may already have inserted a row of the same type, and a global
        # count would then silently skip everything here.
        if demo and first_app and db.query(ProgressLogModel).filter(
            ProgressLogModel.id == "plog_seed_1"
        ).first() is None:
            db.add_all(
                [
                    ProgressLogModel(
                        id="plog_seed_1",
                        application_id="app_1",
                        week=1,
                        summary="Set up the development environment and shipped my first component — a filterable table for the internal dashboard.",
                        hours=38,
                        created_at="2026-08-25 18:00",
                        mentor_feedback="Strong start. Picked up the codebase conventions quickly and asked good questions in review.",
                        mentor_rating=4,
                        reviewed_at="2026-08-26 10:00",
                    ),
                    ProgressLogModel(
                        id="plog_seed_2",
                        application_id="app_1",
                        week=2,
                        summary="Added keyboard navigation and screen-reader labels to the table, and wrote the first tests for it.",
                        hours=40,
                        created_at="2026-09-01 18:00",
                        mentor_feedback="Accessibility work was thorough and unprompted. Next: focus on writing tests before the implementation.",
                        mentor_rating=5,
                        reviewed_at="2026-09-02 09:30",
                    ),
                ]
            )
            db.commit()

        if db.query(VerificationModel).filter(VerificationModel.id == "ver_seed_1").first() is None:
            db.add_all(
                [
                    VerificationModel(
                        id="ver_seed_1",
                        student_id="stu_1001",
                        item_type="skill",
                        item_key="Python",
                        verified_by="fac_3001",
                        verifier_name="Dr. Rajesh Deshmukh",
                        verifier_role=ROLE_FACULTY,
                        verified_at="2026-08-20",
                        note="Demonstrated in the Data Structures lab and the semester project.",
                    ),
                    VerificationModel(
                        id="ver_seed_2",
                        student_id="stu_1001",
                        item_type="skill",
                        item_key="React",
                        verified_by="rec_2001",
                        verifier_name="Priya Nair",
                        verifier_role=ROLE_RECRUITER,
                        verified_at="2026-09-02",
                        note="Shipped production React components during the internship.",
                    ),
                    VerificationModel(
                        id="ver_seed_3",
                        student_id="stu_1001",
                        item_type="project",
                        item_key="Campus Skill Tracker",
                        verified_by="fac_3001",
                        verifier_name="Dr. Rajesh Deshmukh",
                        verifier_role=ROLE_FACULTY,
                        verified_at="2026-08-20",
                        note="Reviewed the repository and the live deployment. The work is the student's own.",
                    ),
                    VerificationModel(
                        id="ver_seed_4",
                        student_id="stu_1001",
                        item_type="certification",
                        item_key="Google Data Analytics Certificate",
                        verified_by="ins_4001",
                        verifier_name="Placement Cell",
                        verifier_role=ROLE_INSTITUTION,
                        verified_at="2026-08-22",
                        note="Certificate ID checked against the issuer's register.",
                    ),
                ]
            )
            db.commit()
    finally:
        db.close()


if not SEEDS_CURRENT:
    seed_platform_v2()

# =====================================================================
# VERIFIED EXTERNAL OPPORTUNITY CATALOGUE
# ---------------------------------------------------------------------
# Real programmes run by governments, companies and official learning
# platforms. Nothing here is invented: every `official_url` was fetched
# and confirmed to resolve before it was added, and each points at the
# organisation's own site rather than an aggregator.
#
# These carry source_type="external", which means the platform surfaces
# them and then gets out of the way — the student applies on the official
# site. The in-app apply endpoint refuses them for exactly that reason.
#
# When a link rots, fix the URL here. Never substitute an unofficial
# mirror to make a card work.
# =====================================================================

EXTERNAL_OPPORTUNITIES = [
    # ---------- Government of India ----------
    {
        "id": "ext_gov_pm_internship",
        "title": "PM Internship Scheme",
        "company": "Ministry of Corporate Affairs",
        "source_name": "Government of India",
        "official_url": "https://pminternship.mca.gov.in",
        "opportunity_type": "internship",
        "location": "Across India",
        "work_mode": "On-site",
        "stipend": "Rs. 5,000/month + one-time grant",
        "duration": "12 months",
        "eligibility": "Age 21-24, not in full-time employment or education",
        "description": "Twelve-month internships with India's top companies under the Government of India's flagship scheme. Applications are made on the official MCA portal.",
        "required_skills": ["Communication", "Problem Solving"],
    },
    {
        "id": "ext_gov_aicte",
        "title": "AICTE Internship Portal",
        "company": "All India Council for Technical Education",
        "source_name": "Government of India",
        "official_url": "https://internship.aicte-india.org",
        "opportunity_type": "internship",
        "location": "Across India",
        "work_mode": "Hybrid",
        "stipend": "Varies by employer",
        "duration": "Varies",
        "eligibility": "Students of AICTE-approved institutions",
        "description": "The national internship portal for technical students, listing openings from industry, government and research organisations.",
        "required_skills": ["Communication"],
    },
    {
        "id": "ext_gov_naps",
        "title": "National Apprenticeship Promotion Scheme (NAPS)",
        "company": "Ministry of Skill Development & Entrepreneurship",
        "source_name": "Government of India",
        "official_url": "https://www.apprenticeshipindia.gov.in",
        "opportunity_type": "apprenticeship",
        "location": "Across India",
        "work_mode": "On-site",
        "stipend": "Government-supported stipend",
        "duration": "6-36 months",
        "eligibility": "Students and graduates; criteria vary by trade",
        "description": "Register as an apprentice and be matched with establishments across India. Stipend is partly funded by the Government of India.",
        "required_skills": ["Communication", "Teamwork"],
    },
    {
        "id": "ext_gov_ncs",
        "title": "National Career Service",
        "company": "Ministry of Labour & Employment",
        "source_name": "Government of India",
        "official_url": "https://www.ncs.gov.in",
        "opportunity_type": "job",
        "location": "Across India",
        "work_mode": "Hybrid",
        "stipend": "Varies by employer",
        "duration": "Full-time",
        "eligibility": "Open to all jobseekers",
        "description": "The Government of India's official employment portal: job listings, career counselling and free skill training.",
        "required_skills": ["Communication"],
    },
    {
        "id": "ext_gov_sih",
        "title": "Smart India Hackathon",
        "company": "Ministry of Education Innovation Cell",
        "source_name": "Government of India",
        "official_url": "https://sih.gov.in",
        "opportunity_type": "project",
        "location": "Across India",
        "work_mode": "Hybrid",
        "stipend": "Prize money for winning teams",
        "duration": "Annual, 36-hour grand finale",
        "eligibility": "Student teams from recognised institutions",
        "description": "India's national innovation contest, where student teams solve problem statements posted by ministries and industry.",
        "required_skills": ["Python", "Problem Solving", "Teamwork"],
    },
    {
        "id": "ext_gov_isro",
        "title": "ISRO Careers & Student Programmes",
        "company": "Indian Space Research Organisation",
        "source_name": "Government of India",
        "official_url": "https://www.isro.gov.in",
        "opportunity_type": "internship",
        "location": "Bengaluru, Thiruvananthapuram & other centres",
        "work_mode": "On-site",
        "stipend": "As per ISRO norms",
        "duration": "4-24 weeks",
        "eligibility": "Engineering and science students; criteria vary by centre",
        "description": "Internships, project work and recruitment at India's national space agency, announced on the official ISRO website.",
        "required_skills": ["Python", "C++", "Problem Solving"],
    },
    {
        "id": "ext_gov_startupindia",
        "title": "Startup India",
        "company": "Department for Promotion of Industry and Internal Trade",
        "source_name": "Government of India",
        "official_url": "https://www.startupindia.gov.in",
        "opportunity_type": "project",
        "location": "Online",
        "work_mode": "Remote",
        "stipend": "Grants and incubation support",
        "duration": "Varies",
        "eligibility": "Student founders and early-stage startups",
        "description": "Recognition, funding schemes, free learning programmes and mentorship for student entrepreneurs.",
        "required_skills": ["Communication", "Leadership"],
    },
    {
        "id": "ext_gov_digitalindia",
        "title": "Digital India Programme",
        "company": "Ministry of Electronics & IT",
        "source_name": "Government of India",
        "official_url": "https://www.digitalindia.gov.in",
        "opportunity_type": "internship",
        "location": "New Delhi & across India",
        "work_mode": "On-site",
        "stipend": "As per programme norms",
        "duration": "Varies",
        "eligibility": "Students in IT and allied disciplines",
        "description": "Internships and project opportunities across the Digital India initiative, announced on the official MeitY portal.",
        "required_skills": ["Python", "SQL"],
    },

    # ---------- AIIA (the institute behind SIH26044) ----------
    # These live in the shared opportunity table on purpose: a student
    # searching "internship" in Jobs & Opportunities should find AIIA's
    # alongside everything else, tagged so its source stays obvious. The
    # AIIA Hub is a focused view of the same records, not a separate silo.
    {
        "id": "ext_aiia_bams_internship",
        "title": "Internship for BAMS Students",
        "company": "All India Institute of Ayurveda",
        "source_name": "AIIA Delhi — Official",
        "official_url": "https://aiia.gov.in/pdf/Notice_235.pdf",
        "opportunity_type": "internship",
        "location": "AIIA, New Delhi",
        "work_mode": "On-site",
        "stipend": "As per institute norms",
        "duration": "See the official notice",
        "eligibility": "BAMS students — see the official notice for exact criteria",
        "description": "AIIA publishes a notice governing internship for BAMS students, together with the prescribed internship letter format.",
        "required_skills": ["Communication", "Teamwork"],
    },
    {
        "id": "ext_aiia_vacancies",
        "title": "AIIA Recruitment & Vacancies",
        "company": "All India Institute of Ayurveda",
        "source_name": "AIIA Delhi — Official",
        "official_url": "https://aiia.gov.in/#/archivesVacancies",
        "opportunity_type": "job",
        "location": "AIIA, New Delhi",
        "work_mode": "On-site",
        "stipend": "As per Government of India norms",
        "duration": "Full-time & contractual",
        "eligibility": "Varies by post — see each advertisement",
        "description": "Teaching, non-teaching and project posts at AIIA, published continuously on the institute vacancy board.",
        "required_skills": ["Communication"],
    },
    {
        "id": "ext_aiia_goa_faculty",
        "title": "Recruitment at AIIA Goa (Faculty, Research & Contractual)",
        "company": "All India Institute of Ayurveda, Goa",
        "source_name": "AIIA — Official Vacancy Board",
        "official_url": "https://aiia.gov.in/#/archivesVacancies",
        "opportunity_type": "job",
        "location": "AIIA Goa",
        "work_mode": "On-site",
        "stipend": "As per Government of India / institute norms",
        "duration": "Direct, deputation & contractual",
        "eligibility": "Varies by post — see the current advertisement on the vacancy board",
        "description": "Faculty, non-teaching, research-fellow and contractual posts at the AIIA Goa satellite campus. AIIA publishes and updates these on its live vacancy board — check there for the advertisement that is currently open, as individual advertisements open and close through the year.",
        "required_skills": ["Communication"],
    },

    # ---------- Company student programmes ----------
    {
        "id": "ext_co_google_students",
        "title": "Google Student Programmes & Internships",
        "company": "Google",
        "source_name": "Google Careers",
        "official_url": "https://www.google.com/about/careers/applications/students/",
        "opportunity_type": "internship",
        "location": "Bengaluru, Hyderabad & global",
        "work_mode": "Hybrid",
        "stipend": "As per Google's offer",
        "duration": "10-14 weeks",
        "eligibility": "Students currently enrolled in a degree programme",
        "description": "Software engineering internships, STEP and other early-career programmes, applied for on Google's own careers site.",
        "required_skills": ["Python", "C++", "Problem Solving"],
    },
    {
        "id": "ext_co_gsoc",
        "title": "Google Summer of Code",
        "company": "Google Open Source",
        "source_name": "Google",
        "official_url": "https://summerofcode.withgoogle.com",
        "opportunity_type": "project",
        "location": "Online",
        "work_mode": "Remote",
        "stipend": "Stipend paid by Google",
        "duration": "12+ weeks",
        "eligibility": "Open to adult newcomers to open source",
        "description": "Paid, mentored open-source contribution with a real project. Applications open annually on the official GSoC site.",
        "required_skills": ["Git", "Python", "Communication"],
    },
    {
        "id": "ext_co_microsoft",
        "title": "Microsoft Students & Graduates",
        "company": "Microsoft",
        "source_name": "Microsoft Careers",
        "official_url": "https://careers.microsoft.com/v2/global/en/students.html",
        "opportunity_type": "internship",
        "location": "Bengaluru, Hyderabad, Noida & global",
        "work_mode": "Hybrid",
        "stipend": "As per Microsoft's offer",
        "duration": "8-12 weeks",
        "eligibility": "Students in an undergraduate or postgraduate programme",
        "description": "Internships and graduate roles across engineering, data and product, applied for on Microsoft's own careers portal.",
        "required_skills": ["C#", "Python", "SQL"],
    },
    {
        "id": "ext_co_amazon",
        "title": "Amazon University Programmes",
        "company": "Amazon",
        "source_name": "Amazon Jobs",
        "official_url": "https://www.amazon.jobs/content/en/career-programs/university",
        "opportunity_type": "internship",
        "location": "Bengaluru, Hyderabad, Chennai & global",
        "work_mode": "Hybrid",
        "stipend": "As per Amazon's offer",
        "duration": "10-24 weeks",
        "eligibility": "Students graduating within the programme window",
        "description": "SDE internships and new-graduate roles listed on Amazon's official jobs site.",
        "required_skills": ["Java", "Python", "SQL", "Problem Solving"],
    },
    {
        "id": "ext_co_apple",
        "title": "Apple Students",
        "company": "Apple",
        "source_name": "Apple Careers",
        "official_url": "https://www.apple.com/careers/us/students.html",
        "opportunity_type": "internship",
        "location": "Global",
        "work_mode": "On-site",
        "stipend": "As per Apple's offer",
        "duration": "12-24 weeks",
        "eligibility": "Currently enrolled students",
        "description": "Internships and student programmes across engineering, design and operations, on Apple's own careers site.",
        "required_skills": ["Problem Solving", "Communication"],
    },
    {
        "id": "ext_co_ibm",
        "title": "IBM Internships",
        "company": "IBM",
        "source_name": "IBM Careers",
        "official_url": "https://www.ibm.com/careers/internships",
        "opportunity_type": "internship",
        "location": "Bengaluru, Pune & global",
        "work_mode": "Hybrid",
        "stipend": "As per IBM's offer",
        "duration": "8-24 weeks",
        "eligibility": "Students in a relevant degree programme",
        "description": "Internships across software, cloud, data and consulting, applied for on IBM's official careers site.",
        "required_skills": ["Python", "SQL", "Communication"],
    },
    {
        "id": "ext_co_nvidia",
        "title": "NVIDIA University Recruiting",
        "company": "NVIDIA",
        "source_name": "NVIDIA Careers",
        "official_url": "https://www.nvidia.com/en-us/about-nvidia/careers/university-recruiting/",
        "opportunity_type": "internship",
        "location": "Pune, Bengaluru & global",
        "work_mode": "Hybrid",
        "stipend": "As per NVIDIA's offer",
        "duration": "12-24 weeks",
        "eligibility": "Students in engineering, CS or related fields",
        "description": "Internships and new-graduate roles in GPU computing, AI and graphics, on NVIDIA's official site.",
        "required_skills": ["C++", "Python"],
    },
    {
        "id": "ext_co_adobe",
        "title": "Adobe Careers & Student Roles",
        "company": "Adobe",
        "source_name": "Adobe Careers",
        "official_url": "https://careers.adobe.com",
        "opportunity_type": "internship",
        "location": "Noida, Bengaluru & global",
        "work_mode": "Hybrid",
        "stipend": "As per Adobe's offer",
        "duration": "8-24 weeks",
        "eligibility": "Students and recent graduates",
        "description": "Internships and early-career roles across product, engineering and design on Adobe's official careers site.",
        "required_skills": ["JavaScript", "Figma", "Problem Solving"],
    },
    {
        "id": "ext_co_wipro",
        "title": "Wipro Careers",
        "company": "Wipro",
        "source_name": "Wipro Careers",
        "official_url": "https://careers.wipro.com",
        "opportunity_type": "job",
        "location": "Across India",
        "work_mode": "Hybrid",
        "stipend": "As per Wipro's offer",
        "duration": "Full-time",
        "eligibility": "Graduates and experienced professionals",
        "description": "Graduate hiring including Elite and WILP programmes, listed on Wipro's own careers portal.",
        "required_skills": ["Java", "SQL", "Communication"],
    },
]

# ---------------------------------------------------------------------
# Official learning platforms. Same rule: first-party URLs only.
# ---------------------------------------------------------------------

EXTERNAL_LEARNING = [
    {
        "id": "ext_lp_nptel",
        "title": "NPTEL Online Certification Courses",
        "provider": "NPTEL (IIT / IISc)",
        "program_type": "certification",
        "url": "https://nptel.ac.in/courses",
        "description": "Free engineering and science courses taught by IIT and IISc faculty, with an optional proctored certification exam.",
        "skills_covered": ["Python", "SQL", "C++", "Communication"],
        "duration": "4-12 weeks",
        "cost": "Free (exam fee optional)",
        "eligibility": "Open to all students",
        "certificate": 1,
    },
    {
        "id": "ext_lp_google_ml_crash",
        "title": "Machine Learning Crash Course",
        "provider": "Google for Developers",
        "program_type": "course",
        "url": "https://developers.google.com/machine-learning/crash-course",
        "description": "Google's own introduction to machine learning: supervised learning, model fitting, generalisation and neural networks, with interactive exercises in Python.",
        "skills_covered": ["Python", "Problem Solving"],
        "duration": "Self-paced",
        "cost": "Free",
        "eligibility": "Basic Python and algebra",
        "certificate": 0,
        "source_type": "official",
        "audience": "both",
    },
    {
        "id": "ext_lp_elements_of_ai",
        "title": "Elements of AI",
        "provider": "University of Helsinki & MinnaLearn",
        "program_type": "course",
        "url": "https://www.elementsofai.com",
        "description": "A university-built introduction to artificial intelligence for non-specialists: what AI can and cannot do, machine learning basics, neural networks and the societal implications.",
        "skills_covered": ["Problem Solving", "Communication"],
        "duration": "Self-paced, about 30 hours",
        "cost": "Free",
        "eligibility": "Open to all, no programming required",
        "certificate": 1,
        "source_type": "official",
        "audience": "both",
    },
    {
        "id": "ext_lp_aws_mlu",
        "title": "AWS Machine Learning University",
        "provider": "Amazon Web Services",
        "program_type": "course",
        "url": "https://aws.amazon.com/machine-learning/mlu/",
        "description": "The machine learning curriculum Amazon uses to train its own scientists and engineers, released publicly: tabular data, computer vision, natural language processing and decision trees.",
        "skills_covered": ["Python", "AWS", "SQL"],
        "duration": "Self-paced",
        "cost": "Free",
        "eligibility": "Python fundamentals recommended",
        "certificate": 0,
        "source_type": "official",
        "audience": "both",
    },
    {
        "id": "ext_lp_ibm_ai",
        "title": "IBM Artificial Intelligence Training",
        "provider": "IBM Training",
        "program_type": "certification",
        "url": "https://www.ibm.com/training/artificial-intelligence",
        "description": "IBM's own AI and data science learning tracks, including generative AI and watsonx, with paid certification paths alongside free introductory content.",
        "skills_covered": ["Python", "SQL", "Problem Solving"],
        "duration": "Varies by track",
        "cost": "Free and paid tracks",
        "eligibility": "Open to all",
        "certificate": 1,
        "source_type": "official",
        "audience": "both",
    },
    {
        "id": "ext_lp_mdn_learn",
        "title": "MDN Web Docs — Learn Web Development",
        "provider": "Mozilla",
        "program_type": "course",
        "url": "https://developer.mozilla.org/en-US/docs/Learn",
        "description": "Mozilla's structured curriculum for web development, from HTML and CSS through JavaScript, accessibility and tooling. The reference the web platform is documented against.",
        "skills_covered": ["HTML", "CSS", "JavaScript", "Git"],
        "duration": "Self-paced",
        "cost": "Free",
        "eligibility": "Open to all",
        "certificate": 0,
        "source_type": "official",
        "audience": "both",
    },
    {
        "id": "ext_lp_webdev_learn",
        "title": "web.dev Learn",
        "provider": "Google Chrome Developers",
        "program_type": "course",
        "url": "https://web.dev/learn",
        "description": "Google's courses on modern web development: CSS, HTML, responsive design, performance, accessibility and privacy, written by the Chrome team.",
        "skills_covered": ["HTML", "CSS", "JavaScript"],
        "duration": "Self-paced",
        "cost": "Free",
        "eligibility": "Open to all",
        "certificate": 0,
        "source_type": "official",
        "audience": "both",
    },
    {
        "id": "ext_lp_swayam",
        "title": "SWAYAM",
        "provider": "Ministry of Education, Government of India",
        "program_type": "course",
        "url": "https://swayam.gov.in",
        "description": "India's national online education platform, hosting credit-eligible courses from school to postgraduate level.",
        "skills_covered": ["Python", "Communication", "Leadership"],
        "duration": "4-16 weeks",
        "cost": "Free",
        "eligibility": "Open to all",
        "certificate": 1,
    },
    {
        "id": "ext_lp_skillindia",
        "title": "Skill India Digital Hub",
        "provider": "Ministry of Skill Development & Entrepreneurship",
        "program_type": "course",
        "url": "https://www.skillindiadigital.gov.in/courses",
        "description": "Government of India's skilling platform: free vocational and digital-skills courses with recognised certification.",
        "skills_covered": ["Communication", "Excel", "Problem Solving"],
        "duration": "Self-paced",
        "cost": "Free",
        "eligibility": "Open to all Indian citizens",
        "certificate": 1,
    },
    {
        "id": "ext_lp_aiia_panchakarma",
        "title": "Panchakarma Technician Course (AIIA)",
        "provider": "All India Institute of Ayurveda",
        "program_type": "certification",
        "url": "https://aiia.gov.in/#/coursesAvailable",
        "description": "One-year technician training in Panchakarma therapy, accredited by HSSC and the Ayurveda Training Accreditation Board. Applications for the 2026 batch have closed (provisional selection list published 21 August 2026). Check the courses page for the next intake.",
        "skills_covered": ["Communication", "Teamwork"],
        "duration": "One year",
        "cost": "See the official brochure",
        "eligibility": "10+2 passed; age 16-35",
        "certificate": 1,
    },
    {
        "id": "ext_lp_aiia_yoga",
        "title": "Yoga Wellness Trainer Course (AIIA)",
        "provider": "All India Institute of Ayurveda",
        "program_type": "certification",
        "url": "https://aiia.gov.in/#/coursesAvailable",
        "description": "Six-month Yoga Wellness Trainer course affiliated with HSSC and NSDC, 3 hours per day, run as an AYUSH Skill Development course under COEDAKSHYA. Applications for the 2026-27 intake closed on 5 July 2026. Check the courses page for the next intake.",
        "skills_covered": ["Communication", "Leadership"],
        "duration": "Six months",
        "cost": "See the official brochure",
        "eligibility": "12th pass",
        "certificate": 1,
    },
    {
        "id": "ext_lp_aiia_molbio",
        "title": "Molecular Biology Techniques Training (AIIA)",
        "provider": "All India Institute of Ayurveda",
        "program_type": "workshop",
        "url": "https://aiia.gov.in/#/trainingWorkshop",
        "description": "Thirty-day hands-on training integrating Ayurveda classics with molecular biology techniques at ITMBU, AIIA New Delhi. The most recent intake ran 25 June to 24 July 2026 and applications for it have closed. New intakes are announced on the training and workshops page.",
        "skills_covered": ["Python", "Problem Solving"],
        "duration": "30 days",
        "cost": "See the official notice",
        "eligibility": "MD Ayurveda or M.Sc Life Sciences",
        "certificate": 1,
    },
    {
        "id": "ext_lp_google_cloud",
        "title": "Google Cloud Skills Boost",
        "provider": "Google Cloud",
        "program_type": "certification",
        "url": "https://www.cloudskillsboost.google",
        "description": "Hands-on labs and learning paths for Google Cloud, leading to official Google Cloud certifications.",
        "skills_covered": ["Docker", "SQL", "Python"],
        "duration": "Self-paced",
        "cost": "Free tier available",
        "eligibility": "Open to all",
        "certificate": 1,
    },
    {
        "id": "ext_lp_google_certs",
        "title": "Google Career Certificates",
        "provider": "Google (on Coursera)",
        "program_type": "certification",
        "url": "https://www.coursera.org/google-career-certificates",
        "description": "Professional certificates in data analytics, IT support, UX design, cybersecurity and project management.",
        "skills_covered": ["Excel", "SQL", "Power BI", "Figma"],
        "duration": "3-6 months",
        "cost": "Paid (financial aid available)",
        "eligibility": "No prior experience required",
        "certificate": 1,
    },
    {
        "id": "ext_lp_ms_learn",
        "title": "Microsoft Learn Training",
        "provider": "Microsoft",
        "program_type": "certification",
        "url": "https://learn.microsoft.com/en-us/training/",
        "description": "Free learning paths for Azure, Power BI, .NET and GitHub, mapped to official Microsoft certifications.",
        "skills_covered": ["Power BI", "SQL", "Excel", "Git", "TypeScript"],
        "duration": "Self-paced",
        "cost": "Free",
        "eligibility": "Open to all",
        "certificate": 1,
    },
    {
        "id": "ext_lp_aws",
        "title": "AWS Skill Builder",
        "provider": "Amazon Web Services",
        "program_type": "certification",
        "url": "https://skillbuilder.aws",
        "description": "AWS's official training library, including free digital courses that prepare you for AWS certification exams.",
        "skills_covered": ["AWS", "Docker"],
        "duration": "Self-paced",
        "cost": "Free tier available",
        "eligibility": "Open to all",
        "certificate": 1,
    },
    {
        "id": "ext_lp_ibm_skillsbuild",
        "title": "IBM SkillsBuild",
        "provider": "IBM",
        "program_type": "certification",
        "url": "https://skillsbuild.org",
        "description": "Free courses and digital credentials for students in AI, cybersecurity, data analysis and cloud.",
        "skills_covered": ["Python", "SQL", "Communication"],
        "duration": "Self-paced",
        "cost": "Free",
        "eligibility": "Students and educators",
        "certificate": 1,
    },
    {
        "id": "ext_lp_cisco",
        "title": "Cisco Networking Academy",
        "provider": "Cisco",
        "program_type": "certification",
        "url": "https://www.netacad.com",
        "description": "Courses in networking, cybersecurity and Python, with pathways to official Cisco certifications.",
        "skills_covered": ["Python", "Problem Solving"],
        "duration": "Self-paced",
        "cost": "Many courses free",
        "eligibility": "Open to all",
        "certificate": 1,
    },
    {
        "id": "ext_lp_fcc",
        "title": "freeCodeCamp Certifications",
        "provider": "freeCodeCamp",
        "program_type": "certification",
        "url": "https://www.freecodecamp.org/learn/",
        "description": "Project-based certifications in responsive web design, JavaScript, front-end libraries and back-end APIs.",
        "skills_covered": ["JavaScript", "HTML", "CSS", "React", "Node.js"],
        "duration": "Self-paced",
        "cost": "Free",
        "eligibility": "Open to all",
        "certificate": 1,
    },
    {
        "id": "ext_lp_kaggle",
        "title": "Kaggle Learn",
        "provider": "Kaggle (Google)",
        "program_type": "course",
        "url": "https://www.kaggle.com/learn",
        "description": "Short, hands-on micro-courses in Python, pandas, SQL, machine learning and data visualisation.",
        "skills_covered": ["Python", "SQL"],
        "duration": "3-7 hours each",
        "cost": "Free",
        "eligibility": "Open to all",
        "certificate": 1,
    },
    {
        "id": "ext_lp_infosys",
        "title": "Infosys Springboard",
        "provider": "Infosys",
        "program_type": "course",
        "url": "https://infyspringboard.onwingspan.com",
        "description": "Infosys's free digital-literacy and professional-skills platform for students, with certification pathways.",
        "skills_covered": ["Java", "Python", "Communication"],
        "duration": "Self-paced",
        "cost": "Free",
        "eligibility": "Open to all learners",
        "certificate": 1,
    },
    {
        "id": "ext_lp_tcsion",
        "title": "TCS iON Career Edge",
        "provider": "Tata Consultancy Services",
        "program_type": "course",
        "url": "https://www.tcsion.com",
        "description": "Free employability programmes covering communication, aptitude and IT foundations for job-seeking students.",
        "skills_covered": ["Communication", "Excel", "Problem Solving"],
        "duration": "10-15 days",
        "cost": "Free",
        "eligibility": "Students and fresh graduates",
        "certificate": 1,
    },
    {
        "id": "ext_lp_github_edu",
        "title": "GitHub Education & Student Developer Pack",
        "provider": "GitHub",
        "program_type": "course",
        "url": "https://education.github.com",
        "description": "Free developer tools, cloud credits and learning resources for verified students.",
        "skills_covered": ["Git"],
        "duration": "Ongoing",
        "cost": "Free for students",
        "eligibility": "Verified students",
        "certificate": 0,
    },
    {
        "id": "ext_lp_mongodb",
        "title": "MongoDB University",
        "provider": "MongoDB",
        "program_type": "certification",
        "url": "https://learn.mongodb.com",
        "description": "Official MongoDB courses and developer certification, free to take.",
        "skills_covered": ["MongoDB", "Node.js"],
        "duration": "Self-paced",
        "cost": "Free",
        "eligibility": "Open to all",
        "certificate": 1,
    },
    {
        "id": "ext_lp_docker",
        "title": "Docker Get Started",
        "provider": "Docker",
        "program_type": "course",
        "url": "https://docs.docker.com/get-started/",
        "description": "Docker's own guided introduction to containers, images and Compose.",
        "skills_covered": ["Docker"],
        "duration": "Self-paced",
        "cost": "Free",
        "eligibility": "Open to all",
        "certificate": 0,
    },
    {
        "id": "ext_lp_fastapi",
        "title": "FastAPI Official Tutorial",
        "provider": "FastAPI",
        "program_type": "course",
        "url": "https://fastapi.tiangolo.com/tutorial/",
        "description": "The framework's own step-by-step tutorial for building production Python APIs.",
        "skills_covered": ["FastAPI", "Python"],
        "duration": "Self-paced",
        "cost": "Free",
        "eligibility": "Basic Python knowledge",
        "certificate": 0,
    },
    {
        "id": "ext_lp_hackerrank",
        "title": "HackerRank Skills Certification",
        "provider": "HackerRank",
        "program_type": "certification",
        "url": "https://www.hackerrank.com/skills-directory",
        "description": "Free role-based skill certifications in problem solving, Python, SQL, Java and React that recruiters recognise.",
        "skills_covered": ["Python", "SQL", "Java", "React", "Problem Solving"],
        "duration": "1-2 hours per test",
        "cost": "Free",
        "eligibility": "Open to all",
        "certificate": 1,
    },
    {
        "id": "ext_lp_edx",
        "title": "edX University Courses",
        "provider": "edX",
        "program_type": "course",
        "url": "https://www.edx.org",
        "description": "University courses from MIT, Harvard, IIT-affiliated and other institutions, auditable free.",
        "skills_covered": ["Python", "SQL", "Communication"],
        "duration": "Varies",
        "cost": "Free to audit",
        "eligibility": "Open to all",
        "certificate": 1,
    },
]


def seed_external_catalogue():
    """Load the verified official-source catalogue.

    Idempotent per row, so a link fixed in EXTERNAL_OPPORTUNITIES here is
    applied on the next restart rather than being skipped because the row
    already exists. Nothing a recruiter posted is ever touched: only rows
    this function owns (source_type == "external") get refreshed.
    """
    db = SessionLocal()
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    try:
        # Catalogue entries that have been retired (source went dead, or the
        # entry was merged into another). Their rows are deleted so a stale
        # listing does not linger in the shared database after the code that
        # created it is gone.
        RETIRED_CATALOGUE_IDS = ["ext_aiia_goa_srf"]
        for _rid in RETIRED_CATALOGUE_IDS:
            db.query(InternshipModel).filter(InternshipModel.id == _rid).delete()
            db.query(LearningProgramModel).filter(LearningProgramModel.id == _rid).delete()
        db.commit()

        # Fetch every row this function owns up front, in one query per table,
        # rather than one SELECT per catalogue entry. Against a remote Supabase
        # instance each round trip costs ~350ms, so the per-row lookups were
        # spending half a minute on startup asking about rows we could have
        # loaded in a single statement.
        opp_ids = [item["id"] for item in EXTERNAL_OPPORTUNITIES]
        existing_opps = {
            r.id: r for r in db.query(InternshipModel)
            .filter(InternshipModel.id.in_(opp_ids)).all()
        } if opp_ids else {}

        learn_ids = [item["id"] for item in EXTERNAL_LEARNING]
        existing_learn = {
            r.id: r for r in db.query(LearningProgramModel)
            .filter(LearningProgramModel.id.in_(learn_ids)).all()
        } if learn_ids else {}

        for item in EXTERNAL_OPPORTUNITIES:
            row = existing_opps.get(item["id"])
            if row is None:
                row = InternshipModel(id=item["id"])
                db.add(row)
            row.title = item["title"]
            row.company = item["company"]
            row.location = item["location"]
            row.work_mode = item["work_mode"]
            row.stipend = item.get("stipend", "")
            row.duration = item.get("duration", "")
            row.deadline = item.get("deadline", "")
            row.description = item.get("description", "")
            row.opportunity_type = item["opportunity_type"]
            row.audience = item.get("audience", "student")
            row.eligibility = item.get("eligibility", "")
            row.openings = item.get("openings", 0)
            row.required_skills = json.dumps(item.get("required_skills", []))
            row.source_type = "external"
            row.official_url = clean_public_url(item["official_url"])
            row.source_name = item["source_name"]
            row.posted_by = None

        for item in EXTERNAL_LEARNING:
            row = existing_learn.get(item["id"])
            if row is None:
                row = LearningProgramModel(id=item["id"], created_at=now)
                db.add(row)
            row.title = item["title"]
            row.provider = item["provider"]
            row.program_type = item["program_type"]
            row.description = item.get("description", "")
            row.skills_covered = json.dumps(item.get("skills_covered", []))
            row.url = clean_public_url(item["url"])
            row.duration = item.get("duration", "")
            row.cost = item.get("cost", "Free")
            row.audience = item.get("audience", "student")
            row.eligibility = item.get("eligibility", "")
            row.certificate = item.get("certificate", 0)
            row.source_type = "official"
            row.posted_by = None

        # The sample partner programs shipped with an official platform's URL
        # (CloudSprint's course pointed at skillbuilder.aws). Those companies
        # are illustrative, so crediting them with a real platform's page is
        # a false attribution — clear it. The rows already exist for anyone
        # who ran an earlier build, hence fixing them here rather than only
        # in the seed literal.
        for row in db.query(LearningProgramModel).filter(
            LearningProgramModel.id.like("lp_seed_%")
        ).all():
            row.url = ""

        # The sample listings originally named five invented employers. The
        # rows already exist wherever an earlier build ran, so rename them
        # here rather than only in the seed literal: nothing on the site
        # should present a company that does not exist as if it hires.
        RETIRED_NAMES = (
            "TechNova", "FinEdge Solutions", "CloudSprint",
            "InsightWorks", "PixelForge Studio",
        )
        DEMO_EMPLOYER = "CareerNexus Demo Employer"
        # One query per table with IN (...), not one per table PER NAME - that
        # was 20 round trips to rename at most a handful of demo rows.
        for row in db.query(InternshipModel).filter(
                InternshipModel.company.in_(RETIRED_NAMES)).all():
            row.company = DEMO_EMPLOYER
        for row in db.query(LearningProgramModel).filter(
                LearningProgramModel.provider.in_(RETIRED_NAMES)).all():
            row.provider = DEMO_EMPLOYER
        for row in db.query(CollaborationModel).filter(
                CollaborationModel.organisation.in_(RETIRED_NAMES)).all():
            row.organisation = DEMO_EMPLOYER
        for row in db.query(StudentModel).filter(
                StudentModel.org_name.in_(RETIRED_NAMES)).all():
            row.org_name = DEMO_EMPLOYER

        db.commit()
    finally:
        db.close()


if not SEEDS_CURRENT:
    seed_external_catalogue()
    mark_seeds_current()

# =====================================================================
# AIIA OPPORTUNITY HUB
# ---------------------------------------------------------------------
# SIH26044 is set by the All India Institute of Ayurveda, an autonomous
# institute under the Ministry of Ayush, so the platform carries a hub for
# what AIIA itself offers students.
#
# Everything here was read off aiia.gov.in — the programme names, the
# announcement dates and the document links are the institute's own. The
# site is a single-page app, so its routes are hash routes (/#/courses...)
# and they are reproduced exactly as the site's navigation emits them.
#
# Where a detail is not stated on the public listing — fees, precise
# eligibility — the field says to consult the official brochure rather than
# guessing. An invented eligibility rule would be worse than a missing one:
# a student could be turned away at the counter because of it.
#
# Two kinds of link, deliberately:
#   * section pages are stable and survive the academic year
#   * programme documents are the authoritative source for that intake but
#     are rotated as sessions close, so each card also belongs to a section
#     the student can fall back to.
# =====================================================================

# =====================================================================
# CENTRAL WEBSITE REGISTER
# ---------------------------------------------------------------------
# Every external destination CareerNexus points at lives in one file:
#
#     frontend/data/website-links.json
#
# It sits under frontend/ rather than at the repo root for one practical
# reason: frontend/serve.py serves that directory, so the browser can
# fetch the same file the backend reads. A repo-root data/ folder would
# be unreachable from the page and we would be back to two copies.
#
# Editing that file is all it takes to change a URL — this module reads
# it at import instead of hard-coding aiia.gov.in in a second place.
# =====================================================================

TEAM_PATH = (
    pathlib.Path(__file__).resolve().parent.parent.parent / "frontend" / "data" / "team.json"
)

WEBSITE_LINKS_PATH = (
    pathlib.Path(__file__).resolve().parent.parent.parent / "frontend" / "data" / "website-links.json"
)


def _load_website_links() -> List[dict]:
    """Read the register, or fall back to an empty list.

    A missing or malformed file must never stop the API booting: the
    lookups below all carry their own defaults, so the worst case is
    that a link falls back to the value it used to be hard-coded as.
    """
    try:
        with open(WEBSITE_LINKS_PATH, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        sites = data.get("websites", [])
        return [w for w in sites if isinstance(w, dict) and clean_public_url(w.get("url", ""))]
    except (OSError, ValueError) as exc:
        print(f"Website links: could not read {WEBSITE_LINKS_PATH.name} ({exc}); using built-in defaults")
        return []


WEBSITE_LINKS = _load_website_links()
_WEBSITE_LINKS_BY_ID = {w["id"]: w for w in WEBSITE_LINKS if w.get("id")}


def site_url(link_id: str, default: str = "") -> str:
    """The registered URL for `link_id`, or `default` if it is not listed."""
    entry = _WEBSITE_LINKS_BY_ID.get(link_id)
    return clean_public_url(entry["url"]) if entry else default


if WEBSITE_LINKS:
    print(f"Website links: {len(WEBSITE_LINKS)} external destinations loaded from the central register")


def _report_contact_email_config() -> None:
    """Say at startup whether the contact form can actually send.

    Silence here previously meant the first anyone knew about missing
    credentials was a message that never arrived.
    """
    missing = [k for k, v in (
        ("SMTP_HOST", SMTP_HOST), ("SMTP_USER", SMTP_USER), ("SMTP_PASSWORD", SMTP_PASSWORD),
    ) if not v]
    if missing:
        print(
            "Contact email: DISABLED - " + ", ".join(missing) + " not set in backend/.env. "
            "The contact form will store messages and return an error to the sender "
            "instead of pretending they were delivered."
        )
    else:
        print(f"Contact email: enabled - {SMTP_HOST}:{SMTP_PORT} as {SMTP_USER} -> {CONTACT_TO}")

# Read from the register, with the previously hard-coded value as the
# fallback so a missing file degrades quietly rather than breaking links.
AIIA_SITE = site_url("aiia_delhi", "https://aiia.gov.in")
AIIA_GOA_SITE = site_url("aiia_goa", "https://aiiagoa.org")
AYUSH_SITE = site_url("ministry_ayush", "https://ayush.gov.in")
AIIA_ORG = "All India Institute of Ayurveda"
AIIA_MINISTRY = "Ministry of Ayush, Government of India"
AIIA_LOCATION = "AIIA, New Delhi"

# Stable sections of the official site, grouped for the hub's quick links.
AIIA_SECTIONS = [
    {
        "group": "Admissions & Academics",
        "links": [
            {"label": "Courses Available", "url": f"{AIIA_SITE}/#/coursesAvailable",
             "note": "Every course AIIA currently runs"},
            {"label": "PhD Programme", "url": f"{AIIA_SITE}/#/phdprogram",
             "note": "Doctoral research in Ayurveda"},
            {"label": "PhD Admission", "url": f"{AIIA_SITE}/#/academicadmission",
             "note": "Entrance notifications and admission rounds"},
            {"label": "Postgraduate Courses", "url": f"{AIIA_SITE}/#/postgraduatecourse",
             "note": "MD/MS Ayurveda specialisations"},
            {"label": "Syllabus", "url": f"{AIIA_SITE}/#/syllabus",
             "note": "Official syllabi by course"},
            {"label": "Exams & Results", "url": f"{AIIA_SITE}/#/examsResults",
             "note": "Examination notices and results"},
        ],
    },
    {
        "group": "Students",
        "links": [
            {"label": "Student Corner", "url": f"{AIIA_SITE}/#/studentCorner",
             "note": "Notices and resources for enrolled students"},
            {"label": "Student Council Committee", "url": f"{AIIA_SITE}/#/studentcouncilcommittee",
             "note": "Student representation at the institute"},
            {"label": "Placement Cell", "url": f"{AIIA_SITE}/#/placementcell",
             "note": "The institute's placement committee"},
            {"label": "Student Enrolment List", "url": f"{AIIA_SITE}/#/studentEnrollmentList",
             "note": "Published enrolment lists"},
        ],
    },
    {
        "group": "Research",
        "links": [
            {"label": "Ongoing Research Projects", "url": f"{AIIA_SITE}/#/ongoingresearchprojects",
             "note": "Projects currently running at AIIA"},
            {"label": "Completed Research Projects", "url": f"{AIIA_SITE}/#/completedresearchprojects",
             "note": "Published project outcomes"},
            {"label": "Guidelines for Research", "url": f"{AIIA_SITE}/#/guidelinesforresearch",
             "note": "Institutional research guidelines"},
            {"label": "Research Application Form", "url": f"{AIIA_SITE}/#/researchform",
             "note": "Form for research proposals"},
            {"label": "International Journal of Ayurveda Research", "url": f"{AIIA_SITE}/#/internationalJournalofAyurvedaResearch",
             "note": "AIIA's peer-reviewed journal (IJAR)"},
        ],
    },
    {
        "group": "Notices & Careers",
        "links": [
            {"label": "Notices", "url": f"{AIIA_SITE}/#/noticesArchive",
             "note": "Official notices and circulars"},
            {"label": "Vacancies", "url": f"{AIIA_SITE}/#/archivesVacancies",
             "note": "Teaching, non-teaching and project posts"},
            {"label": "News", "url": f"{AIIA_SITE}/#/newsArchive",
             "note": "Institute news archive"},
            {"label": "Tenders", "url": f"{AIIA_SITE}/#/archiveTender",
             "note": "Procurement and tender notices"},
        ],
    },
    {
        "group": "Events & Training",
        "links": [
            {"label": "Training & Workshops", "url": f"{AIIA_SITE}/#/trainingWorkshop",
             "note": "Training programmes and workshops"},
            {"label": "Events", "url": f"{AIIA_SITE}/#/eventsList",
             "note": "Conferences, seminars and institute events"},
        ],
    },
    {
        "group": "About AIIA",
        "links": [
            {"label": "About the Institute", "url": f"{AIIA_SITE}/#/aboutus",
             "note": "India's first NABH-accredited AYUSH institute"},
            {"label": "Mandate", "url": f"{AIIA_SITE}/#/mandate",
             "note": "What the institute is charged with"},
            {"label": "Institute Hospital", "url": f"{AIIA_SITE}/#/institutehospital",
             "note": "Clinical services and departments"},
            {"label": "Ministry of Ayush", "url": AYUSH_SITE,
             "note": "The parent ministry"},
        ],
    },
]

# Specific programmes AIIA has announced, taken from its own listings.
# `announced` is the date the institute published the notice.
AIIA_PROGRAMMES = [
    {
        "id": "aiia_panchakarma_tech",
        "title": "Panchakarma Technician Course, Batch 2026-27",
        "category": "Certificate Course",
        "department": "Department of Panchakarma",
        "description": "Technician training in Panchakarma therapy procedures, run as a full batch intake by the institute. Applications for the 2026 batch have closed — AIIA published the provisional selection list on 21 August 2026 and the selection process is under way. Watch the courses page for the next batch.",
        "announced": "2026-07-10",
        "mode": "Offline",
        "certificate": True,
        "url": f"{AIIA_SITE}/#/coursesAvailable",
        "section_url": f"{AIIA_SITE}/#/coursesAvailable",
    },
    {
        "id": "aiia_yoga_wellness",
        "title": "Yoga Wellness Trainer Course",
        "category": "Certificate Course",
        "department": "Department of Swasthavritta",
        "description": "Six-month trainer-level certification in yoga for wellness, an AYUSH Skill Development course under COEDAKSHYA. Applications for the 2026-27 intake closed on 5 July 2026 (the last date was extended once by notice). Watch the courses page for the next intake.",
        "announced": "2026-05-14",
        "mode": "Offline",
        "certificate": True,
        "url": f"{AIIA_SITE}/#/coursesAvailable",
        "section_url": f"{AIIA_SITE}/#/coursesAvailable",
    },
    {
        "id": "aiia_aesthetic_assistant",
        "title": "Ayurvedic Aesthetic Assistant Course (Session 2026-27)",
        "category": "Certificate Course",
        "department": "All India Institute of Ayurveda",
        "description": "Skill course training assistants in Ayurvedic aesthetic practice for the 2026-27 academic session.",
        "announced": "2026-08-20",
        "mode": "Offline",
        "certificate": True,
        "url": f"{AIIA_SITE}/pdf/Flyer_20082026_merged.pdf",
        "section_url": f"{AIIA_SITE}/#/coursesAvailable",
    },
    {
        "id": "aiia_garbhini_mitra",
        "title": "Garbhini Mitra Course",
        "category": "Certificate Course",
        "department": "Department of Prasuti Tantra & Stri Roga",
        "description": "Course on Ayurvedic maternal care. AIIA publishes the brochure together with the application form. Applications for this intake are open; AIIA extended the last date to 15 September 2026 by a separate notice.",
        "announced": "2026-08-10",
        "deadline": "2026-09-15",
        "mode": "Offline",
        "certificate": True,
        "url": f"{AIIA_SITE}/pdf/Academic_Brochure_08082026.pdf",
        "section_url": f"{AIIA_SITE}/#/coursesAvailable",
    },
    {
        "id": "aiia_hospital_management",
        "title": "Certificate Course in Hospital Management 2026",
        "category": "Certificate Course",
        "department": "All India Institute of Ayurveda",
        "description": "Hospital administration and management training for the 2026 session.",
        "announced": "2026-07-24",
        "mode": "Offline",
        "certificate": True,
        "url": f"{AIIA_SITE}/pdf/CCHM_2026_Admission_Notification_AIIA.pdf",
        "section_url": f"{AIIA_SITE}/#/coursesAvailable",
    },
    {
        "id": "aiia_ayurprabha",
        "title": "AYURPRABHA-2K26 — Workshop on Ayurveda Dermatology & Cosmetology",
        "category": "Workshop",
        "department": "All India Institute of Ayurveda",
        "duration": "6 days",
        "description": "Six-day hands-on workshop in Ayurvedic dermatology and cosmetology.",
        "mode": "Offline",
        "certificate": True,
        "url": f"{AIIA_SITE}/pdf/AYURPRABHA.pdf",
        "section_url": f"{AIIA_SITE}/#/trainingWorkshop",
    },
    {
        "id": "aiia_molecular_biology",
        "title": "Skill Development Training Programme in Molecular Biology Techniques",
        "category": "Training Programme",
        "department": "Integrated Translational Molecular Biology Unit (ITMBU), AIIA",
        "description": "Hands-on laboratory training in molecular biology techniques at ITMBU for MD (Ayurveda) and M.Sc Life Sciences candidates. The most recent 30-day intake ran 25 June to 24 July 2026 and applications for it have closed. AIIA announces new intakes on its training and workshops page.",
        "announced": "2026-05-15",
        "mode": "Offline",
        "certificate": True,
        "url": f"{AIIA_SITE}/#/trainingWorkshop",
        "section_url": f"{AIIA_SITE}/#/trainingWorkshop",
    },
    {
        "id": "aiia_qc_pharmacology",
        "title": "Hands-on Training Programme in QC & Pharmacology Labs",
        "category": "Training Programme",
        "department": "Quality Control & Pharmacology Laboratories, AIIA",
        "description": "Practical laboratory training in quality control and pharmacology methods.",
        "announced": "2026-05-27",
        "mode": "Offline",
        "certificate": True,
        "url": f"{AIIA_SITE}/pdf/Hands_on_Training.pdf",
        "section_url": f"{AIIA_SITE}/#/trainingWorkshop",
    },
    {
        "id": "aiia_kaumaracon",
        "title": "KAUMARACON-2026 — International Conference on Kaumarabhritya",
        "category": "Conference",
        "department": "Department of Kaumarabhritya",
        "description": "International conference on Ayurvedic paediatrics. The first circular carries the call for participation.",
        "mode": "Offline",
        "certificate": False,
        "url": f"{AIIA_SITE}/pdf/KAUMARACON-2026.jpeg",
        "section_url": f"{AIIA_SITE}/#/eventsList",
    },
    {
        "id": "aiia_saushrutam",
        "title": "SAUSHRUTAM 2K26 — International Seminar on Shalya Tantra",
        "category": "Seminar",
        "department": "Department of Shalya Tantra",
        "description": "International seminar on Ayurvedic surgery (Shalya Tantra).",
        "announced": "2026-05-11",
        "mode": "Offline",
        "certificate": False,
        "url": f"{AIIA_SITE}/pdf/Saushrutam_2026.pdf",
        "section_url": f"{AIIA_SITE}/#/eventsList",
    },
    {
        "id": "aiia_phd",
        "title": "PhD in Ayurveda 2026-2027",
        "category": "Research / Doctoral",
        "department": "All India Institute of Ayurveda",
        "description": "Doctoral admission in Ayurveda, through the AIIA PhD entrance examination. The 2026-27 entrance cycle is complete — AIIA declared the entrance result on 30 May 2026. The next cycle is announced on the academic admissions page, usually early in the year.",
        "announced": "2026-03-16",
        "mode": "Offline",
        "certificate": True,
        "url": f"{AIIA_SITE}/#/phdprogram",
        "section_url": f"{AIIA_SITE}/#/academicadmission",
    },
    {
        "id": "aiia_aipr",
        "title": "Advanced Certificate Course on Intellectual Property Rights (AIPR)",
        "category": "Certificate Course",
        "department": "All India Institute of Ayurveda",
        "description": "Advanced certificate course covering intellectual property rights, announced by institute notice.",
        "announced": "2026-03-20",
        "mode": "Offline",
        "certificate": True,
        "url": f"{AIIA_SITE}/#/noticesArchive",
        "section_url": f"{AIIA_SITE}/#/noticesArchive",
    },
    {
        "id": "aiia_dietician",
        "title": "Ayurveda Dietician and Poshan Sahayak Course",
        "category": "Certificate Course",
        "department": "All India Institute of Ayurveda",
        "description": "Course in Ayurvedic dietetics and nutrition support. AIIA invited applications by public notice with a last date of 28 February 2026; that intake has closed. Watch the courses page for the next session.",
        "announced": "2026-02-06",
        "mode": "Offline",
        "certificate": True,
        "url": f"{AIIA_SITE}/#/noticesArchive",
        "section_url": f"{AIIA_SITE}/#/coursesAvailable",
    },
    {
        "id": "aiia_ecme_ayurvidya",
        "title": "e-CME Courses on the Ayurvidya Portal",
        "category": "Online Course",
        "department": "All India Institute of Ayurveda",
        "description": "Continuing medical education delivered online through the Ayurvidya portal, run in scheduled batches. AIIA published the schedule for the 2nd batch in July 2026; new batch schedules appear on the notice board.",
        "announced": "2026-07-14",
        "mode": "Online",
        "certificate": True,
        "url": f"{AIIA_SITE}/#/noticesArchive",
        "section_url": f"{AIIA_SITE}/#/trainingWorkshop",
    },
]


@app.get("/api/aiia")
def aiia_hub(user: StudentModel = Depends(get_current_student)):
    """The AIIA opportunity hub.

    Read-only and entirely first-party: every link points at aiia.gov.in or
    the Ministry of Ayush. Nothing here is stored in our database, because
    none of it is ours — the institute owns it and we only help students
    find it.
    """
    programmes = []
    for item in AIIA_PROGRAMMES:
        programmes.append({
            "id": item["id"],
            "title": item["title"],
            "category": item["category"],
            "department": item.get("department", AIIA_ORG),
            "description": item.get("description", ""),
            "eligibility": item.get("eligibility", "See the official brochure"),
            "duration": item.get("duration", "See the official brochure"),
            "fees": item.get("fees", "See the official brochure"),
            "deadline": item.get("deadline", ""),
            "announced": item.get("announced", ""),
            "mode": item.get("mode", "Offline"),
            "location": item.get("location", AIIA_LOCATION),
            "certificate": bool(item.get("certificate")),
            "official_url": clean_public_url(item["url"]),
            "section_url": clean_public_url(item.get("section_url", AIIA_SITE)),
        })

    # Newest announcement first; undated items fall to the end.
    programmes.sort(key=lambda p: p["announced"] or "", reverse=True)

    by_category = {}
    for p in programmes:
        by_category[p["category"]] = by_category.get(p["category"], 0) + 1

    return {
        "organisation": AIIA_ORG,
        "ministry": AIIA_MINISTRY,
        "location": AIIA_LOCATION,
        "website": AIIA_SITE,
        "ministry_website": AYUSH_SITE,
        "programmes": programmes,
        "categories": [{"name": k, "count": v} for k, v in sorted(by_category.items())],
        "sections": AIIA_SECTIONS,
    }

# =====================================================================
# OFFICIAL FEED AUTOMATION
# ---------------------------------------------------------------------
# Instead of a hand-maintained list going stale, the platform pulls new
# notices, vacancies and tenders straight from the institutions that
# publish them, and keeps their real closing dates.
#
# AIIA's website is a React app backed by a public JSON API — the same
# endpoints its own pages call. Each row carries a start_date, an
# end_date and the file name of the official PDF, so we get an accurate
# deadline and a first-party link without guessing at anything.
#
# Rules this module holds to:
#   * only official endpoints; no aggregators, no scraping of third
#     parties
#   * every item keeps the publisher's own deadline, never an invented one
#   * an item with no usable title or link is dropped rather than shown
#     half-empty
#   * a source that is unreachable is recorded as failed and retried; it
#     never takes the app down and never wipes what was already collected
# =====================================================================

import threading
import urllib.error

FEED_USER_AGENT = "CareerNexus/1.0 (SIH26044 student project; contact via aiia.gov.in)"
FEED_TIMEOUT = 20          # seconds per request
FEED_SYNC_INTERVAL = 6 * 60 * 60   # re-check every six hours

# AIIA maps its document types to numeric ids in its own viewpdf route.
AIIA_DOC_TYPE = {"vacancy": 1, "notice": 2, "tender": 3}

# The sources we pull from. `parser` names the shape of the response so a
# new source can be added without touching the sync loop.
FEED_SOURCES = [
    {
        "id": "aiia_notices",
        "name": "AIIA — Notices",
        "organisation": "All India Institute of Ayurveda",
        "category": "Notice",
        "url": "https://aiia.gov.in/getnoticedetail",
        "parser": "aiia",
        "list_key": "noticeList",
        "doc_type": "notice",
        "homepage": "https://aiia.gov.in/#/noticesArchive",
    },
    {
        "id": "aiia_vacancies",
        "name": "AIIA — Vacancies & Recruitment",
        "organisation": "All India Institute of Ayurveda",
        "category": "Vacancy",
        "url": "https://aiia.gov.in/getvacancydetail",
        "parser": "aiia",
        "list_key": "vacancyList",
        "doc_type": "vacancy",
        "homepage": "https://aiia.gov.in/#/archivesVacancies",
    },
    {
        "id": "aiia_tenders",
        "name": "AIIA — Tenders",
        "organisation": "All India Institute of Ayurveda",
        "category": "Tender",
        "url": "https://aiia.gov.in/gettenderdetail",
        "parser": "aiia",
        "list_key": "tenderList",
        "doc_type": "tender",
        "homepage": "https://aiia.gov.in/#/archiveTender",
    },
    {
        "id": "aiia_news",
        "name": "AIIA — News & Announcements",
        "organisation": "All India Institute of Ayurveda",
        "category": "News",
        "url": "https://aiia.gov.in/getcurrentnewsnoticedetail",
        "parser": "aiia",
        "list_key": "newsList",
        "doc_type": "notice",
        "homepage": "https://aiia.gov.in/#/newsArchive",
    },
]

FEED_SOURCES_BY_ID = {s["id"]: s for s in FEED_SOURCES}


class FeedItemModel(Base):
    """One listing pulled from an official source.

    `external_id` is the publisher's own id for the row, so re-running the
    sync updates an item in place instead of duplicating it — a title or a
    deadline can be corrected upstream and we follow.
    """
    __tablename__ = "feed_items"

    id = Column(String, primary_key=True, index=True)
    source_id = Column(String, nullable=False, index=True)
    external_id = Column(String, nullable=False, index=True)
    title = Column(Text, nullable=False)
    category = Column(String, nullable=False, default="Notice")
    organisation = Column(String, nullable=False, default="")
    official_url = Column(String, nullable=False, default="")
    published_on = Column(String, default="")   # publisher's start_date
    deadline = Column(String, default="")       # publisher's end_date
    first_seen = Column(String, nullable=False)
    last_seen = Column(String, nullable=False)


class FeedSyncModel(Base):
    """The outcome of the last sync per source, so the UI can be honest
    about how fresh the data is and when a source is failing."""
    __tablename__ = "feed_syncs"

    source_id = Column(String, primary_key=True, index=True)
    last_run = Column(String, default="")
    status = Column(String, default="never")    # ok | failed | never
    message = Column(Text, default="")
    items_seen = Column(Integer, default=0)
    items_new = Column(Integer, default=0)


create_missing_tables()


def _fetch_json(url: str):
    req = urllib.request.Request(url, headers={
        "User-Agent": FEED_USER_AGENT,
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=FEED_TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def _clean_date(value) -> str:
    """Keep an ISO yyyy-mm-dd date, drop anything else.

    A malformed date is worse than a missing one: it would sort wrongly and
    could show a student a deadline that never existed.
    """
    text = str(value or "").strip()[:10]
    if len(text) == 10 and text[4] == "-" and text[7] == "-":
        try:
            datetime.datetime.strptime(text, "%Y-%m-%d")
            return text
        except ValueError:
            return ""
    return ""


def _parse_aiia(source: dict, payload: dict) -> list:
    """AIIA returns {listKey: [{id, title_english, start_date, end_date,
    pdf_name, ...}]}. The PDF is served through its viewpdf route."""
    rows = payload.get(source["list_key"]) or []
    doc_type_id = AIIA_DOC_TYPE.get(source.get("doc_type", "notice"), 2)
    out = []
    for row in rows:
        title = (row.get("title_english") or row.get("title_hindi") or "").strip()
        pdf = (row.get("pdf_name") or "").strip()
        if not title:
            continue  # nothing useful to show
        url = (
            f"https://aiia.gov.in/viewpdf?docTypeId={doc_type_id}"
            f"&pdfName={urllib.parse.quote(pdf)}"
            if pdf else source["homepage"]
        )
        out.append({
            "external_id": str(row.get("id") or pdf or title[:60]),
            "title": " ".join(title.split()),
            "published_on": _clean_date(row.get("start_date")),
            "deadline": _clean_date(row.get("end_date")),
            "official_url": url,
        })
    return out


FEED_PARSERS = {"aiia": _parse_aiia}


def sync_one_source(source: dict, db: Session) -> dict:
    """Pull one source and upsert its rows. Never raises."""
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    record = db.query(FeedSyncModel).filter(FeedSyncModel.source_id == source["id"]).first()
    if record is None:
        record = FeedSyncModel(source_id=source["id"])
        db.add(record)

    try:
        payload = _fetch_json(source["url"])
        items = FEED_PARSERS[source["parser"]](source, payload)
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError, OSError) as e:
        # A source being down is normal and temporary. Record it and leave
        # everything already collected in place.
        record.last_run = now
        record.status = "failed"
        record.message = f"{type(e).__name__}: {e}"[:300]
        db.commit()
        return {"source_id": source["id"], "status": "failed", "new": 0, "seen": 0}

    # Load this source's rows in one query and match in memory. Querying
    # per item meant ~160 round trips to a database in another region,
    # which took nearly two minutes — long enough for the browser to give
    # up on the admin's "Sync now" click.
    existing = {
        row.external_id: row
        for row in db.query(FeedItemModel).filter(FeedItemModel.source_id == source["id"]).all()
    }

    new_count = 0
    for item in items:
        row = existing.get(item["external_id"])
        if row is None:
            row = FeedItemModel(
                id=new_id("feed"),
                source_id=source["id"],
                external_id=item["external_id"],
                first_seen=now,
            )
            row.last_seen = now
            db.add(row)
            existing[item["external_id"]] = row
            new_count += 1

        url = clean_public_url(item["official_url"])
        # Only touch a row that actually changed, so a sync where nothing
        # moved upstream issues no UPDATE at all. last_seen is deliberately
        # part of that: stamping it every run would dirty every row and undo
        # the saving. How fresh the data is comes from FeedSyncModel.last_run,
        # which is what the UI shows anyway.
        if (
            row.title != item["title"]
            or row.official_url != url
            or row.published_on != item["published_on"]
            or row.deadline != item["deadline"]
            or row.category != source["category"]
        ):
            row.title = item["title"]
            row.category = source["category"]
            row.organisation = source["organisation"]
            row.official_url = url
            row.published_on = item["published_on"]
            row.deadline = item["deadline"]
            row.last_seen = now

    record.last_run = now
    record.status = "ok"
    record.message = ""
    record.items_seen = len(items)
    record.items_new = new_count
    db.commit()
    return {"source_id": source["id"], "status": "ok", "new": new_count, "seen": len(items)}


def sync_all_sources() -> list:
    db = SessionLocal()
    try:
        return [sync_one_source(s, db) for s in FEED_SOURCES]
    finally:
        db.close()


def _feed_sync_loop():
    """Background refresh. Daemon thread, so it never blocks shutdown."""
    while True:
        try:
            results = sync_all_sources()
            ok = sum(1 for r in results if r["status"] == "ok")
            new = sum(r["new"] for r in results)
            print(f"Official feeds: synced {ok}/{len(results)} sources, {new} new items")
        except Exception as e:  # a bug here must not kill the thread
            print(f"Official feeds: sync loop error ({type(e).__name__}: {e})")
        time.sleep(FEED_SYNC_INTERVAL)


def start_feed_scheduler():
    """Start the periodic sync unless it has been switched off.

    Off by default in tests: the suite should not depend on a government
    website being reachable, and it should not hammer one either.
    """
    if os.environ.get("DISABLE_FEED_SYNC", "").strip().lower() in ("1", "true", "yes"):
        print("Official feeds: automatic sync disabled by DISABLE_FEED_SYNC")
        return
    threading.Thread(target=_feed_sync_loop, name="feed-sync", daemon=True).start()


def days_until(date_text: str):
    """Whole days from today to an ISO date; None when there is no date."""
    if not date_text:
        return None
    try:
        target = datetime.datetime.strptime(date_text, "%Y-%m-%d").date()
    except ValueError:
        return None
    return (target - datetime.date.today()).days


def _feed_item_out(row: FeedItemModel) -> dict:
    left = days_until(row.deadline)
    return {
        "id": row.id,
        "source_id": row.source_id,
        "source_name": FEED_SOURCES_BY_ID.get(row.source_id, {}).get("name", row.source_id),
        "title": row.title,
        "category": row.category,
        "organisation": row.organisation,
        "official_url": row.official_url,
        "published_on": row.published_on,
        "deadline": row.deadline,
        "days_left": left,
        "is_open": left is None or left >= 0,
        "first_seen": row.first_seen,
    }


@app.get("/api/feeds/items")
def list_feed_items(
    category: Optional[str] = Query(None),
    include_closed: bool = Query(False),
    user: StudentModel = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    """Everything pulled from official sources, soonest deadline first.

    Items whose deadline has passed are hidden unless asked for — a closed
    listing is noise for a student looking for something to apply to.
    """
    q = db.query(FeedItemModel)
    if category:
        q = q.filter(FeedItemModel.category == category)

    items = [_feed_item_out(r) for r in q.all()]
    if not include_closed:
        items = [i for i in items if i["is_open"]]

    # Soonest real deadline first; undated items after them, newest first.
    items.sort(key=lambda i: (
        i["days_left"] is None,
        i["days_left"] if i["days_left"] is not None else 0,
        i["published_on"] or "",
    ))

    counts = {}
    for i in items:
        counts[i["category"]] = counts.get(i["category"], 0) + 1

    syncs = {s.source_id: s for s in db.query(FeedSyncModel).all()}
    last_run = max((s.last_run for s in syncs.values() if s.last_run), default="")

    return {
        "items": items,
        "total": len(items),
        "categories": [{"name": k, "count": v} for k, v in sorted(counts.items())],
        "closing_soon": sum(1 for i in items if i["days_left"] is not None and 0 <= i["days_left"] <= 7),
        "last_synced": last_run,
        "sources": [
            {
                "id": s["id"],
                "name": s["name"],
                "organisation": s["organisation"],
                "homepage": s["homepage"],
                "status": syncs[s["id"]].status if s["id"] in syncs else "never",
                "last_run": syncs[s["id"]].last_run if s["id"] in syncs else "",
                "items_seen": syncs[s["id"]].items_seen if s["id"] in syncs else 0,
                "message": syncs[s["id"]].message if s["id"] in syncs else "",
            }
            for s in FEED_SOURCES
        ],
    }


@app.post("/api/feeds/sync")
def trigger_feed_sync(admin: StudentModel = Depends(get_current_admin)):
    """Run every source now. Admin-only: it makes outbound requests to
    other people's servers, so it is not something any visitor can trigger."""
    results = sync_all_sources()
    return {
        "results": results,
        "new_items": sum(r["new"] for r in results),
        "sources_ok": sum(1 for r in results if r["status"] == "ok"),
        "sources_total": len(results),
    }


@app.get("/api/website-links")
def website_links(category: Optional[str] = Query(None)):
    """The central register of external websites.

    Public on purpose: it is a list of official public URLs with nothing
    user-specific in it, and the landing page needs it before anyone has
    signed in. Served from frontend/data/website-links.json so there is a
    single copy for the whole project to read.
    """
    sites = WEBSITE_LINKS
    if category:
        wanted = category.strip().lower()
        sites = [w for w in sites if (w.get("category") or "").lower() == wanted]
    return {
        "total": len(sites),
        "categories": sorted({w.get("category", "") for w in WEBSITE_LINKS if w.get("category")}),
        "websites": sites,
    }


@app.get("/api/deadlines")
def upcoming_deadlines(
    within_days: int = Query(30),
    user: StudentModel = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    """One combined deadline board: platform postings, the curated official
    catalogue, and everything the feeds have pulled in."""
    out = []

    for opp in db.query(InternshipModel).all():
        left = days_until(opp.deadline or "")
        if left is None or left < 0:
            continue
        out.append({
            "title": opp.title,
            "organisation": opp.company,
            "category": (opp.opportunity_type or "internship").replace("_", " ").title(),
            "deadline": opp.deadline,
            "days_left": left,
            "official_url": opp.official_url or "",
            "internal_url": "" if (opp.source_type or "platform") == "external" else opp.id,
            "kind": "opportunity",
        })

    for row in db.query(FeedItemModel).all():
        left = days_until(row.deadline)
        if left is None or left < 0:
            continue
        out.append({
            "title": row.title,
            "organisation": row.organisation,
            "category": row.category,
            "deadline": row.deadline,
            "days_left": left,
            "official_url": row.official_url,
            "internal_url": "",
            "kind": "feed",
        })

    out = [d for d in out if d["days_left"] <= within_days]
    out.sort(key=lambda d: d["days_left"])
    return {
        "within_days": within_days,
        "total": len(out),
        "closing_this_week": sum(1 for d in out if d["days_left"] <= 7),
        "deadlines": out,
    }


# =====================================================================
# UNIFIED OPPORTUNITY SEARCH
# ---------------------------------------------------------------------
# One endpoint over everything the platform already holds, so the search
# page and the header search box do not each grow their own copy of the
# catalogue:
#
#   * internships table  - recruiter postings AND the verified official
#                          catalogue (source_type == "external")
#   * learning_programs  - official learning platforms and industry courses
#   * AIIA_PROGRAMMES    - the institute's own announced programmes
#   * feed_items         - whatever the official feeds have pulled in
#
# The scope is CareerNexus's own verified collection: every row traces
# back to an official source that was checked, and the external URLs all
# come from the central register (frontend/data/website-links.json).
# Searching the live internet is a separate feature that has deliberately
# not been built — no search API, no crawler, nothing fabricated. The
# response states the scope in `index_note` and the UI repeats it.
#
# Ranking is a small explainable score, not a black box: a title hit beats
# an organisation hit, which beats a description hit, and an open deadline
# lifts a row above a closed one. Synonym and intent expansion happens on
# the client (js/search-core.js) so the header box can rank local pages
# with exactly the same vocabulary.
# =====================================================================

SEARCH_INDEX_NOTE = (
    "Showing results from CareerNexus's verified collection of official "
    "opportunities - government portals, company career pages, official "
    "learning platforms and AIIA's own listings."
)

# Shown wherever the official source simply does not publish a field. The
# frontend uses the identical string (js/aiia-data.js), so the two never
# drift into "N/A" here and "Not specified" there.
SEARCH_UNSPECIFIED = "Not specified by the official source"

# Which filter bucket each row belongs to. The UI's Category filter uses
# exactly these strings.
SEARCH_CATEGORIES = [
    "Courses", "Internships", "Certifications", "Jobs",
    "Training", "Research", "Government", "AIIA",
]

_GOV_MARKERS = (
    # NPTEL and SWAYAM are deliberately absent: they are government-funded
    # but a student filtering by "University" is looking for exactly them.
    "ministry", "government of india", "govt", "aicte", "isro",
    "drdo", "national", "council", "commission", "department of",
    "skill india", "mygov", "nsdc", "ayush",
)


def _is_government(org: str) -> bool:
    low = (org or "").lower()
    return any(m in low for m in _GOV_MARKERS)


def _search_provider_kind(org: str, official: bool) -> str:
    """Provider bucket for the filter.

    government | university | platform | aiia | company
    """
    low = (org or "").lower()
    if "all india institute of ayurveda" in low or "aiia" in low:
        return "aiia"
    if _is_government(low):
        return "government"
    if any(m in low for m in ("iit", "iisc", "university", "college", "institute", "nptel", "swayam")):
        return "university"
    if official or any(
        m in low for m in ("coursera", "edx", "udacity", "microsoft", "aws", "google", "ibm")
    ):
        return "platform"
    return "company"


def _fee_kind(text: str) -> str:
    """free | paid | unknown - never guessed from an empty field."""
    low = (text or "").strip().lower()
    if not low:
        return "unknown"
    if "free trial" in low:
        return "paid"
    if "free" in low or low in ("0", "nil", "no fee", "no cost"):
        return "free"
    if "rs" in low or "inr" in low or any(ch.isdigit() for ch in low):
        return "paid"
    return "unknown"


def _search_skills(raw: str) -> List[str]:
    """Skill lists are stored as JSON text; a malformed one must not take
    the whole search down."""
    try:
        value = json.loads(raw or "[]")
        return [str(v) for v in value] if isinstance(value, list) else []
    except (ValueError, TypeError):
        return []


def _status_from_deadline(deadline: str) -> str:
    """open | closed | unknown, derived on read so it cannot go stale."""
    left = days_until(deadline or "")
    if left is None:
        return "unknown"
    return "closed" if left < 0 else "open"


def _search_row(
    rid, title, organisation, category, description="", eligibility="",
    location="", mode="", fee="", deadline="", source_name="",
    official_url="", internal_url="", skills=None, verified=True, duration="",
):
    """One result, in the single shape every caller renders."""
    url = clean_public_url(official_url)
    return {
        "id": rid,
        "title": title or "",
        "organisation": organisation or "",
        "category": category,
        "description": description or "",
        "eligibility": eligibility or SEARCH_UNSPECIFIED,
        "location": location or SEARCH_UNSPECIFIED,
        "mode": mode or SEARCH_UNSPECIFIED,
        "duration": duration or SEARCH_UNSPECIFIED,
        "fee": fee or SEARCH_UNSPECIFIED,
        "fee_kind": _fee_kind(fee),
        "deadline": deadline or "",
        "status": _status_from_deadline(deadline),
        "days_left": days_until(deadline or ""),
        "source_name": source_name or organisation or "",
        "official_url": url,
        # Set only for rows that really do have a page inside CareerNexus.
        "internal_url": internal_url or "",
        "provider_kind": _search_provider_kind(organisation, bool(url)),
        "skills": skills or [],
        "verified": bool(verified),
    }


_OPP_TYPE_TO_CATEGORY = {
    "internship": "Internships",
    "job": "Jobs",
    "apprenticeship": "Training",
    "project": "Research",
    "fdp": "Training",
    "training": "Training",
}


def _build_search_index(db: Session, role: str = ROLE_STUDENT) -> List[dict]:
    """Every searchable row, in one flat list.

    Rebuilt per request rather than cached: the catalogue is a few hundred
    rows, and a stale index that hides a posting a recruiter published two
    minutes ago is a worse bug than the milliseconds this costs.
    """
    rows: List[dict] = []

    # Faculty see the faculty track (FDPs, industrial training, faculty
    # internships); everyone else sees the student track. Without this a
    # student searching "python internship" got faculty programmes back --
    # the same audience bug /api/opportunities already guards against.
    audience = ROLE_FACULTY if role == ROLE_FACULTY else "student"
    all_audiences = role in (ROLE_ADMIN, ROLE_INSTITUTION, ROLE_RECRUITER)

    # ---- Opportunities: recruiter postings + official catalogue --------
    for opp in db.query(InternshipModel).all():
        if not all_audiences and (opp.audience or "student") != audience:
            continue
        otype = opp.opportunity_type or "internship"
        category = _OPP_TYPE_TO_CATEGORY.get(otype, "Internships")
        organisation = opp.company or ""
        if _is_government(organisation) and category in ("Internships", "Jobs"):
            category = "Government"
        external = (opp.source_type or "platform") == "external"
        rows.append(_search_row(
            opp.id,
            opp.title,
            organisation,
            category,
            description=opp.description or "",
            eligibility=opp.eligibility or "",
            location=opp.location or "",
            mode=opp.work_mode or "",
            duration=opp.duration or "",
            fee=opp.stipend or "",
            deadline=opp.deadline or "",
            source_name=opp.source_name or organisation,
            official_url=opp.official_url or "",
            internal_url="" if external else "internship-details.html?id=" + str(opp.id),
            skills=_search_skills(opp.required_skills),
            verified=external,
        ))

    # ---- Courses, certifications and workshops -------------------------
    for prog in db.query(LearningProgramModel).all():
        if not all_audiences and (prog.audience or "student") not in (audience, "both"):
            continue
        ptype = prog.program_type or "course"
        if ptype == "certification":
            category = "Certifications"
        elif ptype == "workshop":
            category = "Training"
        else:
            category = "Courses"
        rows.append(_search_row(
            prog.id,
            prog.title,
            prog.provider or "",
            category,
            description=prog.description or "",
            eligibility=prog.eligibility or "",
            location="Online",
            mode="Online",
            duration=prog.duration or "",
            fee=prog.cost or "",
            source_name=prog.provider or "",
            official_url=prog.url or "",
            internal_url="learning.html",
            skills=_search_skills(prog.skills_covered),
            verified=(prog.source_type or "industry") == "official",
        ))

    # ---- AIIA's own announced programmes -------------------------------
    for item in AIIA_PROGRAMMES:
        rows.append(_search_row(
            item["id"],
            item["title"],
            item.get("department") or AIIA_ORG,
            "AIIA",
            description=item.get("description", ""),
            eligibility=item.get("eligibility", ""),
            location=item.get("location", ""),
            mode=item.get("mode", ""),
            duration=item.get("duration", ""),
            fee=item.get("fees", ""),
            deadline=item.get("deadline", ""),
            source_name=AIIA_ORG,
            official_url=item.get("url", ""),
            internal_url="aiia.html",
            verified=True,
        ))

    # ---- Whatever the official feeds have collected ---------------------
    for row in db.query(FeedItemModel).all():
        org = row.organisation or AIIA_ORG
        rows.append(_search_row(
            row.id,
            row.title,
            org,
            "AIIA" if "ayurveda" in org.lower() else "Government",
            deadline=row.deadline or "",
            source_name=org,
            official_url=row.official_url or "",
            internal_url="updates.html",
            verified=True,
        ))

    return rows


def _score_row(row: dict, terms: List[str], raw_query: str = "") -> float:
    """Field-weighted term matching.

    A hit in the title is what the user almost always meant, so it is worth
    far more than the same word buried in a description. A row is only
    dropped when it matches nothing at all.
    """
    if not terms:
        return 1.0

    title = row["title"].lower()
    org = row["organisation"].lower()
    cat = row["category"].lower()
    skills = " ".join(row.get("skills") or []).lower()
    desc = " ".join([row["description"], row["eligibility"], row["location"]]).lower()

    score = 0.0
    hits = 0
    for term in terms:
        # Short terms are matched as whole words only. As a substring "ai"
        # hits "Trainer" and "Ayurveda", which is exactly how a Yoga course
        # came to top the results for "AI course".
        word_only = len(term) <= 3
        pattern = re.compile(r"\b" + re.escape(term) + r"\b")

        def contains(haystack, _p=pattern, _w=word_only, _t=term):
            return bool(_p.search(haystack)) if _w else (_t in haystack)

        matched = False
        if contains(title):
            # A whole word still outscores a bare substring for longer
            # terms: "AI for Everyone" should beat "Aircraft Maintenance".
            score += 12.0 if pattern.search(title) else 6.0
            matched = True
        if contains(skills):
            score += 5.0
            matched = True
        if contains(org):
            score += 4.0
            matched = True
        if contains(cat):
            score += 3.0
            matched = True
        if contains(desc):
            score += 1.5
            matched = True
        if matched:
            hits += 1

    # The whole phrase appearing in the title is the strongest signal
    # there is, and no tally of individual word hits should outrank it.
    if raw_query and len(raw_query) > 4 and raw_query in title:
        score += 18.0

    if not hits:
        return 0.0

    # Reward rows that matched more of what was typed, so "python
    # internship" prefers a Python internship over any Python course.
    score *= 1.0 + 0.6 * (hits - 1)
    if row["status"] == "open":
        score += 2.0
    elif row["status"] == "closed":
        score -= 3.0
    if row["verified"]:
        score += 0.5
    if row["official_url"]:
        score += 0.5
    return score


# Words that describe the *kind* of thing wanted rather than the subject.
# "AI course" is a request for AI; matching only "course" and returning a
# Yoga course is the search lying about what it found. So when a query
# carries a subject word, a row has to match the subject - not merely the
# shape.
_SEARCH_GENERIC_TERMS = {
    "course", "courses", "certification", "certificate", "certifications",
    "internship", "internships", "intern", "job", "jobs", "training",
    "programme", "program", "programmes", "programs", "workshop",
    "workshops", "placement", "opportunity", "opportunities", "vacancy",
    "vacancies", "position", "positions", "online", "offline",
}


def _distinctive_terms(terms: List[str]) -> List[str]:
    return [t for t in terms if t not in _SEARCH_GENERIC_TERMS]


class SearchQuery(BaseModel):
    q: str = ""
    # The client's expanded vocabulary ("cv" -> resume, "ml" -> machine
    # learning). Optional: the server splits `q` itself when it is absent.
    terms: List[str] = []
    category: str = ""
    mode: str = ""
    location: str = ""
    provider: str = ""
    status: str = ""
    fee: str = ""
    sort: str = "relevance"          # relevance | deadline | title
    limit: int = 24
    offset: int = 0


@app.post("/api/search")
def unified_search(
    payload: SearchQuery,
    user: StudentModel = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    """Search courses, internships and official programmes in one place."""
    rows = _build_search_index(db, user_role(user))

    raw = (payload.q or "").strip().lower()
    terms = [t.strip().lower() for t in (payload.terms or []) if t.strip()]
    if not terms and raw:
        terms = [t for t in re.split(r"[^a-z0-9+#.]+", raw) if len(t) > 1]

    def keep(row: dict) -> bool:
        if payload.category and row["category"] != payload.category:
            return False
        if payload.mode and (row["mode"] or "").lower() != payload.mode.lower():
            return False
        if payload.provider and row["provider_kind"] != payload.provider:
            return False
        if payload.status and row["status"] != payload.status:
            return False
        if payload.fee and row["fee_kind"] != payload.fee:
            return False
        if payload.location:
            want = payload.location.strip().lower()
            have = (row["location"] or "").lower()
            if want == "remote":
                if "remote" not in have and (row["mode"] or "").lower() != "online":
                    return False
            elif want == "india":
                # Every source in this index is Indian or open to India, so
                # the only thing this excludes is a remote-only listing.
                if have.strip() == "remote":
                    return False
            elif want not in have:
                return False
        return True

    # If the query named a subject, a row must match that subject. Without
    # this, "AI course" matched every row containing the word "course".
    subject = _distinctive_terms(terms)

    scored = []
    for row in rows:
        if not keep(row):
            continue
        if subject and _score_row(row, subject) <= 0:
            continue
        s = _score_row(row, terms, raw)
        if terms and s <= 0:
            continue
        scored.append((s, row))

    if payload.sort == "deadline":
        # Real deadlines first, soonest at the top; undated rows last.
        scored.sort(key=lambda p: (
            p[1]["days_left"] is None,
            p[1]["days_left"] if p[1]["days_left"] is not None else 0,
        ))
    elif payload.sort == "title":
        scored.sort(key=lambda p: p[1]["title"].lower())
    else:
        scored.sort(key=lambda p: -p[0])

    total = len(scored)
    offset = max(0, payload.offset)
    limit = max(1, min(60, payload.limit))
    page = [r for _, r in scored[offset:offset + limit]]

    # Counts across the whole result set, so the category chips can show
    # how many of each the query found - not just what fits on this page.
    by_category = {c: 0 for c in SEARCH_CATEGORIES}
    for _, row in scored:
        if row["category"] in by_category:
            by_category[row["category"]] += 1

    return {
        "query": payload.q,
        "terms": terms,
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": offset + limit < total,
        "by_category": by_category,
        "index_size": len(rows),
        "index_note": SEARCH_INDEX_NOTE,
        "results": page,
    }



# =====================================================================
# CONTACT US
# ---------------------------------------------------------------------
# The flow the brief asks for:
#
#   form -> POST /api/contact -> stored -> SMTP -> CONTACT_TO
#
# Two rules shape the whole thing:
#
#   1. Never claim an email was sent when it was not. The response
#      carries `delivered`, and the UI says something different for each
#      outcome. A frontend that always shows "sent!" is a lie.
#
#   2. Never lose a message. Every submission is written to the database
#      before the SMTP attempt, so a wrong password or a down mail server
#      costs delivery, not the message — it is still readable at
#      GET /api/admin/contact-messages.
#
# Credentials live in the environment, never in frontend code:
#   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, CONTACT_TO
# =====================================================================

CONTACT_TO = os.environ.get("CONTACT_TO", "aayushswapnali@gmail.com").strip()
SMTP_HOST = os.environ.get("SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587") or 587)
SMTP_USER = os.environ.get("SMTP_USER", "").strip()
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")

# Length caps. Anything longer is rejected rather than truncated, so a
# sender is told their message did not go through instead of silently
# losing the end of it.
CONTACT_MAX = {"name": 120, "email": 254, "subject": 200, "message": 5000, "phone": 40, "category": 60}
CONTACT_MIN = {"name": 2, "subject": 3, "message": 10}

_report_contact_email_config()

CONTACT_CATEGORIES = [
    "General question", "Feedback", "Bug report",
    "Partnership", "Institution enquiry", "Other",
]

# Rate limit: a burst allowance plus an hourly cap, per IP. In-process
# and therefore per-worker — fine for a single-instance deployment, and
# the honest limitation is noted in the README.
CONTACT_RATE_WINDOW = 3600      # seconds
CONTACT_RATE_MAX = 12           # submissions per IP per window
CONTACT_MIN_GAP = 8             # seconds between two submissions
_contact_hits: dict = {}


def _client_ip(request: Request) -> str:
    """Best-effort client address.

    X-Forwarded-For is attacker-controlled unless a trusted proxy sets
    it, so it is only consulted when TRUST_PROXY_HEADERS says a proxy is
    actually in front of us. Otherwise a spammer would rotate the header
    and walk straight through the rate limit.
    """
    if os.environ.get("TRUST_PROXY_HEADERS", "").strip().lower() in ("1", "true", "yes"):
        fwd = request.headers.get("x-forwarded-for", "")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _contact_rate_check(ip: str) -> Optional[str]:
    """None when the caller may post, else the reason they may not."""
    now = time.time()
    hits = [t for t in _contact_hits.get(ip, []) if now - t < CONTACT_RATE_WINDOW]
    _contact_hits[ip] = hits

    if hits and now - hits[-1] < CONTACT_MIN_GAP:
        return (
            f"Please wait about {CONTACT_MIN_GAP} seconds between messages, "
            "then try again."
        )
    if len(hits) >= CONTACT_RATE_MAX:
        return (
            f"That is {CONTACT_RATE_MAX} messages in an hour from this address. "
            "Please try again later."
        )

    # Keep the table from growing without bound on a long-running server.
    if len(_contact_hits) > 5000:
        for key in [k for k, v in _contact_hits.items() if not v or now - v[-1] > CONTACT_RATE_WINDOW]:
            _contact_hits.pop(key, None)
    return None


def _contact_record(ip: str) -> None:
    """Count one accepted submission against the sender's allowance.

    Deliberately separate from the check, and called only once a message
    has passed validation. Charging a rejected submission would mean
    someone who mistyped their email has to sit out the 20-second gap
    before they can correct it — punishing a typo like spam.
    """
    _contact_hits.setdefault(ip, []).append(time.time())


class ContactMessageModel(Base):
    """A message from the contact form.

    Stored before the email is attempted, so nothing is lost when mail is
    misconfigured or the SMTP host is unreachable.
    """
    __tablename__ = "contact_messages"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    phone = Column(String, default="")
    category = Column(String, default="")
    created_at = Column(String, nullable=False)
    # Whether the SMTP send actually succeeded, and why not if it did not.
    delivered = Column(Integer, default=0)
    delivery_error = Column(String, default="")
    client_ip = Column(String, default="")


# ContactMessageModel is declared after the two create_all() calls higher
# up, so it needs its own or the table is never created and the first
# submission dies on "no such table: contact_messages".
create_missing_tables()


class ContactPayload(BaseModel):
    name: str
    # Deliberately `str`, not EmailStr: EmailStr fails with a 422 and a
    # Pydantic error array, which renders as "[object Object]" in the UI.
    # The address is validated below with the same email_validator library,
    # so nothing is weakened — only the error message improves.
    email: str
    subject: str
    message: str
    phone: Optional[str] = ""
    category: Optional[str] = ""
    # Honeypot: a field the form renders but hides. A human never fills
    # it; a naive bot filling every input does.
    website: Optional[str] = ""


# Human-readable names for the length errors below.
CONTACT_FIELD_LABELS = {
    "name": "name", "email": "email address", "subject": "subject",
    "message": "message", "phone": "phone number", "category": "reason",
}


def _contact_clean(value: Optional[str], field: str) -> str:
    """Trim a field and reject it if it is over its cap.

    Rejecting rather than truncating: silently cutting the end off a
    message means the sender believes they sent something they did not.
    The caller sees an HTTPException with the field named.
    """
    text = (value or "").strip()
    limit = CONTACT_MAX[field]
    if len(text) > limit:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Your {CONTACT_FIELD_LABELS[field]} is too long "
                f"({len(text)} characters, maximum {limit}). "
                "Please shorten it and try again."
            ),
        )
    return text


def _header_safe(value: str) -> str:
    """Strip CR/LF before a value goes anywhere near an email header.

    Without this, a name of "Bob\\nBcc: victim@example.com" injects a new
    header and turns the contact form into an open relay.
    """
    return re.sub(r"[\r\n]+", " ", value or "").strip()


def _send_contact_email(row: "ContactMessageModel") -> tuple:
    """Send one contact message. Returns (delivered, error_message).

    Never raises: the caller has already stored the message and needs to
    answer the request either way.
    """
    if not (SMTP_HOST and SMTP_USER and SMTP_PASSWORD):
        return False, "SMTP is not configured (set SMTP_HOST, SMTP_USER and SMTP_PASSWORD)"

    try:
        msg = EmailMessage()
        msg["Subject"] = _header_safe(f"[CareerNexus Contact] {row.subject}")
        msg["From"] = SMTP_USER
        msg["To"] = CONTACT_TO
        # Pressing Reply in the inbox answers the person who wrote in.
        # EmailStr has already validated the address and _header_safe
        # removes any CR/LF, so this cannot inject extra headers.
        msg["Reply-To"] = _header_safe(row.email)

        body = (
            f"Name:\n{row.name}\n\n"
            f"Email:\n{row.email}\n\n"
            f"Subject:\n{row.subject}\n\n"
            f"Message:\n{row.message}\n\n"
        )
        if row.phone:
            body += f"Phone:\n{row.phone}\n\n"
        if row.category:
            body += f"Category:\n{row.category}\n\n"
        body += (
            f"Submitted from:\nCareerNexus Website\n\n"
            f"Submitted at:\n{row.created_at}\n"
        )
        msg.set_content(body)

        if SMTP_PORT == 465:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
                smtp.login(SMTP_USER, SMTP_PASSWORD)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
                smtp.starttls()
                smtp.login(SMTP_USER, SMTP_PASSWORD)
                smtp.send_message(msg)
        return True, ""
    except Exception as exc:                      # noqa: BLE001 - report, never crash
        # The class name plus message is enough to debug without leaking
        # the password into a log line.
        return False, f"{type(exc).__name__}: {exc}"


@app.get("/api/contact/meta")
def contact_meta():
    """What the contact form needs before anyone types anything.

    Public. Deliberately exposes no credentials — only the address that
    is already printed on the page and the category list.
    """
    return {
        "contact_email": CONTACT_TO,
        "categories": CONTACT_CATEGORIES,
        "limits": CONTACT_MAX,
        "email_configured": bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD),
    }


@app.post("/api/contact")
def submit_contact(payload: ContactPayload, request: Request, db: Session = Depends(get_db)):
    """Receive a contact message, store it, then try to email it.

    Public by design — the whole point is that someone who is not signed
    in can reach the team.
    """
    ip = _client_ip(request)
    blocked = _contact_rate_check(ip)
    if blocked:
        raise HTTPException(status_code=429, detail=blocked)

    # Honeypot. Answer 200 so a bot cannot tell it was caught, but do not
    # store or send anything.
    if (payload.website or "").strip():
        return {"ok": True, "delivered": True, "message": "Message sent successfully. We'll get back to you soon."}

    name = _contact_clean(payload.name, "name")
    subject = _contact_clean(payload.subject, "subject")
    message = _contact_clean(payload.message, "message")
    phone = _contact_clean(payload.phone, "phone")
    category = _contact_clean(payload.category, "category")

    if len(name) < CONTACT_MIN["name"]:
        raise HTTPException(status_code=400, detail="Please enter your name.")

    raw_email = _contact_clean(payload.email, "email")
    try:
        # Normalises the address and rejects anything malformed. Checking
        # deliverability would need a DNS lookup on every submission, so
        # that is off; a wrong-but-well-formed address simply bounces.
        clean_email = _validate_email(raw_email, check_deliverability=False).normalized
    except Exception:                              # noqa: BLE001
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")
    if len(subject) < CONTACT_MIN["subject"]:
        raise HTTPException(status_code=400, detail="Please enter a subject.")
    if len(message) < CONTACT_MIN["message"]:
        raise HTTPException(status_code=400, detail="Please enter a message of at least 10 characters.")
    if category and category not in CONTACT_CATEGORIES:
        raise HTTPException(status_code=400, detail="Please choose a valid category.")

    # Validation is past; this one counts against the rate limit.
    _contact_record(ip)

    row = ContactMessageModel(
        id=new_id("msg"),
        name=name,
        email=clean_email,
        subject=subject,
        message=message,
        phone=phone,
        category=category,
        created_at=datetime.datetime.now().isoformat(timespec="seconds"),
        client_ip=ip,
    )
    # Stored first, on purpose: from here on the message cannot be lost,
    # whatever the mail server does.
    db.add(row)
    db.commit()
    db.refresh(row)

    delivered, error = _send_contact_email(row)
    row.delivered = 1 if delivered else 0
    row.delivery_error = error[:500]
    db.commit()

    if not delivered:
        # Loud, and with the reason, because this is the operator's problem
        # to fix - most often SMTP_* missing from backend/.env.
        print(f"Contact form: message {row.id} stored but NOT emailed - {error}")
        # 502, not 200. The message is safe in the database and readable at
        # /api/admin/contact-messages, but the sender was NOT reached, so
        # the response must not be a success. Answering 200 here is what
        # let the page show "Message received" for an email that never
        # left the building. A non-2xx cannot be rendered as success by
        # the API layer even if the page's own logic regressed.
        raise HTTPException(
            status_code=502,
            detail="Unable to send your message right now. Please try again.",
        )

    return {
        "ok": True,
        "delivered": True,
        "message": "Message sent successfully. We'll get back to you soon.",
    }


@app.get("/api/admin/contact-messages")
def list_contact_messages(
    user: StudentModel = Depends(require_roles(ROLE_ADMIN)),
    db: Session = Depends(get_db),
):
    """Every message the form has taken.

    This is what makes "stored even when email fails" a real safety net
    rather than a black hole.
    """
    rows = (
        db.query(ContactMessageModel)
        .order_by(ContactMessageModel.created_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "name": r.name,
            "email": r.email,
            "subject": r.subject,
            "message": r.message,
            "phone": r.phone or "",
            "category": r.category or "",
            "created_at": r.created_at,
            "delivered": bool(r.delivered),
            "delivery_error": r.delivery_error or "",
        }
        for r in rows
    ]


@app.get("/api/team")
def team():
    """Team VertexSquad, read from frontend/data/team.json.

    Public, and read from the same file the browser fetches so the two can
    never disagree.
    """
    try:
        with open(TEAM_PATH, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return {
            "meta": data.get("meta", {}),
            "members": data.get("members", []),
        }
    except (OSError, ValueError) as exc:
        # The page renders from its own copy of the file, so an empty list
        # here degrades rather than breaks.
        print(f"Team: could not read {TEAM_PATH.name} ({exc})")
        return {"meta": {}, "members": []}



start_feed_scheduler()
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
