/**
 * CareerNexus — Application Tracking Page
 */
const STATUS_LABELS = {
  applied: 'Applied',
  under_review: 'Under Review',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  selected: 'Selected',
  rejected: 'Rejected',
};

(async function initApplications() {
  if (!requireAuth()) return;
  const studentName = localStorage.getItem('cn_student_name') || 'Student';
  const pageBody = mountAppShell('applications.html', studentName);

  pageBody.innerHTML = `
    <h1 class="text-page-heading mb-2">My Applications</h1>
    <p class="text-body mb-5">Track the status of every internship you've applied to.</p>
    <div class="card" id="applicationsCard">${loadingState('Loading your applications...')}</div>
  `;

  try {
    const applications = await api.getApplications();
    const card = document.getElementById('applicationsCard');

    if (!applications.length) {
      card.innerHTML = emptyState('📋', 'No applications yet.', 'Apply to internships that match your skills to start tracking them here.', '<a href="internships.html" class="btn btn-primary">Explore Internships</a>');
      return;
    }

    card.innerHTML = `
      <div class="table-wrap">
        <table class="applications-table">
          <thead>
            <tr>
              <th>Internship</th>
              <th>Company</th>
              <th>Applied On</th>
              <th>Match</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${applications.map((app) => `
              <tr>
                <td style="font-weight:600;">${escapeHtml(app.title)}</td>
                <td>${escapeHtml(app.company)}</td>
                <td>${formatDate(app.applied_on)}</td>
                <td>${app.match_score}%</td>
                <td><span class="badge status-${app.status}">${STATUS_LABELS[app.status] || app.status}</span></td>
                <td><a class="btn btn-ghost btn-sm" href="internship-details.html?id=${app.internship_id}">View</a></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    document.getElementById('applicationsCard').innerHTML = errorState(err.message || 'Unable to load applications.', 'location.reload');
  }
})();
