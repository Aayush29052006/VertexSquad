/**
 * CareerNexus — Shared UI components & helpers
 * Sidebar/navbar rendering, toasts, match-score ring, skill chips,
 * loading/empty/error state builders. Loaded on every authenticated page.
 */

/* The four stakeholder types from the problem statement, plus the platform
   operator. Every nav item declares which of them may see it — but that is
   only cosmetic: the backend re-checks the role on every single request. */
const ROLES = {
  STUDENT: 'student',
  FACULTY: 'faculty',
  RECRUITER: 'recruiter',
  INSTITUTION: 'institution',
  ADMIN: 'admin',
};

const ALL_ROLES = Object.values(ROLES);
const STAFF = [ROLES.FACULTY, ROLES.RECRUITER, ROLES.INSTITUTION, ROLES.ADMIN];

const NAV_ITEMS = [
  { href: 'dashboard.html', icon: '📊', label: 'Dashboard', roles: ALL_ROLES },

  // --- The student journey, in the order a student actually walks it:
  // assess -> see the gap -> learn -> find a role -> apply -> track -> portfolio.
  { href: 'assessment.html', icon: '📝', label: 'Skill Assessment', roles: [ROLES.STUDENT, ROLES.ADMIN] },
  { href: 'profile.html', icon: '👤', label: 'My Profile', roles: ALL_ROLES },
  { href: 'resume.html', icon: '📄', label: 'Resume', roles: [ROLES.STUDENT, ROLES.ADMIN] },
  { href: 'skill-gap.html', icon: '🎯', label: 'Skill Gap', roles: [ROLES.STUDENT, ROLES.ADMIN] },
  { href: 'learning.html', icon: '🎓', label: 'Learning Paths', roles: [ROLES.STUDENT, ROLES.FACULTY, ROLES.ADMIN] },
  { href: 'internships.html', icon: '💼', label: 'Internships', roles: [ROLES.STUDENT, ROLES.ADMIN] },
  { href: 'opportunities.html', icon: '🚀', label: 'Jobs & Opportunities', roles: [ROLES.STUDENT, ROLES.FACULTY, ROLES.ADMIN] },
  // The institute behind SIH26044. Everything on this page is AIIA's own.
  { href: 'aiia.html', icon: '🌿', label: 'AIIA Hub', roles: ALL_ROLES },
  { href: 'applications.html', icon: '📋', label: 'Applications', roles: [ROLES.STUDENT, ROLES.ADMIN] },
  { href: 'what-if.html', icon: '🔮', label: 'What-If Analysis', roles: [ROLES.STUDENT, ROLES.ADMIN] },
  { href: 'documents.html', icon: '🗂️', label: 'My Documents', roles: [ROLES.STUDENT, ROLES.FACULTY, ROLES.ADMIN] },
  { href: 'portfolio.html', icon: '🏅', label: 'My Portfolio', roles: [ROLES.STUDENT, ROLES.ADMIN] },

  // --- Shared across academia and industry.
  { href: 'collaborations.html', icon: '🤝', label: 'Collaborations', roles: ALL_ROLES },

  // --- Industry.
  { href: 'recruiter.html', icon: '🏢', label: 'Recruiter Portal', roles: [ROLES.RECRUITER, ROLES.ADMIN] },
  { href: 'post-opportunity.html', icon: '➕', label: 'Post Opportunity', roles: STAFF },

  // --- Academia.
  { href: 'faculty.html', icon: '🎒', label: 'Faculty Portal', roles: [ROLES.FACULTY, ROLES.ADMIN] },
  { href: 'verify.html', icon: '✅', label: 'Verify Students', roles: STAFF },
  { href: 'institution.html', icon: '📈', label: 'Institution Analytics', roles: [ROLES.INSTITUTION, ROLES.FACULTY, ROLES.ADMIN] },

  // --- Platform operator only.
  { href: 'admin.html', icon: '🛡️', label: 'Admin Panel', roles: [ROLES.ADMIN] },
];

