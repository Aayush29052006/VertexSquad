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

/* `group` sorts a role's items into labelled, collapsible sections in the
   sidebar (see renderAppShell). It changes nothing about routing, access or
   search — search-core.js reads href/label/roles only and never looks at
   this field. Grouping exists purely so a 17-link list reads as five short
   ones instead of one long scroll. */
const NAV_ITEMS = [
  { href: 'dashboard.html', icon: '📊', label: 'Dashboard', roles: ALL_ROLES, group: 'Main' },
  // Discovery across every verified source in one place.
  { href: 'search.html', icon: '🔍', label: 'Search Opportunities', roles: ALL_ROLES, group: 'Main' },

  // --- The student journey, in the order a student actually walks it:
  // assess -> see the gap -> learn -> find a role -> apply -> track -> portfolio.
  { href: 'assessment.html', icon: '📝', label: 'Skill Assessment', roles: [ROLES.STUDENT, ROLES.ADMIN], group: 'Career Development' },
  // Skill Gap is not a top-level destination on its own — it needs a
  // specific opportunity (?id=) to mean anything, and with none given it
  // just falls back to whichever recommendation loads first. It is reached
  // from where it is actually relevant: the "Where Your Gaps Show Up" card
  // on the assessment result, each opportunity's own details page, and
  // What-If. The page itself still exists at skill-gap.html.
  { href: 'what-if.html', icon: '🔮', label: 'What-If Analysis', roles: [ROLES.STUDENT, ROLES.ADMIN], group: 'Career Development' },
  { href: 'learning.html', icon: '🎓', label: 'Learning Paths', roles: [ROLES.STUDENT, ROLES.FACULTY, ROLES.ADMIN], group: 'Career Development' },

  // My Profile now carries what My Portfolio used to show separately —
  // verification stamps, credibility score, the public share link — since
  // it was the same underlying data with nothing distinct to justify two
  // destinations. portfolio.html still exists for that public link.
  { href: 'profile.html', icon: '👤', label: 'My Profile', roles: ALL_ROLES, group: 'Career Profile' },
  // Resume upload + Documents merged onto one page (resume.html) - a
  // faculty account sees only the Documents tab there, so it keeps the
  // wider role list of the two.
  { href: 'resume.html', icon: '📄', label: 'Resume & Documents', roles: [ROLES.STUDENT, ROLES.FACULTY, ROLES.ADMIN], group: 'Career Profile' },

  // Jobs & Opportunities already carries internships as one of its filterable
  // types — a separate Internships page browsing the same /api/opportunities
  // catalogue had nothing left that this one didn't already do, and less.
  { href: 'opportunities.html', icon: '🚀', label: 'Jobs & Opportunities', roles: [ROLES.STUDENT, ROLES.FACULTY, ROLES.ADMIN], group: 'Opportunities & Applications' },
  { href: 'applications.html', icon: '📋', label: 'Applications', roles: [ROLES.STUDENT, ROLES.ADMIN], group: 'Opportunities & Applications' },

  // Auto-collected official notices, vacancies and tenders, with deadlines.
  { href: 'updates.html', icon: '🔔', label: 'Live Updates', roles: ALL_ROLES, group: 'Community & Updates' },
  // The institute behind SIH26044. Everything on this page is AIIA's own.
  { href: 'aiia.html', icon: '🌿', label: 'AIIA Hub', roles: ALL_ROLES, group: 'Community & Updates' },
  // --- Shared across academia and industry.
  // --- Who built this, and how to reach them. Everyone sees it.
  { href: 'team.html', icon: '👥', label: 'Team & Contact', roles: ALL_ROLES, group: 'Community & Updates' },

  // --- Industry.
  { href: 'recruiter.html', icon: '🏢', label: 'Recruiter Portal', roles: [ROLES.RECRUITER, ROLES.ADMIN], group: 'Industry' },
  { href: 'post-opportunity.html', icon: '➕', label: 'Post Opportunity', roles: STAFF, group: 'Industry' },

  // --- Academia.
  { href: 'faculty.html', icon: '🎒', label: 'Faculty Portal', roles: [ROLES.FACULTY, ROLES.ADMIN], group: 'Academia' },
  { href: 'verify.html', icon: '✅', label: 'Verify Students', roles: STAFF, group: 'Academia' },
  { href: 'institution.html', icon: '📈', label: 'Institution Analytics', roles: [ROLES.INSTITUTION, ROLES.FACULTY, ROLES.ADMIN], group: 'Academia' },

  // --- Platform operator only.
  { href: 'admin.html', icon: '🛡️', label: 'Admin Panel', roles: [ROLES.ADMIN], group: 'Platform' },
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

/* =====================================================================
   Resizable sidebar
   ---------------------------------------------------------------------
   The width lives in one custom property, --sidebar-width. Everything
   downstream already adapts: .app-shell is a flex row and .main-content
   is `flex: 1; min-width: 0`, so widening the sidebar narrows the content
   column and nothing overflows.

   The chosen width is remembered per device in localStorage. It is
   re-clamped on every load and on every window resize, so a width picked
   on a 27" monitor cannot leave a laptop with a sliver of content.
   Below the 768px breakpoint the sidebar becomes an off-canvas drawer and
   resizing is switched off entirely.
   ===================================================================== */

const SIDEBAR_WIDTH_KEY = 'cn_sidebar_width';
const SIDEBAR_DEFAULT = 260;
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 420;
/* Below this the sidebar is a drawer (see responsive.css) — no resizing. */
const SIDEBAR_DRAWER_BREAKPOINT = 768;

/* The widest the sidebar may be *right now*. On a narrow laptop the cap
   comes down so the content column always keeps roughly two thirds. */
function sidebarMaxWidth() {
  const viewport = window.innerWidth || SIDEBAR_MAX * 3;
  return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.round(viewport * 0.34)));
}

