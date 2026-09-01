/**
 * CareerNexus — Student Profile Page
 */
let currentStudent = null;

function renderProfile(pageBody, student) {
  const initials = student.full_name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  pageBody.innerHTML = `
    <div class="profile-header card">
      <div class="avatar avatar-lg">${initials}</div>
      <div class="profile-header-info">
        <h1 class="text-page-heading">${escapeHtml(student.full_name)}</h1>
        <p class="text-body">${escapeHtml(student.degree)}, ${escapeHtml(student.branch)} · ${escapeHtml(student.college)}</p>
      </div>
      <div class="profile-header-actions">
        <button class="btn btn-secondary" id="downloadResumeBtn">📄 Download ATS Resume</button>
        <button class="btn btn-primary" id="editProfileBtn">Edit Profile</button>
      </div>
    </div>

    <div class="profile-grid">
      <div>
        <div class="card profile-section">
          <h2 class="text-section-heading mb-3">Personal Information</h2>
          <div class="profile-field-grid">
            <div class="profile-field"><div class="field-label">Email</div><div class="field-value">${escapeHtml(student.email)}</div></div>
            <div class="profile-field"><div class="field-label">Phone</div><div class="field-value">${escapeHtml(student.phone)}</div></div>
            <div class="profile-field"><div class="field-label">Location</div><div class="field-value">${escapeHtml(student.location)}</div></div>
          </div>
        </div>

        <div class="card profile-section">
          <h2 class="text-section-heading mb-3">Academic Information</h2>
          <div class="profile-field-grid">
            <div class="profile-field"><div class="field-label">College</div><div class="field-value">${escapeHtml(student.college)}</div></div>
            <div class="profile-field"><div class="field-label">Degree</div><div class="field-value">${escapeHtml(student.degree)}</div></div>
            <div class="profile-field"><div class="field-label">Branch</div><div class="field-value">${escapeHtml(student.branch)}</div></div>
            <div class="profile-field"><div class="field-label">Current Year</div><div class="field-value">${escapeHtml(student.current_year)}</div></div>
            <div class="profile-field"><div class="field-label">Graduation Year</div><div class="field-value">${student.graduation_year}</div></div>
            <div class="profile-field"><div class="field-label">CGPA</div><div class="field-value">${student.cgpa}</div></div>
          </div>
        </div>

        <div class="card profile-section">
          <h2 class="text-section-heading mb-3">Skills</h2>
          <div class="chip-row">${student.skills.map((s) => `<span class="skill-chip">${escapeHtml(s)}</span>`).join('')}</div>
        </div>

        <div class="card profile-section">
          <h2 class="text-section-heading mb-3">Projects</h2>
          ${student.projects.map((p) => `
            <div class="entity-card">
              <h4>${escapeHtml(p.title)}</h4>
              <p class="text-caption mt-1">${escapeHtml(p.description)}</p>
              <div class="entity-tags">${p.tech.map((t) => `<span class="entity-tag">${escapeHtml(t)}</span>`).join('')}</div>
            </div>`).join('') || emptyState('📁', 'No projects added yet.', 'Add a project to strengthen your profile.')}
        </div>

        <div class="card profile-section">
          <h2 class="text-section-heading mb-3">Certifications</h2>
          ${student.certifications.map((c) => `
            <div class="entity-card">
              <h4>${escapeHtml(c.title)}</h4>
              <p class="text-caption mt-1">${escapeHtml(c.issuer)} · ${c.year}</p>
            </div>`).join('') || emptyState('🏅', 'No certifications added yet.', 'Add certifications to boost your placement readiness.')}
        </div>

        <div class="card">
          <h2 class="text-section-heading mb-3">Experience</h2>
          <div class="timeline">
            ${student.experience.map((e) => `
              <div class="timeline-item">
                <h4 class="text-card-heading">${escapeHtml(e.role)}</h4>
                <p class="text-caption">${escapeHtml(e.org)} · ${escapeHtml(e.duration)}</p>
                <p class="text-body mt-1">${escapeHtml(e.description)}</p>
              </div>`).join('') || emptyState('💼', 'No experience added yet.', 'Add internships or part-time roles you have completed.')}
          </div>
        </div>
      </div>

      <div>
        <div class="card profile-section">
          <h2 class="text-section-heading mb-3">Preferences</h2>
          <div class="profile-field mb-3"><div class="field-label">Preferred Roles</div><div class="chip-row mt-1">${student.preferences.preferred_roles.map((r) => `<span class="badge badge-info">${escapeHtml(r)}</span>`).join('')}</div></div>
          <div class="profile-field mb-3"><div class="field-label">Preferred Locations</div><div class="chip-row mt-1">${student.preferences.preferred_locations.map((l) => `<span class="badge badge-neutral">${escapeHtml(l)}</span>`).join('')}</div></div>
          <div class="profile-field mb-3"><div class="field-label">Work Mode</div><div class="field-value">${escapeHtml(student.preferences.work_mode)}</div></div>
          <div class="profile-field"><div class="field-label">Internship Duration</div><div class="field-value">${escapeHtml(student.preferences.duration)}</div></div>
        </div>

        <div class="card profile-section">
          <h2 class="text-section-heading mb-3">Soft Skills</h2>
          <div class="chip-row">${student.soft_skills.map((s) => `<span class="badge badge-neutral">${escapeHtml(s)}</span>`).join('')}</div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('editProfileBtn').addEventListener('click', openEditModal);
  document.getElementById('downloadResumeBtn').addEventListener('click', downloadAtsResume);
}

/* ---------- ATS-friendly resume export ----------
   Builds a clean, single-column, parser-friendly resume and hands it to the
   browser's print dialog, where the user picks "Save as PDF". Single column
   with real headings is what ATS parsers handle best — multi-column layouts
   and graphics are exactly what they choke on. Uses no external library, so
   there is nothing to load and nothing to break offline. */
function atsSection(title, innerHtml) {
  if (!innerHtml) return '';
  return `<section class="ats-section"><h2>${escapeHtml(title)}</h2>${innerHtml}</section>`;
}

function buildAtsResume(s) {
  const contact = [s.email, s.phone, s.location].filter(Boolean).map(escapeHtml).join('  |  ');

  const education = `
    <p><strong>${escapeHtml(s.degree || '')}${s.branch ? ', ' + escapeHtml(s.branch) : ''}</strong></p>
    <p>${escapeHtml(s.college || '')}</p>
    <p>${s.graduation_year ? 'Graduating ' + escapeHtml(String(s.graduation_year)) : ''}${s.cgpa ? '  |  CGPA: ' + escapeHtml(String(s.cgpa)) : ''}</p>`;

  const skills = (s.skills || []).length
    ? `<p>${(s.skills || []).map(escapeHtml).join(', ')}</p>` : '';

  const softSkills = (s.soft_skills || []).length
    ? `<p>${(s.soft_skills || []).map(escapeHtml).join(', ')}</p>` : '';

  const experience = (s.experience || []).map((e) => `
    <div class="ats-entry">
      <p><strong>${escapeHtml(e.role || '')}</strong>${e.org ? ' — ' + escapeHtml(e.org) : ''}</p>
      <p class="ats-meta">${escapeHtml(e.duration || '')}</p>
      <p>${escapeHtml(e.description || '')}</p>
    </div>`).join('');

  const projects = (s.projects || []).map((p) => `
    <div class="ats-entry">
      <p><strong>${escapeHtml(p.title || '')}</strong>${(p.tech || []).length ? ' — ' + (p.tech || []).map(escapeHtml).join(', ') : ''}</p>
      <p>${escapeHtml(p.description || '')}</p>
    </div>`).join('');

  const certifications = (s.certifications || []).map((c) => `
    <p>${escapeHtml(c.title || '')}${c.issuer ? ' — ' + escapeHtml(c.issuer) : ''}${c.year ? ' (' + escapeHtml(String(c.year)) + ')' : ''}</p>`).join('');

  return `
    <div class="ats-resume" id="atsResume">
      <header class="ats-head">
        <h1>${escapeHtml(s.full_name || '')}</h1>
        <p>${contact}</p>
      </header>
      ${atsSection('Education', education)}
      ${atsSection('Technical Skills', skills)}
      ${atsSection('Experience', experience)}
      ${atsSection('Projects', projects)}
      ${atsSection('Certifications', certifications)}
      ${atsSection('Soft Skills', softSkills)}
    </div>`;
}

function downloadAtsResume() {
  if (!currentStudent) return;

  document.getElementById('atsResumeHost')?.remove();

  const host = document.createElement('div');
  host.id = 'atsResumeHost';
  host.innerHTML = buildAtsResume(currentStudent);
  document.body.appendChild(host);

  // Give the browser a tick to lay the new nodes out before printing
  const cleanup = () => host.remove();
  window.addEventListener('afterprint', cleanup, { once: true });

  setTimeout(() => {
    window.print();
    // Safari/Firefox don't always fire afterprint — clean up defensively
    setTimeout(() => { if (document.getElementById('atsResumeHost')) cleanup(); }, 1000);
  }, 60);

  showToast('Choose "Save as PDF" in the print dialog.', 'success');
}

function openEditModal() {
  document.getElementById('editName').value = currentStudent.full_name;
  document.getElementById('editLocation').value = currentStudent.location;
  document.getElementById('editPhone').value = currentStudent.phone;
  document.getElementById('editCgpa').value = currentStudent.cgpa;
  document.getElementById('editSkills').value = currentStudent.skills.join(', ');
  document.getElementById('editModal').hidden = false;
}

(async function initProfile() {
  if (!requireAuth()) return;
  const studentName = localStorage.getItem('cn_student_name') || 'Student';
  const pageBody = mountAppShell('profile.html', studentName);
  pageBody.innerHTML = loadingState('Loading your profile...');

  try {
    currentStudent = await api.getStudentProfile();
    renderProfile(pageBody, currentStudent);
  } catch (err) {
    pageBody.innerHTML = errorState(err.message || 'Unable to load your profile.', 'location.reload');
  }

  const editModal = document.getElementById('editModal');
  document.getElementById('closeEdit').addEventListener('click', () => { editModal.hidden = true; });
  editModal.addEventListener('click', (e) => { if (e.target === editModal) editModal.hidden = true; });

  document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      full_name: document.getElementById('editName').value.trim(),
      location: document.getElementById('editLocation').value.trim(),
      phone: document.getElementById('editPhone').value.trim(),
      cgpa: Number(document.getElementById('editCgpa').value),
      skills: document.getElementById('editSkills').value.split(',').map((s) => s.trim()).filter(Boolean),
    };
    try {
      currentStudent = await api.updateStudentProfile(payload);
      localStorage.setItem('cn_student_name', currentStudent.full_name);
      renderProfile(document.getElementById('pageBody'), currentStudent);
      editModal.hidden = true;
      showToast('Profile updated successfully.', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to update profile.', 'error');
    }
  });
})();
