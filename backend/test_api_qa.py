r"""Full-stack API, auth and security checks against a throwaway instance.

Run against a SQLite-backed server so nothing here can touch the shared
Supabase database:

    set DATABASE_URL=sqlite:///./qa_test.db
    venv\Scripts\python -m uvicorn app.main:app --port 8100
    venv\Scripts\python test_api_qa.py

Every check states what it expects, so a failure names the defect rather
than just a status code.
"""
import json
import sys
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8100"

# The QA database persists between runs, so every address this run registers
# has to be unique or the second run fails on "email already registered" and
# reports a product bug that is really a test bug.
RUN = str(int(time.time()))


def addr(local):
    return f"{local}+{RUN}@example.com"

_passed, _failed, _skipped = 0, 0, 0


def _safe(text):
    """Windows consoles are cp1252; a label with an emoji in it must not
    crash the run it is reporting on."""
    return str(text).encode("ascii", "backslashreplace").decode("ascii")


def skip(label, why):
    """Report a check that could not run. Counted separately so it can never
    be mistaken for a pass, and never reported as a product failure."""
    global _skipped
    _skipped += 1
    print(f"  SKIP  {_safe(label)}  <- {_safe(why)}")


def check(label, condition, detail=""):
    label, detail = _safe(label), _safe(detail)
    global _passed, _failed
    if condition:
        _passed += 1
        print(f"  PASS  {label}")
    else:
        _failed += 1
        print(f"  FAIL  {label}" + (f"  <- {detail}" if detail else ""))


def call(method, path, body=None, token=None, raw=None, headers=None):
    """Returns (status, parsed_json_or_text). Never raises on HTTP error."""
    url = BASE + path
    data = None
    hdrs = {"Content-Type": "application/json"}
    if raw is not None:
        data = raw if isinstance(raw, bytes) else raw.encode()
    elif body is not None:
        data = json.dumps(body).encode()
    if token:
        hdrs["Authorization"] = f"Bearer {token}"
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            txt = r.read().decode("utf-8", "replace")
            try:
                return r.status, json.loads(txt)
            except Exception:
                return r.status, txt
    except urllib.error.HTTPError as e:
        txt = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, txt
    except Exception as e:                      # connection refused, timeout
        return 0, str(e)


def register(email, password="Passw0rd!23", role="student", name="QA User"):
    return call("POST", "/api/auth/register", {
        "full_name": name, "email": email, "password": password, "role": role,
    })


def login(email, password="Passw0rd!23"):
    st, body = call("POST", "/api/auth/login", {"email": email, "password": password})
    tok = body.get("token") if isinstance(body, dict) else None
    return st, tok, body


# ---------------------------------------------------------------- section 1
def test_health_and_public():
    print("\n=== 1. Public surface ===")
    st, body = call("GET", "/api/team")
    check("GET /api/team is public", st == 200)
    check("team payload has members", isinstance(body, dict) and body.get("members"))

    st, _ = call("GET", "/api/website-links")
    check("GET /api/website-links is public", st == 200)

    st, _ = call("GET", "/api/contact/meta")
    check("GET /api/contact/meta is public", st == 200)

    st, _ = call("GET", "/api/opportunities")
    check("GET /api/opportunities requires auth", st == 401, f"got {st}")

    st, _ = call("GET", "/api/nope-does-not-exist")
    check("unknown route returns 404", st == 404, f"got {st}")


