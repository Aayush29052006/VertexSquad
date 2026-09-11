/**
 * CareerNexus — Theme controller
 * Applies/persists the light/dark theme and wires up every toggle control
 * on the page (navbar icon button, or the labeled switch on Settings).
 * The blocking snippet in each page's <head> already set the attribute
 * before first paint; this file keeps it in sync with user interaction.
 */
const THEME_STORAGE_KEY = 'cn_theme';

function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function setTheme(theme) {
  const resolved = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', resolved);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, resolved);
  } catch (e) {
    /* private browsing / storage blocked — theme still applies for this load */
  }
  syncThemeControls(resolved);
}

function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

function syncThemeControls(theme) {
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(theme === 'dark'));
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  });
  document.querySelectorAll('[data-theme-option]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-theme-option') === theme);
  });
}

document.addEventListener('click', (e) => {
  const toggleBtn = e.target.closest('[data-theme-toggle]');
  if (toggleBtn) {
    toggleTheme();
    return;
  }
  const optionBtn = e.target.closest('[data-theme-option]');
  if (optionBtn) {
    setTheme(optionBtn.getAttribute('data-theme-option'));
  }
});

document.addEventListener('DOMContentLoaded', () => syncThemeControls(getTheme()));

/* ---------- Team entrance ----------
   Two ways to reach admin-login.html without a visible link on any page:
     - type "admin" anywhere (not inside a field)
     - Ctrl+Alt+A / Cmd+Alt+A

   This lives here rather than in auth.js because auth.js only loads on
   login.html/register.html, and the entrance needs to work from wherever
   someone actually lands - starting with the homepage, which is what
   start.bat opens. theme.js is the one script every page already includes,
   so putting it here is what makes it work site-wide instead of on two
   pages nobody necessarily visits first. (A third gesture - five taps on
   the fine print - stays local to auth.js, since it targets an element
   that only exists on the login page.)

   Be clear about what this is worth: it is tidiness, not security. Anyone
   who opens View Source can read this. The actual gate is the server -
   admin-login.html refuses to keep a session whose role is not "admin",
   and every /api/admin/* route re-checks the role on its own, so knowing
   the address gets an outsider precisely nowhere without the password.

   Ctrl+Alt+A rather than Ctrl+Shift+A: browsers reserve most Ctrl+Shift
   combinations for themselves - Ctrl+Shift+A is Chrome's tab search, and
   Chrome consumes it before the page ever sees the event. Ctrl+Alt+A is
   unclaimed, and a plain typed word cannot collide with a browser
   shortcut at all. */
(function initTeamEntrance() {
  function openTeamSignIn() {
    if (/\/pages\//.test(location.pathname)) {
      if (!/admin-login\.html$/.test(location.pathname)) window.location.href = 'admin-login.html';
    } else if (!/admin-login\.html$/.test(location.pathname)) {
      window.location.href = 'pages/admin-login.html';
    }
  }

  function typingInAField(target) {
    return !!target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    );
  }

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === 'KeyA') {
      e.preventDefault();
      openTeamSignIn();
    }
  });

  const SECRET_WORD = 'admin';
  let typed = '';
  let typedTimer = null;
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (typingInAField(e.target)) return;
    if (e.key.length !== 1) return;

    typed = (typed + e.key.toLowerCase()).slice(-SECRET_WORD.length);
    clearTimeout(typedTimer);
    typedTimer = setTimeout(() => { typed = ''; }, 1500);
    if (typed === SECRET_WORD) {
      typed = '';
      clearTimeout(typedTimer);
      openTeamSignIn();
    }
  });
})();

/* ---------- Scroll reveal ----------
   Fades content in as it scrolls into view. Purely decorative: if the user
   prefers reduced motion, or IntersectionObserver is missing, we do nothing
   and everything stays visible (the CSS only hides elements once <html> has
   the .cn-reveal class, which we add here). */
(function initReveal() {
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!('IntersectionObserver' in window)) return;
  } catch (e) {
    return;
  }

  // Elements that should reveal on scroll (marked up or matched by selector).
  const SELECTORS = [
    '[data-reveal]',
    '.stat-item',
    '.step-card',
    '.cta-section',
    '#features .card',
    '.footer-grid > *',
    '.section-header',
  ].join(',');

  const root = document.documentElement;
  root.classList.add('cn-reveal');

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('cn-in');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
  );

  function tag(el) {
    if (el.dataset.reveal === undefined) el.dataset.reveal = '';
    // Already on screen? Show it now, in the same frame — no hide-then-reveal flash.
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top < vh * 0.92 && rect.bottom > 0) {
      el.classList.add('cn-in');
    } else {
      io.observe(el);
    }
  }

  function scan(node) {
    if (node.nodeType !== 1) return;
    if (node.matches && node.matches(SELECTORS)) tag(node);
    if (node.querySelectorAll) node.querySelectorAll(SELECTORS).forEach(tag);
  }

  // Safety net: if the observer never fires (edge cases), reveal everything.
  const failSafe = setTimeout(() => {
    document.querySelectorAll('[data-reveal]:not(.cn-in)').forEach((el) => el.classList.add('cn-in'));
  }, 2500);
  io.takeRecords; // no-op, keeps linters calm

  const start = () => {
    scan(document.body);
    // App pages render content asynchronously — watch for it.
    new MutationObserver((muts) => {
      muts.forEach((m) => m.addedNodes.forEach(scan));
    }).observe(document.body, { childList: true, subtree: true });
    // clear the fail-safe once we've had a chance to reveal
    setTimeout(() => clearTimeout(failSafe), 4000);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
