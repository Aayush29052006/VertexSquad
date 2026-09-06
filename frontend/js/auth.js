/**
 * CareerNexus — Authentication UI logic
 * Handles client-side validation and calls the central api layer.
 * Password hashing and real auth happen on the backend / Supabase Auth.
 */

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function setFieldError(inputEl, errorEl, message) {
  if (message) {
    inputEl.classList.add('input-error');
    errorEl.textContent = message;
    errorEl.hidden = false;
  } else {
    inputEl.classList.remove('input-error');
    errorEl.hidden = true;
  }
}

/* ---------- Google Sign-In ----------
   Uses Google Identity Services. The browser receives an ID token signed by
   Google and hands it to our backend, which verifies the signature before
   issuing a CareerNexus session. If no client ID is configured the whole
   block is hidden, so the page still works without it. */
function handleGoogleCredential(response) {
  const slot = document.getElementById('googleSlot');
  const errorEl = document.getElementById('googleError');
  if (errorEl) errorEl.hidden = true;

  api.loginWithGoogle(response.credential)
    .then(({ token, student }) => {
      localStorage.setItem('cn_token', token);
      localStorage.setItem('cn_student_name', student.full_name);
      localStorage.setItem('cn_role', student.role || 'student');
      window.location.href = 'dashboard.html';
    })
    .catch((err) => {
      if (errorEl) {
        errorEl.textContent = err.message || 'Google sign-in failed. Please try again.';
        errorEl.hidden = false;
      }
      if (slot) slot.setAttribute('aria-busy', 'false');
    });
}

function initGoogleSignIn() {
  const slot = document.getElementById('googleSlot');
  const block = document.getElementById('googleBlock');
  if (!slot || !block) return;

  const clientId = (typeof CONFIG !== 'undefined' && CONFIG.GOOGLE_CLIENT_ID) || '';
  if (!clientId) {
    block.hidden = true; // not configured yet — hide rather than show a dead button
    return;
  }

  // google.accounts loads asynchronously; wait for it before rendering.
  let tries = 0;
  const ready = setInterval(() => {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      clearInterval(ready);
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredential,
        // Keep the whole flow in a popup. In redirect mode Google would send
        // the browser to a redirect_uri this static app does not serve, which
        // shows up as a 404.
        ux_mode: 'popup',
        auto_select: false,
      });
      window.google.accounts.id.renderButton(slot, {
        theme: 'outline',
        size: 'large',
        width: 320,
        text: 'continue_with',
        shape: 'pill',
      });
    } else if (++tries > 40) {
      clearInterval(ready);
      block.hidden = true; // script blocked or offline
    }
  }, 100);
}

document.addEventListener('DOMContentLoaded', initGoogleSignIn);

