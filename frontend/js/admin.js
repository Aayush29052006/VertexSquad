/**
 * CareerNexus — Admin Panel
 * College placement-cell / platform control: students, internships,
 * applications, and a skill-shortage overview. Every call hits /api/admin/*,
 * which the backend rejects for anyone whose role !== 'admin'.
 */

const APP_STATUSES = ['applied', 'under_review', 'shortlisted', 'rejected'];

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'livedata', label: 'Live Data' },
  { id: 'students', label: 'Students' },
  { id: 'internships', label: 'Internships' },
  { id: 'applications', label: 'Applications' },
  { id: 'skillgaps', label: 'Skill Gaps' },
];

// Deep-linkable: /pages/admin.html#students opens that tab directly.
let activeTab = TABS.some((t) => t.id === location.hash.slice(1)) ? location.hash.slice(1) : 'overview';

(function initAdmin() {
  if (!requireAdmin()) return;
  const studentName = localStorage.getItem('cn_student_name') || 'Admin';
  const pageBody = mountAppShell('admin.html', studentName);

  pageBody.innerHTML = `
    <h1 class="text-page-heading mb-1">Admin Panel</h1>
    <p class="text-body mb-5">Manage students, internships and applications across the platform.</p>
    <div class="admin-tabs" id="adminTabs">
      ${TABS.map((t) => `<button class="admin-tab${t.id === activeTab ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
    </div>
    <div id="adminContent">${loadingState('Loading...')}</div>
  `;

  document.getElementById('adminTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    activeTab = btn.dataset.tab;
    history.replaceState(null, '', '#' + activeTab);
    document.querySelectorAll('.admin-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === activeTab));
    renderTab();
  });

  renderTab();
})();

function renderTab() {
  const el = document.getElementById('adminContent');
  el.innerHTML = loadingState('Loading...');
  const render = {
    overview: renderOverview,
    livedata: renderLiveData,
    students: renderStudents,
    internships: renderInternships,
    applications: renderApplications,
    skillgaps: renderSkillGaps,
  }[activeTab];
  render(el).catch((err) => {
    el.innerHTML = errorState(err.message || 'Failed to load this section.', 'renderTab');
  });
}

/* ---------------- Overview ---------------- */
async function renderOverview(el) {
  const s = await api.admin.getStats();
  const statusChips = Object.entries(s.applications_by_status || {})
    .map(([k, v]) => `<span class="badge">${escapeHtml(k)}: ${v}</span>`)
    .join(' ') || '<span class="text-muted">No applications yet</span>';

  el.innerHTML = `
    <div class="stat-grid mb-6">
      ${statTile('👥 Students', s.students_total, `${s.students_active} active`)}
      ${statTile('💼 Internships', s.internships_total, 'Live postings')}
      ${statTile('📋 Applications', s.applications_total, 'All time')}
      ${statTile('⚠️ At Risk', s.at_risk_count, 'Readiness < 50%')}
      ${statTile('📄 Resumes', s.resumes_uploaded, 'Uploaded & parsed')}
      ${statTile('🛡️ Admins', s.admins, 'With full access')}
    </div>
    <div class="card mb-5">
      <h2 class="text-card-heading mb-3">Applications by status</h2>
      <div>${statusChips}</div>
    </div>
    <div class="card">
      <h2 class="text-card-heading mb-3">Top colleges</h2>
      ${
        (s.top_colleges || []).length
          ? s.top_colleges.map((c) => `<div class="bar-row"><span>${escapeHtml(c.college)}</span><span class="text-muted">${c.students} student${c.students === 1 ? '' : 's'}</span><span></span></div>`).join('')
          : '<p class="text-muted">No colleges recorded yet.</p>'
      }
    </div>
  `;
}

/* ---------------- Live Data ----------------
   The one place an admin can pull real-world data on demand. It calls the
   backend's sync, which reads AIIA's own public feeds (notices, vacancies,
   tenders, news) and upserts what it finds; nothing here is generated. The
   table below always shows what the *server* recorded for each source, so a
   failure is visible with its real reason instead of a vanishing toast. */
const FEED_STATUS_BADGE = { ok: 'badge-success', failed: 'badge-danger', never: 'badge-neutral' };
const FEED_STATUS_LABEL = { ok: 'Refreshed', failed: 'Failed', never: 'Never run' };

function catalogueBlock(c) {
  if (!c || !c.checked) {
    return `<div class="callout mb-5"><strong>Catalogue links not verified yet.</strong>
      <div class="text-caption mt-1">Press the sync button: every official page in the catalogue is opened and its state recorded.</div></div>`;
  }
  const problems = (c.problems || []).map((p) => `
    <tr>
      <td>${escapeHtml(p.title)}</td>
      <td><span class="badge ${p.state === 'broken' ? 'badge-danger' : 'badge-neutral'}">${p.state === 'broken' ? 'Page gone' : 'Could not verify'}</span></td>
      <td class="text-caption">${escapeHtml(p.note || '')}</td>
      <td><a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer">Open</a></td>
    </tr>`).join('');
  return `
    <div class="stat-grid mb-5">
      ${statTile('🔗 Catalogue pages live', `${c.live} / ${c.checked}`, `Checked ${c.last_checked || ''}`)}
      ${statTile('⚠️ Could not verify', c.unverified, 'Site blocks bots or timed out')}
      ${statTile('❌ Page gone', c.broken, '404 or host not found')}
    </div>
    ${problems ? `<div class="card table-wrap mb-5">
      <table class="admin-table">
        <thead><tr><th>Catalogue entry</th><th>State</th><th>Details</th><th></th></tr></thead>
        <tbody>${problems}</tbody>
      </table></div>` : ''}`;
}

async function renderLiveData(el, outcome = null) {
  const feed = await api.getFeedItems();

  const banner = outcome
    ? `<div class="callout ${outcome.failed ? 'callout-warning' : 'callout-success'} mb-5">
         <strong>${escapeHtml(outcome.headline)}</strong>
         ${outcome.detail ? `<div class="text-caption mt-1">${escapeHtml(outcome.detail)}</div>` : ''}
       </div>`
    : '';

  el.innerHTML = `
    ${banner}
    <div class="card mb-5">
      <h2 class="text-card-heading mb-1">Fetch real-world data</h2>
      <p class="text-body mb-3">
        Reads the latest notices, vacancies, tenders and news straight from the official
        AIIA website (aiia.gov.in), then re-opens every official page the catalogue links to. Nothing is generated: every item is copied from
        AIIA's own public feed, and items already stored are updated in place, never duplicated.
      </p>
      <div class="flex items-center gap-3" style="flex-wrap:wrap;">
        <button class="btn btn-primary" id="syncRealData" type="button">Sync real-world data now</button>
        <span class="text-caption" id="syncProgress" aria-live="polite"></span>
      </div>
    </div>

    <div class="stat-grid mb-5">
      ${statTile('📢 Open items', feed.total, 'Notices, vacancies, tenders, news')}
      ${statTile('⏳ Closing soon', feed.closing_soon, 'Deadline within 7 days')}
      ${statTile('🕒 Last checked', feed.last_synced || 'Never', 'India time (IST)')}
    </div>

    ${catalogueBlock(feed.catalogue)}

    <div class="card table-wrap">
      <table class="admin-table">
        <thead><tr><th>Source</th><th>Status</th><th>Items on source</th><th>Last checked</th><th>Details</th></tr></thead>
        <tbody>
          ${feed.sources.map((s) => `
            <tr>
              <td><a href="${escapeHtml(s.homepage)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.name)}</a></td>
              <td><span class="badge ${FEED_STATUS_BADGE[s.status] || 'badge-neutral'}">${escapeHtml(FEED_STATUS_LABEL[s.status] || s.status)}</span></td>
              <td>${s.items_seen}</td>
              <td>${escapeHtml(s.last_run || '—')}</td>
              <td class="text-caption">${escapeHtml(s.message || '')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="text-caption mt-3">
      See the result to students on <a href="updates.html">Live Updates</a>. The server also re-checks
      these sources by itself on every start and every six hours while it is running.
    </p>
  `;

  document.getElementById('syncRealData').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Fetching from aiia.gov.in...';
    document.getElementById('syncProgress').textContent =
      'Checking 4 official feeds, then every catalogue page. This can take up to a minute.';

    let result;
    try {
      const res = await api.syncFeeds();
      const failed = res.results.filter((r) => r.status !== 'ok');
      result = {
        failed: failed.length > 0,
        headline: `${res.sources_ok} of ${res.sources_total} sources refreshed · ${res.new_items} new item${res.new_items === 1 ? '' : 's'} found`,
        detail: failed.length
          ? `Could not refresh: ${failed.map((f) => f.source_id.replace('aiia_', '')).join(', ')}. Previously stored items were left untouched.`
          : res.catalogue && res.catalogue.checked
            ? `Catalogue re-verified: ${res.catalogue.live} of ${res.catalogue.checked} official pages live${res.catalogue.broken ? `, ${res.catalogue.broken} gone` : ''}. AIIA has ${res.catalogue.aiia_open_vacancies} advertised vacanc${res.catalogue.aiia_open_vacancies === 1 ? 'y' : 'ies'} open.`
            : 'Everything below is what AIIA is publishing right now.',
      };
    } catch (err) {
      result = { failed: true, headline: 'The sync could not be completed.', detail: err.message || '' };
    }
    showToast(result.headline, result.failed ? 'error' : 'success');
    // Re-read what the server recorded, whatever the outcome.
    try {
      await renderLiveData(el, result);
    } catch (err) {
      el.innerHTML = errorState(err.message || 'Could not reload the sync status.', 'renderTab');
    }
  });
}

function statTile(label, value, sub) {
  return `
    <div class="stat-tile">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value ?? 0}</div>
      <div class="stat-sub">${escapeHtml(sub || '')}</div>
    </div>`;
}

/* ---------------- Students ---------------- */
async function renderStudents(el, search = '') {
  const rows = await api.admin.listStudents(search);
  el.innerHTML = `
    <div class="admin-toolbar">
      <input class="form-input" id="studentSearch" placeholder="Search name, email, college" value="${escapeHtml(search)}" />
      <button class="btn btn-secondary btn-sm" id="studentSearchBtn">Search</button>
      <span class="text-caption">${rows.length} student${rows.length === 1 ? '' : 's'}</span>
    </div>
    <div class="card table-wrap">
      <table class="admin-table admin-table--wide">
        <thead><tr>
          <th>Name</th><th>Email</th><th>College</th><th>Grad</th><th>CGPA</th>
          <th>Skills</th><th>Readiness</th><th>Role</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>
          ${rows.map(studentRow).join('') || `<tr><td colspan="10" class="text-muted">No students found.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  const doSearch = () => renderStudents(el, document.getElementById('studentSearch').value.trim());
  document.getElementById('studentSearchBtn').addEventListener('click', doSearch);
  document.getElementById('studentSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

  el.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => handleStudentAction(btn.dataset.action, btn.dataset.id, btn.dataset.value, el, search));
  });
}

