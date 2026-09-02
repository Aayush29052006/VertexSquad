/**
 * CareerNexus — Internship Discovery Page
 */
let allInternships = [];

function applyFiltersAndRender() {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  const workMode = document.getElementById('workModeFilter').value;
  const minMatch = Number(document.getElementById('matchFilter').value);
  const sortBy = document.getElementById('sortSelect').value;

  let results = allInternships.filter((item) => {
    const matchesQuery = !query || [item.title, item.company, item.location, ...item.required_skills]
      .join(' ').toLowerCase().includes(query);
    const matchesMode = !workMode || item.work_mode === workMode;
    const matchesScore = item.match_score >= minMatch;
    return matchesQuery && matchesMode && matchesScore;
  });

  if (sortBy === 'match') results.sort((a, b) => b.match_score - a.match_score);
  if (sortBy === 'deadline') results.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

  const grid = document.getElementById('resultsGrid');
  document.getElementById('resultsCount').textContent = `${results.length} internship${results.length === 1 ? '' : 's'} found`;

  if (!results.length) {
    grid.innerHTML = emptyState('🔍', 'No internships match your filters.', 'Try adjusting your search or filters to see more opportunities.');
    return;
  }
  grid.innerHTML = `<div class="recommend-grid">${results.map(internshipCardHtml).join('')}</div>`;
}

(async function initInternships() {
  if (!requireAuth()) return;
  const studentName = localStorage.getItem('cn_student_name') || 'Student';
  const pageBody = mountAppShell('internships.html', studentName);

  pageBody.innerHTML = `
    <h1 class="text-page-heading mb-2">Discover Internships</h1>
    <p class="text-body mb-5">Search and filter opportunities matched to your skills.</p>

    <div class="search-bar">
      <input class="form-input" id="searchInput" placeholder="Search by role, skill, or company..." />
    </div>
    <div class="filter-bar">
      <select class="form-select" id="workModeFilter">
        <option value="">All Work Modes</option>
        <option>Remote</option>
        <option>Hybrid</option>
        <option>On-site</option>
      </select>
      <select class="form-select" id="matchFilter">
        <option value="0">Any Match Score</option>
        <option value="80">80%+ Excellent</option>
        <option value="60">60%+ Good</option>
        <option value="40">40%+ Moderate</option>
      </select>
      <select class="form-select" id="sortSelect">
        <option value="match">Sort: Best Match</option>
        <option value="deadline">Sort: Deadline</option>
      </select>
      <span class="results-count" id="resultsCount"></span>
    </div>

    <div id="resultsGrid">${skeletonCards(3)}</div>
  `;

  try {
    allInternships = await api.getRecommendations();
    applyFiltersAndRender();
  } catch (err) {
    document.getElementById('resultsGrid').innerHTML = errorState(err.message || 'Unable to load internships.', 'location.reload');
    return;
  }

  ['searchInput'].forEach((id) => document.getElementById(id).addEventListener('input', applyFiltersAndRender));
  ['workModeFilter', 'matchFilter', 'sortSelect'].forEach((id) => document.getElementById(id).addEventListener('change', applyFiltersAndRender));
})();