function clampSidebarWidth(px) {
  const n = Number(px);
  if (!Number.isFinite(n)) return SIDEBAR_DEFAULT;
  return Math.round(Math.min(sidebarMaxWidth(), Math.max(SIDEBAR_MIN, n)));
}

/* Which sidebar nav groups the user has manually collapsed. Everything is
   open by default (a first-time visitor should see the whole map, not a
   wall of closed accordions); we only remember it once someone actually
   closes one, so most people never touch this key at all. */
const SIDEBAR_COLLAPSED_KEY = 'cn_sidebar_collapsed_groups';

function storedCollapsedGroups() {
  try {
    const raw = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return []; // private mode, storage disabled, or corrupted value
  }
}

function sidebarGroupOpen(groupName) {
  return !storedCollapsedGroups().includes(groupName);
}

function setSidebarGroupOpen(groupName, isOpen) {
  try {
    const collapsed = storedCollapsedGroups().filter((g) => g !== groupName);
    if (!isOpen) collapsed.push(groupName);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify(collapsed));
  } catch (_) {
    /* not being able to remember this is not worth an error */
  }
}

function storedSidebarWidth() {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return raw ? clampSidebarWidth(raw) : SIDEBAR_DEFAULT;
  } catch (_) {
    return SIDEBAR_DEFAULT; // private mode / storage disabled
  }
}

function applySidebarWidth(px, persist) {
  const width = clampSidebarWidth(px);
  document.documentElement.style.setProperty('--sidebar-width', width + 'px');
  const handle = document.getElementById('sidebarResizer');
  if (handle) {
    handle.setAttribute('aria-valuenow', String(width));
    handle.setAttribute('aria-valuemax', String(sidebarMaxWidth()));
    handle.setAttribute('aria-valuetext', width + ' pixels');
  }
  if (persist) {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
    } catch (_) {
      /* not being able to remember the width is not worth an error */
    }
  }
  return width;
}

