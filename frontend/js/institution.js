/**
 * CareerNexus — Institution Analytics
 * The three questions a placement cell actually needs answered: are our
 * students ready, which skills are we not teaching, and which branches are
 * falling behind.
 */

function statCard(label, value, caption) {
  return `
    <div class="card stat-card">
      <p class="stat-value">${escapeHtml(String(value))}</p>
      <p class="text-label">${escapeHtml(label)}</p>
      ${caption ? `<p class="text-caption">${escapeHtml(caption)}</p>` : ''}
    </div>`;
}

function gapRow(g, maxImpact) {
  const width = maxImpact ? Math.max(4, Math.round((g.impact / maxImpact) * 100)) : 4;
  const band = g.pct_missing >= 70 ? 'gap-high' : g.pct_missing >= 40 ? 'gap-med' : 'gap-low';
  return `
    <div class="bar-row">
      <span class="bar-skill">${escapeHtml(g.skill)}</span>
      <span class="bar-track"><span class="bar-fill ${band}" style="width:${width}%"></span></span>
      <span class="bar-meta">
        <b>${g.pct_missing}%</b>
        <span>lack it · ${g.openings_requiring} ${g.openings_requiring === 1 ? 'opening' : 'openings'} want it</span>
      </span>
    </div>`;
}

