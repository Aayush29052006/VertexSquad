/**
 * CareerNexus — Internship Details Page
 */
let currentInternship = null;
let currentResume = null;

function getIdFromUrl() {
  return new URLSearchParams(window.location.search).get('id');
}

function renderBreakdown(breakdown, overall) {
  const rows = Object.entries(breakdown).map(([label, value]) => {
    const pct = Math.max(0, Math.min(100, Number(value) || 0));
    return `
    <div class="breakdown-row">
      <div class="breakdown-top"><span>${escapeHtml(label)}</span><span>${pct}%</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%;"></div></div>
    </div>
  `;
  }).join('');
  const overallPct = Math.max(0, Math.min(100, Number(overall) || 0));
  return `
    ${rows}
    <div class="divider"></div>
    <div class="breakdown-row">
      <div class="breakdown-top"><strong>Overall Match</strong><strong>${overallPct}%</strong></div>
      <div class="progress-track"><div class="progress-fill fill-success" style="width:${overallPct}%;"></div></div>
    </div>
  `;
}

function renderDetails(pageBody, item) {
  document.title = `${item.title} — CareerNexus`;
  pageBody.innerHTML = `
    <a href="opportunities.html" class="text-caption" style="color:var(--primary);">← Back to Opportunities</a>

    <div class="details-header mt-3">
      <div>
        <h1 class="text-page-heading">${escapeHtml(item.title)}</h1>
        <p class="text-body mt-1">${escapeHtml(item.company)}</p>
        <div class="mt-2">${sourceBadge(item)}</div>
        <div class="details-meta-row">
          <span>📍 ${escapeHtml(item.location)}</span>
          <span>💻 ${escapeHtml(item.work_mode)}</span>
          <span>💰 ${escapeHtml(item.stipend)}</span>
          <span>⏱️ ${escapeHtml(item.duration)}</span>
        </div>
      </div>
      ${matchRingSvg(item.match_score, 96)}
    </div>

    <div class="details-grid">
      <div>
        <div class="card mb-5">
          <h2 class="text-section-heading mb-1">Match Breakdown</h2>
          <p class="text-caption mb-3">
            Each row below is that factor's own score out of 100. They combine at
            <strong>50% skills · 20% preferences · 15% education · 15% projects</strong>
            to produce the overall match — which is why a single strong factor can't
            carry the score on its own.
          </p>
          ${renderBreakdown(item.breakdown, item.match_score)}
        </div>

        <div class="card mb-5">${matchFormulaExplainer()}</div>

        <div class="card mb-5">
          <h2 class="text-section-heading mb-2">Why You're a Match</h2>
          <p class="text-body mb-3">You match ${item.matched_skills.length}/${item.required_skills.length} required skills.</p>
          <p class="text-label mb-2">Your Strongest Matches</p>
          <div class="chip-row">${item.matched_skills.map((s) => skillChip(s)).join('')}</div>
        </div>

        ${item.missing_skills.length ? `
        <div class="card mb-5">
          <h2 class="text-section-heading mb-2">Skill Gap</h2>
          <p class="text-body mb-3">You should improve:</p>
          <div class="chip-row">${item.missing_skills.map((s) => skillChip(s, 'missing')).join('')}</div>
          <a href="skill-gap.html?id=${encodeURIComponent(item.id)}" class="btn btn-secondary mt-4">View Full Skill Gap Analysis</a>
        </div>` : ''}

        <div class="card mb-5">
          <h2 class="text-section-heading mb-3">Requirements</h2>
          <div class="req-columns">
            <div>
              <p class="text-label mb-2">Required Skills</p>
              <div class="chip-row">${item.required_skills.map((s) => `<span class="badge badge-neutral">${escapeHtml(s)}</span>`).join('')}</div>
            </div>
            <div>
              <p class="text-label mb-2">Preferred Skills</p>
              <div class="chip-row">${(item.preferred_skills || ['Communication', 'Adaptability']).map((s) => `<span class="badge badge-neutral">${escapeHtml(s)}</span>`).join('')}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <h2 class="text-section-heading mb-3">Description & Eligibility</h2>
          <p class="text-body">${escapeHtml(item.description || `${item.company} is looking for a motivated ${item.title} to join their team. You'll work closely with engineers and mentors on real production features while building your professional skill set.`)}</p>
          <p class="text-label mt-4 mb-1">Eligibility</p>
          <p class="text-body">${escapeHtml(item.eligibility || 'Open to penultimate and final-year undergraduate students from any recognized institution.')}</p>
        </div>
      </div>

      <div>
        <div class="card apply-sticky">
          <p class="text-label mb-1">Application Deadline</p>
          <p class="text-card-heading mb-4">${item.deadline ? formatDate(item.deadline) : 'Open until filled'}</p>
          ${matchBadge(item.match_score)}
          ${
            // An externally-hosted listing is applied for on its own portal.
            // We show the way there and say so plainly, instead of an Apply
            // button that would only write a row in our own database.
            isExternalListing(item)
              ? `<div class="external-apply mt-4">
                   <p class="text-caption mb-3">
                     This opportunity is hosted by <strong>${escapeHtml(item.source_name || item.company)}</strong>.
                     Applications are made on their official website, not on CareerNexus.
                   </p>
                   ${officialLinkButton(item.official_url, 'Apply on Official Portal', 'btn btn-primary btn-block btn-lg')}
                 </div>`
              : `<button class="btn btn-primary btn-block btn-lg mt-4" id="applyBtn">Apply Now</button>`
          }
          <button class="btn btn-secondary btn-block mt-3" id="prepBtn">🤖 Prepare with AI</button>
        </div>
      </div>
    </div>
  `;

  // Only present for platform-hosted listings.
  document.getElementById('applyBtn')?.addEventListener('click', openApplyModal);
  document.getElementById('prepBtn').addEventListener('click', openPrepModal);
}

/* ---------- AI Interview Prep ---------- */
async function openPrepModal() {
  const modalOverlay = document.getElementById('applyModal');
  const modal = modalOverlay.querySelector('.modal');
  modal.classList.add('modal-wide');

  const closeModal = () => {
    modalOverlay.hidden = true;
    modal.classList.remove('modal-wide');
  };

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="text-card-heading">🤖 AI Interview Prep</h3>
      <button class="modal-close" id="closePrep" aria-label="Close">&times;</button>
    </div>
    <p class="text-caption mb-4">Likely questions for <strong>${escapeHtml(currentInternship.title)}</strong> at ${escapeHtml(currentInternship.company)}</p>
    <div id="prepBody">${loadingState('Generating your interview questions...')}</div>
  `;
  modalOverlay.hidden = false;
  document.getElementById('closePrep').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

  try {
    const data = await api.getInterviewPrep(currentInternship.id);
    const badge = data.source === 'ai'
      ? '<span class="badge badge-success">AI generated</span>'
      : '<span class="badge badge-warning">Offline mode</span>';

    document.getElementById('prepBody').innerHTML = `
      <div class="mb-4">${badge}</div>
      ${data.questions.map((q, i) => `
        <div class="prep-card">
          <div class="prep-q-head">
            <span class="prep-num">${i + 1}</span>
            <span class="badge badge-neutral">${escapeHtml(q.type || 'Question')}</span>
          </div>
          <p class="prep-question">${escapeHtml(q.question)}</p>
          <details class="prep-answer">
            <summary>Show sample answer</summary>
            <p class="text-body mt-2">${escapeHtml(q.sample_answer)}</p>
          </details>
        </div>
      `).join('')}
    `;
  } catch (err) {
    document.getElementById('prepBody').innerHTML = errorState(
      err.message || 'Could not generate interview questions right now.', null
    );
  }
}

