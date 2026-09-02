/**
 * CareerNexus — Settings
 */
(async function initSettings() {
  if (!requireAuth()) return;

  const studentName = localStorage.getItem('cn_student_name') || 'Student';
  const pageBody = mountAppShell('settings.html', studentName);

  pageBody.innerHTML = `
    <div class="section-header">
      <div>
        <h1 class="text-page-heading">Settings</h1>
        <p class="text-caption">Manage how CareerNexus looks and your account details.</p>
      </div>
    </div>

    <div class="card mb-6">
      <h2 class="text-card-heading">Appearance</h2>
      <p class="text-caption mt-1">Choose how CareerNexus looks on this device.</p>
      <div class="theme-switch mt-4">
        <button type="button" data-theme-option="light">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
          Light
        </button>
        <button type="button" data-theme-option="dark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>
          Dark
        </button>
      </div>
    </div>

    <div class="card" id="accountCard">${loadingState('Loading account details...')}</div>
  `;

  try {
    const student = await api.getStudentProfile();
    document.getElementById('accountCard').innerHTML = `
      <h2 class="text-card-heading">Account</h2>
      <div class="divider"></div>
      <div class="flex items-center gap-4">
        <div class="avatar avatar-lg" aria-hidden="true">${escapeHtml((student.full_name || 'S').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase())}</div>
        <div>
          <p class="text-card-heading">${escapeHtml(student.full_name || 'Student')}</p>
          <p class="text-caption mt-1">${escapeHtml(student.email || '')}</p>
        </div>
      </div>
    `;
  } catch (err) {
    document.getElementById('accountCard').innerHTML = errorState('Unable to load account details.', 'location.reload');
  }
})();