function studentRow(s) {
  return `
    <tr>
      <td style="font-weight:600;">${escapeHtml(s.full_name)}</td>
      <td>${escapeHtml(s.email)}</td>
      <td>${escapeHtml(s.college || '—')}</td>
      <td class="col-num">${s.graduation_year || '—'}</td>
      <td class="col-num">${s.cgpa ? s.cgpa.toFixed(1) : '—'}</td>
      <td class="col-num">${s.skills_count}</td>
      <td class="col-num">${s.placement_readiness}%</td>
      <td><span class="badge ${s.role === 'admin' ? 'badge-info' : ''}">${s.role}</span></td>
      <td><span class="badge ${s.is_active ? 'status-selected' : 'status-rejected'}">${s.is_active ? 'active' : 'disabled'}</span></td>
      <td>
        <div class="row-actions">
          ${
            s.role === 'admin'
              ? `<button class="btn btn-ghost btn-sm" data-action="demote" data-id="${s.id}">Demote</button>`
              : `<button class="btn btn-ghost btn-sm" data-action="promote" data-id="${s.id}">Make admin</button>`
          }
          <button class="btn btn-ghost btn-sm" data-action="toggle" data-id="${s.id}" data-value="${s.is_active ? '0' : '1'}">${s.is_active ? 'Disable' : 'Enable'}</button>
          <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${s.id}" style="color:var(--danger,#e5484d);">Delete</button>
        </div>
      </td>
    </tr>`;
}

