/**
 * CareerNexus — Post an Opportunity
 * One form for every kind of posting: student internships, jobs and
 * apprenticeships, and the faculty track (FDPs, industrial training, joint
 * projects). Publishing is restricted to recruiters, institutions and
 * faculty — enforced on the server, not here.
 */

const STUDENT_TYPES = [
  ['internship', 'Internship'],
  ['job', 'Full-time Job'],
  ['apprenticeship', 'Apprenticeship'],
  ['project', 'Live Project'],
];

const FACULTY_TYPES = [
  ['fdp', 'Faculty Development Programme (FDP)'],
  ['training', 'Industrial Training / Faculty Internship'],
  ['project', 'Joint Project / Consultancy'],
];

(function initPostOpportunity() {
  if (!requireAuth()) return;
  if (!hasRole(ROLES.RECRUITER, ROLES.INSTITUTION, ROLES.FACULTY)) {
    window.location.href = 'dashboard.html';
    return;
  }

  const name = localStorage.getItem('cn_student_name') || 'User';
  const pageBody = mountAppShell('post-opportunity.html', name);

  pageBody.innerHTML = `
    <h1 class="text-page-heading mb-1">Post an Opportunity</h1>
    <p class="text-body mb-5">
      Published roles are matched against every student's skill profile straight away, so the
      candidates who see it first are the ones who actually fit.
    </p>

    <form class="card" id="oppForm">
      <div class="form-grid-2">
        <div>
          <label class="form-label" for="audience">Who is this for?</label>
          <select class="form-input mb-3" id="audience" name="audience">
            <option value="student">Students</option>
            <option value="faculty">Faculty / Academicians</option>
          </select>
        </div>
        <div>
          <label class="form-label" for="opportunity_type">Type</label>
          <select class="form-input mb-3" id="opportunity_type" name="opportunity_type"></select>
        </div>
      </div>

      <label class="form-label" for="title">Title</label>
      <input class="form-input mb-3" id="title" name="title" required placeholder="Backend Developer Intern" />

      <label class="form-label" for="company">Organisation</label>
      <input class="form-input mb-3" id="company" name="company" required placeholder="TechNova" />

      <label class="form-label" for="description">Description</label>
      <textarea class="form-input mb-3" id="description" name="description" rows="3"
                placeholder="What will they work on, and what does success look like?"></textarea>

      <div class="form-grid-2">
        <div>
          <label class="form-label" for="location">Location</label>
          <input class="form-input mb-3" id="location" name="location" required placeholder="Pune" />
        </div>
        <div>
          <label class="form-label" for="work_mode">Work mode</label>
          <select class="form-input mb-3" id="work_mode" name="work_mode">
            <option>Hybrid</option><option>Remote</option><option>On-site</option>
          </select>
        </div>
        <div>
          <label class="form-label" for="stipend">Stipend / Salary</label>
          <input class="form-input mb-3" id="stipend" name="stipend" placeholder="Rs. 15,000/month" />
        </div>
        <div>
          <label class="form-label" for="duration">Duration</label>
          <input class="form-input mb-3" id="duration" name="duration" placeholder="6 months" />
        </div>
        <div>
          <label class="form-label" for="deadline">Application deadline</label>
          <input class="form-input mb-3" id="deadline" name="deadline" type="date" />
        </div>
        <div>
          <label class="form-label" for="openings">Openings</label>
          <input class="form-input mb-3" id="openings" name="openings" type="number" min="1" value="1" />
        </div>
        <div>
          <label class="form-label" for="min_cgpa">Minimum CGPA (0 = no cutoff)</label>
          <input class="form-input mb-3" id="min_cgpa" name="min_cgpa" type="number" step="0.1" min="0" max="10" value="0" />
        </div>
      </div>

      <label class="form-label" for="required_skills">Required skills (comma separated)</label>
      <input class="form-input mb-2" id="required_skills" name="required_skills" required
             placeholder="Python, FastAPI, SQL, Docker" />
      <p class="text-caption mb-4">
        These drive the whole match. Be specific and name the real tools — every student's score is
        computed against this list.
      </p>

      <p class="form-error mb-3" id="oppError" hidden></p>
      <div class="flex gap-2">
        <button class="btn btn-primary btn-lg" type="submit" id="publishBtn">Publish Opportunity</button>
        <a class="btn btn-secondary" href="recruiter.html">Cancel</a>
      </div>
    </form>
  `;

  const audience = document.getElementById('audience');
  const typeSelect = document.getElementById('opportunity_type');

  function refreshTypes() {
    const list = audience.value === 'faculty' ? FACULTY_TYPES : STUDENT_TYPES;
    typeSelect.innerHTML = list.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  }
  audience.addEventListener('change', refreshTypes);
  refreshTypes();

  document.getElementById('oppForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('publishBtn');
    const errorEl = document.getElementById('oppError');
    errorEl.hidden = true;

    const data = Object.fromEntries(new FormData(e.target).entries());
    const skills = data.required_skills.split(',').map((s) => s.trim()).filter(Boolean);
    if (!skills.length) {
      errorEl.textContent = 'Name at least one required skill.';
      errorEl.hidden = false;
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Publishing...';
    try {
      await api.createOpportunity({
        ...data,
        required_skills: skills,
        min_cgpa: Number(data.min_cgpa || 0),
        openings: Number(data.openings || 1),
      });
      showToast('Opportunity published. Matched candidates can see it now.', 'success');
      window.location.href = 'recruiter.html';
    } catch (err) {
      errorEl.textContent = err.message || 'Could not publish the opportunity.';
      errorEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Publish Opportunity';
    }
  });
})();
