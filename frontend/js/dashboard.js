/**
 * CareerNexus — Student Dashboard
 */
function getTimeOfDayGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// Each stakeholder has their own home. This dashboard is the student's, so
// send everyone else to the portal that is actually about their work.
const ROLE_HOMES = {
  recruiter: 'recruiter.html',
  faculty: 'faculty.html',
  institution: 'institution.html',
};

(async function initDashboard() {
  if (!requireAuth()) return;

  const home = ROLE_HOMES[localStorage.getItem('cn_role')];
  if (home) {
    window.location.replace(home);
    return;
  }

  const studentName = localStorage.getItem('cn_student_name') || 'Student';
  const pageBody = mountAppShell('dashboard.html', studentName);

  pageBody.innerHTML = `
    <div class="greeting-banner">
      <h1 class="text-page-heading">${getTimeOfDayGreeting()}, ${escapeHtml(studentName.split(' ')[0])} 👋</h1>
      <p class="text-body mt-1">Here is your career overview.</p>
    </div>
    <div class="mt-4">${liveUpdatesTeaser('New official notices, vacancies and deadlines land here automatically.')}</div>

    <div id="assessmentNudge"></div>

    <div class="card mb-6" id="profileCompletionCard"></div>

    <div class="stat-grid" id="statGrid">
      ${skeletonCards(4)}
    </div>

    <div class="section-header">
      <div>
        <h2 class="text-section-heading">Recommended For You</h2>
        <p class="text-caption">Based on your skills, education, and preferences.</p>
      </div>
      <a class="btn btn-secondary btn-sm" href="opportunities.html">View All</a>
    </div>
    <div class="recommend-grid" id="recommendGrid">
      ${skeletonCards(3)}
    </div>
  `;

  try {
    const [student, recommendations, applications] = await Promise.all([
      api.getStudentProfile(),
      api.getRecommendations(),
      api.getApplications(),
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
        <div class="stat-value">${applications.length}</div>
        <div class="stat-sub">Total submitted</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">🏆 Placement Readiness</div>
        <div class="stat-value">${student.placement_readiness}<span style="font-size:1.1rem;color:var(--text-muted);">/100</span></div>
        <div class="stat-sub">Overall readiness score</div>
      </div>
    `;

    // The assessment is the first step of the whole journey, so a student who
    // has not taken it gets a prompt here rather than having to find the page.
    try {
      const assessment = await api.getAssessmentResult();
      const nudge = document.getElementById('assessmentNudge');
      if (nudge && !assessment.has_assessment) {
        nudge.innerHTML = `
          <div class="callout callout-warning mb-5">
            <strong>Start with the skill assessment.</strong>
            It takes about ten minutes and is what turns your profile into a real skill map —
            every match score, gap and learning path on this site is built from it.
            <div class="mt-3"><a class="btn btn-primary btn-sm" href="assessment.html">Take the Assessment</a></div>
          </div>`;
      } else if (nudge && assessment.has_assessment) {
        nudge.innerHTML = `
          <div class="callout mb-5">
            <strong>Assessed skill score: ${assessment.overall_score}%</strong>
            &nbsp;·&nbsp;<span class="text-caption">last taken ${escapeHtml(assessment.submitted_at)}</span>
            <div class="mt-3">
              <a class="btn btn-secondary btn-sm" href="assessment.html">View Skill Profile</a>
              <a class="btn btn-ghost btn-sm" href="learning.html">Learning Path</a>
            </div>
          </div>`;
      }
    } catch (_) {
      /* the dashboard is still useful without the nudge — never block on it */
    }

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
