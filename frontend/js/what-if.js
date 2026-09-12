/**
 * CareerNexus — What-If Analysis (Phase 2)
 * Scores are always computed by the backend; the frontend only sends
 * the candidate skill list and renders whatever score comes back.
 */
let addedSkills = [];
let whatIfInternship = null;

function getIdFromUrl() {
  return new URLSearchParams(window.location.search).get('id');
}

function renderWhatIf(pageBody, item) {
  pageBody.innerHTML = `
    <h1 class="text-page-heading mb-1">What-If Analysis</h1>
    <p class="text-body mb-5">See how learning new skills could change your match for <strong>${escapeHtml(item.title)}</strong> at ${escapeHtml(item.company)}.</p>

    <div class="card">
      <p class="text-label mb-2">What if I learn...</p>
      <div class="flex gap-2 mb-3" style="flex-wrap:wrap;">
        ${item.missing_skills.map((s) => `<button class="btn btn-secondary btn-sm" data-suggest="${escapeHtml(s)}" type="button">+ ${escapeHtml(s)}</button>`).join('')}
      </div>
      <div class="flex gap-2">
        <input class="form-input" id="skillInput" placeholder="Type a skill and press Add" style="max-width:280px;" />
        <button class="btn btn-secondary" id="addBtn" type="button">Add</button>
      </div>
      <div class="chip-row mt-3" id="addedChips"></div>

      <div class="whatif-compare" id="compareBlock" hidden>
        <div class="whatif-score">
          <div class="text-label">Current Match</div>
          <div class="num" id="currentScore">—</div>
        </div>
        <div class="whatif-delta" id="deltaScore"></div>
        <div class="whatif-score">
          <div class="text-label">Potential Match</div>
          <div class="num" style="color:var(--success);" id="potentialScore">—</div>
        </div>
      </div>

      <button class="btn btn-primary btn-lg mt-4" id="calcBtn" disabled>Calculate Potential Match</button>
      <p id="whatIfError" class="form-error mt-3" hidden></p>
    </div>

    <div class="card mt-5">${matchFormulaExplainer()}</div>
  `;

  const skillInput = document.getElementById('skillInput');
  const addedChipsEl = document.getElementById('addedChips');
  const calcBtn = document.getElementById('calcBtn');

  function refreshChips() {
    addedChipsEl.innerHTML = addedSkills.map((s) => `<span class="skill-chip chip-removable">${escapeHtml(s)} <button class="chip-remove" data-remove="${escapeHtml(s)}" aria-label="Remove ${escapeHtml(s)}">&times;</button></span>`).join('');
    calcBtn.disabled = addedSkills.length === 0;
    addedChipsEl.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        addedSkills = addedSkills.filter((s) => s !== btn.dataset.remove);
        refreshChips();
      });
    });
  }

  document.querySelectorAll('[data-suggest]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const skill = btn.dataset.suggest;
      if (!addedSkills.includes(skill)) addedSkills.push(skill);
      refreshChips();
    });
  });

  document.getElementById('addBtn').addEventListener('click', () => {
    const value = skillInput.value.trim();
    if (value && !addedSkills.includes(value)) {
      addedSkills.push(value);
      skillInput.value = '';
      refreshChips();
    }
  });

  calcBtn.addEventListener('click', async () => {
    const errorEl = document.getElementById('whatIfError');
    errorEl.hidden = true;
    calcBtn.disabled = true;
    calcBtn.innerHTML = '<span class="spinner"></span> Calculating...';
    try {
      const result = await api.getWhatIfScore(item.id, addedSkills);
      const gain = result.potential_match - result.current_match;
      document.getElementById('compareBlock').hidden = false;
      document.getElementById('currentScore').textContent = `${result.current_match}%`;
      document.getElementById('potentialScore').textContent = `${result.potential_match}%`;
      document.getElementById('deltaScore').textContent = `+${gain}% →`;

      // A +0% result is a real answer, not a failure - say why, otherwise it
      // just looks like the calculator is broken.
      if (gain === 0) {
        const missing = item.missing_skills || [];
        errorEl.style.color = 'var(--text-muted)';
        errorEl.textContent = missing.length
          ? `These skills aren't required for this role. Try ${missing.slice(0, 3).join(', ')} instead.`
          : 'You already have every skill this role asks for — your score is limited by preferences, CGPA and projects rather than skills.';
        errorEl.hidden = false;
      } else {
        errorEl.style.color = '';
      }
    } catch (err) {
      errorEl.textContent = err.message || 'Unable to calculate potential match right now.';
      errorEl.hidden = false;
    } finally {
      calcBtn.disabled = addedSkills.length === 0;
      calcBtn.textContent = 'Calculate Potential Match';
    }
  });

  refreshChips();
}

(async function initWhatIf() {
  if (!requireAuth()) return;
  const studentName = localStorage.getItem('cn_student_name') || 'Student';
  const pageBody = mountAppShell('what-if.html', studentName);
  pageBody.innerHTML = loadingState('Loading internship...');

  try {
    let id = getIdFromUrl();
    if (!id) {
      const recs = await api.getRecommendations();
      id = recs[0]?.id;
    }
    if (!id) {
      pageBody.innerHTML = emptyState('🔮', 'No internship selected.', 'Explore internships first, then run a what-if analysis from any listing.', '<a href="internships.html" class="btn btn-primary">Explore Internships</a>');
      return;
    }
    whatIfInternship = await api.getInternshipDetails(id);
    renderWhatIf(pageBody, whatIfInternship);
  } catch (err) {
    pageBody.innerHTML = errorState(err.message || 'Unable to load this internship.', 'location.reload');
  }
})();
