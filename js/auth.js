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
  };
  const formError = document.getElementById('registerFormError');
  const submitBtn = document.getElementById('registerSubmit');
  const submitText = document.getElementById('registerSubmitText');

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

    if (!fields.college.value.trim()) { setFieldError(fields.college, errors.college, 'College is required'); valid = false; }
    else setFieldError(fields.college, errors.college, '');

    if (!fields.degree.value) { setFieldError(fields.degree, errors.degree, 'Please select a degree'); valid = false; }
    else setFieldError(fields.degree, errors.degree, '');

    if (!fields.branch.value.trim()) { setFieldError(fields.branch, errors.branch, 'Branch is required'); valid = false; }
    else setFieldError(fields.branch, errors.branch, '');

    if (!fields.gradYear.value) { setFieldError(fields.gradYear, errors.gradYear, 'Please select a graduation year'); valid = false; }
    else setFieldError(fields.gradYear, errors.gradYear, '');

    if (!valid) return;

    submitBtn.disabled = true;
    submitText.innerHTML = '<span class="spinner"></span> Creating account...';
    try {
      const payload = {
        full_name: fields.fullName.value.trim(),
        email: fields.regEmail.value.trim(),
        password: fields.regPassword.value,
        college: fields.college.value.trim(),
        degree: fields.degree.value,
        branch: fields.branch.value.trim(),
        graduation_year: Number(fields.gradYear.value),
      };
      const { token, student } = await api.register(payload);
      localStorage.setItem('cn_token', token);
      localStorage.setItem('cn_student_name', student.full_name);
      window.location.href = 'dashboard.html';
    } catch (err) {
      formError.textContent = err.message || 'Registration failed. Please try again.';
      formError.hidden = false;
      submitBtn.disabled = false;
      submitText.textContent = 'Create Account';
    }
  });
}
