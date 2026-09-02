/**
 * CareerNexus — Student Dashboard
 */
function getTimeOfDayGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

(async function initDashboard() {
  if (!requireAuth()) return;

  const studentName = localStorage.getItem('cn_student_name') || 'Student';
  const pageBody = mountAppShell('dashboard.html', studentName);

  pageBody.innerHTML = `
    <div class="greeting-banner">
      <h1 class="text-page-heading">${getTimeOfDayGreeting()}, ${escapeHtml(studentName.split(' ')[0])} 👋</h1>
      <p class="text-body mt-1">Here is your career overview.</p>
    </div>

    <div class="card mb-6" id="profileCompletionCard"></div>

    <div class="stat-grid" id="statGrid">
      ${skeletonCards(4)}
    </div>

    <div class="section-header">
      <div>
        <h2 class="text-section-heading">Recommended For You</h2>
        <p class="text-caption">Based on your skills, education, and preferences.</p>
      </div>
      <a class="btn btn-secondary btn-sm" href="internships.html">View All</a>
    </div>
    <div class="recommend-grid" id="recommendGrid">
      ${skeletonCards(3)}
    </div>
  `;

  try {
    const [student, recommendations] = await Promise.all([
      api.getStudentProfile(),
      api.getRecommendations(),
    ]);

    document.getElementById('profileCompletionCard').innerHTML = `
      <div class="flex justify-between items-center mb-2">
        <span class="text-label">Profile Completion</span>
        <span class="text-card-heading">${student.profile_completion}%</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${student.profile_completion}%;"></div></div>
      ${student.profile_completion < 100 ? `<a href="profile.html" class="btn btn-ghost btn-sm mt-3">Complete your profile →</a>` : ''}
    `;

    const strongMatches = recommendations.filter((r) => r.match_score >= CONFIG.MATCH_THRESHOLDS.GOOD).length;
    const applications = MOCK.applications.length;

    document.getElementById('statGrid').innerHTML = `
      <div class="stat-tile">
        <div class="stat-label">🧠 Skills Detected</div>
        <div class="stat-value">${student.skills.length}</div>
        <div class="stat-sub">From resume & profile</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">🎯 Strong Matches</div>
        <div class="stat-value">${strongMatches}</div>
        <div class="stat-sub">Internships ≥ 60% match</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">📋 Applications</div>
        <div class="stat-value">${applications}</div>
        <div class="stat-sub">Total submitted</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">🏆 Placement Readiness</div>
        <div class="stat-value">${student.placement_readiness}<span style="font-size:1.1rem;color:var(--text-muted);">/100</span></div>
        <div class="stat-sub">Overall readiness score</div>
      </div>
    `;

    const top = recommendations.slice(0, 5);
    const grid = document.getElementById('recommendGrid');
    if (!top.length) {
      grid.outerHTML = emptyState('🔍', 'No internship matches yet.', 'Complete your profile and add more skills to discover better opportunities.', '<a href="profile.html" class="btn btn-primary">Complete Profile</a>');
    } else {
      grid.innerHTML = top.map(internshipCardHtml).join('');
    }
  } catch (err) {
    document.getElementById('statGrid').outerHTML = errorState(err.message || 'Unable to load your dashboard.', 'location.reload');
  }
})();