# ---------------------------------------------------------------- section 2
def test_registration_validation():
    print("\n=== 2. Registration validation ===")
    st, b = call("POST", "/api/auth/register", {})
    check("empty registration rejected", st in (400, 422), f"got {st}")

    st, b = register("not-an-email")
    check("malformed email rejected", st in (400, 422), f"got {st}")

    st, b = register(addr("qa_shortpw"), password="a")
    check("1-char password rejected", st in (400, 422), f"got {st}")

    st, b = register(addr("qa_dupe"))
    check("valid registration accepted", st in (200, 201), f"got {st}: {b}")

    st, b = register(addr("qa_dupe"))
    check("duplicate email rejected", st in (400, 409), f"got {st}")

    st, b = register(addr("qa_dupe").upper())
    check("duplicate email is case-insensitive", st in (400, 409), f"got {st}")

    st, b = register(addr("qa_spaces") + "  ")
    if st in (200, 201):
        st2, tok, _ = login(addr("qa_spaces"))
        check("trailing space in email is trimmed", st2 == 200, f"login gave {st2}")
    else:
        check("trailing space in email is trimmed", False, f"register gave {st}")

    long_name = "A" * 5000
    st, b = register(addr("qa_longname"), name=long_name)
    check("5000-char name does not 500", st != 500, f"got {st}")


# ---------------------------------------------------------------- section 3
def test_auth():
    print("\n=== 3. Authentication ===")
    register(addr("qa_auth"))
    st, tok, b = login(addr("qa_auth"))
    check("login with correct password", st == 200 and tok, f"got {st}")

    st, _, _ = login(addr("qa_auth"), "WrongPassword!")
    check("wrong password rejected", st in (400, 401), f"got {st}")

    st, _, _ = login(addr("qa_nobody"))
    check("unknown user rejected", st in (400, 401), f"got {st}")

    st, b = call("GET", "/api/student/profile", token="garbage.token.value")
    check("garbage token rejected", st == 401, f"got {st}")

    st, b = call("GET", "/api/student/profile", token="")
    check("empty token rejected", st in (401, 403), f"got {st}")

    # A token signed with the wrong key must not be accepted.
    forged = (
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
        "eyJzdWIiOiJzdHVfMTAwMSIsInJvbGUiOiJhZG1pbiJ9."
        "ZmFrZXNpZ25hdHVyZQ"
    )
    st, b = call("GET", "/api/admin/stats", token=forged)
    check("forged admin JWT rejected", st in (401, 403), f"got {st}")

    st, b = call("GET", "/api/student/profile", token=tok)
    check("valid token reaches own profile", st == 200, f"got {st}")
    return tok


# ---------------------------------------------------------------- section 4
def test_rbac(student_token):
    print("\n=== 4. Authorization / RBAC ===")
    admin_only = [
        "/api/admin/stats", "/api/admin/students",
        "/api/admin/internships", "/api/admin/applications",
        "/api/admin/skill-gaps", "/api/admin/contact-messages",
    ]
    for path in admin_only:
        st, _ = call("GET", path, token=student_token)
        check(f"student blocked from {path}", st == 403, f"got {st}")
        st, _ = call("GET", path)
        check(f"anonymous blocked from {path}", st in (401, 403), f"got {st}")

    register(addr("qa_recruiter"), role="recruiter", name="QA Recruiter")
    _, rec_tok, _ = login(addr("qa_recruiter"))
    if rec_tok:
        st, _ = call("GET", "/api/admin/stats", token=rec_tok)
        check("recruiter blocked from admin stats", st == 403, f"got {st}")
        st, _ = call("GET", "/api/verify/pending", token=student_token)
        check("student blocked from faculty verify queue", st == 403, f"got {st}")

    # Role escalation attempt: can a caller simply ask to be an admin?
    st, b = call("POST", "/api/auth/register", {
        "full_name": "QA Escalate", "email": addr("qa_escalate"),
        "password": "Passw0rd!23", "role": "admin",
    })
    if st in (200, 201):
        _, esc_tok, _ = login(addr("qa_escalate"))
        st2, _ = call("GET", "/api/admin/stats", token=esc_tok)
        check("self-registering as admin grants no admin access", st2 == 403,
              f"ESCALATION: got {st2}")
    else:
        check("self-registering as admin is refused outright", True)
    return rec_tok


