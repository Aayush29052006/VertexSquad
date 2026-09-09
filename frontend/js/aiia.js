/**
 * CareerNexus — AIIA Opportunity Hub
 *
 * SIH26044 is set by the All India Institute of Ayurveda, so this page
 * gathers what AIIA itself offers students: courses, training, research,
 * conferences, notices and vacancies.
 *
 * Every card here belongs to the institute, not to us. There is no apply
 * button anywhere on this page — each item links to aiia.gov.in, which is
 * where applications are actually made.
 */

const CATEGORY_ICONS = {
  'Certificate Course': '🎖️',
  'Online Course': '💻',
  'Workshop': '🛠️',
  'Training Programme': '🔬',
  'Conference': '🎤',
  'Seminar': '📢',
  'Research / Doctoral': '🧪',
};

let hub = null;

function programmeCard(p) {
  return `
    <article class="card card-hover aiia-card" data-category="${escapeHtml(p.category)}">
      <div class="aiia-card-head">
        <span class="aiia-icon" aria-hidden="true">${CATEGORY_ICONS[p.category] || '📘'}</span>
        <div>
          <span class="opp-type">${escapeHtml(p.category)}</span>
          <h3 class="text-card-heading mt-1">${escapeHtml(p.title)}</h3>
          <p class="company-name">${escapeHtml(p.department)}</p>
        </div>
      </div>

      ${p.description ? `<p class="text-caption mb-3">${escapeHtml(p.description)}</p>` : ''}

      <dl class="aiia-facts">
        <div><dt>Mode</dt><dd>${p.mode === 'Online' ? '💻' : '🏛️'} ${escapeHtml(p.mode)}</dd></div>
        <div><dt>Location</dt><dd>${escapeHtml(p.location)}</dd></div>
        <div><dt>Duration</dt><dd>${escapeHtml(p.duration)}</dd></div>
        <div><dt>Eligibility</dt><dd>${escapeHtml(p.eligibility)}</dd></div>
        <div><dt>Fees</dt><dd>${escapeHtml(p.fees)}</dd></div>
        <div><dt>Certificate</dt><dd>${p.certificate ? '✅ Yes' : '—'}</dd></div>
      </dl>

      <div class="internship-footer">
        <span class="text-caption">
          ${p.deadline ? deadlineBadge(p.deadline) : (p.announced ? `Announced ${formatDate(p.announced)}` : 'See the institute notice board')}
        </span>
        <div class="flex gap-2" style="flex-wrap:wrap;">
          ${officialLinkButton(p.section_url, 'Section', 'btn btn-ghost btn-sm')}
          ${officialLinkButton(p.official_url, 'Official Details', 'btn btn-primary btn-sm')}
        </div>
      </div>
    </article>`;
}

function sectionGroup(group) {
  return `
    <section class="card mb-4">
      <h3 class="text-section-heading mb-3">${escapeHtml(group.group)}</h3>
      <div class="aiia-links">
        ${group.links
          .map(
            (l) => `
          <div class="aiia-link-row">
            <div>
              <strong>${escapeHtml(l.label)}</strong>
              <p class="text-caption">${escapeHtml(l.note)}</p>
            </div>
            ${officialLinkButton(l.url, 'Open', 'btn btn-secondary btn-sm')}
          </div>`
          )
          .join('')}
      </div>
    </section>`;
}

function render(pageBody) {
  const active = document.querySelector('.aiia-chip.active');
  const category = active ? active.dataset.category : '';
  const list = document.getElementById('aiiaList');
  const rows = category ? hub.programmes.filter((p) => p.category === category) : hub.programmes;

  document.getElementById('aiiaCount').textContent =
    `${rows.length} ${rows.length === 1 ? 'programme' : 'programmes'}`;
  list.innerHTML = rows.length
    ? rows.map(programmeCard).join('')
    : emptyState('🔍', 'Nothing in this category', 'Try another category, or open the institute notice board.');
}

(async function initAiia() {
  if (!requireAuth()) return;
  const name = localStorage.getItem('cn_student_name') || 'Student';
  const pageBody = mountAppShell('aiia.html', name);
  pageBody.innerHTML = loadingState('Loading AIIA opportunities...');

  try {
    hub = await api.getAiiaHub();

    pageBody.innerHTML = `
      <h1 class="text-page-heading mb-1">AIIA Opportunity Hub</h1>
      <p class="text-body mb-2">
        ${escapeHtml(hub.organisation)} — an autonomous institute under the
        ${escapeHtml(hub.ministry)}, and the department behind this problem statement.
      </p>
      <p class="text-caption mb-5">
        🌐 Everything on this page is published by AIIA. Applications are made on the
        institute's own website, never through CareerNexus — we only help you find them.
        ${officialLinkButton(hub.website, 'aiia.gov.in', 'btn btn-ghost btn-sm')}
      </p>

      <div class="admin-toolbar" id="aiiaChips">
        <button type="button" class="aiia-chip active" data-category="">All</button>
        ${hub.categories
          .map(
            (c) => `<button type="button" class="aiia-chip" data-category="${escapeHtml(c.name)}">
                      ${CATEGORY_ICONS[c.name] || '📘'} ${escapeHtml(c.name)} (${c.count})
                    </button>`
          )
          .join('')}
        <span class="text-caption" id="aiiaCount"></span>
      </div>

      <div class="opp-grid mb-6" id="aiiaList"></div>

      <h2 class="text-section-heading mb-1">Official AIIA Sections</h2>
      <p class="text-caption mb-4">
        Direct links into the institute's website — admissions, research, notices,
        vacancies, tenders and events. These pages stay put as intakes come and go.
      </p>
      <div class="split-2">${hub.sections.map(sectionGroup).join('')}</div>
    `;

    document.getElementById('aiiaChips').addEventListener('click', (e) => {
      const chip = e.target.closest('.aiia-chip');
      if (!chip) return;
      document.querySelectorAll('.aiia-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      render(pageBody);
    });

    render(pageBody);
  } catch (err) {
    pageBody.innerHTML = errorState(err.message || 'Could not load the AIIA hub.', 'location.reload');
  }
})();