/* ---------- Opened straight from the hard disk? ----------
   Double-clicking an .html file loads it over file://, and the app cannot
   work that way:

     * the browser sends "Origin: null", which is not in the backend's
       allowlist, so every API call is blocked before it is sent
     * the login session lives in localStorage on the http://localhost:5500
       origin, and file:// gets its own empty one

   The symptom is a blank white page with nothing in the console to explain
   it, so say what happened and how to fix it instead. Widening the CORS
   allowlist to accept "null" would silence this, but it would also let any
   HTML file on the machine call the API, so we don't. */
(function warnIfOpenedAsFile() {
  if (window.location.protocol !== 'file:') return;

  const served = 'http://localhost:5500' + window.location.pathname.replace(/^.*\/frontend/, '');
  document.addEventListener('DOMContentLoaded', () => {
    document.body.innerHTML = `
      <div style="max-width:640px;margin:14vh auto;padding:32px;font:15px/1.6 system-ui,sans-serif;
                  color:#1a1d24;background:#fff;border:1px solid #dfe3ea;border-radius:14px;">
        <h1 style="margin:0 0 12px;font-size:1.4rem;">Open CareerNexus through the local server</h1>
        <p style="margin:0 0 16px;">
          This page was opened directly from a folder, so the browser is treating it as a
          local file. CareerNexus needs its server running: opened this way the page cannot
          reach the API or see that you are signed in, which is why it looks empty.
        </p>
        <p style="margin:0 0 8px;font-weight:600;">Do this instead</p>
        <ol style="margin:0 0 18px;padding-left:20px;">
          <li>Run <code style="background:#eef1f6;padding:1px 6px;border-radius:4px;">start.bat</code></li>
          <li>Open <a href="${served}" style="color:#0a7f6b;font-weight:600;">${served}</a></li>
        </ol>
        <p style="margin:0;color:#5b6472;font-size:0.9rem;">
          The address bar should start with <strong>http://localhost:5500</strong>, never
          <strong>file:///</strong>.
        </p>
      </div>`;
  });
})();

function currentRole() {
  return localStorage.getItem('cn_role') || ROLES.STUDENT;
}

function isAdmin() {
  return currentRole() === ROLES.ADMIN;
}

function isStudent() {
  return currentRole() === ROLES.STUDENT;
}

/* True when the signed-in user is one of the roles listed. Admin passes
   every check — the platform operator can reach every portal. */
function hasRole(...roles) {
  const role = currentRole();
  return role === ROLES.ADMIN || roles.includes(role);
}

const ROLE_LABELS = {
  student: 'Student',
  faculty: 'Faculty',
  recruiter: 'Recruiter',
  institution: 'Institution',
  admin: 'Admin',
};

function roleLabel(role) {
  return ROLE_LABELS[role || currentRole()] || 'Student';
}

function themeToggleHtml() {
  return `
    <button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch to light theme" aria-pressed="true">
      <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
      <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>
    </button>`;
}

function currentPageName() {
  const parts = window.location.pathname.split('/');
  return parts[parts.length - 1] || 'dashboard.html';
}

function renderAppShell(activeHref, studentName) {
  const page = currentPageName();
  const initials = (studentName || 'S')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const role = currentRole();
  const links = NAV_ITEMS
    .filter((item) => item.roles.includes(role))
    .map(
      (item) => `
      <a class="sidebar-link${item.href === (activeHref || page) ? ' active' : ''}" href="${item.href}">
        <span class="icon" aria-hidden="true">${item.icon}</span>
        <span>${item.label}</span>
      </a>`
    )
    .join('');

  return `
    <div class="sidebar-backdrop" id="sidebarBackdrop"></div>
    <aside class="sidebar" id="sidebar" aria-label="Primary navigation">
      <div class="sidebar-brand">
        <a class="brand" href="dashboard.html">
          <img class="brand-mark" src="../assets/logos/careernexus-logo.png" alt="" />
          <span class="brand-name">CareerNexus</span>
        </a>
      </div>
      <nav class="sidebar-nav">
        ${links}
      </nav>
      <div class="sidebar-divider"></div>
      <div class="sidebar-footer">
        <a class="sidebar-link${page === 'settings.html' ? ' active' : ''}" href="settings.html"><span class="icon" aria-hidden="true">⚙️</span><span>Settings</span></a>
        <a class="sidebar-link" href="#" id="logoutBtn"><span class="icon" aria-hidden="true">🚪</span><span>Logout</span></a>
      </div>
    </aside>
    <div class="main-content">
      <header class="topbar">
        <button class="mobile-menu-btn btn btn-ghost btn-icon" id="menuToggle" aria-label="Open menu">☰</button>
        <div></div>
        <div class="flex items-center gap-3">
          ${themeToggleHtml()}
          <span class="text-body" style="color:var(--text-primary);font-weight:600;">${escapeHtml(studentName || 'Student')}</span>
          <div class="avatar" aria-hidden="true">${escapeHtml(initials)}</div>
        </div>
      </header>
      <main class="page-body" id="pageBody"></main>
    </div>
  `;
}