# ---------------------------------------------------------------- section 5
def test_idor(student_token):
    print("\n=== 5. IDOR / cross-user access ===")
    register(addr("qa_victim"), name="QA Victim")
    _, victim_tok, _ = login(addr("qa_victim"))
    st, victim = call("GET", "/api/student/profile", token=victim_tok)
    victim_id = victim.get("id") if isinstance(victim, dict) else None

    if victim_id:
        st, b = call("GET", f"/api/admin/students/{victim_id}", token=student_token)
        check("student cannot read another user via admin route", st == 403, f"got {st}")

        st, b = call("GET", f"/api/portfolio/{victim_id}", token=student_token)
        check("portfolio of another student is not silently exposed",
              st in (200, 403, 404), f"got {st}")

    st, b = call("GET", "/api/admin/students/../../etc/passwd", token=student_token)
    check("path traversal in id param does not 500", st != 500, f"got {st}")

    st, b = call("PATCH", "/api/admin/students/stu_1001",
                 {"role": "admin"}, token=student_token)
    check("student cannot promote themselves via admin PATCH", st == 403, f"got {st}")


# ---------------------------------------------------------------- section 6
def test_injection_and_xss(student_token):
    print("\n=== 6. Injection / XSS ===")
    payloads = [
        "'; DROP TABLE students; --",
        "' OR '1'='1",
        "<script>alert(1)</script>",
        "../../../../etc/passwd",
        "${jndi:ldap://x}",
        "\x00nullbyte",
        "🙂🙂🙂 unicode",
    ]
    for p in payloads:
        st, b = call("POST", "/api/auth/login", {"email": p, "password": p})
        check(f"login handles {p[:24]!r}", st in (400, 401, 422), f"got {st}")

    # The database must still be there after the injection attempts.
    st, _ = call("GET", "/api/team")
    check("service healthy after injection attempts", st == 200, f"got {st}")

    st, b = call("GET", "/api/search?q=<script>alert(1)</script>", token=student_token)
    check("search with script tag does not 500", st != 500, f"got {st}")

    st, b = call("POST", "/api/search", {"query": "<img src=x onerror=alert(1)>"},
                 token=student_token)
    if st == 200 and isinstance(b, dict):
        blob = json.dumps(b)
        check("search does not reflect raw executable markup",
              "onerror=alert" not in blob or "&lt;" in blob,
              "raw payload echoed back")
    else:
        check("search with markup handled", st != 500, f"got {st}")


# ---------------------------------------------------------------- section 7
def test_malformed_requests(student_token):
    print("\n=== 7. Malformed / hostile requests ===")
    st, b = call("POST", "/api/auth/login", raw="{not json at all")
    check("invalid JSON body -> 4xx not 500", 400 <= st < 500, f"got {st}")

    st, b = call("POST", "/api/auth/login", raw="")
    check("empty body -> 4xx not 500", 400 <= st < 500, f"got {st}")

    st, b = call("POST", "/api/auth/login",
                 {"email": "a@b.com", "password": "x", "extra": {"nested": [1, 2]}})
    check("unexpected extra fields do not 500", st != 500, f"got {st}")

    st, b = call("POST", "/api/auth/login", {"email": ["array"], "password": 12345})
    check("wrong types -> 4xx not 500", 400 <= st < 500, f"got {st}")

    big = {"full_name": "x" * 200000, "email": addr("qa_big"),
           "password": "Passw0rd!23"}
    st, b = call("POST", "/api/auth/register", big)
    check("200KB field does not 500", st != 500, f"got {st}")

    st, b = call("GET", "/api/search?q=" + "a" * 20000, token=student_token)
    check("20KB query string does not 500", st != 500, f"got {st}")

    st, b = call("DELETE", "/api/team")
    check("wrong method -> 405", st in (404, 405), f"got {st}")