function initSidebarResize() {
  const shell = document.querySelector('.app-shell');
  const sidebar = document.getElementById('sidebar');
  const handle = document.getElementById('sidebarResizer');
  if (!shell || !sidebar || !handle) return;

  applySidebarWidth(storedSidebarWidth(), false);

  let dragging = false;   // pointer is down on the handle
  let moved = false;      // ...and has travelled far enough to be a drag
  let frame = 0;
  let pending = 0;
  let startX = 0;
  /* A press that never travels is a click, not a drag. Without this
     threshold, clicking the handle snapped the sidebar to wherever the
     cursor happened to be, and the first half of a double-click did that
     before the reset could run. */
  const DRAG_THRESHOLD = 3;

  const commit = () => {
    frame = 0;
    applySidebarWidth(pending, false);
  };

  const onMove = (e) => {
    if (!dragging) return;
    if (!moved) {
      if (Math.abs(e.clientX - startX) < DRAG_THRESHOLD) return;
      moved = true;
      shell.classList.add('is-resizing');
    }
    // Measured from the sidebar's own left edge, so the width follows the
    // pointer exactly however the page is scrolled.
    pending = e.clientX - sidebar.getBoundingClientRect().left;
    // One update per frame: pointermove fires far faster than the browser
    // can relayout, and reflowing the whole content column on every event
    // is what makes a drag feel like it is lagging behind the cursor.
    if (!frame) frame = requestAnimationFrame(commit);
  };

  const stop = () => {
    if (!dragging) return;
    dragging = false;
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    shell.classList.remove('is-resizing');
    // Persist only a real drag; a click leaves the width exactly as it was.
    if (moved) applySidebarWidth(pending, true);
    moved = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
  };

  handle.addEventListener('pointerdown', (e) => {
    if (window.innerWidth <= SIDEBAR_DRAWER_BREAKPOINT) return;
    e.preventDefault();
    dragging = true;
    moved = false;
    startX = e.clientX;
    pending = sidebar.getBoundingClientRect().width;
    // .is-resizing is added on first movement, not here, so a click does
    // not flash the drag styling.
    // Listening on window, not the handle, so the drag survives the
    // pointer outrunning an 8px target.
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  });

  // Double-click the handle to go back to the default width.
  handle.addEventListener('dblclick', () => applySidebarWidth(SIDEBAR_DEFAULT, true));

  // Keyboard equivalent — a drag handle that only responds to a mouse is
  // unusable for anyone navigating by keyboard.
  handle.addEventListener('keydown', (e) => {
    const current = sidebar.getBoundingClientRect().width;
    const step = e.shiftKey ? 40 : 12;
    if (e.key === 'ArrowLeft') { e.preventDefault(); applySidebarWidth(current - step, true); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); applySidebarWidth(current + step, true); }
    else if (e.key === 'Home') { e.preventDefault(); applySidebarWidth(SIDEBAR_MIN, true); }
    else if (e.key === 'End') { e.preventDefault(); applySidebarWidth(sidebarMaxWidth(), true); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applySidebarWidth(SIDEBAR_DEFAULT, true); }
  });

  // Re-clamp when the window changes size: the maximum depends on it.
  window.addEventListener('resize', () => {
    if (dragging) return;
    applySidebarWidth(storedSidebarWidth(), false);
  });
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
  const activePage = activeHref || page;
  const visible = NAV_ITEMS.filter((item) => item.roles.includes(role));

  // Group in first-seen order rather than alphabetically, so "Main" still
  // leads and "Platform" still trails regardless of which groups a given
  // role even has.
  const order = [];
  const byGroup = {};
  visible.forEach((item) => {
    const g = item.group || 'Main';
    if (!byGroup[g]) { byGroup[g] = []; order.push(g); }
    byGroup[g].push(item);
  });

  const linkHtml = (item) => `
      <a class="sidebar-link${item.href === activePage ? ' active' : ''}" href="${item.href}">
        <span class="icon" aria-hidden="true">${item.icon}</span>
        <span>${item.label}</span>
      </a>`;

  // A single-item group (usually "Platform", admin-only) isn't worth a
  // collapsible header of its own - it renders as a bare link instead.
  const links = order
    .map((g) => {
      const items = byGroup[g];
      if (items.length === 1) return linkHtml(items[0]);
      const label = escapeHtml(g);
      const isOpenGroup = items.some((item) => item.href === activePage);
      return `
      <details class="sidebar-group" ${isOpenGroup || sidebarGroupOpen(g) ? 'open' : ''} data-group="${label}">
        <summary class="sidebar-group-label"><span>${label}</span></summary>
        <div class="sidebar-group-links">${items.map(linkHtml).join('')}</div>
      </details>`;
    })
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
      <div class="sidebar-resizer" id="sidebarResizer" role="separator"
           aria-orientation="vertical" aria-label="Resize sidebar"
           title="Drag to resize · double-click to reset"
           tabindex="0" aria-valuemin="${SIDEBAR_MIN}" aria-valuemax="${SIDEBAR_MAX}"></div>
    </aside>
    <div class="main-content">
      <header class="topbar">
        <button class="mobile-menu-btn btn btn-ghost btn-icon" id="menuToggle" aria-label="Open menu">☰</button>
        <!-- Global search. Understands intent rather than exact text:
             "make my cv" reaches the Resume page. Pages are ranked here,
             catalogue rows by POST /api/search. -->
        <div class="global-search" id="globalSearch">
          <span class="global-search-icon" aria-hidden="true">🔍</span>
          <input class="global-search-input" id="globalSearchInput" type="search"
                 placeholder="Search pages, courses, internships, AIIA…"
                 autocomplete="off" role="combobox" aria-expanded="false"
                 aria-controls="globalSearchPanel" aria-label="Search CareerNexus" />
          <div class="global-search-panel" id="globalSearchPanel" role="listbox" hidden></div>
        </div>
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
  // Apply the remembered width before the shell paints, so the sidebar
  // never flashes at the default width before jumping to the saved one.
  applySidebarWidth(storedSidebarWidth(), false);
  shellRoot.innerHTML = renderAppShell(activeHref, studentName);
  initSidebarResize();
  initGlobalSearch();
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const toggle = document.getElementById('menuToggle');
  const closeMenu = () => { sidebar.classList.remove('open'); backdrop.classList.remove('open'); };
  toggle?.addEventListener('click', () => { sidebar.classList.add('open'); backdrop.classList.add('open'); });
  backdrop?.addEventListener('click', closeMenu);
  document.querySelectorAll('.sidebar-group').forEach((details) => {
    details.addEventListener('toggle', () => {
      setSidebarGroupOpen(details.dataset.group, details.open);
    });
  });
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

