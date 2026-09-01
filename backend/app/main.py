import os
import json
import jwt
import datetime
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from sqlalchemy import create_engine, Column, String, Integer, Float, ForeignKey, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
import io
import pypdf
import urllib.request

# Initialize FastAPI app
app = FastAPI(title="CareerNexus Backend", version="1.0")

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permits all origins for hackathon simplicity
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load environment variables (must happen before any os.environ reads below)
from dotenv import load_dotenv
load_dotenv()

# JWT Configurations
# Read the signing secret from the environment so it is never committed to the
# repo. The fallback keeps local development working out of the box, but any
# real deployment must set JWT_SECRET_KEY in .env — anyone who knows the
# signing secret can forge a login token.
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "careernexus-local-dev-only-change-me")
ALGORITHM = "HS256"

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

# --- DB MODELS ---

class StudentModel(Base):
    __tablename__ = "students"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
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


class InternshipModel(Base):
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

# Create tables
Base.metadata.create_all(bind=engine)

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
                    company="TechNova",
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
                    company="FinEdge Solutions",
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
                    company="InsightWorks",
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
                    company="CloudSprint",
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
                    company="PixelForge Studio",
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
                phone="+91 98765 43210",
                location="Pune, Maharashtra",
                photo_url="",
                college="Vishwakarma Institute of Technology",
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

seed_database()

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
    return student

def get_current_student(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)) -> StudentModel:
    token = credentials.credentials
    return get_student_from_token(token, db)

# --- PAIRED ALGORITHMS ---

def calculate_match_score_breakdown(student: StudentModel, internship: InternshipModel):
    # 1. Required Skills Match (60% weight)
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

class ConfirmSkillsPayload(BaseModel):
    skills: List[str] = []

class WhatIfPayload(BaseModel):
    skills: List[str] = []

# --- API ENDPOINTS ---

@app.post("/api/auth/login")
def login(payload: LoginPayload, db: Session = Depends(get_db)):
    student = db.query(StudentModel).filter(StudentModel.email == payload.email).first()

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
        "phone": student.phone or "",
        "location": student.location or "",
        "photo_url": student.photo_url or "",
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
    existing = db.query(StudentModel).filter(StudentModel.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    student_id = f"stu_{int(datetime.datetime.now().timestamp())}"
    student = StudentModel(
        id=student_id,
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        college=payload.college,
        branch=payload.branch,
        current_year=payload.current_year,
        graduation_year=payload.graduation_year,
        cgpa=payload.cgpa,
        skills=json.dumps(["HTML", "CSS", "JavaScript"]),
        soft_skills=json.dumps(["Communication"]),
        projects=json.dumps([]),
        certifications=json.dumps([]),
        experience=json.dumps([]),
        preferred_roles=json.dumps(["Frontend Developer"]),
        preferred_locations=json.dumps(["Remote"]),
        work_mode="Remote",
        duration="3 months",
        profile_completion=50,
        placement_readiness=50
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
        "phone": student.phone or "",
        "location": student.location or "",
        "photo_url": student.photo_url or "",
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

    try:
        from jwt import PyJWKClient

        jwks_client = PyJWKClient("https://www.googleapis.com/oauth2/v3/certs")
        signing_key = jwks_client.get_signing_key_from_jwt(payload.credential)
        claims = jwt.decode(
            payload.credential,
            signing_key.key,
            algorithms=["RS256"],
            audience=client_id,
            issuer=["https://accounts.google.com", "accounts.google.com"],
        )
    except Exception as e:
        print(f"Google sign-in: token verification failed ({e})")
        raise HTTPException(status_code=401, detail="Google sign-in failed. Please try again.")

    email = claims.get("email")
    if not email or not claims.get("email_verified", False):
        raise HTTPException(status_code=401, detail="Google account has no verified email address")

    student = db.query(StudentModel).filter(StudentModel.email == email).first()
    if student is None:
        student = StudentModel(
            id=f"stu_{int(datetime.datetime.now().timestamp())}",
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
        "phone": student.phone or "",
        "location": student.location or "",
        "photo_url": student.photo_url or "",
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


# gemini-1.5-flash and 2.5-flash are retired and 404 for new keys.
# We try a pinned current model first, then fall back to the moving
# "-latest" alias. The alias is convenient but is frequently rate-limited
# (HTTP 503), which would silently drop us to the non-AI fallback.
GEMINI_MODEL_CANDIDATES = ["gemini-3.6-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"]


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
            with urllib.request.urlopen(req, timeout=30) as response:
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
            "breakdown": score_details["breakdown"]
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
        "breakdown": score_details["breakdown"]
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
    
    app_id = f"app_{int(datetime.datetime.now().timestamp())}"
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
            questions = data.get("questions", [])
            if questions:
                return {
                    "role": internship.title,
                    "company": internship.company,
                    "source": "ai",
                    "questions": questions[:3],
                }
        except json.JSONDecodeError:
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
        id=f"int_{int(datetime.datetime.now().timestamp())}",
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
