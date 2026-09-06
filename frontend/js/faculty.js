/**
 * CareerNexus — Faculty Portal
 * The academician's home: faculty internships, industrial training and FDPs
 * matched to their own profile, the collaboration calls open to them, and a
 * shortcut into the students waiting for verification.
 */

const FAC_TYPE_LABELS = {
  fdp: 'Faculty Development Programme',
  training: 'Industrial Training',
  project: 'Joint Project / Consultancy',
};

function facOpportunityCard(o) {
  const pct = Math.max(0, Math.min(100, Number(o.match_score) || 0));
  const { tier } = getMatchTier(pct);
  return `
    <article class="card card-hover opp-card">
      <div class="opp-head">
        <div>
          <span class="opp-type">🎓 ${escapeHtml(FAC_TYPE_LABELS[o.opportunity_type] || o.opportunity_type)}</span>
          <h3 class="text-card-heading mt-1">${escapeHtml(o.title)}</h3>
          <p class="company-name">${escapeHtml(o.company)}</p>
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
      ${o.description ? `<p class="text-caption mb-3">${escapeHtml(o.description)}</p>` : ''}
      <div class="internship-meta">
        <span>📍 ${escapeHtml(o.location)}</span>
        <span>💻 ${escapeHtml(o.work_mode)}</span>
        ${o.stipend ? `<span>💰 ${escapeHtml(o.stipend)}</span>` : ''}
        ${o.duration ? `<span>⏱ ${escapeHtml(o.duration)}</span>` : ''}
        ${o.openings > 1 ? `<span>👥 ${o.openings} seats</span>` : ''}
      </div>
      <div class="internship-chips mt-2">${(o.required_skills || []).map((s) => skillChip(s)).join('')}</div>
      <div class="internship-footer">
        <span class="text-caption">${o.deadline ? `Applications close ${formatDate(o.deadline)}` : 'Open until filled'}</span>
        <a class="btn btn-primary btn-sm" href="internship-details.html?id=${encodeURIComponent(o.id)}">View & Apply</a>
      </div>
    </article>`;
}

(async function initFaculty() {
  if (!requireAuth()) return;
  if (!hasRole(ROLES.FACULTY)) {
    window.location.href = 'dashboard.html';
    return;
  }

  const name = localStorage.getItem('cn_student_name') || 'Faculty';
  const pageBody = mountAppShell('faculty.html', name);
  pageBody.innerHTML = loadingState('Loading your faculty portal...');

  // One slow endpoint should not blank the whole page, so each section
  // degrades on its own.
  const [oppRes, colRes, verRes] = await Promise.allSettled([
    api.listOpportunities(),
    api.listCollaborations(),
    api.getPendingVerifications(),
  ]);

  const opportunities = oppRes.status === 'fulfilled' ? oppRes.value : [];
  const collaborations = colRes.status === 'fulfilled' ? colRes.value : [];
  const pending = verRes.status === 'fulfilled' ? verRes.value : [];
  const pendingItems = pending.reduce((n, r) => n + r.pending_count, 0);

  pageBody.innerHTML = `
    <h1 class="text-page-heading mb-1">Faculty Portal</h1>
    <p class="text-body mb-5">
      Industry exposure for academicians — faculty internships, industrial training and FDPs — plus
      the students waiting on your sign-off.
    </p>

    <div class="stat-grid mb-5">
      <div class="card stat-card">
        <p class="stat-value">${opportunities.length}</p>
        <p class="text-label">Open to Faculty</p>
        <p class="text-caption">FDPs, training and projects</p>
      </div>
      <div class="card stat-card">
        <p class="stat-value">${collaborations.length}</p>
        <p class="text-label">Collaboration Calls</p>
        <p class="text-caption">Lectures, research, consultancy</p>
      </div>
      <div class="card stat-card">
        <p class="stat-value">${pending.length}</p>
        <p class="text-label">Students Awaiting Verification</p>
        <p class="text-caption">${pendingItems} unverified ${pendingItems === 1 ? 'claim' : 'claims'}</p>
      </div>
    </div>

    ${
      pending.length
        ? `<div class="callout callout-warning mb-5">
             <strong>${pending.length} of your students have unverified claims.</strong>
             A verified portfolio is what separates a real CV from a list of assertions.
             <div class="mt-3"><a class="btn btn-primary btn-sm" href="verify.html">Open the Verification Queue</a></div>
           </div>`
        : ''
    }

    <section class="mb-5">
      <div class="flex items-center justify-between mb-3" style="flex-wrap:wrap;gap:12px;">
        <h2 class="text-section-heading">Opportunities for You</h2>
        <a class="btn btn-ghost btn-sm" href="opportunities.html">See all</a>
      </div>
      ${
        opportunities.length
          ? `<div class="opp-grid">${opportunities.slice(0, 4).map(facOpportunityCard).join('')}</div>`
          : `<div class="card">${emptyState(
              '🎓',
              'Nothing open right now',
              'Faculty internships, industrial training and FDPs published by industry partners appear here.'
            )}</div>`
      }
    </section>

    <section>
      <div class="flex items-center justify-between mb-3" style="flex-wrap:wrap;gap:12px;">
        <h2 class="text-section-heading">Collaboration Calls</h2>
        <a class="btn btn-ghost btn-sm" href="collaborations.html">See all</a>
      </div>
      ${
        collaborations.length
          ? `<div class="verified-list card">
               ${collaborations
                 .slice(0, 5)
                 .map(
                   (c) => `
                 <div class="verified-item verified-item-block">
                   <div>
                     <strong>${escapeHtml(c.title)}</strong>
                     <p class="text-caption">${escapeHtml(c.organisation)} · ${escapeHtml(
                     (c.collab_type || '').replace(/_/g, ' ')
                   )}${c.starts_on ? ` · ${formatDate(c.starts_on)}` : ''}</p>
                   </div>
                   <a class="btn btn-secondary btn-sm" href="collaborations.html">View</a>
                 </div>`
                 )
                 .join('')}
             </div>`
          : `<div class="card">${emptyState('🤝', 'No open calls', 'Guest lectures, joint research and consultancy calls appear here.')}</div>`
      }
    </section>
  `;
})();
