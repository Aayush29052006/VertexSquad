/**
 * CareerNexus — Team & Contact
 *
 * One page, two sections: who built this, and how to reach them.
 *
 * Public by design. Someone who has never signed in must be able to read
 * the team page and send a message, so the page renders a plain header
 * when there is no session and the full app shell when there is.
 *
 * The team list comes from data/team.json and shows two things only:
 * name and work title. No bios, photos, skills, profile links or personal
 * contact details — that is a deliberate choice about what belongs on a
 * public page, not an unfinished section. A title nobody has supplied
 * shows as a visible placeholder rather than an invented job title.
 */

const TEAM_FALLBACK_MSG =
  'Could not load the team list right now.';

/* Mirrors the backend's CONTACT_MAX so the counter and the server agree. */
const CONTACT_LIMITS = { name: 120, email: 254, subject: 200, message: 5000, phone: 40 };

let contactCategories = [];
let contactEmail = '';
let contactSubmitting = false;

/* ---------- Team ---------- */

function memberCard(m) {
  const title = (m.title || '').trim();
  const bio = (m.bio || '').trim();
  return `
    <article class="card team-card">
      <p class="team-name">${escapeHtml(m.name)}</p>
      ${
        title
          ? `<p class="team-role">${escapeHtml(title)}</p>`
          // Shown until someone fills in the title. Visibly a placeholder,
          // so it can never be mistaken for a real job title.
          : '<p class="team-role team-role--empty">Work title to be added</p>'
      }
      ${
        // No bio means no element at all — a card without one falls back
        // to name and title rather than showing an empty gap or a
        // stand-in sentence nobody wrote.
        bio ? `<p class="team-bio">${escapeHtml(bio)}</p>` : ''
      }
    </article>`;
}

function teamSection(data) {
  const meta = data.meta || {};
  const members = Array.isArray(data.members) ? data.members : [];

  if (!members.length) {
    return `<section class="team-block" id="team">
      <h2 class="text-section-heading">Meet the Team</h2>
      ${emptyState('👥', 'Team details are not published yet', 'Add the team to frontend/data/team.json and they will appear here.')}
    </section>`;
  }

  return `
    <section class="team-block" id="team">
      <div class="team-intro">
        <h2 class="text-section-heading">Meet the Team</h2>
        ${meta.tagline ? `<p class="text-body mt-2">${escapeHtml(meta.tagline)}</p>` : ''}
        <p class="text-caption mt-2">
          ${escapeHtml(meta.team_name || 'Team VertexSquad')}${
            meta.event ? ` · ${escapeHtml(meta.event)}` : ''
          }${meta.problem_statement ? ` · Problem Statement ${escapeHtml(meta.problem_statement)}` : ''}
        </p>
      </div>
      <div class="team-grid">${members.map(memberCard).join('')}</div>
    </section>`;
}

/* ---------- Contact ---------- */

