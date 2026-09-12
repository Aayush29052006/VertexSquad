/**
 * CareerNexus — Skill Assessment
 * The questionnaire the problem statement opens with. Questions arrive from
 * the backend without their answer key, and scoring happens server-side, so
 * nothing here can be gamed from DevTools.
 */

let assessmentData = null;
const answers = {};

function scoreBand(score) {
  if (score >= 80) return { cls: 'excellent', label: 'Strong' };
  if (score >= 60) return { cls: 'good', label: 'Competent' };
  if (score >= 40) return { cls: 'moderate', label: 'Developing' };
  return { cls: 'low', label: 'Needs work' };
}

/* ---------- Result view ---------- */

function renderResult(pageBody, result, isFresh) {
  const cats = Object.entries(result.category_scores || {}).sort((a, b) => b[1] - a[1]);
  const strengths = cats.filter(([, v]) => v >= 60);
  const gaps = cats.filter(([, v]) => v < 60);

  pageBody.innerHTML = `
    <h1 class="text-page-heading mb-1">Your Skill Profile</h1>
    <p class="text-body mb-5">
      ${isFresh ? 'Assessment submitted' : 'Last assessed'} on ${escapeHtml(result.submitted_at)}${
        result.attempts > 1 ? ` · attempt ${result.attempts}` : ''
      }
    </p>

    ${
      isFresh && (result.skills_added || []).length
        ? `<div class="callout callout-success mb-5">
             <strong>${result.skills_added.length} skill${result.skills_added.length === 1 ? '' : 's'} added to your profile.</strong>
             ${result.skills_added.map((s) => skillChip(s)).join(' ')}
             <p class="text-caption mt-2">These now count towards every match score and recommendation.</p>
           </div>`
        : ''
    }

    <div class="score-grid mb-5">
      <div class="card score-card score-card-lead">
        ${matchRingSvg(result.overall_score, 120)}
        <div>
          <p class="text-label">Overall Score</p>
          <p class="text-card-heading">${scoreBand(result.overall_score).label}</p>
          <p class="text-caption">Technical 50% · Soft skills 25% · Aptitude 25%</p>
        </div>
      </div>
      ${[
        ['Technical', result.technical_score],
        ['Soft Skills', result.soft_score],
        ['Aptitude', result.aptitude_score],
      ]
        .map(
          ([label, value]) => `
        <div class="card score-card">
          <p class="text-label">${label}</p>
          <p class="score-big">${value}%</p>
          <div class="bar-track"><span class="bar-fill band-${scoreBand(value).cls}" style="width:${value}%"></span></div>
        </div>`
        )
        .join('')}
    </div>

    <div class="split-2 mb-5">
      <div class="card">
        <h2 class="text-section-heading mb-1">Your Strengths</h2>
        <p class="text-caption mb-3">Areas where you scored 60% or above.</p>
        ${
          strengths.length
            ? strengths.map(([name, value]) => categoryRow(name, value)).join('')
            : '<p class="text-body">No category reached 60% yet. The learning paths below are the fastest way to change that.</p>'
        }
      </div>
      <div class="card">
        <h2 class="text-section-heading mb-1">Your Skill Gaps</h2>
        <p class="text-caption mb-3">Where the assessment says to focus next.</p>
        ${
          gaps.length
            ? gaps.map(([name, value]) => categoryRow(name, value)).join('')
            : '<p class="text-body">No gaps found — you scored 60% or above in every category.</p>'
        }
      </div>
    </div>

    ${
      (result.history || []).length > 1
        ? `<div class="card mb-5">
             <h2 class="text-section-heading mb-3">Progress Over Time</h2>
             <div class="spark-row">
               ${result.history
                 .map(
                   (h) => `
                 <div class="spark-col" title="${escapeHtml(h.submitted_at)}">
                   <div class="spark-bar" style="height:${Math.max(4, h.overall_score)}%"></div>
                   <span class="spark-label">${h.overall_score}%</span>
                 </div>`
                 )
                 .join('')}
             </div>
             <p class="text-caption mt-3">Each bar is one attempt, oldest on the left.</p>
           </div>`
        : ''
    }

    <div class="card mb-5" id="crossGapCard"></div>

    <div class="flex gap-3" style="flex-wrap:wrap;">
      <a class="btn btn-primary" href="learning.html">See My Learning Path</a>
      <a class="btn btn-secondary" href="opportunities.html">Browse Matching Roles</a>
      <button class="btn btn-ghost" id="retakeBtn" type="button">Retake Assessment</button>
    </div>
  `;

  document.getElementById('retakeBtn')?.addEventListener('click', () => startAssessment(pageBody));
  renderCrossOpportunityGaps();
}

