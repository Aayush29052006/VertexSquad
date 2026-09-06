/**
 * CareerNexus — Jobs & Opportunities
 * Internships, full-time jobs, apprenticeships and live projects for
 * students; FDPs, industrial training and research projects for faculty.
 * The backend decides which track you see from your role.
 */

const TYPE_LABELS = {
  internship: 'Internship',
  job: 'Full-time Job',
  apprenticeship: 'Apprenticeship',
  project: 'Live Project',
  fdp: 'Faculty Development Programme',
  training: 'Industrial Training',
};

const TYPE_ICONS = {
  internship: '💼',
  job: '🏢',
  apprenticeship: '🔧',
  project: '🚀',
  fdp: '🎓',
  training: '🏭',
};

let allOpportunities = [];

function opportunityCard(item) {
  const pct = Math.max(0, Math.min(100, Number(item.match_score) || 0));
  const { tier } = getMatchTier(pct);
  const missing = (item.missing_skills || []).slice(0, 4);

  return `
    <article class="card card-hover opp-card">
      <div class="opp-head">
        <div>
          <span class="opp-type">${TYPE_ICONS[item.opportunity_type] || '💼'} ${escapeHtml(
    TYPE_LABELS[item.opportunity_type] || item.opportunity_type
  )}</span>
          <h3 class="text-card-heading mt-1">${escapeHtml(item.title)}</h3>
          <p class="company-name">${escapeHtml(item.company)}</p>
        </div>
        <div class="match-ring match-${tier}" style="width:56px;height:56px;flex-shrink:0;">
          <svg viewBox="0 0 56 56">
            <circle class="ring-bg" cx="28" cy="28" r="24"></circle>
            <circle class="ring-fg" cx="28" cy="28" r="24"
              stroke-dasharray="${2 * Math.PI * 24}"
              stroke-dashoffset="${2 * Math.PI * 24 * (1 - pct / 100)}"></circle>
          </svg>
          <div class="ring-value" style="font-size:0.85rem;">${pct}%</div>
        </div>
      </div>

      ${item.description ? `<p class="text-caption mb-3">${escapeHtml(item.description)}</p>` : ''}

      <div class="internship-meta">
        <span>📍 ${escapeHtml(item.location)}</span>
        <span>💻 ${escapeHtml(item.work_mode)}</span>
        ${item.stipend ? `<span>💰 ${escapeHtml(item.stipend)}</span>` : ''}
        ${item.duration ? `<span>⏱ ${escapeHtml(item.duration)}</span>` : ''}
        ${item.openings > 1 ? `<span>👥 ${item.openings} openings</span>` : ''}
        ${item.min_cgpa ? `<span>🎓 Min CGPA ${item.min_cgpa}</span>` : ''}
      </div>

      <div class="internship-chips mt-2">${(item.matched_skills || []).map((s) => skillChip(s)).join('')}</div>
      ${
        missing.length
          ? `<div class="mt-2">
               <p class="text-label mb-1">Missing</p>
               <div class="internship-chips">${missing.map((s) => skillChip(s, 'missing')).join('')}</div>
             </div>`
          : ''
      }

      <div class="internship-footer">
        <span class="text-caption">${item.deadline ? `Deadline: ${formatDate(item.deadline)}` : 'Open until filled'}</span>
        <div class="flex gap-2">
          <a class="btn btn-ghost btn-sm" href="what-if.html?id=${encodeURIComponent(item.id)}">What-If</a>
          <a class="btn btn-primary btn-sm" href="internship-details.html?id=${encodeURIComponent(item.id)}">View & Apply</a>
        </div>
      </div>
    </article>`;
}

function applyFilters() {
  const type = document.getElementById('typeFilter').value;
  const mode = document.getElementById('modeFilter').value;
  const search = document.getElementById('searchInput').value.trim().toLowerCase();

  const filtered = allOpportunities.filter((o) => {
    if (type && o.opportunity_type !== type) return false;
    if (mode && (o.work_mode || '').toLowerCase() !== mode.toLowerCase()) return false;
    if (search) {
      const haystack = [o.title, o.company, o.location, ...(o.required_skills || [])].join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const list = document.getElementById('oppList');
  document.getElementById('resultCount').textContent =
    `${filtered.length} ${filtered.length === 1 ? 'opportunity' : 'opportunities'}`;

  list.innerHTML = filtered.length
    ? filtered.map(opportunityCard).join('')
    : emptyState('🔍', 'Nothing matches those filters', 'Try widening the type or work mode.');
}

(async function initOpportunities() {
  if (!requireAuth()) return;
  const studentName = localStorage.getItem('cn_student_name') || 'Student';
  const pageBody = mountAppShell('opportunities.html', studentName);
  pageBody.innerHTML = loadingState('Finding opportunities that match you...');

  const faculty = currentRole() === ROLES.FACULTY;

  try {
    allOpportunities = await api.listOpportunities();
    const types = [...new Set(allOpportunities.map((o) => o.opportunity_type))];

    pageBody.innerHTML = `
      <h1 class="text-page-heading mb-1">${faculty ? 'Faculty Opportunities' : 'Jobs & Opportunities'}</h1>
      <p class="text-body mb-4">
        ${
          faculty
            ? 'Faculty internships, industrial training, FDPs and joint projects — matched against your own skill profile.'
            : 'Internships, full-time roles, apprenticeships and live projects, ranked by how well they match your skill profile.'
        }
      </p>

      <div class="admin-toolbar">
        <input class="form-input" id="searchInput" placeholder="Search role, company or skill" />
        <select class="form-input" id="typeFilter">
          <option value="">All types</option>
          ${types.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(TYPE_LABELS[t] || t)}</option>`).join('')}
        </select>
        <select class="form-input" id="modeFilter">
          <option value="">Any work mode</option>
          <option value="Remote">Remote</option>
          <option value="Hybrid">Hybrid</option>
          <option value="On-site">On-site</option>
        </select>
        <span class="text-caption" id="resultCount"></span>
      </div>

      <div class="opp-grid" id="oppList"></div>
    `;

    // Deep link from the learning page: ?search=Docker pre-fills the box.
    const preset = new URLSearchParams(window.location.search).get('search');
    if (preset) document.getElementById('searchInput').value = preset;

    document.getElementById('searchInput').addEventListener('input', applyFilters);
    document.getElementById('typeFilter').addEventListener('change', applyFilters);
    document.getElementById('modeFilter').addEventListener('change', applyFilters);
    applyFilters();
  } catch (err) {
    pageBody.innerHTML = errorState(err.message || 'Could not load opportunities.', 'location.reload');
  }
})();
