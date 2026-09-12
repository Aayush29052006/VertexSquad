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
          <div class="flex items-center gap-2 mb-3" style="justify-content:space-between;">
            <h2 class="text-section-heading" style="margin:0;">Professional Profile Links</h2>
            <button class="btn btn-ghost btn-sm" id="editLinksBtn" type="button">Edit</button>
          </div>
          <p class="text-caption mb-3">
            Connect your LinkedIn and GitHub so recruiters can find them, and pull real GitHub projects
            straight into your portfolio.
          </p>
          <div id="socialLinksView">${renderSocialLinksView(student)}</div>
          <div id="socialLinksEdit" hidden>${renderSocialLinksEdit(student)}</div>
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
  wireSocialLinks();
}

/* ---------- Connected Profiles (LinkedIn / GitHub) ----------
   LinkedIn is a link only — see the long comment on /api/social/github-import
   in the backend for why there is no "import" for it. GitHub gets both a
   link and a real import, because its public API actually allows one. */

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

function renderSocialLinksView(student) {
  const hasGithub = !!student.github_url;
  return `
    ${socialRow('💼', 'LinkedIn', student.linkedin_url, 'Not connected yet')}
    ${socialRow('🐙', 'GitHub', student.github_url, 'Not connected yet')}
    ${hasGithub ? `
      <button class="btn btn-secondary btn-sm mt-2" id="importGithubBtn" type="button">
        Import GitHub Projects
      </button>` : `
      <p class="text-caption mt-2">Add your GitHub link and save to unlock project import.</p>`}
  `;
}

function renderSocialLinksEdit(student) {
  return `
    <div class="form-group">
      <label class="form-label" for="linkedinUrlInput">LinkedIn Profile URL</label>
      <input class="form-input" id="linkedinUrlInput" placeholder="https://www.linkedin.com/in/your-name"
             value="${escapeHtml(student.linkedin_url || '')}" />
    </div>
    <div class="form-group">
      <label class="form-label" for="githubUrlInput">GitHub Profile URL</label>
      <input class="form-input" id="githubUrlInput" placeholder="https://github.com/your-username"
             value="${escapeHtml(student.github_url || '')}" />
    </div>
    <p class="form-error mt-1 mb-2" id="socialLinksError" hidden></p>
    <div class="flex gap-2">
      <button class="btn btn-primary btn-sm" id="saveSocialLinksBtn" type="button">Save Links</button>
      <button class="btn btn-ghost btn-sm" id="cancelSocialLinksBtn" type="button">Cancel</button>
    </div>
  `;
}

function wireSocialLinks() {
  const viewEl = document.getElementById('socialLinksView');
  const editEl = document.getElementById('socialLinksEdit');

  function showView() {
    viewEl.innerHTML = renderSocialLinksView(currentStudent);
    viewEl.hidden = false;
    editEl.hidden = true;
    document.getElementById('importGithubBtn')?.addEventListener('click', openGithubImportModal);
  }

  document.getElementById('editLinksBtn').addEventListener('click', () => {
    editEl.innerHTML = renderSocialLinksEdit(currentStudent);
    viewEl.hidden = true;
    editEl.hidden = false;
    document.getElementById('cancelSocialLinksBtn').addEventListener('click', showView);
    document.getElementById('saveSocialLinksBtn').addEventListener('click', async () => {
      const btn = document.getElementById('saveSocialLinksBtn');
      const errorEl = document.getElementById('socialLinksError');
      errorEl.hidden = true;
      btn.disabled = true;
      btn.textContent = 'Saving...';
      try {
        currentStudent = await api.updateStudentProfile({
          linkedin_url: document.getElementById('linkedinUrlInput').value.trim(),
          github_url: document.getElementById('githubUrlInput').value.trim(),
        });
        showView();
        showToast('Profile links saved.', 'success');
      } catch (err) {
        errorEl.textContent = err.message || 'Could not save those links. Check they are the right platform’s URL.';
        errorEl.hidden = false;
        btn.disabled = false;
        btn.textContent = 'Save Links';
      }
    });
  });

  document.getElementById('importGithubBtn')?.addEventListener('click', openGithubImportModal);
}