function mountAppShell(activeHref, studentName) {
  const shellRoot = document.getElementById('appShell') || document.body;
  shellRoot.innerHTML = renderAppShell(activeHref, studentName);
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const toggle = document.getElementById('menuToggle');
  const closeMenu = () => { sidebar.classList.remove('open'); backdrop.classList.remove('open'); };
  toggle?.addEventListener('click', () => { sidebar.classList.add('open'); backdrop.classList.add('open'); });
  backdrop?.addEventListener('click', closeMenu);
  document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    const wasAdmin = isAdmin();
    localStorage.removeItem('cn_token');
    localStorage.removeItem('cn_student_name');
    localStorage.removeItem('cn_role');
    // Team members land back on the team sign-in; students on the student one.
    window.location.href = wasAdmin ? 'admin-login.html' : 'login.html';
  });
  return document.getElementById('pageBody');
}

function requireAuth() {
  if (!localStorage.getItem('cn_token')) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

// Guard for admin-only pages. The backend still enforces the real check on
// every /api/admin/* request; this just avoids showing a broken page.
// Anyone not signed in as an admin is sent to the team sign-in page.
function requireAdmin() {
  if (!localStorage.getItem('cn_token') || !isAdmin()) {
    window.location.href = 'admin-login.html';
    return false;
  }
  return true;
}

/* ---------- Toasts ---------- */
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast${type === 'success' ? ' toast-success' : ''}${type === 'error' ? ' toast-error' : ''}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

/* ---------- Match score ring ---------- */
function matchRingSvg(score, size = 84) {
  const pct = Math.max(0, Math.min(100, Number(score) || 0));
  const { tier } = getMatchTier(pct);
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  return `
    <div class="match-ring match-${tier}" style="width:${size}px;height:${size}px;">
      <svg viewBox="0 0 ${size} ${size}">
        <circle class="ring-bg" cx="${size / 2}" cy="${size / 2}" r="${radius}"></circle>
        <circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${radius}"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle>
      </svg>
      <div class="ring-value">${pct}%</div>
    </div>
  `;
}

function matchBadge(score) {
  const { tier, label } = getMatchTier(score);
  return `<span class="badge badge-${tier === 'excellent' ? 'success' : tier === 'good' ? 'info' : tier === 'moderate' ? 'warning' : 'danger'}">${label}</span>`;
}

/* ---------- Links to official external sources ----------
   Most of what this platform lists is run by somebody else: a government
   scheme, a company's careers page, an official learning platform. Those
   listings must send the student to the real source rather than to a page
   of ours pretending to own them.

   Every such link says where it goes, opens in a new tab, and carries the
   ↗ mark, so nobody clicks expecting to stay on CareerNexus. */

function externalHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_) {
    return '';
  }
}

/* A button that leaves the site. Returns '' for anything that is not a
   valid http(s) URL, so a bad link renders as no button at all rather
   than as a dead one. */
function officialLinkButton(url, label = 'Official Website', className = 'btn btn-primary btn-sm') {
  const safe = safeUrl(url);
  if (!safe) return '';
  const host = externalHost(safe);
  return `<a class="${className} external-link" href="${escapeHtml(safe)}"
             target="_blank" rel="noopener noreferrer"
             title="Opens ${escapeHtml(host)} in a new tab">${escapeHtml(label)}<span class="ext-arrow" aria-hidden="true">↗</span><span class="sr-only"> (opens ${escapeHtml(host)} in a new tab)</span></a>`;
}

