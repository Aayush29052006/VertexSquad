/**
 * CareerNexus — Demo account quick-fill
 *
 * The platform has five stakeholder views and a reviewer has no way to guess
 * the credentials for any of them, so both sign-in pages offer one-click
 * prefill. One account is filled on load, which means "open the page, press
 * Log In" is enough to get a working session.
 *
 * These are seeded demo accounts with no real data behind them — the
 * passwords are already published in the README. Nothing here weakens a real
 * account: it only types into the form for you, and the server still checks
 * the credentials like any other login.
 */

const DEMO_ACCOUNTS = [
  {
    role: 'student',
    label: 'Student',
    icon: '🎓',
    // Must match DEMO_STUDENT_EMAIL in backend/app/main.py. This account is
    // seeded on every database, unlike the ten-student cohort, which is
    // local-SQLite only.
    email: 'demo.student@careernexus.example.com',
    password: 'demo1234',
    blurb: 'Assessment, skill gaps, learning paths, applications and portfolio',
  },
  {
    role: 'recruiter',
    label: 'Recruiter',
    icon: '🏢',
    email: 'recruiter@technova.example.com',
    password: 'demo1234',
    blurb: 'Post roles, rank applicants, shortlist and sign off internships',
  },
  {
    role: 'faculty',
    label: 'Faculty',
    icon: '🎒',
    email: 'faculty@sscoetjalgaon.example.com',
    password: 'demo1234',
    blurb: 'Faculty internships and FDPs, plus the student verification queue',
  },
  {
    role: 'institution',
    label: 'Institution',
    icon: '📈',
    email: 'tpo@sscoetjalgaon.example.com',
    password: 'demo1234',
    blurb: 'Cohort analytics, curriculum gaps and placement readiness',
  },
  {
    role: 'admin',
    label: 'Admin',
    icon: '🛡️',
    email: 'aayushswapnali@gmail.com',
    password: 'demo1234',
    blurb: 'Full platform control across every role',
  },
];

/**
 * Render the picker and prefill the first account.
 *
 * @param {Object} options
 * @param {string}   options.mountId   id of the element to render into
 * @param {string[]} options.roles     which accounts to offer, in order
 * @param {string}   options.emailId   id of the email input to fill
 * @param {string}   options.passwordId id of the password input to fill
 * @param {string}   [options.title]   heading above the chips
 */
function mountDemoAccounts({ mountId, roles, emailId, passwordId, title = 'Demo accounts' }) {
  const mount = document.getElementById(mountId);
  const emailInput = document.getElementById(emailId);
  const passwordInput = document.getElementById(passwordId);
  if (!mount || !emailInput || !passwordInput) return;

  const accounts = roles
    .map((r) => DEMO_ACCOUNTS.find((a) => a.role === r))
    .filter(Boolean);
  if (!accounts.length) return;

  mount.innerHTML = `
    <div class="demo-block">
      <div class="demo-head">
        <span class="demo-title">${escapeHtml(title)}</span>
        <button type="button" class="demo-clear" id="demoClear">Use my own account</button>
      </div>
      <div class="demo-chips" role="group" aria-label="${escapeHtml(title)}">
        ${accounts
          .map(
            (a, i) => `
          <button type="button" class="demo-chip${i === 0 ? ' active' : ''}"
                  data-demo-role="${escapeHtml(a.role)}"
                  title="${escapeHtml(a.blurb)}"
                  aria-pressed="${i === 0}">
            <span aria-hidden="true">${a.icon}</span> ${escapeHtml(a.label)}
          </button>`
          )
          .join('')}
      </div>
      <p class="demo-hint" id="demoHint"></p>
    </div>
  `;

  const hint = document.getElementById('demoHint');

  function fill(account) {
    emailInput.value = account.email;
    passwordInput.value = account.password;
    // Some browsers only repaint a floating label / validation state after
    // an input event, so fire one as if the user had typed it.
    emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));

    mount.querySelectorAll('.demo-chip').forEach((chip) => {
      const on = chip.dataset.demoRole === account.role;
      chip.classList.toggle('active', on);
      chip.setAttribute('aria-pressed', String(on));
    });

    hint.textContent = `${account.blurb}. Press Log In to continue.`;
  }

  function clear() {
    emailInput.value = '';
    passwordInput.value = '';
    emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    mount.querySelectorAll('.demo-chip').forEach((chip) => {
      chip.classList.remove('active');
      chip.setAttribute('aria-pressed', 'false');
    });
    hint.textContent = 'Fields cleared — sign in with your own account.';
    emailInput.focus();
  }

  mount.addEventListener('click', (e) => {
    if (e.target.closest('#demoClear')) {
      clear();
      return;
    }
    const chip = e.target.closest('[data-demo-role]');
    if (!chip) return;
    const account = accounts.find((a) => a.role === chip.dataset.demoRole);
    if (account) fill(account);
  });

  document.getElementById('demoClear').addEventListener('click', clear);

  // Prefill the first account so the page is usable without a single click.
  fill(accounts[0]);
}