/* ---------- Where the gaps actually bite ----------
   The assessment scores skill CATEGORIES in the abstract. This answers the
   next question a student actually has: "missing which skill costs me the
   most real opportunities?" Built from data the student already has access
   to (their own ranked opportunity list) rather than a new endpoint, and
   it links straight into the existing per-opportunity Skill Gap page for
   the deep dive — this is a summary of that page's data, not a
   replacement for it. */
async function renderCrossOpportunityGaps() {
  const card = document.getElementById('crossGapCard');
  if (!card) return;
  try {
    const opportunities = await api.listOpportunities();
    const topMatches = [...opportunities].sort((a, b) => b.match_score - a.match_score).slice(0, 10);
    if (!topMatches.length) { card.remove(); return; }

    const tally = new Map(); // skill -> { count, example: {id, title} }
    topMatches.forEach((opp) => {
      (opp.missing_skills || []).forEach((skill) => {
        const key = skill.toLowerCase();
        const entry = tally.get(key) || { skill, count: 0, example: opp };
        entry.count += 1;
        tally.set(key, entry);
      });
    });
    const ranked = [...tally.values()].sort((a, b) => b.count - a.count).slice(0, 5);

    if (!ranked.length) {
      card.innerHTML = `
        <h2 class="text-section-heading mb-1">Where Your Gaps Show Up</h2>
        <p class="text-body">You already have every skill your top ${topMatches.length} matched opportunities ask for.</p>`;
      return;
    }

    card.innerHTML = `
      <h2 class="text-section-heading mb-1">Where Your Gaps Show Up</h2>
      <p class="text-caption mb-3">Across your top ${topMatches.length} matched opportunities, these missing skills come up most often.</p>
      ${ranked
        .map(
          (r) => `
        <div class="priority-item">
          <div>
            <strong>${escapeHtml(r.skill)}</strong>
            <span class="text-caption" style="margin-left:8px;">missing from ${r.count} of ${topMatches.length}</span>
          </div>
          <a class="btn btn-secondary btn-sm" href="skill-gap.html?id=${encodeURIComponent(r.example.id)}">View Example →</a>
        </div>`
        )
        .join('')}
    `;
  } catch (_) {
    // Non-critical enrichment — the assessment result above still stands
    // on its own, so a failure here just removes the card rather than
    // showing an error state for something the user didn't explicitly ask for.
    card.remove();
  }
}

function categoryRow(name, value) {
  const band = scoreBand(value);
  return `
    <div class="cat-row">
      <span class="cat-name">${escapeHtml(name)}</span>
      <span class="bar-track"><span class="bar-fill band-${band.cls}" style="width:${value}%"></span></span>
      <span class="cat-value">${value}%</span>
    </div>`;
}

/* ---------- Questionnaire view ---------- */