/* =====================================================================
   Global search box (header)
   ---------------------------------------------------------------------
   Two kinds of answer, kept visibly apart:

     Pages       ranked locally from NAV_ITEMS + PAGE_KEYWORDS, so they
                 appear instantly with no round trip. This is what most
                 queries actually want ("where do I upload my resume").
     Catalogue   courses, internships, government schemes and AIIA
                 programmes, ranked by POST /api/search over the same
                 rows the rest of the app renders.

   Intent, not exact text: the query is expanded through
   js/search-core.js first, so "make my cv" finds Resume and "AI course"
   finds machine-learning material.
   ===================================================================== */

function initGlobalSearch() {
  const wrap = document.getElementById('globalSearch');
  const input = document.getElementById('globalSearchInput');
  const panel = document.getElementById('globalSearchPanel');
  if (!wrap || !input || !panel) return;
  if (typeof expandSearchTerms !== 'function') return; // search-core.js not loaded

  let debounce = 0;
  let requestId = 0;
  let items = [];        // flat list of the currently rendered options
  let cursor = -1;       // keyboard highlight

  const open = () => {
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  const close = () => {
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    cursor = -1;
  };

  function paint(html) {
    panel.innerHTML = html;
    items = [...panel.querySelectorAll('[data-go]')];
    cursor = -1;
    open();
  }

  function highlight(next) {
    if (!items.length) return;
    cursor = (next + items.length) % items.length;
    items.forEach((el, i) => el.classList.toggle('is-active', i === cursor));
    items[cursor].scrollIntoView({ block: 'nearest' });
  }

  /* Nothing typed yet: recent searches, then popular ones. */
  function paintIdle() {
    const recent = typeof recentSearches === 'function' ? recentSearches() : [];
    const chip = (t) =>
      `<button type="button" class="gs-chip" data-go="query" data-query="${escapeHtml(t)}">${escapeHtml(t)}</button>`;
    paint(`
      ${recent.length
        ? `<div class="gs-group">
             <div class="gs-group-head">
               <span>Recent</span>
               <button type="button" class="gs-clear" id="gsClearRecent">Clear</button>
             </div>
             <div class="gs-chips">${recent.map(chip).join('')}</div>
           </div>`
        : ''}
      <div class="gs-group">
        <p class="gs-group-head"><span>Popular searches</span></p>
        <div class="gs-chips">${SEARCH_POPULAR.map(chip).join('')}</div>
      </div>
      <p class="gs-foot">Press Enter for the full Opportunity Search</p>
    `);
    document.getElementById('gsClearRecent')?.addEventListener('click', (e) => {
      e.stopPropagation();
      clearRecentSearches();
      paintIdle();
    });
  }

  function pageRow(page) {
    return `
      <button type="button" class="gs-row" data-go="page" data-href="${escapeHtml(page.href)}">
        <span class="gs-row-icon" aria-hidden="true">${page.icon}</span>
        <span class="gs-row-body">
          <span class="gs-row-title">${escapeHtml(page.label)}</span>
          <span class="gs-row-meta">Page</span>
        </span>
      </button>`;
  }

  /* A catalogue row. Clicking it opens the right place: the page inside
     CareerNexus when the row has one, otherwise the official source —
     never a fabricated link, and the destination is labelled either way. */
  function resultRow(row) {
    const external = !row.internal_url && row.official_url;
    const href = row.internal_url || row.official_url;
    if (!href) return '';
    const deadline = row.deadline
      ? ` · ${typeof deadlineLabel === 'function' ? deadlineLabel(row.deadline) : escapeHtml(row.deadline)}`
      : '';
    return `
      <button type="button" class="gs-row"
              data-go="${external ? 'external' : 'page'}"
              data-href="${escapeHtml(safeUrl(href) || href)}">
        <span class="gs-row-icon" aria-hidden="true">${external ? '↗' : '→'}</span>
        <span class="gs-row-body">
          <span class="gs-row-title">${escapeHtml(row.title)}</span>
          <span class="gs-row-meta">${escapeHtml(row.category)} · ${escapeHtml(row.organisation)}${deadline}</span>
        </span>
      </button>`;
  }

  function group(title, rowsHtml, count) {
    if (!rowsHtml) return '';
    return `
      <div class="gs-group">
        <p class="gs-group-head"><span>${escapeHtml(title)}</span>${
          count ? `<span class="gs-count">${count}</span>` : ''
        }</p>
        ${rowsHtml}
      </div>`;
  }

  async function run(query) {
    const terms = expandSearchTerms(query);
    if (!terms.length) {
      paintIdle();
      return;
    }

    const pages = searchLocalPages(terms, 4);
    const seeAll = `
      <button type="button" class="gs-row gs-row--all" data-go="query" data-query="${escapeHtml(query)}">
        <span class="gs-row-icon" aria-hidden="true">🔍</span>
        <span class="gs-row-body">
          <span class="gs-row-title">Search "${escapeHtml(query)}" everywhere</span>
          <span class="gs-row-meta">Open Opportunity Search</span>
        </span>
      </button>`;

    // Pages first and immediately — they need no network.
    paint(group('Pages', pages.map(pageRow).join(''), pages.length) +
      '<div class="gs-group" id="gsRemote"><p class="gs-group-head"><span>Searching verified opportunities…</span></p></div>' +
      seeAll);

    const mine = ++requestId;
    let data;
    try {
      data = await api.search({ q: query, terms, limit: 12 });
    } catch (err) {
      if (mine !== requestId) return; // a newer query already answered
      const slot = document.getElementById('gsRemote');
      if (slot) {
        slot.innerHTML = `<p class="gs-group-head"><span>Courses & opportunities</span></p>
          <p class="gs-note">Could not reach the index right now. ${escapeHtml(err.message)}</p>`;
      }
      return;
    }
    if (mine !== requestId) return;

    const buckets = {};
    (data.results || []).forEach((row) => {
      const key = row.category === 'AIIA' ? 'AIIA' :
        (row.category === 'Courses' || row.category === 'Certifications') ? 'Courses' :
        (row.category === 'Internships' || row.category === 'Jobs') ? 'Internships & Jobs' : 'Other';
      (buckets[key] = buckets[key] || []).push(row);
    });

    const order = ['Courses', 'Internships & Jobs', 'AIIA', 'Other'];
    const html = order
      .filter((k) => buckets[k] && buckets[k].length)
      .map((k) => group(k, buckets[k].slice(0, 4).map(resultRow).join(''), buckets[k].length))
      .join('');

    paint(group('Pages', pages.map(pageRow).join(''), pages.length) +
      (html || `<div class="gs-group"><p class="gs-note">No courses or opportunities matched. ${
        data.total === 0 ? 'Try a broader word, or browse by category.' : ''
      }</p></div>`) +
      seeAll +
      `<p class="gs-foot">${escapeHtml(data.index_note || '')}</p>`);
  }

  function goToSearchPage(query) {
    if (typeof rememberSearch === 'function') rememberSearch(query);
    window.location.href = 'search.html?q=' + encodeURIComponent(query);
  }

  input.addEventListener('focus', () => {
    if (!input.value.trim()) paintIdle();
    else open();
  });

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const value = input.value;
    // Long enough to be worth a request, short enough to feel live.
    debounce = setTimeout(() => run(value), 220);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(cursor + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(cursor - 1); }
    else if (e.key === 'Escape') { close(); input.blur(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (cursor >= 0 && items[cursor]) { items[cursor].click(); return; }
      const q = input.value.trim();
      if (q) goToSearchPage(q);
    }
  });

  panel.addEventListener('click', (e) => {
    const row = e.target.closest('[data-go]');
    if (!row) return;
    const kind = row.dataset.go;
    if (kind === 'query') {
      goToSearchPage(row.dataset.query || input.value.trim());
    } else if (kind === 'external') {
      const url = safeUrl(row.dataset.href);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } else if (row.dataset.href) {
      if (typeof rememberSearch === 'function') rememberSearch(input.value.trim());
      window.location.href = row.dataset.href;
    }
    close();
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) close();
  });

  // "/" focuses search, the way most web apps do it — but not while the
  // user is typing into a field, or the character would be swallowed.
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
    e.preventDefault();
    input.focus();
  });
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

