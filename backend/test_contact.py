"""End-to-end check of the contact email path.

Run it from backend/ with the venv active:

    python test_contact.py

Exits non-zero if anything fails, so it can go straight into CI.

Runs the real _send_contact_email() and the real /api/contact handler.
The only thing replaced is the SMTP transport itself, so what is under
test is the message CareerNexus actually builds: the subject format, the
body format, Reply-To, and whether header injection survives.

Gmail's own authentication is the one part this cannot cover — that needs
the app password, which belongs in the operator's .env and nowhere else.
"""
import os
import sys
import smtplib

os.environ["DATABASE_URL"] = "sqlite:///./contact_test.db"
os.environ["DISABLE_FEED_SYNC"] = "true"
os.environ["SMTP_HOST"] = "smtp.example.test"
os.environ["SMTP_PORT"] = "587"
os.environ["SMTP_USER"] = "careernexus-test@example.test"
os.environ["SMTP_PASSWORD"] = "not-a-real-password"
os.environ["CONTACT_TO"] = "aayushswapnali@gmail.com"

import app.main as m  # noqa: E402

captured = []


class FakeSMTP:
    """Accepts exactly what smtplib.SMTP accepts, records the message."""

    def __init__(self, host, port, timeout=None):
        captured.append({"host": host, "port": port})

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def starttls(self):
        captured[-1]["starttls"] = True

    def login(self, user, password):
        captured[-1]["login_user"] = user

    def send_message(self, msg):
        captured[-1]["msg"] = msg


smtplib.SMTP = FakeSMTP

failures = []


def check(label, condition, detail=""):
    print(f"  {'PASS' if condition else 'FAIL'}  {label}" + (f"  -> {detail}" if detail and not condition else ""))
    if not condition:
        failures.append(label)


print("\n=== 1. A normal message ===")
db = m.SessionLocal()
row = m.ContactMessageModel(
    id=m.new_id("msg"),
    name="Priya Sharma",
    email="priya.sharma@example.com",
    subject="Question about internships",
    message="How do I apply for the PM Internship Scheme through CareerNexus?",
    phone="+91 90000 00000",
    category="General question",
    created_at="2026-09-10T11:30:00",
)
delivered, error = m._send_contact_email(row)
check("delivered is True", delivered, error)
msg = captured[-1]["msg"]

check("STARTTLS used on port 587", captured[-1].get("starttls") is True)
check("subject format", msg["Subject"] == "[CareerNexus Contact] Question about internships", msg["Subject"])
check("To is the configured destination", msg["To"] == "aayushswapnali@gmail.com", msg["To"])
check("Reply-To is the sender", msg["Reply-To"] == "priya.sharma@example.com", msg["Reply-To"])

body = msg.get_content()
for field in ["Name:", "Priya Sharma", "Email:", "priya.sharma@example.com",
              "Subject:", "Message:", "Submitted from:", "CareerNexus Website",
              "Submitted at:", "2026-09-10T11:30:00", "Phone:", "Category:"]:
    check(f"body contains {field!r}", field in body)

print("\n=== 2. Header injection must not survive ===")
evil = m.ContactMessageModel(
    id=m.new_id("msg"),
    name="Bob",
    email="attacker@example.com\nBcc: victim@example.com",
    subject="Hello\nX-Evil: yes\nBcc: someone@example.com",
    message="body",
    created_at="2026-09-10T11:31:00",
)
m._send_contact_email(evil)
emsg = captured[-1]["msg"]
check("no Bcc header was injected", emsg["Bcc"] is None, str(emsg["Bcc"]))
check("no X-Evil header was injected", emsg["X-Evil"] is None, str(emsg["X-Evil"]))
check("subject flattened to one line", "\n" not in emsg["Subject"], repr(emsg["Subject"]))
check("Reply-To flattened to one line", "\n" not in emsg["Reply-To"], repr(emsg["Reply-To"]))
# The right assertion is about header NAMES: the injected text may
# still sit as inert characters inside one header value, which is
# harmless because it creates no new header.
check("no extra headers exist at all",
      set(emsg.keys()) == {"Subject", "From", "To", "Reply-To",
                           "Content-Type", "Content-Transfer-Encoding", "MIME-Version"},
      str(sorted(emsg.keys())))