/* ---------- Login ---------- */
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const emailError = document.getElementById('emailError');
  const passwordError = document.getElementById('passwordError');
  const formError = document.getElementById('formError');
  const submitBtn = document.getElementById('loginSubmit');
  const submitText = document.getElementById('loginSubmitText');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    let valid = true;
    formError.hidden = true;

    if (!isValidEmail(emailInput.value)) {
      setFieldError(emailInput, emailError, 'Invalid email address');
      valid = false;
    } else {
      setFieldError(emailInput, emailError, '');
    }

    if (!passwordInput.value) {
      setFieldError(passwordInput, passwordError, 'Password is required');
      valid = false;
    } else {
      setFieldError(passwordInput, passwordError, '');
    }

    if (!valid) return;

    submitBtn.disabled = true;
    submitText.innerHTML = '<span class="spinner"></span> Logging in...';
    try {
      const { token, student } = await api.login(emailInput.value, passwordInput.value);
      localStorage.setItem('cn_token', token);
      localStorage.setItem('cn_student_name', student.full_name);
      localStorage.setItem('cn_role', student.role || 'student');
      window.location.href = 'dashboard.html';
    } catch (err) {
      formError.textContent = err.message || 'Login failed. Please try again.';
      formError.hidden = false;
      submitBtn.disabled = false;
      submitText.textContent = 'Log In';
    }
  });

  const forgotLink = document.getElementById('forgotLink');
  const forgotModal = document.getElementById('forgotModal');
  const closeForgot = document.getElementById('closeForgot');
  const sendResetBtn = document.getElementById('sendResetBtn');
  forgotLink?.addEventListener('click', (e) => { e.preventDefault(); forgotModal.hidden = false; });
  closeForgot?.addEventListener('click', () => { forgotModal.hidden = true; });
  forgotModal?.addEventListener('click', (e) => { if (e.target === forgotModal) forgotModal.hidden = true; });
  sendResetBtn?.addEventListener('click', () => {
    forgotModal.hidden = true;
    showToast('If an account exists for that email, a reset link has been sent.', 'success');
  });

  /* ---------- Team entrance ----------
     The team sign-in lives at admin-login.html. This page shows no link to
     it, so a student who is not looking for it never sees one.

     Be clear about what that is worth: it is tidiness, not security. Anyone
     who opens View Source can read this. The actual gate is the server —
     admin-login.html refuses to keep a session whose role is not "admin",
     and every /api/admin/* route re-checks the role on its own, so knowing
     the address gets an outsider precisely nowhere without the password.

     Three ways in:
       - type "admin" anywhere on the page (not inside a field)
       - Ctrl+Alt+A / Cmd+Alt+A
       - five quick taps on the small print at the bottom of the card

     Typing the word is the reliable one. Browsers reserve most Ctrl+Shift
     combinations for themselves — Ctrl+Shift+A is Chrome's tab search, and
     Chrome consumes it before the page ever sees the event, so a shortcut
     built on it silently does nothing. Ctrl+Alt+A is unclaimed, and a
     plain typed word cannot collide with a browser shortcut at all.

     The gesture deliberately targets the fine print rather than the logo:
     the logo is a link home, so its first tap would navigate away before
     the fifth ever landed. */
  function openTeamSignIn() {
    window.location.href = 'admin-login.html';
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
    if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'A' || e.key === 'a')) {
      e.preventDefault();
      openTeamSignIn();
    }
  });

  // Type the word. Skipped while a field has focus, so it can never steal
  // a keystroke meant for the email or password box.
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

  const tapTarget = document.querySelector('.auth-links');
  if (tapTarget) {
    let taps = 0;
    let tapTimer = null;
    tapTarget.style.cursor = 'default';
    tapTarget.addEventListener('click', () => {
      taps += 1;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => { taps = 0; }, 1500);
      if (taps >= 5) {
        taps = 0;
        clearTimeout(tapTimer);
        openTeamSignIn();
      }
    });
  }
}