/* ---------- Deadlines ----------
   A listing without a visible closing date is close to useless: the whole
   question a student has is "can I still apply?". These render the answer
   rather than a bare date the reader has to work out for themselves.

   Anything that has no date says so honestly instead of implying urgency
   that the publisher never stated. */

function daysUntil(dateText) {
  if (!dateText) return null;
  const target = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function deadlineLabel(dateText) {
  const left = daysUntil(dateText);
  if (left === null) return 'No closing date published';
  if (left < 0) return `Closed ${formatDate(dateText)}`;
  if (left === 0) return 'Closes today';
  if (left === 1) return 'Closes tomorrow';
  if (left <= 30) return `${left} days left`;
  return `Closes ${formatDate(dateText)}`;
}

/* Urgency tier, used for colour. Deliberately conservative: "urgent" is
   only the last three days, so the badge keeps its meaning. */
function deadlineTier(dateText) {
  const left = daysUntil(dateText);
  if (left === null) return 'none';
  if (left < 0) return 'closed';
  if (left <= 3) return 'urgent';
  if (left <= 7) return 'soon';
  return 'open';
}

function deadlineBadge(dateText) {
  const tier = deadlineTier(dateText);
  const icon = { urgent: '⏰', soon: '⏳', closed: '🚫', open: '📅', none: '📄' }[tier];
  const title = dateText ? `Closing date ${dateText}` : 'The publisher has not stated a closing date';
  return `<span class="deadline-badge deadline-${tier}" title="${escapeHtml(title)}">${icon} ${escapeHtml(deadlineLabel(dateText))}</span>`;
}

/* ---------- Skill chips ---------- */
function skillChip(name, variant = 'default') {
  const cls = variant === 'missing' ? 'skill-chip chip-missing' : 'skill-chip';
  const icon = variant === 'missing' ? '○' : '✓';
  return `<span class="${cls}">${icon} ${escapeHtml(name)}</span>`;
}

/* ---------- Verification stamps ----------
   The distinction that matters across Profile and Portfolio: verified vs
   self-declared. A stamp means a named faculty member, institution or
   employer signed for it. Shared here since both pages render it. */
function verifiedBadge(v) {
  if (!v) return '<span class="stamp stamp-self" title="Self-declared, not yet verified">Self-declared</span>';
  const who = v.verified_by || 'Verified';
  const role = v.verifier_role ? ` (${roleLabel(v.verifier_role)})` : '';
  const title = `Verified by ${who}${role} on ${v.verified_at}${v.note ? ` — ${v.note}` : ''}`;
  return `<span class="stamp stamp-verified" title="${escapeHtml(title)}">✓ Verified</span>`;
}

/* ---------- Connected profile links (LinkedIn / GitHub) ----------
   Shared between profile.html (with an Edit form) and resume.html (read-only,
   so a student can see what their downloaded resume will list) — kept here
   rather than duplicated in both pages' scripts. */
function socialRow(icon, label, url, placeholder) {
  return `
    <div class="social-link-row">
      <span class="social-icon" aria-hidden="true">${icon}</span>
      <div class="social-link-body">
        <span class="field-label">${escapeHtml(label)}</span>
        ${url
          ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="social-link-url">${escapeHtml(url)}</a>`
          : `<span class="text-caption" style="font-style:italic;">${escapeHtml(placeholder)}</span>`}
      </div>
    </div>`;
}

/* ---------- State builders ---------- */
/* A one-line pointer to Live Updates, dropped into the pages where an
   official deadline is exactly what someone here is looking for. This is
   deliberately a link, not a re-fetched feed: repeating the same live data
   on four pages would mean four places that can drift out of sync with
   each other, for a fact ("go check Live Updates") that doesn't need its
   own copy of the data to be true. */
/* One explanation of the match formula, reused wherever a match score is
   shown, instead of a separate write-up per page that could quietly drift
   out of sync with the others (or with the real formula) over time. The
   weights and the worked example are both real - 50/20/15/15 is what
   calculate_match_score_breakdown() in the backend actually uses, and the
   example numbers are a real, checkable computation, not the illustrative
   skills-only formula a generic prompt would suggest. */
function matchFormulaExplainer() {
  return `
    <details class="callout" style="cursor:default;">
      <summary style="cursor:pointer;font-weight:600;color:var(--text-primary);">How Match Percentage Works</summary>
      <div class="mt-3">
        <p class="text-body mb-2">
          Every match score is four factors, weighted and added together — never guessed, and never the
          same two ways on two pages.
        </p>
        <table class="table-wrap" style="width:100%;border-collapse:collapse;font-size:0.875rem;">
          <tbody>
            <tr><td style="padding:4px 8px 4px 0;color:var(--text-secondary);">Required skills you have</td><td style="text-align:right;font-weight:600;">50%</td></tr>
            <tr><td style="padding:4px 8px 4px 0;color:var(--text-secondary);">Preferences (location, work mode)</td><td style="text-align:right;font-weight:600;">20%</td></tr>
            <tr><td style="padding:4px 8px 4px 0;color:var(--text-secondary);">Education eligibility (CGPA)</td><td style="text-align:right;font-weight:600;">15%</td></tr>
            <tr><td style="padding:4px 8px 4px 0;color:var(--text-secondary);">Relevant projects</td><td style="text-align:right;font-weight:600;">15%</td></tr>
          </tbody>
        </table>
        <p class="text-caption mt-3 mb-1"><strong>Worked example</strong> — a role needing 4 skills, of which you have 3:</p>
        <p class="text-caption mb-1">Skills 3/4 = 75% → 75 × 0.50 = <strong>37.5</strong></p>
        <p class="text-caption mb-1">Preferences match half → 50% → 50 × 0.20 = <strong>10</strong></p>
        <p class="text-caption mb-1">CGPA in the 7.0–8.4 band → 90% → 90 × 0.15 = <strong>13.5</strong></p>
        <p class="text-caption mb-3">One relevant project → 80% → 80 × 0.15 = <strong>12</strong></p>
        <p class="text-body mb-2">37.5 + 10 + 13.5 + 12 = <strong>73%</strong> overall — capped between 10% and 100%.</p>
        <p class="text-caption" style="font-style:italic;">
          A match percentage estimates fit against this one posting's stated requirements. It is not a
          guarantee of selection — the employer decides that.
        </p>
      </div>
    </details>`;
}

function liveUpdatesTeaser(text) {
  return `
    <a class="callout callout-info live-updates-teaser" href="updates.html">
      <span aria-hidden="true">🔔</span>
      <span>${escapeHtml(text)} <strong>See Live Updates →</strong></span>
    </a>`;
}

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
        ${deadlineBadge(item.deadline)}
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
