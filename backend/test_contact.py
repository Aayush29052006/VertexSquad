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
check("answers 502, not 200", r2.status_code == 502, r2.text)
check("error text is the one the UI shows",
      r2.json().get("detail") == "Unable to send your message right now. Please try again.", r2.text)
check("does NOT claim it was sent", "sent successfully" not in r2.text)
check("message was still stored", after == before + 1, f"{before} -> {after}")
stored = db.query(m.ContactMessageModel).filter(
    m.ContactMessageModel.email == "second.person@example.com").first()
check("stored row records the failure", stored is not None and stored.delivered == 0)
check("failure reason recorded", bool(stored and stored.delivery_error), stored.delivery_error if stored else "")

print("\n=== 4b. Validation: rejected, never silently truncated ===")
m._contact_hits.clear()
for label, payload, expect in [
    ("invalid email", {"name": "A Tester", "email": "nope", "subject": "Subject here",
                       "message": "A long enough message body."}, "valid email address"),
    ("empty name", {"name": "", "email": "a@b.com", "subject": "Subject here",
                    "message": "A long enough message body."}, "enter your name"),
    ("empty subject", {"name": "A Tester", "email": "a@b.com", "subject": "",
                       "message": "A long enough message body."}, "enter a subject"),
    ("short message", {"name": "A Tester", "email": "a@b.com", "subject": "Subject here",
                       "message": "hi"}, "at least 10 characters"),
    ("over-long message", {"name": "A Tester", "email": "a@b.com", "subject": "Subject here",
                           "message": "m" * 9000}, "too long"),
    ("over-long name", {"name": "N" * 500, "email": "a@b.com", "subject": "Subject here",
                        "message": "A long enough message body."}, "too long"),
]:
    rr = client.post("/api/contact", json=payload)
    check(label + " -> 400", rr.status_code == 400, str(rr.status_code) + " " + rr.text)
    check(label + " -> readable reason", expect in rr.text, rr.text)

# A rejected attempt must not cost the sender their allowance, or a typo
# locks them out for 20 seconds.
before_len = len(m._contact_hits.get("testclient", []))
client.post("/api/contact", json={"name": "", "email": "a@b.com",
                                  "subject": "x", "message": "y"})
check("a rejected attempt does not consume the rate limit",
      len(m._contact_hits.get("testclient", [])) == before_len)


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


print("\n=== 7. Resend over HTTPS (Render's free plan blocks SMTP ports) ===")
import io  # noqa: E402
import json  # noqa: E402
import urllib.error  # noqa: E402
import urllib.request  # noqa: E402

sent = []
KEY = "re_test_key_do_not_leak_123"


class FakeResp:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self):
        return b'{"id":"abc"}'


def urlopen_ok(req, timeout=None):
    sent.append({
        "url": req.full_url,
        "method": req.get_method(),
        "headers": {k.lower(): v for k, v in req.header_items()},
        "json": json.loads(req.data.decode()),
    })
    return FakeResp()


def urlopen_denied(req, timeout=None):
    raise urllib.error.HTTPError(
        req.full_url, 403, "Forbidden", {}, io.BytesIO(b'{"message":"You can only send to your own address"}'))


class NoSMTP:
    def __init__(self, *a, **k):
        raise AssertionError("SMTP must not be touched when Resend is configured")


saved = (m.RESEND_API_KEY, m.SMTP_HOST, m.SMTP_USER, m.SMTP_PASSWORD, urllib.request.urlopen, smtplib.SMTP)
m.RESEND_API_KEY, m.SMTP_HOST, m.SMTP_USER, m.SMTP_PASSWORD = KEY, "", "", ""
smtplib.SMTP = NoSMTP
urllib.request.urlopen = urlopen_ok

ok, err = m._send_contact_email(row)
check("delivered via Resend with no SMTP settings at all", ok, err)
req = sent[-1]
check("posts to Resend's HTTPS API", req["url"] == "https://api.resend.com/emails" and req["method"] == "POST", req["url"])
check("authenticates with the key", req["headers"].get("authorization") == f"Bearer {KEY}")
check("identifies itself (Cloudflare rejects the default urllib agent)", req["headers"].get("user-agent", "").startswith("CareerNexus"))
p = req["json"]
check("goes to the configured destination", p["to"] == ["aayushswapnali@gmail.com"], str(p["to"]))
check("Reply-To is the sender", p["reply_to"] == "priya.sharma@example.com", p["reply_to"])
check("subject format", p["subject"] == "[CareerNexus Contact] Question about internships", p["subject"])
check("body carries the message", "Priya Sharma" in p["text"] and "PM Internship Scheme" in p["text"])
check("from address is Resend's shared sender", p["from"].endswith("<onboarding@resend.dev>"), p["from"])

m._send_contact_email(evil)
pe = sent[-1]["json"]
check("injected subject/reply-to flattened to one line", "\n" not in pe["subject"] and "\n" not in pe["reply_to"], repr(pe))
check("payload has exactly the expected fields", set(pe) == {"from", "to", "reply_to", "subject", "text"}, str(sorted(pe)))

m._contact_hits.clear()
check("meta reports email as configured", client.get("/api/contact/meta").json().get("email_configured") is True)
r7 = client.post("/api/contact", json={
    "name": "Resend Person", "email": "resend.person@example.com",
    "subject": "Resend endpoint", "message": "Checking the endpoint end to end over the HTTPS path.",
})
check("endpoint answers 200 and delivered", r7.status_code == 200 and r7.json().get("delivered") is True, r7.text)

print("\n--- 7b. Resend refuses: stored, honest 502, key never leaks ---")
urllib.request.urlopen = urlopen_denied
m._contact_hits.clear()
r8 = client.post("/api/contact", json={
    "name": "Denied Person", "email": "denied.person@example.com",
    "subject": "Denied path", "message": "Resend rejects this one, it must still be stored.",
})
check("answers 502, not 200", r8.status_code == 502, r8.text)
stored8 = db.query(m.ContactMessageModel).filter(
    m.ContactMessageModel.email == "denied.person@example.com").first()
check("message still stored, marked undelivered", stored8 is not None and stored8.delivered == 0)
check("failure reason recorded with the API's own text",
      bool(stored8 and stored8.delivery_error.startswith("Resend HTTP 403")), stored8.delivery_error if stored8 else "")
check("API key never appears in the stored error or the response",
      KEY not in (stored8.delivery_error if stored8 else "") and KEY not in r8.text)

print("\n--- 7c. Nothing configured at all ---")
m.RESEND_API_KEY = ""
m._contact_hits.clear()
check("meta reports email as NOT configured", client.get("/api/contact/meta").json().get("email_configured") is False)
r9 = client.post("/api/contact", json={
    "name": "Unconfigured Person", "email": "unconfigured@example.com",
    "subject": "No mail settings", "message": "There is nothing to send this with, so it must say so."})
check("still answers 502, never a fake success", r9.status_code == 502, r9.text)

(m.RESEND_API_KEY, m.SMTP_HOST, m.SMTP_USER, m.SMTP_PASSWORD, urllib.request.urlopen, smtplib.SMTP) = saved

db.close()
print("\n" + "=" * 58)
print(f"  {len(failures)} failure(s)" if failures else "  ALL CHECKS PASSED")
for f in failures:
    print("   -", f)
sys.exit(1 if failures else 0)
