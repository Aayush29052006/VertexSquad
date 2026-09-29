/**
 * CareerNexus — Recruiter Portal
 * What a company sees: the roles it posted, the applicants ranked by skill
 * compatibility, and the controls to shortlist, reject or sign off a
 * completed internship. Scoped server-side to this account's own postings.
 */

let applicantCache = [];

const STATUS_BADGES = {
  applied: 'badge-info',
  under_review: 'badge-warning',
  shortlisted: 'badge-success',
  rejected: 'badge-danger',
  completed: 'badge-success',
};

function statusLabel(s) {
  return (s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function postingRow(p) {
  return `
    <tr>
      <td>
        <strong>${escapeHtml(p.title)}</strong>
        <div class="text-caption">${escapeHtml(TYPE_LABELS_R[p.opportunity_type] || p.opportunity_type)} · ${escapeHtml(p.location)}</div>
      </td>
      <td>${escapeHtml(p.work_mode)}</td>
      <td class="col-num">${p.openings}</td>
      <td class="col-num">${p.applicants}</td>
      <td class="col-num">${p.shortlisted}</td>
      <td>${p.deadline ? formatDate(p.deadline) : '—'}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-secondary btn-sm" data-view="${escapeHtml(p.id)}">View Applicants</button>
        </div>
      </td>
    </tr>`;
}

const TYPE_LABELS_R = {
  internship: 'Internship',
  job: 'Full-time Job',
  apprenticeship: 'Apprenticeship',
  project: 'Live Project',
  fdp: 'FDP',
  training: 'Industrial Training',
};

function applicantRow(a) {
  const { tier } = getMatchTier(a.match_score);
  return `
    <tr>
      <td>
        <strong>${escapeHtml(a.student_name)}</strong>
        <div class="text-caption">${escapeHtml([a.branch, a.college].filter(Boolean).join(' · '))}</div>
      </td>
      <td>${escapeHtml(a.opportunity_title)}</td>
      <td class="col-num">
        <span class="match-pill match-${tier}">${a.match_score}%</span>
      </td>
      <td class="col-num">
        ${a.cgpa ? a.cgpa.toFixed(2) : '—'}
        ${a.meets_cgpa ? '' : '<div class="text-caption" style="color:var(--danger,#d9707a);">below cutoff</div>'}
      </td>
      <td>
        <div class="chip-row chip-row-tight">
          ${(a.matched_skills || []).slice(0, 4).map((s) => skillChip(s)).join('')}
          ${(a.missing_skills || []).slice(0, 3).map((s) => skillChip(s, 'missing')).join('')}
        </div>
      </td>
      <td><span class="badge ${STATUS_BADGES[a.status] || 'badge-info'}">${escapeHtml(statusLabel(a.status))}</span></td>
      <td>
        <div class="row-actions">
          <a class="btn btn-ghost btn-sm" href="portfolio.html?id=${encodeURIComponent(a.student_id)}" target="_blank" rel="noopener">Portfolio</a>
          <button class="btn btn-secondary btn-sm" data-set="shortlisted" data-app="${escapeHtml(a.application_id)}">Shortlist</button>
          <button class="btn btn-ghost btn-sm" data-set="rejected" data-app="${escapeHtml(a.application_id)}">Reject</button>
          ${
            a.status === 'shortlisted'
              ? `<button class="btn btn-primary btn-sm" data-complete="${escapeHtml(a.application_id)}">Mark Complete</button>`
              : ''
          }
        </div>
      </td>
    </tr>`;
}

function renderApplicants(filterId) {
  const minMatch = Number(document.getElementById('minMatch').value || 0);
  const rows = applicantCache.filter(
    (a) => (!filterId || a.opportunity_id === filterId) && a.match_score >= minMatch
  );
  document.getElementById('applicantCount').textContent =
    `${rows.length} ${rows.length === 1 ? 'applicant' : 'applicants'}`;
  document.getElementById('applicantBody').innerHTML = rows.length
    ? rows.map(applicantRow).join('')
    : `<tr><td colspan="7">${emptyState('👥', 'No applicants match', 'Lower the minimum match score or pick another posting.')}</td></tr>`;
}

async function refreshApplicants(filterId) {
  applicantCache = await api.recruiter.getApplicants();
  renderApplicants(filterId);
}

function signalRow(s) {
  return `<tr>
      <td>${escapeHtml(s.skill)}</td>
      <td class="col-num">${s.horizon_months}mo</td>
      <td class="text-caption">${escapeHtml(s.note || '—')}</td>
      <td class="text-caption">${escapeHtml(s.created_at)}</td>
    </tr>`;
}

/* PS 26134 asks for "employer surveys" as an input the platform combines
   with job postings. A posting says what a company needs today; this is
   the forward-looking half — what a recruiter expects to need next — kept
   as the recruiter's own stated opinion, never inferred or generated. */
async function renderSkillSignals(el) {
  const data = await api.getSkillSignals();
  el.innerHTML = `
    <section class="card mb-5">
      <h2 class="text-section-heading mb-1">Skills you expect to matter more</h2>
      <p class="text-body mb-3">
        A quick forward-looking signal — separate from your postings — that feeds the
        platform's skill-demand picture for training providers and the placement cell.
      </p>
      <form id="signalForm" class="flex items-end gap-3 mb-3" style="flex-wrap:wrap;">
        <label class="text-caption" style="flex:1;min-width:160px;">Skill
          <input class="form-input" id="signalSkill" maxlength="80" required placeholder="e.g. Kubernetes" />
        </label>
        <label class="text-caption">In the next
          <select class="form-input" id="signalHorizon">
            <option value="6">6 months</option>
            <option value="12" selected>12 months</option>
            <option value="24">24 months</option>
          </select>
        </label>
        <label class="text-caption" style="flex:2;min-width:220px;">Note (optional)
          <input class="form-input" id="signalNote" maxlength="300" placeholder="Why this skill" />
        </label>
        <button class="btn btn-primary" type="submit">Submit</button>
      </form>
      ${
        data.mine && data.mine.length
          ? `<div class="table-wrap"><table class="admin-table">
               <thead><tr><th>Skill</th><th class="col-num">Horizon</th><th>Note</th><th>Submitted</th></tr></thead>
               <tbody>${data.mine.map(signalRow).join('')}</tbody>
             </table></div>`
          : `<p class="text-caption">Nothing submitted yet.</p>`
      }
    </section>`;

  document.getElementById('signalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const skill = document.getElementById('signalSkill').value.trim();
    if (!skill) return;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await api.submitSkillSignal({
        skill,
        horizon_months: Number(document.getElementById('signalHorizon').value),
        note: document.getElementById('signalNote').value.trim(),
      });
      showToast('Thanks — recorded for the skill-demand picture.', 'success');
      await renderSkillSignals(el);
    } catch (err) {
      showToast(err.message || 'Could not record that.', 'error');
      btn.disabled = false;
    }
  });
}

