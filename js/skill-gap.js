/**
 * CareerNexus — Skill Gap Analysis Page
 */
function getIdFromUrl() {
  return new URLSearchParams(window.location.search).get('id');
}

function renderSkillGap(pageBody, item, gap) {
  pageBody.innerHTML = `
    <h1 class="text-page-heading mb-1">Skill Gap Analysis</h1>
    <p class="text-body mb-5">For <strong>${escapeHtml(item.title)}</strong> at ${escapeHtml(item.company)}</p>

    <div class="gap-columns">
      <div class="card">
        <h2 class="text-section-heading mb-3">Your Current Skills</h2>
        <div class="chip-row">${gap.current_skills.map((s) => skillChip(s)).join('')}</div>
      </div>
      <div class="card">
        <h2 class="text-section-heading mb-3">Skills Required</h2>
        <div class="chip-row">
          ${gap.required_skills.map((s) => gap.missing_skills.includes(s) ? skillChip(s, 'missing') : skillChip(s)).join('')}
        </div>
      </div>
    </div>

    <div class="card gap-summary mb-5">
      <div class="gap-num">${gap.missing_skills.length}</div>
      <p class="text-body">${gap.missing_skills.length === 1 ? 'Skill' : 'Skills'} Missing</p>
    </div>

    ${gap.missing_skills.length ? `
    <div class="card mb-5">
      <h2 class="text-section-heading mb-3">Priority</h2>
      ${gap.priority.map((p) => `
        <div class="priority-item">
          <div>
            <span class="badge ${p.priority === 'HIGH' ? 'badge-danger' : 'badge-warning'}">${p.priority}</span>
            <strong style="margin-left:10px;">${escapeHtml(p.skill)}</strong>
          </div>
          <span class="text-caption">Why this matters: core requirement for this role</span>
        </div>
      `).join('')}
      <p class="text-caption mt-4">How it affects your match: closing these gaps could raise your match score by up to ${Math.min(gap.missing_skills.length * 7, 100 - item.match_score)}%.</p>
    </div>
    ` : `<div class="card mb-5">${emptyState('🎉', 'No skill gaps found!', 'You meet all required skills for this internship.')}</div>`}

    <div class="flex gap-3">
      <a href="internship-details.html?id=${item.id}" class="btn btn-secondary">Back to Internship</a>
      <a href="what-if.html?id=${item.id}" class="btn btn-primary">Run What-If Analysis</a>
    </div>
  `;
}

(async function initSkillGap() {
  if (!requireAuth()) return;
  const studentName = localStorage.getItem('cn_student_name') || 'Student';
  const pageBody = mountAppShell('skill-gap.html', studentName);
  pageBody.innerHTML = loadingState('Analyzing skill gap...');

  try {
    let id = getIdFromUrl();
    if (!id) {
      const recs = await api.getRecommendations();
      id = recs[0]?.id;
    }
    if (!id) {
      pageBody.innerHTML = emptyState('🎯', 'No internship matches yet.', 'Complete your profile and add more skills to discover better opportunities.', '<a href="profile.html" class="btn btn-primary">Complete Profile</a>');
      return;
    }
    const [item, gap] = await Promise.all([api.getInternshipDetails(id), api.getSkillGap(id)]);
    renderSkillGap(pageBody, item, gap);
  } catch (err) {
    pageBody.innerHTML = errorState(err.message || 'Unable to load skill gap analysis.', 'location.reload');
  }
})();