async function handleStudentAction(action, id, value, el, search) {
  try {
    if (action === 'promote') {
      await api.admin.updateStudent(id, { role: 'admin' });
      showToast('Promoted to admin', 'success');
    } else if (action === 'demote') {
      await api.admin.updateStudent(id, { role: 'student' });
      showToast('Changed to student', 'success');
    } else if (action === 'toggle') {
      await api.admin.updateStudent(id, { is_active: value === '1' });
      showToast('Account status updated', 'success');
    } else if (action === 'delete') {
      if (!confirm('Delete this student and all their applications? This cannot be undone.')) return;
      await api.admin.deleteStudent(id);
      showToast('Student deleted', 'success');
    }
    renderStudents(el, search);
  } catch (err) {
    showToast(err.message || 'Action failed', 'error');
  }
}

/* ---------------- Internships ---------------- */
async function renderInternships(el) {
  const rows = await api.admin.listInternships();
  el.innerHTML = `
    <div class="admin-toolbar">
      <button class="btn btn-primary btn-sm" id="newInternshipBtn">+ New internship</button>
      <span class="text-caption">${rows.length} posting${rows.length === 1 ? '' : 's'}</span>
    </div>
    <div class="card table-wrap">
      <table class="admin-table admin-table--wide">
        <thead><tr>
          <th>Title</th><th>Company</th><th>Location</th><th>Mode</th>
          <th>Stipend</th><th>Deadline</th><th>Applicants</th><th>Skills</th><th></th>
        </tr></thead>
        <tbody>
          ${rows.map(internshipRow).join('') || `<tr><td colspan="9" class="text-muted">No internships yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('newInternshipBtn').addEventListener('click', () => openInternshipModal(null, el));
  el.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = rows.find((r) => r.id === btn.dataset.id);
      if (btn.dataset.action === 'edit') openInternshipModal(row, el);
      if (btn.dataset.action === 'delete') deleteInternship(row, el);
    });
  });
}

