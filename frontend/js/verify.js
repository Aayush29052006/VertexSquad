/**
 * CareerNexus — Verify Students
 * The queue that turns a self-declared CV line into a verified one. Faculty,
 * institutions and employers work through their students' unverified claims
 * and sign the ones they can vouch for.
 *
 * A student can never reach this page, and the backend rejects any attempt
 * to verify your own portfolio.
 */

let queue = [];

const ITEM_ICONS = { skill: '🧠', certification: '🎖️', project: '🛠️', internship: '💼' };

function studentBlock(row) {
  return `
    <section class="card mb-4" data-student="${escapeHtml(row.student_id)}">
      <div class="flex items-center justify-between mb-3" style="flex-wrap:wrap;gap:12px;">
        <div>
          <h2 class="text-section-heading mb-1">${escapeHtml(row.student_name)}</h2>
          <p class="text-caption">${escapeHtml([row.branch, row.college].filter(Boolean).join(' · ') || 'No college on file')}</p>
        </div>
        <div class="flex gap-2 items-center">
          <span class="badge badge-warning">${row.pending_count} pending</span>
          <a class="btn btn-ghost btn-sm" href="portfolio.html?id=${encodeURIComponent(row.student_id)}" target="_blank" rel="noopener">Open Portfolio ↗</a>
        </div>
      </div>
      <div class="verify-list">
        ${row.items
          .map(
            (item) => `
          <div class="verify-item" data-key="${escapeHtml(item.item_key)}" data-type="${escapeHtml(item.item_type)}">
            <span class="vi-icon" aria-hidden="true">${ITEM_ICONS[item.item_type] || '•'}</span>
            <span class="vi-name">${escapeHtml(item.label)}</span>
            <span class="vi-type">${escapeHtml(item.item_type)}</span>
            <button class="btn btn-primary btn-sm"
                    data-verify="${escapeHtml(row.student_id)}"
                    data-type="${escapeHtml(item.item_type)}"
                    data-key="${escapeHtml(item.item_key)}">Verify</button>
          </div>`
          )
          .join('')}
      </div>
    </section>`;
}

function render(pageBody) {
  const list = document.getElementById('queueList');
  const search = document.getElementById('queueSearch').value.trim().toLowerCase();
  const rows = search
    ? queue.filter((r) =>
        [r.student_name, r.college, r.branch].join(' ').toLowerCase().includes(search)
      )
    : queue;

  document.getElementById('queueCount').textContent =
    `${rows.length} ${rows.length === 1 ? 'student' : 'students'} with unverified claims`;

  list.innerHTML = rows.length
    ? rows.map(studentBlock).join('')
    : `<div class="card">${emptyState(
        '✅',
        'Nothing waiting',
        'Every claim from your students has been verified.'
      )}</div>`;
}

(async function initVerify() {
  if (!requireAuth()) return;
  if (!hasRole(ROLES.FACULTY, ROLES.INSTITUTION, ROLES.RECRUITER)) {
    window.location.href = 'dashboard.html';
    return;
  }

  const name = localStorage.getItem('cn_student_name') || 'Verifier';
  const pageBody = mountAppShell('verify.html', name);
  pageBody.innerHTML = loadingState('Loading the verification queue...');

  try {
    queue = await api.getPendingVerifications();

    pageBody.innerHTML = `
      <h1 class="text-page-heading mb-1">Verify Students</h1>
      <p class="text-body mb-4">
        Sign off on skills, projects and certificates you can personally vouch for. A verified item
        carries your name and role on the student's public portfolio — so only verify what you have
        actually seen.
      </p>

      <div class="admin-toolbar">
        <input class="form-input" id="queueSearch" placeholder="Search student, branch or college" />
        <span class="text-caption" id="queueCount"></span>
      </div>

      <div id="queueList"></div>
    `;

    document.getElementById('queueSearch').addEventListener('input', () => render(pageBody));
    render(pageBody);

    pageBody.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-verify]');
      if (!btn) return;

      const { verify: studentId, type, key } = btn.dataset;
      btn.disabled = true;
      btn.textContent = 'Verifying...';
      try {
        await api.verifyPortfolioItem({ student_id: studentId, item_type: type, item_key: key });
        // Drop it from the local queue so the list reflects reality without a
        // full round-trip.
        const row = queue.find((r) => r.student_id === studentId);
        if (row) {
          row.items = row.items.filter((i) => !(i.item_type === type && i.item_key === key));
          row.pending_count = row.items.length;
          if (!row.items.length) queue = queue.filter((r) => r.student_id !== studentId);
        }
        showToast('Verified. It now shows your name on their portfolio.', 'success');
        render(pageBody);
      } catch (err) {
        showToast(err.message || 'Could not verify that item.', 'error');
        btn.disabled = false;
        btn.textContent = 'Verify';
      }
    });
  } catch (err) {
    pageBody.innerHTML = errorState(err.message || 'Could not load the verification queue.', 'location.reload');
  }
})();
