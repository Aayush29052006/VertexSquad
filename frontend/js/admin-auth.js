/**
 * CareerNexus — Team / Admin sign-in
 * Separate entrance for the team. It uses the same /api/auth/login endpoint as
 * students, then refuses to keep the session unless the account's role is
 * "admin". The real gate is still server-side: every /api/admin/* route
 * independently checks the role, so this page is a front door, not the lock.
 */
(function initAdminLogin() {
  const form = document.getElementById('adminLoginForm');
  if (!form) return;

  // This page always asks who you are. It used to redirect straight to the
  // panel whenever an admin session was already in localStorage, which meant
  // that on a shared machine whoever signed in first stayed signed in and
  // every later visit silently inherited their session. With more than one
  // admin on the team the panel could no longer tell who was acting.
  //
  // An existing session is still honoured — you just have to choose it
  // deliberately rather than being sent through on someone else's token.
  const activeName = localStorage.getItem('cn_student_name');
  if (localStorage.getItem('cn_token') && localStorage.getItem('cn_role') === 'admin' && activeName) {
    const notice = document.createElement('div');
    notice.className = 'active-session';
    notice.innerHTML = `
      <p class="text-caption">
        Already signed in as <strong>${escapeHtml(activeName)}</strong>.
      </p>
      <div class="flex gap-2 mt-2" style="flex-wrap:wrap;">
        <a class="btn btn-secondary btn-sm" href="admin.html">Continue as ${escapeHtml(activeName.split(' ')[0])}</a>
        <button class="btn btn-ghost btn-sm" type="button" id="switchAdmin">Sign in as someone else</button>
      </div>`;
    form.parentNode.insertBefore(notice, form);

    document.getElementById('switchAdmin').addEventListener('click', () => {
      localStorage.removeItem('cn_token');
      localStorage.removeItem('cn_student_name');
      localStorage.removeItem('cn_role');
      notice.remove();
      document.getElementById('email').focus();
    });
  }

  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const formError = document.getElementById('formError');
  const btn = document.getElementById('adminLoginSubmit');
  const btnText = document.getElementById('adminLoginSubmitText');

  const showError = (msg) => {
    formError.textContent = msg;
    formError.hidden = false;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.hidden = true;

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      showError('Enter your email and password.');
      return;
    }

    btn.disabled = true;
    btnText.innerHTML = '<span class="spinner"></span> Signing in...';

    try {
      const { token, student } = await api.login(email, password);

      if (!student || student.role !== 'admin') {
        // Valid credentials, but not a team account — store nothing.
        showError('This account does not have team access. Contact an admin if you think this is a mistake.');
        btn.disabled = false;
        btnText.textContent = 'Sign In';
        return;
      }

      localStorage.setItem('cn_token', token);
      localStorage.setItem('cn_student_name', student.full_name);
      localStorage.setItem('cn_role', 'admin');
      window.location.href = 'admin.html';
    } catch (err) {
      // Same generic message whether the email is unknown or the password wrong.
      showError(err.message || 'Sign in failed. Check your credentials and try again.');
      btn.disabled = false;
      btnText.textContent = 'Sign In';
    }
  });
})();