/* ---------- GitHub project import ----------
   Fetch -> preview -> the student picks what to keep -> confirm. Nothing
   reaches student.projects or student.skills without that explicit pick,
   and re-running the import never creates a second copy of a repo already
   imported once (matched by its GitHub URL) or a skill already present
   (matched case-insensitively, same rule the match engine itself uses). */

function _githubUsernameFromUrl(url) {
  return (url || '').trim().replace(/^https?:\/\//i, '').replace(/^(www\.)?github\.com\//i, '').split('/')[0].split('?')[0];
}

function _isProjectAlreadySaved(repo) {
  return currentStudent.projects.some((p) => p.url && p.url.toLowerCase() === repo.html_url.toLowerCase());
}

function _isSkillAlreadySaved(skill) {
  return currentStudent.skills.some((s) => s.toLowerCase() === skill.toLowerCase());
}

function githubRepoRow(repo, index) {
  const already = _isProjectAlreadySaved(repo);
  return `
    <label class="gh-repo-row${already ? ' gh-repo-row-saved' : ''}">
      <input type="checkbox" data-repo-index="${index}" ${already ? 'disabled' : ''} />
      <div class="gh-repo-body">
        <div class="flex items-center gap-2">
          <strong>${escapeHtml(repo.name)}</strong>
          ${repo.is_fork ? '<span class="badge badge-neutral">Fork</span>' : ''}
          ${already ? '<span class="badge badge-success">Already in your portfolio</span>' : ''}
        </div>
        ${repo.description ? `<p class="text-caption mt-1">${escapeHtml(repo.description)}</p>` : '<p class="text-caption mt-1" style="font-style:italic;">No description on GitHub.</p>'}
        <div class="entity-tags mt-1">
          ${repo.language ? `<span class="entity-tag">${escapeHtml(repo.language)}</span>` : ''}
          ${repo.topics.map((t) => `<span class="entity-tag">${escapeHtml(t)}</span>`).join('')}
        </div>
        <p class="text-caption mt-1">
          ⭐ ${repo.stars} &nbsp; \u{1F374} ${repo.forks} &nbsp; updated ${escapeHtml(repo.updated_at || 'unknown date')}
          &nbsp; <a href="${escapeHtml(repo.html_url)}" target="_blank" rel="noopener noreferrer">View on GitHub ↗</a>
        </p>
      </div>
    </label>`;
}

function githubSkillChip(skill) {
  const already = _isSkillAlreadySaved(skill);
  return `
    <label class="skill-confirm-chip ${already ? 'kept' : ''}" style="cursor:${already ? 'default' : 'pointer'};">
      <input type="checkbox" data-skill-name="${escapeHtml(skill)}" ${already ? 'checked disabled' : ''} style="margin-right:4px;" />
      ${escapeHtml(skill)}${already ? ' (already added)' : ''}
    </label>`;
}

let _githubImportData = null;

function openGithubImportModal() {
  const modal = document.getElementById('githubModal');
  const body = document.getElementById('githubModalBody');
  modal.hidden = false;
  body.innerHTML = loadingState('Reading the public GitHub profile...');

  const username = _githubUsernameFromUrl(currentStudent.github_url);
  api.githubImport(username)
    .then((data) => {
      _githubImportData = data;
      const p = data.profile;
      body.innerHTML = `
        <div class="flex items-center gap-3 mb-4">
          ${p.avatar_url ? `<img src="${escapeHtml(p.avatar_url)}" alt="" style="width:56px;height:56px;border-radius:50%;" />` : ''}
          <div>
            <strong>${escapeHtml(p.name)}</strong>
            <p class="text-caption">@${escapeHtml(p.login)} · ${p.public_repos} public repos · ${p.followers} followers</p>
          </div>
        </div>
        ${p.bio ? `<p class="text-body mb-4">${escapeHtml(p.bio)}</p>` : ''}

        <h4 class="text-card-heading mb-2">Select repositories to add to your Portfolio</h4>
        ${data.repos.length
          ? `<div class="gh-repo-list">${data.repos.map(githubRepoRow).join('')}</div>`
          : `<p class="text-body mb-3">No public repositories found on this account.</p>`}

        ${data.languages_detected.length ? `
          <h4 class="text-card-heading mt-4 mb-2">Languages detected — add any to Skills?</h4>
          <p class="text-caption mb-2">Detected from your public repos. Nothing here is added unless you tick it.</p>
          <div class="chip-row">${data.languages_detected.map(githubSkillChip).join('')}</div>
        ` : ''}

        <p class="form-error mt-3" id="githubImportError" hidden></p>
        <div class="flex gap-2 mt-4">
          <button class="btn btn-primary" id="confirmGithubImportBtn" type="button">Import Selected</button>
          <button class="btn btn-ghost" id="cancelGithubImportBtn" type="button">Cancel</button>
        </div>
      `;

      document.getElementById('cancelGithubImportBtn').addEventListener('click', () => { modal.hidden = true; });
      document.getElementById('confirmGithubImportBtn').addEventListener('click', confirmGithubImport);
    })
    .catch((err) => {
      body.innerHTML = errorState(
        err.message || 'Could not read that GitHub profile right now.',
        null
      );
      body.innerHTML += `<div class="flex gap-2 mt-3"><button class="btn btn-secondary" id="closeGithubErrorBtn" type="button">Close</button></div>`;
      document.getElementById('closeGithubErrorBtn').addEventListener('click', () => { modal.hidden = true; });
    });
}

async function confirmGithubImport() {
  const btn = document.getElementById('confirmGithubImportBtn');
  const errorEl = document.getElementById('githubImportError');
  errorEl.hidden = true;

  const selectedRepos = [...document.querySelectorAll('[data-repo-index]:checked')]
    .map((el) => _githubImportData.repos[Number(el.dataset.repoIndex)]);
  const selectedSkills = [...document.querySelectorAll('[data-skill-name]:checked:not(:disabled)')]
    .map((el) => el.dataset.skillName);

  if (!selectedRepos.length && !selectedSkills.length) {
    errorEl.textContent = 'Select at least one repository or skill to import — or Cancel.';
    errorEl.hidden = false;
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Importing...';
  try {
    const newProjects = selectedRepos.map((repo) => ({
      title: repo.name,
      description: repo.description || '(No description provided on GitHub.)',
      tech: [repo.language, ...repo.topics].filter(Boolean),
      url: repo.html_url,
      source: 'github',
    }));
    const mergedProjects = [...currentStudent.projects, ...newProjects];
    const mergedSkills = [...currentStudent.skills];
    selectedSkills.forEach((s) => {
      if (!mergedSkills.some((existing) => existing.toLowerCase() === s.toLowerCase())) mergedSkills.push(s);
    });

    currentStudent = await api.updateStudentProfile({ projects: mergedProjects, skills: mergedSkills });
    document.getElementById('githubModal').hidden = true;
    renderProfile(document.getElementById('pageBody'), currentStudent);
    showToast(
      `Imported ${newProjects.length} project${newProjects.length === 1 ? '' : 's'}` +
      (selectedSkills.length ? ` and ${selectedSkills.length} skill${selectedSkills.length === 1 ? '' : 's'}.` : '.'),
      'success'
    );
  } catch (err) {
    errorEl.textContent = err.message || 'Could not save the imported items. Please try again.';
    errorEl.hidden = false;
    btn.disabled = false;
    btn.textContent = 'Import Selected';
  }
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
  const contact = [s.email, s.phone, s.location, s.linkedin_url, s.github_url]
    .filter(Boolean).map(escapeHtml).join('  |  ');

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

  const githubModal = document.getElementById('githubModal');
  document.getElementById('closeGithubModal').addEventListener('click', () => { githubModal.hidden = true; });
  githubModal.addEventListener('click', (e) => { if (e.target === githubModal) githubModal.hidden = true; });

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
