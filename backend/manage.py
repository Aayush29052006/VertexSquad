r"""Small admin CLI for tasks there is no UI for yet.

Run from the backend/ folder with the venv active (or use venv\Scripts\python):

    python manage.py set-password  you@example.com
    python manage.py make-admin    teammate@example.com
    python manage.py list-admins

set-password prompts for the new password (twice, hidden) and never echoes it.
"""
import sys
import getpass

from app.main import SessionLocal, StudentModel, hash_password


def _get(db, email):
    s = db.query(StudentModel).filter(StudentModel.email == email.strip().lower()).first()
    if not s:
        # fall back to a case-sensitive match if the stored email has capitals
        s = db.query(StudentModel).filter(StudentModel.email == email.strip()).first()
    return s


def set_password(email):
    db = SessionLocal()
    try:
        s = _get(db, email)
        if not s:
            sys.exit(f"No account for {email!r}")
        pw1 = getpass.getpass("New password: ")
        pw2 = getpass.getpass("Confirm password: ")
        if pw1 != pw2:
            sys.exit("Passwords did not match.")
        if len(pw1) < 8:
            sys.exit("Use at least 8 characters.")
        s.password_hash = hash_password(pw1)
        db.commit()
        print(f"Password updated for {s.email}")
    finally:
        db.close()


def make_admin(email):
    db = SessionLocal()
    try:
        s = _get(db, email)
        if not s:
            sys.exit(f"No account for {email!r} (they must register first)")
        s.role = "admin"
        s.is_active = 1
        db.commit()
        print(f"{s.email} is now an admin")
    finally:
        db.close()


def list_admins():
    db = SessionLocal()
    try:
        admins = db.query(StudentModel).filter(StudentModel.role == "admin").all()
        if not admins:
            print("(no admins)")
        for a in admins:
            print(f"  {a.email}   active={bool(a.is_active)}")
    finally:
        db.close()


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(0)
    cmd = args[0]
    if cmd == "set-password" and len(args) == 2:
        set_password(args[1])
    elif cmd == "make-admin" and len(args) == 2:
        make_admin(args[1])
    elif cmd == "list-admins":
        list_admins()
    else:
        print(__doc__)
        sys.exit(1)