function contactSection() {
  return `
    <section class="contact-block" id="contact">
      <div class="contact-intro">
        <h2 class="text-section-heading">Get in Touch</h2>
        <p class="text-body mt-2">
          Have a question, feedback, an issue, or a collaboration idea?
          Contact the CareerNexus team.
        </p>
        <p class="text-caption mt-2" id="contactEmailLine"></p>
      </div>

      <form class="card contact-form" id="contactForm" novalidate>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="cfName">Full Name <span class="req" aria-hidden="true">*</span></label>
            <input class="form-input" type="text" id="cfName" name="name"
                   maxlength="${CONTACT_LIMITS.name}" autocomplete="name" required />
            <p class="form-error" id="cfNameError" hidden></p>
          </div>
          <div class="form-group">
            <label class="form-label" for="cfEmail">Email <span class="req" aria-hidden="true">*</span></label>
            <input class="form-input" type="email" id="cfEmail" name="email"
                   maxlength="${CONTACT_LIMITS.email}" autocomplete="email" required />
            <p class="form-error" id="cfEmailError" hidden></p>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="cfPhone">Phone <span class="opt">(optional)</span></label>
            <input class="form-input" type="tel" id="cfPhone" name="phone"
                   maxlength="${CONTACT_LIMITS.phone}" autocomplete="tel" />
          </div>
          <div class="form-group">
            <label class="form-label" for="cfCategory">Reason <span class="opt">(optional)</span></label>
            <select class="form-select" id="cfCategory" name="category">
              <option value="">Select a reason</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="cfSubject">Subject <span class="req" aria-hidden="true">*</span></label>
          <input class="form-input" type="text" id="cfSubject" name="subject"
                 maxlength="${CONTACT_LIMITS.subject}" required />
          <p class="form-error" id="cfSubjectError" hidden></p>
        </div>

        <div class="form-group">
          <label class="form-label" for="cfMessage">Message <span class="req" aria-hidden="true">*</span></label>
          <textarea class="form-textarea" id="cfMessage" name="message" rows="6"
                    maxlength="${CONTACT_LIMITS.message}" required></textarea>
          <div class="contact-meta-row">
            <p class="form-error" id="cfMessageError" hidden></p>
            <span class="contact-count" id="cfCount">0 / ${CONTACT_LIMITS.message}</span>
          </div>
        </div>

        <!-- Honeypot: hidden from people, tempting to a naive bot. Not
             display:none, because some bots skip those. -->
        <div class="contact-hp" aria-hidden="true">
          <label for="cfWebsite">Website</label>
          <input type="text" id="cfWebsite" name="website" tabindex="-1" autocomplete="off" />
        </div>

        <button class="btn btn-primary btn-lg" type="submit" id="cfSubmit">Send Message</button>
        <p class="contact-status" id="cfStatus" role="status" aria-live="polite" hidden></p>
      </form>
    </section>`;
}

function showFieldError(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.hidden = !message;
}

function clearContactErrors() {
  ['cfNameError', 'cfEmailError', 'cfSubjectError', 'cfMessageError'].forEach((id) =>
    showFieldError(id, '')
  );
  const status = document.getElementById('cfStatus');
  if (status) status.hidden = true;
}

/* Same rules the backend enforces. Client-side validation is for a fast,
   clear message — the server re-checks all of it, because anything the
   browser says can be forged. */
function validateContact(values) {
  let ok = true;
  if (values.name.length < 2) {
    showFieldError('cfNameError', 'Please enter your name.');
    ok = false;
  }
  // Deliberately loose: over-clever email regexes reject valid addresses.
  // The real check is the backend's EmailStr.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) {
    showFieldError('cfEmailError', 'Please enter a valid email address.');
    ok = false;
  }
  if (values.subject.length < 3) {
    showFieldError('cfSubjectError', 'Please enter a subject.');
    ok = false;
  }
  if (values.message.length < 10) {
    showFieldError('cfMessageError', 'Please enter a message of at least 10 characters.');
    ok = false;
  }
  return ok;
}

function setContactStatus(kind, text) {
  const status = document.getElementById('cfStatus');
  if (!status) return;
  status.className = `contact-status contact-status--${kind}`;
  status.textContent = text;
  status.hidden = false;
}

async function handleContactSubmit(e) {
  e.preventDefault();
  if (contactSubmitting) return;
  clearContactErrors();

  const values = {
    name: document.getElementById('cfName').value.trim(),
    email: document.getElementById('cfEmail').value.trim(),
    subject: document.getElementById('cfSubject').value.trim(),
    message: document.getElementById('cfMessage').value.trim(),
    phone: document.getElementById('cfPhone').value.trim(),
    category: document.getElementById('cfCategory').value,
    website: document.getElementById('cfWebsite').value,
  };

  if (!validateContact(values)) return;

  const btn = document.getElementById('cfSubmit');
  contactSubmitting = true;
  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    const res = await api.sendContactMessage(values);
    // Success is only ever claimed when the backend confirms the email
    // actually went out. It answers 502 when the send failed, so this
    // branch is not even reached then — but the flag is checked as well,
    // because "the request worked" and "the email arrived" are different
    // things and only the second one earns a success message.
    if (!res.delivered) {
      throw new Error('Unable to send your message right now. Please try again.');
    }
    setContactStatus('ok', res.message || "Message sent successfully. We'll get back to you soon.");
    // Cleared only on a real send, so a failed attempt keeps what was
    // typed and can be retried without writing it all out again.
    document.getElementById('contactForm').reset();
    document.getElementById('cfCount').textContent = `0 / ${CONTACT_LIMITS.message}`;
  } catch (err) {
    setContactStatus('err', err.message || 'Unable to send your message right now. Please try again.');
  } finally {
    contactSubmitting = false;
    btn.disabled = false;
    btn.textContent = 'Send Message';
  }
}