/* ---------- Register ---------- */
const registerForm = document.getElementById('registerForm');
if (registerForm) {
  const fields = {
    fullName: document.getElementById('fullName'),
    regEmail: document.getElementById('regEmail'),
    regPassword: document.getElementById('regPassword'),
    confirmPassword: document.getElementById('confirmPassword'),
    college: document.getElementById('college'),
    degree: document.getElementById('degree'),
    branch: document.getElementById('branch'),
    gradYear: document.getElementById('gradYear'),
    accountRole: document.getElementById('accountRole'),
    orgName: document.getElementById('orgName'),
    designation: document.getElementById('designation'),
    department: document.getElementById('department'),
  };
  const errors = {
    fullName: document.getElementById('fullNameError'),
    regEmail: document.getElementById('regEmailError'),
    regPassword: document.getElementById('regPasswordError'),
    confirmPassword: document.getElementById('confirmPasswordError'),
    college: document.getElementById('collegeError'),
    degree: document.getElementById('degreeError'),
    branch: document.getElementById('branchError'),
    gradYear: document.getElementById('gradYearError'),
    orgName: document.getElementById('orgNameError'),
  };
  const formError = document.getElementById('registerFormError');
  const submitBtn = document.getElementById('registerSubmit');
  const submitText = document.getElementById('registerSubmitText');

  // Students give academic details; everyone else gives an organisation.
  // Asking a recruiter for their graduation year would be nonsense, so the
  // two blocks swap rather than stacking.
  const studentFields = document.getElementById('studentFields');
  const orgFields = document.getElementById('orgFields');

  function isStudentSignup() {
    return !fields.accountRole || fields.accountRole.value === 'student';
  }

  function syncRoleFields() {
    const student = isStudentSignup();
    if (studentFields) studentFields.hidden = !student;
    if (orgFields) orgFields.hidden = student;
    // Hidden required inputs would block submit with an invisible error.
    [fields.college, fields.degree, fields.branch, fields.gradYear].forEach((el) => {
      if (el) el.required = student;
    });
  }

  fields.accountRole?.addEventListener('change', syncRoleFields);
  syncRoleFields();

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    let valid = true;
    formError.hidden = true;

    if (!fields.fullName.value.trim()) { setFieldError(fields.fullName, errors.fullName, 'Full name is required'); valid = false; }
    else setFieldError(fields.fullName, errors.fullName, '');

    if (!isValidEmail(fields.regEmail.value)) { setFieldError(fields.regEmail, errors.regEmail, 'Invalid email address'); valid = false; }
    else setFieldError(fields.regEmail, errors.regEmail, '');

    if (fields.regPassword.value.length < 8) { setFieldError(fields.regPassword, errors.regPassword, 'Password must contain at least 8 characters'); valid = false; }
    else setFieldError(fields.regPassword, errors.regPassword, '');

    if (fields.confirmPassword.value !== fields.regPassword.value || !fields.confirmPassword.value) {
      setFieldError(fields.confirmPassword, errors.confirmPassword, 'Passwords do not match'); valid = false;
    } else setFieldError(fields.confirmPassword, errors.confirmPassword, '');

    if (isStudentSignup()) {
      if (!fields.college.value.trim()) { setFieldError(fields.college, errors.college, 'College is required'); valid = false; }
      else setFieldError(fields.college, errors.college, '');

      if (!fields.degree.value) { setFieldError(fields.degree, errors.degree, 'Please select a degree'); valid = false; }
      else setFieldError(fields.degree, errors.degree, '');

      if (!fields.branch.value.trim()) { setFieldError(fields.branch, errors.branch, 'Branch is required'); valid = false; }
      else setFieldError(fields.branch, errors.branch, '');

      if (!fields.gradYear.value) { setFieldError(fields.gradYear, errors.gradYear, 'Please select a graduation year'); valid = false; }
      else setFieldError(fields.gradYear, errors.gradYear, '');
    } else if (!fields.orgName.value.trim()) {
      setFieldError(fields.orgName, errors.orgName, 'Organisation is required');
      valid = false;
    } else {
      setFieldError(fields.orgName, errors.orgName, '');
    }

    if (!valid) return;

    submitBtn.disabled = true;
    submitText.innerHTML = '<span class="spinner"></span> Creating account...';
    try {
      const role = fields.accountRole ? fields.accountRole.value : 'student';
      const payload = {
        full_name: fields.fullName.value.trim(),
        email: fields.regEmail.value.trim(),
        password: fields.regPassword.value,
        role,
      };
      if (isStudentSignup()) {
        Object.assign(payload, {
          college: fields.college.value.trim(),
          degree: fields.degree.value,
          branch: fields.branch.value.trim(),
          graduation_year: Number(fields.gradYear.value),
        });
      } else {
        Object.assign(payload, {
          org_name: fields.orgName.value.trim(),
          designation: fields.designation.value.trim(),
          department: fields.department.value.trim(),
          // Faculty and institution accounts belong to a college; the
          // analytics and verification queue are scoped by this.
          college: role === 'recruiter' ? '' : fields.orgName.value.trim(),
        });
      }
      const { token, student } = await api.register(payload);
      localStorage.setItem('cn_token', token);
      localStorage.setItem('cn_student_name', student.full_name);
      localStorage.setItem('cn_role', student.role || 'student');
      window.location.href = 'dashboard.html';
    } catch (err) {
      formError.textContent = err.message || 'Registration failed. Please try again.';
      formError.hidden = false;
      submitBtn.disabled = false;
      submitText.textContent = 'Create Account';
    }
  });
}