from fastapi.testclient import TestClient  # noqa: E402
client = TestClient(m.app)

print("")
print("=== 2b. The endpoint rejects the injected address outright ===")
m._contact_hits.clear()
_r = client.post("/api/contact", json={
    "name": "Bob",
    "email": "attacker@example.com\nBcc: victim@example.com",
    "subject": "Hello",
    "message": "This should never reach the mailer at all.",
})
check("injected address rejected with 400", _r.status_code == 400, _r.text)
check("friendly message", "valid email" in _r.text.lower(), _r.text)

m._contact_hits.clear()
print("\n=== 3. The endpoint reports delivery truthfully ===")
r = client.post("/api/contact", json={
    "name": "Test Person",
    "email": "test.person@example.com",
    "subject": "Endpoint check",
    "message": "Checking that the endpoint stores and reports delivery honestly.",
})
check("HTTP 200", r.status_code == 200, r.text)
data = r.json()
check("delivered is True with SMTP working", data.get("delivered") is True, r.text)
check("success wording matches the brief",
      data.get("message") == "Message sent successfully. We'll get back to you soon.", data.get("message"))

m._contact_hits.clear()
print("\n=== 4. When SMTP breaks, the message is still stored and NOT called sent ===")


class BrokenSMTP(FakeSMTP):
    def login(self, user, password):
        raise smtplib.SMTPAuthenticationError(535, b"bad credentials")


smtplib.SMTP = BrokenSMTP
before = db.query(m.ContactMessageModel).count()
r2 = client.post("/api/contact", json={
    "name": "Second Person",
    "email": "second.person@example.com",
    "subject": "Failure path",
    "message": "This one should be stored even though the mail server rejects the login.",
})
after = db.query(m.ContactMessageModel).count()
check("HTTP 200", r2.status_code == 200, r2.text)
check("delivered is False", r2.json().get("delivered") is False, r2.text)
check("does NOT claim it was sent", "sent successfully" not in r2.json().get("message", ""))
check("message was still stored", after == before + 1, f"{before} -> {after}")
stored = db.query(m.ContactMessageModel).filter(
    m.ContactMessageModel.email == "second.person@example.com").first()
check("stored row records the failure", stored is not None and stored.delivered == 0)
check("failure reason recorded", bool(stored and stored.delivery_error), stored.delivery_error if stored else "")

print("\n=== 5. Rate limiting ===")
m._contact_hits.clear()
smtplib.SMTP = FakeSMTP
codes = []
for i in range(4):
    rr = client.post("/api/contact", json={
        "name": f"Rapid {i}",
        "email": f"rapid{i}@example.com",
        "subject": "Rapid fire",
        "message": "Sending several messages in quick succession to test the limiter.",
    })
    codes.append(rr.status_code)
check("first submission accepted", codes[0] == 200, str(codes))
check("rapid repeats are blocked with 429", all(c == 429 for c in codes[1:]), str(codes))

print("\n=== 6. Honeypot stores nothing ===")
m._contact_hits.clear()
before = db.query(m.ContactMessageModel).count()
rh = client.post("/api/contact", json={
    "name": "Bot", "email": "bot@example.com", "subject": "Spam subject",
    "message": "Spam message body that is long enough to pass validation.",
    "website": "http://spam.example",
})
after = db.query(m.ContactMessageModel).count()
check("looks like success to the bot", rh.status_code == 200 and rh.json().get("delivered") is True)
check("nothing was stored", after == before, f"{before} -> {after}")

db.close()
print("\n" + "=" * 58)
print(f"  {len(failures)} failure(s)" if failures else "  ALL CHECKS PASSED")
for f in failures:
    print("   -", f)
sys.exit(1 if failures else 0)