(async function initInstitution() {
  if (!requireAuth()) return;
  if (!hasRole(ROLES.INSTITUTION, ROLES.FACULTY)) {
    window.location.href = 'dashboard.html';
    return;
  }

  const name = localStorage.getItem('cn_student_name') || 'Institution';
  const pageBody = mountAppShell('institution.html', name);
  pageBody.innerHTML = loadingState('Crunching cohort analytics...');

  try {
    const a = await api.getInstitutionAnalytics();

    if (!a.students_total) {
      pageBody.innerHTML = `
        <h1 class="text-page-heading mb-1">Institution Analytics</h1>
        <p class="text-body mb-5">${escapeHtml(a.scope || '')}</p>
        <div class="card">${emptyState(
          '📊',
          'No student records yet',
          a.message || 'Once students from your institution sign up, their skill and placement data appears here.'
        )}</div>`;
      return;
    }

    const bands = a.readiness_bands || {};
    const maxImpact = Math.max(...(a.curriculum_gaps || []).map((g) => g.impact), 0);

    pageBody.innerHTML = `
      <h1 class="text-page-heading mb-1">Institution Analytics</h1>
      <p class="text-body mb-5">${escapeHtml(a.scope)} · ${a.students_total} students on the platform</p>

      <div class="stat-grid mb-5">
        ${statCard('Students', a.students_total, '')}
        ${statCard('Avg. Readiness', `${a.avg_readiness}%`, 'Placement readiness score')}
        ${statCard('Assessed', `${a.assessment_coverage_pct}%`, `${a.assessments_completed} completed the assessment`)}
        ${statCard('Participation', `${a.participation_pct}%`, `${a.students_applied} have applied somewhere`)}
        ${statCard('Placed / Shortlisted', `${a.placement_pct}%`, `${a.students_placed} students`)}
        ${statCard('Avg. CGPA', a.avg_cgpa || '—', '')}
      </div>

      <div class="split-2 mb-5">
        <section class="card">
          <h2 class="text-section-heading mb-1">Placement Readiness</h2>
          <p class="text-caption mb-4">Where the cohort sits today.</p>
          <div class="band-row">
            <span class="bar-skill">Ready (70%+)</span>
            <span class="bar-track"><span class="bar-fill gap-low" style="width:${Math.round(((bands.ready || 0) / a.students_total) * 100)}%"></span></span>
            <span class="bar-meta"><b>${bands.ready || 0}</b></span>
          </div>
          <div class="band-row">
            <span class="bar-skill">Developing (40–69%)</span>
            <span class="bar-track"><span class="bar-fill gap-med" style="width:${Math.round(((bands.developing || 0) / a.students_total) * 100)}%"></span></span>
            <span class="bar-meta"><b>${bands.developing || 0}</b></span>
          </div>
          <div class="band-row">
            <span class="bar-skill">At risk (&lt;40%)</span>
            <span class="bar-track"><span class="bar-fill gap-high" style="width:${Math.round(((bands.at_risk || 0) / a.students_total) * 100)}%"></span></span>
            <span class="bar-meta"><b>${bands.at_risk || 0}</b></span>
          </div>
          <p class="text-caption mt-4">
            The at-risk group is where intervention pays off most — they are the students least likely
            to be shortlisted without help.
          </p>
        </section>

        <section class="card">
          <h2 class="text-section-heading mb-1">Application Funnel</h2>
          <p class="text-caption mb-4">${a.applications_total} applications from this cohort.</p>
          ${Object.entries(a.applications_by_status || {})
            .sort((x, y) => y[1] - x[1])
            .map(
              ([status, n]) => `
            <div class="band-row">
              <span class="bar-skill">${escapeHtml(status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()))}</span>
              <span class="bar-track"><span class="bar-fill gap-low" style="width:${Math.round((n / a.applications_total) * 100)}%"></span></span>
              <span class="bar-meta"><b>${n}</b></span>
            </div>`
            )
            .join('') || '<p class="text-body">No applications yet.</p>'}
        </section>
      </div>

      <section class="card mb-5">
        <h2 class="text-section-heading mb-1">Curriculum Gaps</h2>
        <p class="text-caption mb-2">
          Ranked by impact — how many of your students lack the skill, weighted by how many open roles
          demand it. The top row is the strongest case for a syllabus change or an extra workshop.
        </p>
        <div class="gap-legend">
          <span><i class="gap-high"></i>70%+ of students lack it</span>
          <span><i class="gap-med"></i>40–69%</span>
          <span><i class="gap-low"></i>under 40%</span>
        </div>
        ${(a.curriculum_gaps || []).map((g) => gapRow(g, maxImpact)).join('') || '<p class="text-body">No gaps detected.</p>'}
      </section>

      <div class="split-2 mb-5">
        <section class="card">
          <h2 class="text-section-heading mb-3">By Branch</h2>
          <div class="table-wrap">
            <table class="admin-table">
              <thead><tr>
                <th>Branch</th><th class="col-num">Students</th>
                <th class="col-num">Avg. Readiness</th><th class="col-num">Applied</th><th class="col-num">Participation</th>
              </tr></thead>
              <tbody>
                ${(a.by_branch || [])
                  .map(
                    (b) => `
                  <tr>
                    <td><strong>${escapeHtml(b.branch)}</strong></td>
                    <td class="col-num">${b.students}</td>
                    <td class="col-num">${b.avg_readiness}%</td>
                    <td class="col-num">${b.applied}</td>
                    <td class="col-num">${b.participation_pct}%</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </section>

        <section class="card">
          <h2 class="text-section-heading mb-1">By District</h2>
          <p class="text-caption mb-3">
            Student-declared location — PS 26134's district axis for targeting training capacity.
          </p>
          <div class="table-wrap">
            <table class="admin-table">
              <thead><tr>
                <th>District</th><th class="col-num">Students</th>
                <th class="col-num">Avg. Readiness</th><th class="col-num">Participation</th>
              </tr></thead>
              <tbody>
                ${(a.by_district || [])
                  .map(
                    (d) => `
                  <tr>
                    <td><strong>${escapeHtml(d.district)}</strong></td>
                    <td class="col-num">${d.students}</td>
                    <td class="col-num">${d.avg_readiness}%</td>
                    <td class="col-num">${d.participation_pct}%</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section class="card mb-5">
        <h2 class="text-section-heading mb-1">Course Health</h2>
        <p class="text-caption mb-3">
          Every published course's skills, checked against current open-role demand. A course whose
          skills match nothing currently in demand is flagged for review — this reads only real
          postings and real course data, nothing here is guessed.
        </p>
        <div class="table-wrap">
          <table class="admin-table">
            <thead><tr>
              <th>Course</th><th>Provider</th><th class="col-num">Demand alignment</th><th>Status</th>
            </tr></thead>
            <tbody>
              ${
                (a.course_health || []).length
                  ? a.course_health
                      .map(
                        (c) => `
                <tr>
                  <td><strong>${escapeHtml(c.title)}</strong></td>
                  <td>${escapeHtml(c.provider)}</td>
                  <td class="col-num">${c.demand_alignment_pct}%</td>
                  <td><span class="badge ${c.flag === 'aligned' ? 'badge-success' : c.flag === 'partial' ? 'badge-warning' : 'badge-danger'}">${
                          c.flag === 'aligned' ? 'Aligned' : c.flag === 'partial' ? 'Partially aligned' : 'Low demand alignment'
                        }</span></td>
                </tr>`
                      )
                      .join('')
                  : `<tr><td colspan="4">${emptyState('📚', 'No courses to check yet', '')}</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <h2 class="text-section-heading mb-1">Employer Signals</h2>
        <p class="text-caption mb-3">
          Skills recruiters say will matter more in the next year, ranked by how many distinct
          companies flagged them — PS 26134's "employer survey" input.
        </p>
        ${
          (a.employer_signals || []).length
            ? `<div class="chip-row">
                 ${a.employer_signals.map((s) => `<span class="badge badge-neutral">${escapeHtml(s.skill)} · ${s.companies} ${s.companies === 1 ? 'company' : 'companies'}</span>`).join('')}
               </div>`
            : `<p class="text-body">No recruiter has submitted a signal yet.</p>`
        }
      </section>
    `;
  } catch (err) {
    pageBody.innerHTML = errorState(err.message || 'Could not load analytics.', 'location.reload');
  }
})();
