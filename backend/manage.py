r"""Small admin CLI for tasks there is no UI for yet.

Run from the backend/ folder with the venv active (or use venv\Scripts\python):

    python manage.py set-password  you@example.com
    python manage.py make-admin    teammate@example.com
    python manage.py list-admins
    python manage.py reseed

set-password prompts for the new password (twice, hidden) and never echoes it.
"""
import sys
import app.main
import getpass

from app.main import SessionLocal, StudentModel, hash_password



def reseed():
    """Clear the seed marker so the next startup re-runs the seeders.

    Startup skips seeding when app_meta.seed_version matches SEED_VERSION,
    because re-running it costs ~20s of round trips to change nothing. Use
    this after editing catalogue data if you did not bump SEED_VERSION.

    It only deletes the marker row - it does not touch any real data, and
    the seeders themselves are idempotent, so this is safe to run at any
    time. Restart the backend afterwards.
    """
    from app.main import AppMetaModel
    db = SessionLocal()
    try:
        row = db.query(AppMetaModel).filter(AppMetaModel.key == "seed_version").first()
        if row is None:
            print("No seed marker set - the next startup would seed anyway.")
            return
        db.delete(row)
        db.commit()
        print("Seed marker cleared. Restart the backend to re-run the seeders.")
    finally:
        db.close()

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


def test_email():
    """Send one real email using the settings in backend/.env.

    This is the honest way to answer "is the contact form actually
    working" - it uses the same _send_contact_email() the website calls,
    against the real mail server, and prints the provider's own error if
    it fails.
    """
    import datetime

    print("Contact email configuration")
    print(f"  SMTP_HOST     {app.main.SMTP_HOST or '(not set)'}")
    print(f"  SMTP_PORT     {app.main.SMTP_PORT}")
    print(f"  SMTP_USER     {app.main.SMTP_USER or '(not set)'}")
    print(f"  SMTP_PASSWORD {'set (' + str(len(app.main.SMTP_PASSWORD)) + ' chars)' if app.main.SMTP_PASSWORD else '(not set)'}")
    print(f"  CONTACT_TO    {app.main.CONTACT_TO}")
    print()

    missing = [k for k, v in (("SMTP_HOST", app.main.SMTP_HOST),
                              ("SMTP_USER", app.main.SMTP_USER),
                              ("SMTP_PASSWORD", app.main.SMTP_PASSWORD)) if not v]
    if missing:
        print("NOT CONFIGURED - missing: " + ", ".join(missing))
        print()
        print("Add these to backend/.env, then run this again:")
        print()
        print("  SMTP_HOST=smtp.gmail.com")
        print("  SMTP_PORT=587")
        print("  SMTP_USER=your.address@gmail.com")
        print("  SMTP_PASSWORD=<16-character Gmail App Password>")
        print("  CONTACT_TO=aayushswapnali@gmail.com")
        print()
        print("Gmail rejects your normal account password. Turn on 2-Step")
        print("Verification, then create an App Password at")
        print("  https://myaccount.google.com/apppasswords")
        sys.exit(1)

    row = app.main.ContactMessageModel(
        id="manage-test",
        name="CareerNexus Test",
        email=app.main.CONTACT_TO,
        subject="Contact form delivery test",
        message="Sent by `python manage.py test-email`. If this arrived, the "
                "contact form can deliver mail.",
        phone="",
        category="",
        created_at=datetime.datetime.now().isoformat(timespec="seconds"),
    )
    print(f"Sending to {app.main.CONTACT_TO} ...")
    delivered, error = app.main._send_contact_email(row)
    if delivered:
        print()
        print(f"ACCEPTED by {app.main.SMTP_HOST}.")
        print(f"Check {app.main.CONTACT_TO} - including Spam and Promotions.")
        print("The mail server accepting it is not the same as it landing in")
        print("the inbox, so confirm it visually before calling this done.")
    else:
        print()
        print("FAILED - the mail server refused it:")
        print(f"  {error}")
        print()
        if "Authentication" in error or "535" in error:
            print("535/Authentication usually means SMTP_PASSWORD is a normal")
            print("account password rather than a Gmail App Password.")
        sys.exit(1)


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
    elif cmd == "reseed":
        reseed()
    elif cmd == "test-email":
        test_email()
    else:
        print(__doc__)
        sys.exit(1)
