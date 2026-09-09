/**
 * CareerNexus — Learning Paths
 * Every gap the platform found, ranked by how many open roles that one skill
 * would unlock, each with real courses attached. Industry-published programs
 * are listed first because they come with a hiring partner behind them.
 */

const PROGRAM_ICONS = {
  course: '📘',
  certification: '🎖️',
  workshop: '🛠️',
  mentorship: '🧑‍🏫',
};

function programCard(p) {
  const isIndustry = p.source === 'industry';
  const isOfficial = p.source === 'official';
  return `
    <article class="program-card${isIndustry ? ' program-industry' : ''}${isOfficial ? ' program-official' : ''}">
      <div class="program-head">
        <span class="program-icon" aria-hidden="true">${PROGRAM_ICONS[p.program_type] || '📘'}</span>
        <div>
          <h4 class="program-title">${escapeHtml(p.title)}</h4>
          <p class="program-provider">${escapeHtml(p.provider)}</p>
        </div>
        ${isIndustry ? '<span class="badge badge-success">Industry partner</span>' : ''}
        ${isOfficial ? '<span class="source-badge source-official">🌐 Official platform</span>' : ''}
      </div>
      ${p.description ? `<p class="text-caption mb-2">${escapeHtml(p.description)}</p>` : ''}
      <div class="program-meta">
        <span>${escapeHtml((p.program_type || '').replace(/^\w/, (c) => c.toUpperCase()))}</span>
        ${p.duration ? `<span>⏱ ${escapeHtml(p.duration)}</span>` : ''}
        ${p.cost ? `<span>💰 ${escapeHtml(p.cost)}</span>` : ''}
        ${p.certificate ? '<span>🎖️ Certificate</span>' : ''}
      </div>
      ${p.eligibility ? `<p class="text-caption mt-2">✅ ${escapeHtml(p.eligibility)}</p>` : ''}
      <div class="mt-3">
        ${officialLinkButton(p.url, 'Official Website', 'btn btn-secondary btn-sm')}
      </div>
    </article>`;
}

function gapBlock(rec) {
  const badge =
    rec.priority === 'HIGH' ? 'badge-danger' : rec.priority === 'MEDIUM' ? 'badge-warning' : 'badge-info';
  return `
    <section class="card mb-5">
      <div class="gap-head">
        <div>
          <span class="badge ${badge}">${escapeHtml(rec.priority)} PRIORITY</span>
          <h2 class="text-section-heading mt-2 mb-1">${escapeHtml(rec.skill)}</h2>
          <p class="text-caption">
            Learning this unlocks <strong>${rec.opportunities_unlocked}</strong>
            open ${rec.opportunities_unlocked === 1 ? 'role' : 'roles'} you cannot currently match.
          </p>
        </div>
        <a class="btn btn-ghost btn-sm" href="opportunities.html?search=${encodeURIComponent(rec.skill)}">See those roles</a>
      </div>
      <div class="program-grid mt-4">${rec.programs.map(programCard).join('')}</div>
    </section>`;
}

async function renderCatalogue(container) {
  try {
    const programs = await api.listLearningPrograms();
    if (!programs.length) {
      container.innerHTML = `<div class="card">${emptyState(
        '🎓',
        'No industry programs yet',
        'Companies publish training, certifications and mentorship here. Check back soon.'
      )}</div>`;
      return;
    }
    container.innerHTML = `
      <h2 class="text-section-heading mb-1">All Courses &amp; Certifications</h2>
      <p class="text-caption mb-4">
        Official platforms and industry partners, whether or not they close one of your gaps.
        Every link opens the provider's own website — CareerNexus does not host these courses.
      </p>
      <div class="program-grid">${programs.map(programCard).join('')}</div>`;
  } catch (err) {
    container.innerHTML = `<div class="card"><p class="form-error">${escapeHtml(err.message)}</p></div>`;
  }
}

(async function initLearning() {
  if (!requireAuth()) return;
  const studentName = localStorage.getItem('cn_student_name') || 'Student';
  const pageBody = mountAppShell('learning.html', studentName);
  pageBody.innerHTML = loadingState('Working out what to learn next...');

  try {
    const data = await api.getLearningRecommendations();

    pageBody.innerHTML = `
      <h1 class="text-page-heading mb-1">Learning Paths</h1>
      <p class="text-body mb-5">
        Built from the gap between your skill profile and what employers on the platform are
        actually asking for — ordered so the skill that opens the most doors comes first.
      </p>
      <div id="gapList"></div>
      <div id="catalogue" class="mt-6"></div>
    `;

    const gapList = document.getElementById('gapList');
    if (!data.recommendations.length) {
      gapList.innerHTML = `<div class="card mb-5">${emptyState(
        '🎉',
        'No skill gaps found',
        data.gaps_found
          ? 'We could not find a course for your remaining gaps yet — the industry catalogue below is still worth a look.'
          : 'You already have every skill the open roles ask for. Take the assessment again to test yourself more deeply.',
        '<a class="btn btn-primary" href="opportunities.html">Browse Opportunities</a>'
      )}</div>`;
    } else {
      gapList.innerHTML = data.recommendations.map(gapBlock).join('');
    }

    renderCatalogue(document.getElementById('catalogue'));
  } catch (err) {
    pageBody.innerHTML = errorState(err.message || 'Could not load your learning path.', 'location.reload');
  }
})();