function internshipRow(i) {
  return `
    <tr>
      <td style="font-weight:600;">${escapeHtml(i.title)}</td>
      <td>${escapeHtml(i.company)}</td>
      <td>${escapeHtml(i.location)}</td>
      <td>${escapeHtml(i.work_mode)}</td>
      <td>${escapeHtml(i.stipend || '—')}</td>
      <td>${escapeHtml(i.deadline || '—')}</td>
      <td class="col-num">${i.applicant_count ?? 0}</td>
      <td>${(i.required_skills || []).slice(0, 4).map((s) => `<span class="badge">${escapeHtml(s)}</span>`).join(' ')}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${i.id}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${i.id}" style="color:var(--danger,#e5484d);">Delete</button>
        </div>
      </td>
    </tr>`;
}

async function deleteInternship(row, el) {
  if (!confirm(`Delete "${row.title}" at ${row.company}? Applications to it are removed too.`)) return;
  try {
    await api.admin.deleteInternship(row.id);
    showToast('Internship deleted', 'success');
    renderInternships(el);
  } catch (err) {
    showToast(err.message || 'Delete failed', 'error');
  }
}

function openInternshipModal(row, el) {
  const isEdit = !!row;
  const v = row || { title: '', company: '', location: '', work_mode: 'Remote', stipend: '', duration: '', deadline: '', required_skills: [] };
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2 class="text-card-heading mb-4">${isEdit ? 'Edit' : 'New'} internship</h2>
      <div class="form-group"><label class="form-label">Title</label><input class="form-input" id="f_title" value="${escapeHtml(v.title)}" /></div>
      <div class="form-group"><label class="form-label">Company</label><input class="form-input" id="f_company" value="${escapeHtml(v.company)}" /></div>
      <div class="form-group"><label class="form-label">Location</label><input class="form-input" id="f_location" value="${escapeHtml(v.location)}" /></div>
      <div class="form-group"><label class="form-label">Work mode</label>
        <select class="form-input" id="f_mode">
          ${['Remote', 'Hybrid', 'On-site'].map((m) => `<option ${m === v.work_mode ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Stipend</label><input class="form-input" id="f_stipend" value="${escapeHtml(v.stipend || '')}" placeholder="₹15,000/month" /></div>
      <div class="form-group"><label class="form-label">Duration</label><input class="form-input" id="f_duration" value="${escapeHtml(v.duration || '')}" placeholder="3 months" /></div>
      <div class="form-group"><label class="form-label">Deadline</label><input class="form-input" id="f_deadline" type="date" value="${escapeHtml(v.deadline || '')}" /></div>
      <div class="form-group"><label class="form-label">Required skills (comma separated)</label><input class="form-input" id="f_skills" value="${escapeHtml((v.required_skills || []).join(', '))}" /></div>
      <div class="flex gap-3 mt-4">
        <button class="btn btn-primary" id="f_save">${isEdit ? 'Save changes' : 'Create'}</button>
        <button class="btn btn-ghost" id="f_cancel">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#f_cancel').addEventListener('click', close);
  overlay.querySelector('#f_save').addEventListener('click', async () => {
    const payload = {
      title: overlay.querySelector('#f_title').value.trim(),
      company: overlay.querySelector('#f_company').value.trim(),
      location: overlay.querySelector('#f_location').value.trim(),
      work_mode: overlay.querySelector('#f_mode').value,
      stipend: overlay.querySelector('#f_stipend').value.trim(),
      duration: overlay.querySelector('#f_duration').value.trim(),
      deadline: overlay.querySelector('#f_deadline').value.trim(),
      required_skills: overlay.querySelector('#f_skills').value.split(',').map((s) => s.trim()).filter(Boolean),
    };
    try {
      if (isEdit) await api.admin.updateInternship(row.id, payload);
      else await api.admin.createInternship(payload);
      showToast(isEdit ? 'Internship updated' : 'Internship created', 'success');
      close();
      renderInternships(el);
    } catch (err) {
      showToast(err.message || 'Save failed', 'error');
    }
  });
}

/* ---------------- Applications ---------------- */
async function renderApplications(el, status = '') {
  const rows = await api.admin.listApplications(status);
  el.innerHTML = `
    <div class="admin-toolbar">
      <select class="form-input" id="appStatusFilter">
        <option value="">All statuses</option>
        ${APP_STATUSES.map((s) => `<option value="${s}" ${s === status ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <span class="text-caption">${rows.length} application${rows.length === 1 ? '' : 's'}</span>
    </div>
    <div class="card table-wrap">
      <table class="admin-table admin-table--wide">
        <thead><tr>
          <th>Student</th><th>Internship</th><th>Company</th><th>Applied</th><th>Match</th><th>Status</th>
        </tr></thead>
        <tbody>
          ${rows.map(applicationRow).join('') || `<tr><td colspan="6" class="text-muted">No applications.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  document.getElementById('appStatusFilter').addEventListener('change', (e) => renderApplications(el, e.target.value));
  el.querySelectorAll('select[data-app-id]').forEach((sel) => {
    sel.addEventListener('change', async () => {
      try {
        await api.admin.updateApplication(sel.dataset.appId, sel.value);
        showToast('Status updated', 'success');
      } catch (err) {
        showToast(err.message || 'Update failed', 'error');
        renderApplications(el, status);
      }
    });
  });
}

function applicationRow(a) {
  return `
    <tr>
      <td><div style="font-weight:600;">${escapeHtml(a.student_name)}</div><div class="text-caption">${escapeHtml(a.student_email)}</div></td>
      <td>${escapeHtml(a.internship_title)}</td>
      <td>${escapeHtml(a.company)}</td>
      <td>${formatDate(a.applied_on)}</td>
      <td>${a.match_score || 0}%</td>
      <td>
        <select class="form-input" data-app-id="${a.id}" style="max-width:160px;">
          ${APP_STATUSES.map((s) => `<option value="${s}" ${s === a.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
    </tr>`;
}

/* ---------------- Skill gaps ---------------- */
async function renderSkillGaps(el) {
  const data = await api.admin.getSkillGaps();
  if (!data.total_students || !data.gaps.length) {
    el.innerHTML = emptyState('🎯', 'Not enough data yet.', 'Add internships and get students to fill their skills to see the shortage report.');
    return;
  }
  const tier = (pct) => (pct >= 70 ? 'gap-high' : pct >= 40 ? 'gap-med' : 'gap-low');
  const noProfile = data.students_without_profile || 0;
  // Say out loud who is not in the denominator. A percentage over an unstated
  // population is the kind of number a judge asks about and nobody can answer.
  const caveat = noProfile
    ? ` ${noProfile} more student${noProfile === 1 ? ' has' : 's have'} no skills recorded yet and ${noProfile === 1 ? 'is' : 'are'} not counted.`
    : '';

  el.innerHTML = `
    <div class="card">
      <h2 class="text-card-heading mb-1">Skill shortage across ${data.total_students} student${data.total_students === 1 ? '' : 's'} with a skill profile</h2>
      <p class="text-caption mb-4">Share of students who don't yet have each skill our internships ask for.${escapeHtml(caveat)}</p>
      <div class="gap-legend">
        <span><i class="gap-high"></i>Critical (70%+ missing)</span>
        <span><i class="gap-med"></i>Moderate (40–69%)</span>
        <span><i class="gap-low"></i>Well covered (&lt;40%)</span>
      </div>
      ${data.gaps.map((g) => `
        <div class="bar-row">
          <span class="bar-skill">${escapeHtml(g.skill)}</span>
          <span class="bar-track"><span class="bar-fill ${tier(g.pct_missing)}" style="width:${g.pct_missing}%;"></span></span>
          <span class="bar-meta"><b>${g.pct_missing}%</b><span>${g.students_missing}/${data.total_students}</span></span>
        </div>
      `).join('')}
    </div>
  `;
}