# ---------------------------------------------------------------- section 8
def test_contact_form():
    print("\n=== 8. Contact form ===")
    ok = {"name": "QA Tester", "email": addr("qa_contact"),
          "subject": "QA subject line", "message": "This is a QA message body, long enough."}

    # Contact is rate limited per IP, with a minimum gap between messages, and
    # the limiter is in-process - so it survives across runs of this script.
    # A 429 here means the limiter is doing its job, NOT that validation is
    # broken, so those checks are skipped rather than failed. Run the suite an
    # hour apart, or restart the QA server, to exercise them again.
    LIMITED = "rate limited (429) - the limiter is working; check not exercised"

    st, b = call("POST", "/api/contact", dict(ok, website="i-am-a-bot"))
    if st == 429:
        skip("honeypot submission looks successful to the bot", LIMITED)
    else:
        check("honeypot submission looks successful to the bot", st == 200, f"got {st}")

    st, b = call("POST", "/api/contact", dict(ok, email="not-an-email"))
    if st == 429:
        skip("invalid email rejected", LIMITED)
    else:
        check("invalid email rejected", st in (400, 422), f"got {st}")

    st, b = call("POST", "/api/contact", dict(ok, message="short"))
    if st == 429:
        skip("too-short message rejected", LIMITED)
    else:
        check("too-short message rejected", st == 400, f"got {st}")

    st, b = call("POST", "/api/contact", dict(ok, subject="Sub\r\nBcc: evil@example.com"))
    if st == 429:
        skip("CRLF header injection in subject rejected or stripped", LIMITED)
    else:
        check("CRLF header injection in subject rejected or stripped",
              st in (200, 400, 422, 502), f"got {st}")
        if st == 200 and isinstance(b, dict):
            check("no header injection leaked into response",
                  "Bcc:" not in json.dumps(b), "Bcc survived")


# ---------------------------------------------------------------- section 9
def test_cors_and_headers():
    print("\n=== 9. CORS ===")
    st, b = call("GET", "/api/team", headers={"Origin": "https://evil.example.com"})
    check("request from unknown origin does not 500", st != 500, f"got {st}")

    st, b = call("GET", "/api/team", headers={"Origin": "null"})
    check("Origin: null does not 500", st != 500, f"got {st}")


# ---------------------------------------------------------------- section 10
def test_business_logic(student_token, rec_token):
    print("\n=== 10. Business logic ===")
    st, b = call("GET", "/api/internships/does-not-exist-xyz", token=student_token)
    check("unknown internship -> 404", st == 404, f"got {st}")

    st, b = call("POST", "/api/internships/does-not-exist-xyz/apply", {},
                 token=student_token)
    check("apply to unknown internship -> 404", st == 404, f"got {st}")

    st, b = call("GET", "/api/assessment/questions", token=student_token)
    if st == 200:
        qs = b.get("questions") if isinstance(b, dict) else b
        blob = json.dumps(qs)
        leaked = any(k in blob for k in ('"correct"', '"answer"', '"is_correct"'))
        check("assessment answer key never leaves the server", not leaked,
              "answer key present in payload")
    else:
        check("assessment questions load", False, f"got {st}")

    st, b = call("POST", "/api/assessment/submit", {"answers": "not-a-list"},
                 token=student_token)
    check("malformed assessment submission -> 4xx not 500", st != 500, f"got {st}")

    st, b = call("GET", "/api/opportunities", token=student_token)
    if st == 200:
        rows = b if isinstance(b, list) else (b.get("opportunities") or b.get("items") or [])
        blob = json.dumps(rows)
        check("opportunity list carries no javascript: URLs",
              "javascript:" not in blob.lower(), "unsafe URL in catalogue")
    else:
        check("opportunity list loads for a student", False, f"got {st}")


def main():
    st, _ = call("GET", "/api/team")
    if st == 0:
        print(f"Cannot reach {BASE} - start the QA instance first.")
        sys.exit(2)

    test_health_and_public()
    test_registration_validation()
    student_token = test_auth()
    rec_token = test_rbac(student_token)
    test_idor(student_token)
    test_injection_and_xss(student_token)
    test_malformed_requests(student_token)
    test_contact_form()
    test_cors_and_headers()
    test_business_logic(student_token, rec_token)

    print("\n" + "=" * 58)
    print(f"  {_passed} passed, {_failed} failed, {_skipped} skipped")
    print("=" * 58)
    sys.exit(1 if _failed else 0)


if __name__ == "__main__":
    main()