function openApplyModal() {
  const modalOverlay = document.getElementById('applyModal');
  const modal = modalOverlay.querySelector('.modal');
  modal.innerHTML = `
    <div class="modal-header">
      <h3 id="applyTitle" class="text-card-heading">Confirm Application</h3>
      <button class="modal-close" id="closeApply" aria-label="Close">&times;</button>
    </div>
    <p class="text-caption">You're applying for:</p>
    <h3 class="text-card-heading mt-1">${escapeHtml(currentInternship.title)}</h3>
    <p class="text-body">${escapeHtml(currentInternship.company)}</p>
    <div class="divider"></div>
    <div class="flex items-center gap-3 mb-3">
      <span class="text-label">Your Match Score</span>
      ${matchBadge(currentInternship.match_score)}
      <strong>${currentInternship.match_score}%</strong>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-label">Resume</span>
      <span class="text-body">${escapeHtml(currentResume?.file_name || 'No resume uploaded')}</span>
    </div>
    <div class="flex gap-3 mt-5">
      <button class="btn btn-ghost btn-block" id="cancelApply">Cancel</button>
      <button class="btn btn-primary btn-block" id="confirmApply">Confirm Application</button>
    </div>
  `;
  modalOverlay.hidden = false;

  document.getElementById('closeApply').addEventListener('click', () => { modalOverlay.hidden = true; });
  document.getElementById('cancelApply').addEventListener('click', () => { modalOverlay.hidden = true; });
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.hidden = true; });

  document.getElementById('confirmApply').addEventListener('click', async () => {
    const btn = document.getElementById('confirmApply');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Submitting...';
    try {
      await api.applyToInternship(currentInternship.id);
      modal.innerHTML = `
        <div class="state-block">
          <div class="state-icon">✅</div>
          <div class="state-title">Application Submitted ✓</div>
          <p class="state-text">You have successfully applied to ${escapeHtml(currentInternship.title)} at ${escapeHtml(currentInternship.company)}.</p>
          <a href="applications.html" class="btn btn-primary">View My Applications</a>
        </div>
      `;
    } catch (err) {
      showToast(err.message || 'Failed to submit application.', 'error');
      modalOverlay.hidden = true;
    }
  });
}

(async function initDetails() {
  if (!requireAuth()) return;
  const studentName = localStorage.getItem('cn_student_name') || 'Student';
  const pageBody = mountAppShell('opportunities.html', studentName);
  pageBody.innerHTML = loadingState('Loading internship details...');

  const id = getIdFromUrl();
  if (!id) {
    pageBody.innerHTML = errorState('No internship specified.', null);
    return;
  }

  try {
    [currentInternship, currentResume] = await Promise.all([
      api.getInternshipDetails(id),
      api.getResumeStatus().catch(() => null),
    ]);
    renderDetails(pageBody, currentInternship);
  } catch (err) {
    pageBody.innerHTML = errorState(err.message || 'Unable to load this internship.', 'location.reload');
  }
})();
