/**
 * CareerNexus — Post an Internship (recruiter / admin)
 * Writes a new opportunity to the backend, which persists it to Supabase.
 * It then appears in every student's recommendations with a match score
 * computed server-side.
 */

const WORK_MODES = ['Remote', 'Hybrid', 'On-site'];

function setError(inputEl, errorEl, message) {
  if (message) {
    inputEl.classList.add('input-error');
    errorEl.textContent = message;
    errorEl.hidden = false;
  } else {
    inputEl.classList.remove('input-error');
    errorEl.hidden = true;
  }
}

(function initAddInternship() {
  if (!requireAuth()) return;

  const studentName = localStorage.getItem('cn_student_name') || 'Student';
  const pageBody = mountAppShell('add-internship.html', studentName);

  pageBody.innerHTML = `
    <h1 class="text-page-heading mb-2">Post an Internship</h1>
    <p class="text-body mb-5">Publish an opportunity. It is matched to every student's profile automatically.</p>

    <div class="card" style="max-width:760px;">
      <form id="internshipForm" novalidate>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="title">Role Title <span aria-hidden="true">*</span></label>
            <input class="form-input" id="title" placeholder="e.g. Frontend Developer Intern" required />
            <p class="form-error" id="titleError" hidden></p>
          </div>
          <div class="form-group">
            <label class="form-label" for="company">Company <span aria-hidden="true">*</span></label>
            <input class="form-input" id="company" placeholder="e.g. TechNova" required />
            <p class="form-error" id="companyError" hidden></p>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="location">Location <span aria-hidden="true">*</span></label>
            <input class="form-input" id="location" placeholder="e.g. Pune" required />
            <p class="form-error" id="locationError" hidden></p>
          </div>
          <div class="form-group">
            <label class="form-label" for="workMode">Work Mode</label>
            <select class="form-select" id="workMode">
              ${WORK_MODES.map((m) => `<option>${m}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="stipend">Stipend</label>
            <input class="form-input" id="stipend" placeholder="e.g. ₹15,000/month" />
          </div>
          <div class="form-group">
            <label class="form-label" for="duration">Duration</label>
            <input class="form-input" id="duration" placeholder="e.g. 3 months" />
          </div>
          <div class="form-group">
            <label class="form-label" for="deadline">Application Deadline</label>
            <input class="form-input" type="date" id="deadline" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="skills">Required Skills <span aria-hidden="true">*</span></label>
          <input class="form-input" id="skills" placeholder="e.g. React, JavaScript, CSS" />
          <p class="form-hint">Separate skills with commas. These drive the match score.</p>
          <p class="form-error" id="skillsError" hidden></p>
          <div class="chip-row mt-3" id="skillPreview"></div>
        </div>

        <div class="flex gap-3 mt-5" style="flex-wrap:wrap;">
          <button class="btn btn-primary btn-lg" type="submit" id="submitBtn">Publish Internship</button>
          <a class="btn btn-ghost btn-lg" href="internships.html">Cancel</a>
        </div>
        <p class="form-error mt-3" id="formError" hidden></p>
      </form>
    </div>

    <div class="card mt-5" id="successCard" hidden style="max-width:760px;"></div>
  `;

  const form = document.getElementById('internshipForm');
  const skillsInput = document.getElementById('skills');
  const skillPreview = document.getElementById('skillPreview');
  const submitBtn = document.getElementById('submitBtn');
  const formError = document.getElementById('formError');

  const parseSkills = () =>
    skillsInput.value.split(',').map((s) => s.trim()).filter(Boolean);

  // Live chip preview so the recruiter sees exactly what will be saved
  skillsInput.addEventListener('input', () => {
    const skills = parseSkills();
    skillPreview.innerHTML = skills.map((s) => `<span class="skill-chip">${escapeHtml(s)}</span>`).join('');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.hidden = true;

    const title = document.getElementById('title');
    const company = document.getElementById('company');
    const location = document.getElementById('location');
    const skills = parseSkills();

    let valid = true;
    if (!title.value.trim()) { setError(title, document.getElementById('titleError'), 'Role title is required'); valid = false; }
    else setError(title, document.getElementById('titleError'), '');

    if (!company.value.trim()) { setError(company, document.getElementById('companyError'), 'Company is required'); valid = false; }
    else setError(company, document.getElementById('companyError'), '');

    if (!location.value.trim()) { setError(location, document.getElementById('locationError'), 'Location is required'); valid = false; }
    else setError(location, document.getElementById('locationError'), '');

    if (!skills.length) { setError(skillsInput, document.getElementById('skillsError'), 'Add at least one required skill'); valid = false; }
    else setError(skillsInput, document.getElementById('skillsError'), '');

    if (!valid) return;

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Publishing...';

    try {
      const created = await api.createInternship({
        title: title.value.trim(),
        company: company.value.trim(),
        location: location.value.trim(),
        work_mode: document.getElementById('workMode').value,
        stipend: document.getElementById('stipend').value.trim(),
        duration: document.getElementById('duration').value.trim(),
        deadline: document.getElementById('deadline').value,
        required_skills: skills,
      });

      form.hidden = true;
      const success = document.getElementById('successCard');
      success.hidden = false;
      success.innerHTML = `
        <div class="state-block">
          <div class="state-icon">✅</div>
          <div class="state-title">Internship Published</div>
          <p class="state-text">
            <strong>${escapeHtml(created.title)}</strong> at ${escapeHtml(created.company)}
            is now live and being matched to students.
          </p>
          <div class="flex gap-3 mt-4" style="flex-wrap:wrap;justify-content:center;">
            <a class="btn btn-primary" href="internship-details.html?id=${encodeURIComponent(created.id)}">View Listing</a>
            <button class="btn btn-secondary" id="postAnotherBtn">Post Another</button>
          </div>
        </div>
      `;
      showToast('Internship published successfully.', 'success');

      document.getElementById('postAnotherBtn').addEventListener('click', () => {
        form.reset();
        skillPreview.innerHTML = '';
        form.hidden = false;
        success.hidden = true;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Publish Internship';
      });
    } catch (err) {
      formError.textContent = err.message || 'Could not publish this internship. Please try again.';
      formError.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Publish Internship';
    }
  });
})();
