/**
 * CareerNexus — Team / Admin sign-in
 * Separate entrance for the team. It uses the same /api/auth/login endpoint as
 * students, then refuses to keep the session unless the account's role is
 * "admin". The real gate is still server-side: every /api/admin/* route
 * independently checks the role, so this page is a front door, not the lock.
 */
(function initAdminLogin() {
  // Already signed in as an admin? Go straight through.
  if (localStorage.getItem('cn_token') && localStorage.getItem('cn_role') === 'admin') {
    window.location.replace('admin.html');
    return;
  }

  const form = document.getElementById('adminLoginForm');
  if (!form) return;

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