function wireContact() {
  const form = document.getElementById('contactForm');
  if (!form) return;
  form.addEventListener('submit', handleContactSubmit);

  const message = document.getElementById('cfMessage');
  const count = document.getElementById('cfCount');
  message?.addEventListener('input', () => {
    count.textContent = `${message.value.length} / ${CONTACT_LIMITS.message}`;
  });

  // Clear a field's error as soon as the person starts fixing it.
  [['cfName', 'cfNameError'], ['cfEmail', 'cfEmailError'],
   ['cfSubject', 'cfSubjectError'], ['cfMessage', 'cfMessageError']].forEach(([input, error]) => {
    document.getElementById(input)?.addEventListener('input', () => showFieldError(error, ''));
  });
}

async function loadContactMeta() {
  try {
    const meta = await api.getContactMeta();
    contactCategories = meta.categories || [];
    contactEmail = meta.contact_email || '';

    const select = document.getElementById('cfCategory');
    if (select) {
      select.innerHTML =
        '<option value="">Select a reason</option>' +
        contactCategories
          .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
          .join('');
    }
    const line = document.getElementById('contactEmailLine');
    if (line && contactEmail) {
      line.innerHTML = `Or email us directly at <a href="mailto:${escapeHtml(contactEmail)}" style="color:var(--primary);font-weight:600;">${escapeHtml(contactEmail)}</a>`;
    }
  } catch (_) {
    // The form still works without this — the category list is optional
    // and the server fills in the destination address itself.
  }
}

/* ---------- Page ---------- */

(async function initTeamPage() {
  const signedIn = !!localStorage.getItem('cn_token');
  let pageBody;

  if (signedIn) {
    pageBody = mountAppShell('team.html', localStorage.getItem('cn_student_name') || 'Student');
  } else {
    // Public view: same header as a shared portfolio, no sidebar, no
    // login wall. Reaching the team must never require an account.
    document.body.classList.add('public-portfolio');
    document.getElementById('appShell').innerHTML = `
      <div class="public-wrap">
        <header class="public-topbar">
          <a class="brand" href="../index.html">
            <img class="brand-mark" src="../assets/logos/careernexus-logo.png" alt="" />
            <span class="brand-name">CareerNexus</span>
          </a>
          <a class="btn btn-secondary btn-sm" href="login.html">Log In</a>
        </header>
        <main class="page-body" id="pageBody"></main>
      </div>`;
    pageBody = document.getElementById('pageBody');
  }

  pageBody.innerHTML = `
    <h1 class="text-page-heading">Team &amp; Contact</h1>
    <p class="text-body mt-2">The people behind CareerNexus, and how to reach them.</p>
    <div id="teamHost" class="mt-5">${loadingState('Loading the team...')}</div>
    ${contactSection()}
  `;

  wireContact();
  loadContactMeta();

  // Read the same file the backend reads. Fetched rather than baked in,
  // so editing data/team.json is genuinely all it takes.
  const host = document.getElementById('teamHost');
  try {
    const res = await fetch('../data/team.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    host.innerHTML = teamSection(await res.json());
  } catch (err) {
    // Fall back to the API, which serves the same file from the server.
    try {
      host.innerHTML = teamSection(await api.getTeam());
    } catch (_) {
      host.innerHTML = errorState(`${TEAM_FALLBACK_MSG} (${err.message})`, 'location.reload');
    }
  }

  // Arriving at team.html#contact should land on the form. Deferred by
  // two frames: the team cards were injected a moment ago and the browser
  // has not finished laying them out, so scrolling immediately aims at
  // the wrong offset.
  if (window.location.hash === '#contact') {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
    );
  }
})();