/* Small label naming who actually runs a listing. */
function sourceBadge(item) {
  if ((item.source_type || 'platform') !== 'external') {
    return '<span class="source-badge source-platform">Posted on CareerNexus</span>';
  }
  const who = item.source_name || item.company || 'Official source';
  const host = externalHost(item.official_url || '');
  return `<span class="source-badge source-official" title="${escapeHtml(host)}">🌐 ${escapeHtml(who)}</span>`;
}

function isExternalListing(item) {
  return (item.source_type || 'platform') === 'external';
}

/* ---------- Skill chips ---------- */
function skillChip(name, variant = 'default') {
  const cls = variant === 'missing' ? 'skill-chip chip-missing' : 'skill-chip';
  const icon = variant === 'missing' ? '○' : '✓';
  return `<span class="${cls}">${icon} ${escapeHtml(name)}</span>`;
}

/* ---------- State builders ---------- */
function loadingState(message = 'Loading...') {
  return `<div class="loading-state"><div class="spinner spinner-lg"></div><p>${escapeHtml(message)}</p></div>`;
}

function errorState(message, retryFnName) {
  return `
    <div class="state-block">
      <div class="state-icon">⚠️</div>
      <div class="state-title">Something went wrong</div>
      <p class="state-text">${escapeHtml(message)}</p>
      ${retryFnName ? `<button class="btn btn-primary" onclick="${retryFnName}()">Try Again</button>` : ''}
    </div>
  `;
}

function emptyState(icon, title, text, ctaHtml = '') {
  return `
    <div class="state-block">
      <div class="state-icon">${escapeHtml(icon)}</div>
      <div class="state-title">${escapeHtml(title)}</div>
      <p class="state-text">${escapeHtml(text)}</p>
      ${ctaHtml}
    </div>
  `;
}

function skeletonCards(count = 3) {
  return Array.from({ length: count }).map(() => '<div class="skeleton skeleton-card"></div>').join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

/* Make a URL safe to use as an href.
   escapeHtml is not enough on its own: "javascript:alert(1)" contains no
   HTML characters, so it survives escaping intact and then runs when the
   link is clicked. Anything that is not plain http(s) is dropped. */
function safeUrl(url) {
  const raw = (url ?? '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
  } catch (_) {
    return ''; // unparseable — treat as no link at all
  }
}

/* ---------- Internship card ---------- */
function internshipCardHtml(item) {
  const pct = Math.max(0, Math.min(100, Number(item.match_score) || 0));
  const { tier } = getMatchTier(pct);
  const matchedChips = item.matched_skills.map((s) => skillChip(s)).join('');
  const missingChips = item.missing_skills.length
    ? `<div class="mt-2"><p class="text-label mb-1">Missing</p><div class="internship-chips">${item.missing_skills.map((s) => skillChip(s, 'missing')).join('')}</div></div>`
    : '';
  return `
    <article class="card card-hover internship-card">
      <div class="internship-card-head">
        <div>
          <h3 class="text-card-heading">${escapeHtml(item.title)}</h3>
          <p class="company-name">${escapeHtml(item.company)}</p>
        </div>
        <div class="match-ring match-${tier}" style="width:56px;height:56px;flex-shrink:0;">
          <svg viewBox="0 0 56 56">
            <circle class="ring-bg" cx="28" cy="28" r="24"></circle>
            <circle class="ring-fg" cx="28" cy="28" r="24" stroke-dasharray="${2 * Math.PI * 24}" stroke-dashoffset="${2 * Math.PI * 24 * (1 - pct / 100)}"></circle>
          </svg>
          <div class="ring-value" style="font-size:0.85rem;">${pct}%</div>
        </div>
      </div>
      <div class="internship-meta">
        <span>📍 ${escapeHtml(item.location)}</span>
        <span>💻 ${escapeHtml(item.work_mode)}</span>
        <span>💰 ${escapeHtml(item.stipend)}</span>
      </div>
      <div class="internship-chips">${matchedChips}</div>
      ${missingChips}
      <div class="internship-footer">
        <span class="text-caption">${item.deadline ? `Deadline: ${formatDate(item.deadline)}` : 'Open until filled'}</span>
        ${
          isExternalListing(item)
            ? officialLinkButton(item.official_url, 'Official Website')
            : `<a class="btn btn-primary btn-sm" href="internship-details.html?id=${encodeURIComponent(item.id)}">View Details</a>`
        }
      </div>
    </article>
  `;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return escapeHtml(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}