(async function initRecruiter() {
  if (!requireAuth()) return;
  if (!hasRole(ROLES.RECRUITER, ROLES.INSTITUTION, ROLES.FACULTY)) {
    window.location.href = 'dashboard.html';
    return;
  }

  const name = localStorage.getItem('cn_student_name') || 'Recruiter';
  const pageBody = mountAppShell('recruiter.html', name);
  pageBody.innerHTML = loadingState('Loading your hiring pipeline...');

  try {
    const [postings, applicants] = await Promise.all([
      api.recruiter.getPostings(),
      api.recruiter.getApplicants(),
    ]);
    applicantCache = applicants;

    const totalApplicants = postings.reduce((n, p) => n + p.applicants, 0);
    const totalShortlisted = postings.reduce((n, p) => n + p.shortlisted, 0);

    pageBody.innerHTML = `
      <h1 class="text-page-heading mb-1">Recruiter Portal</h1>
      <p class="text-body mb-5">Your postings and every candidate who applied, ranked by how well their verified skills fit the role.</p>

      <div class="stat-grid mb-5">
        ${[
          ['Live Postings', postings.length],
          ['Total Applicants', totalApplicants],
          ['Shortlisted', totalShortlisted],
          ['Avg. Match', applicants.length ? `${Math.round(applicants.reduce((n, a) => n + a.match_score, 0) / applicants.length)}%` : '—'],
        ]
          .map(
            ([label, value]) => `
          <div class="card stat-card">
            <p class="stat-value">${escapeHtml(String(value))}</p>
            <p class="text-label">${label}</p>
          </div>`
          )
          .join('')}
      </div>

      <div id="skillSignalMount"></div>

      <section class="card mb-5">
        <div class="flex items-center justify-between mb-3" style="flex-wrap:wrap;gap:12px;">
          <h2 class="text-section-heading">Your Postings</h2>
          <a class="btn btn-primary btn-sm" href="post-opportunity.html">+ Post an Opportunity</a>
        </div>
        ${
          postings.length
            ? `<div class="table-wrap">
                 <table class="admin-table admin-table--wide">
                   <thead><tr>
                     <th>Role</th><th>Mode</th><th class="col-num">Openings</th>
                     <th class="col-num">Applicants</th><th class="col-num">Shortlisted</th><th>Deadline</th><th>Actions</th>
                   </tr></thead>
                   <tbody>${postings.map(postingRow).join('')}</tbody>
                 </table>
               </div>`
            : emptyState('📭', 'No postings yet', 'Publish a role and matched students will see it immediately.',
                '<a class="btn btn-primary" href="post-opportunity.html">Post an Opportunity</a>')
        }
      </section>

      <section class="card">
        <div class="flex items-center justify-between mb-3" style="flex-wrap:wrap;gap:12px;">
          <h2 class="text-section-heading">Candidate Shortlisting</h2>
          <span class="text-caption" id="applicantCount"></span>
        </div>
        <div class="admin-toolbar">
          <select class="form-input" id="postingFilter">
            <option value="">All postings</option>
            ${postings.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.title)}</option>`).join('')}
          </select>
          <label class="text-caption">Min match
            <select class="form-input" id="minMatch">
              <option value="0">Any</option>
              <option value="40">40%+</option>
              <option value="60">60%+</option>
              <option value="80">80%+</option>
            </select>
          </label>
        </div>
        <div class="table-wrap">
          <table class="admin-table admin-table--wide">
            <thead><tr>
              <th>Candidate</th><th>Applied For</th><th class="col-num">Match</th>
              <th class="col-num">CGPA</th><th>Skills</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody id="applicantBody"></tbody>
          </table>
        </div>
      </section>
    `;

    const postingFilter = document.getElementById('postingFilter');
    postingFilter.addEventListener('change', () => renderApplicants(postingFilter.value));
    document.getElementById('minMatch').addEventListener('change', () => renderApplicants(postingFilter.value));

    // "View Applicants" on a posting row just drives the filter below it.
    pageBody.addEventListener('click', async (e) => {
      const view = e.target.closest('[data-view]');
      if (view) {
        postingFilter.value = view.dataset.view;
        renderApplicants(view.dataset.view);
        document.getElementById('applicantBody').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      const setBtn = e.target.closest('[data-set]');
      if (setBtn) {
        setBtn.disabled = true;
        try {
          await api.recruiter.setApplicationStatus(setBtn.dataset.app, setBtn.dataset.set);
          showToast(`Candidate ${statusLabel(setBtn.dataset.set).toLowerCase()}.`, 'success');
          await refreshApplicants(postingFilter.value);
        } catch (err) {
          showToast(err.message || 'Could not update the application.', 'error');
          setBtn.disabled = false;
        }
        return;
      }

      const doneBtn = e.target.closest('[data-complete]');
      if (doneBtn) {
        doneBtn.disabled = true;
        try {
          await api.recruiter.completeInternship(doneBtn.dataset.complete);
          showToast('Internship marked complete and signed into the student portfolio.', 'success');
          await refreshApplicants(postingFilter.value);
        } catch (err) {
          showToast(err.message || 'Could not complete the internship.', 'error');
          doneBtn.disabled = false;
        }
      }
    });

    renderApplicants('');

    if (hasRole(ROLES.RECRUITER)) {
      renderSkillSignals(document.getElementById('skillSignalMount')).catch(() => {});
    }
  } catch (err) {
    pageBody.innerHTML = errorState(err.message || 'Could not load the recruiter portal.', 'location.reload');
  }
})();