function renderQuestionnaire(pageBody) {
  const sections = assessmentData.sections;

  pageBody.innerHTML = `
    <h1 class="text-page-heading mb-1">Skill Assessment</h1>
    <p class="text-body mb-4">
      ${assessmentData.total_questions} questions across three sections. There is no time limit, and
      your answers only ever improve your profile — a wrong answer marks a gap, it never removes a skill.
    </p>

    <div class="progress-sticky">
      <div class="progress-track"><span class="progress-fill" id="progressFill" style="width:0%"></span></div>
      <span class="progress-text" id="progressText">0 of ${assessmentData.total_questions} answered</span>
    </div>

    <form id="assessmentForm">
      ${sections
        .map(
          (section) => `
        <section class="card mb-5">
          <h2 class="text-section-heading mb-1">${escapeHtml(section.title)}</h2>
          <p class="text-caption mb-4">${escapeHtml(section.hint)}</p>
          ${section.questions.map((q, i) => questionHtml(q, i + 1)).join('')}
        </section>`
        )
        .join('')}

      <div class="card assessment-submit">
        <p class="text-body mb-3" id="submitHint">Answer every question to submit.</p>
        <button class="btn btn-primary btn-lg" type="submit" id="submitBtn" disabled>Submit Assessment</button>
        <p class="form-error mt-3" id="assessmentError" hidden></p>
      </div>
    </form>
  `;

  const form = document.getElementById('assessmentForm');

  form.addEventListener('change', (e) => {
    const input = e.target;
    if (input.name && input.type === 'radio') {
      answers[input.name] = Number(input.value);
      input.closest('.question')?.classList.add('answered');
      updateProgress();
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitAssessment(pageBody);
  });

  updateProgress();
}

function questionHtml(q, index) {
  return `
    <fieldset class="question" data-qid="${escapeHtml(q.id)}">
      <legend class="question-text"><span class="question-num">${index}</span>${escapeHtml(q.question)}</legend>
      <div class="options">
        ${q.options
          .map(
            (opt, i) => `
          <label class="option">
            <input type="radio" name="${escapeHtml(q.id)}" value="${i}" />
            <span>${escapeHtml(opt)}</span>
          </label>`
          )
          .join('')}
      </div>
    </fieldset>`;
}

function updateProgress() {
  const answered = Object.keys(answers).length;
  const total = assessmentData.total_questions;
  const pct = Math.round((answered / total) * 100);
  document.getElementById('progressFill').style.width = `${pct}%`;
  document.getElementById('progressText').textContent = `${answered} of ${total} answered`;

  const complete = answered === total;
  const btn = document.getElementById('submitBtn');
  btn.disabled = !complete;
  document.getElementById('submitHint').textContent = complete
    ? 'All questions answered. Submit to see your skill profile.'
    : `${total - answered} question${total - answered === 1 ? '' : 's'} left.`;
}

async function submitAssessment(pageBody) {
  const btn = document.getElementById('submitBtn');
  const errorEl = document.getElementById('assessmentError');
  errorEl.hidden = true;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Scoring...';

  try {
    const result = await api.submitAssessment(answers);
    showToast('Assessment scored. Your skill profile is updated.', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderResult(pageBody, result, true);
  } catch (err) {
    errorEl.textContent = err.message || 'Could not submit the assessment. Please try again.';
    errorEl.hidden = false;
    btn.disabled = false;
    btn.textContent = 'Submit Assessment';
  }
}

async function startAssessment(pageBody) {
  pageBody.innerHTML = loadingState('Loading the questionnaire...');
  Object.keys(answers).forEach((k) => delete answers[k]);
  try {
    assessmentData = await api.getAssessmentQuestions();
    renderQuestionnaire(pageBody);
  } catch (err) {
    pageBody.innerHTML = errorState(err.message || 'Could not load the assessment.', 'location.reload');
  }
}

(async function initAssessment() {
  if (!requireAuth()) return;
  const studentName = localStorage.getItem('cn_student_name') || 'Student';
  const pageBody = mountAppShell('assessment.html', studentName);
  pageBody.innerHTML = loadingState('Checking your assessment history...');

  try {
    const existing = await api.getAssessmentResult();
    if (existing.has_assessment) {
      renderResult(pageBody, existing, false);
    } else {
      await startAssessment(pageBody);
    }
  } catch (err) {
    pageBody.innerHTML = errorState(err.message || 'Could not load the assessment.', 'location.reload');
  }
})();
