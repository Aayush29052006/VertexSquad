/**
 * CareerNexus — AIIA Opportunity Hub
 *
 * A discovery section for what the All India Institute of Ayurveda offers
 * students: courses, internships, training, research, CME, workshops,
 * conferences, admissions, jobs and notifications.
 *
 * It is a native part of CareerNexus, not a bolt-on. It uses the same
 * shell, sidebar, session, theme, cards, toasts, deadline badges and
 * external-link component as every other page, and it never asks anyone
 * to log in again.
 *
 * RESILIENCE — this page used to die with "Failed to fetch" the moment the
 * API hiccupped, which was the wrong shape entirely: none of the catalogue
 * is per-user and none of it needs a database. So the verified catalogue
 * in aiia-data.js renders first and always, and the backend is only asked
 * for extras (live notices with their closing dates). If that call fails
 * the page says so quietly in one line and stays completely usable.
 *
 * Applications happen on AIIA's own website. Every button that leads to
 * one is an external link — there is no fake internal apply here.
 */

const AIIA_SAVED_KEY = 'cn_saved_opportunities';

let aiiaState = {
  category: '',
  location: '',
  status: '',
  eligibility: '',
  query: '',
  liveNotices: [],
  liveError: '',
};

/* ---------- Saved opportunities ----------
   Shared storage, not an AIIA-specific one: the key is generic so any
   other page can adopt the same list. Per device, because there is no
   server-side saved-items table yet — see the note in the README. */
function savedIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(AIIA_SAVED_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return [];
  }
}

function isSaved(id) {
  return savedIds().includes(id);
}

function toggleSaved(id) {
  const current = savedIds();
  const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
  try {
    localStorage.setItem(AIIA_SAVED_KEY, JSON.stringify(next));
  } catch (_) {
    showToast('Could not save on this device (storage is blocked).', 'error');
  }
  return next.includes(id);
}

/* ---------- Cards ---------- */

function aiiaCard(item) {
  const status = aiiaStatus(item);
  const saved = isSaved(item.id);
  const isGoa = item.sourceType === AIIA_SOURCE.AIIA_GOA;

  return `
    <article class="card card-hover aiia-card status-${status.tier}" data-id="${escapeHtml(item.id)}">
      <div class="aiia-card-head">
        <span class="aiia-icon" aria-hidden="true">${AIIA_CATEGORY_ICONS[item.category] || '📘'}</span>
        <div style="min-width:0;">
          <span class="opp-type">${escapeHtml(item.category)}${item.domain ? ` · ${escapeHtml(item.domain)}` : ''}</span>
          <h3 class="text-card-heading mt-1">${escapeHtml(item.title)}</h3>
          <p class="company-name">${escapeHtml(item.organization)}</p>
        </div>
        <button class="aiia-save" type="button" data-save="${escapeHtml(item.id)}"
                title="${saved ? 'Remove from saved' : 'Save for later'}"
                aria-pressed="${saved}">${saved ? '★' : '☆'}</button>
      </div>

      <div class="aiia-badges">
        <span class="source-badge ${isGoa ? 'source-goa' : 'source-official'}">🌐 ${escapeHtml(item.sourceType)}</span>
        <span class="deadline-badge deadline-${status.tier}">${escapeHtml(status.label)}${
          item.deadline ? ` · ${formatDate(item.deadline)}` : ''
        }</span>
      </div>

      ${item.description ? `<p class="text-caption mb-3">${escapeHtml(item.description)}</p>` : ''}

      <dl class="aiia-facts">
        <div><dt>Eligibility</dt><dd>${escapeHtml(item.eligibility)}</dd></div>
        <div><dt>Duration</dt><dd>${escapeHtml(item.duration)}</dd></div>
        <div><dt>Fees</dt><dd>${escapeHtml(item.fee)}</dd></div>
        <div><dt>Mode</dt><dd>${item.mode === 'Online' ? '💻' : item.mode === 'Hybrid' ? '🔀' : '🏛️'} ${escapeHtml(item.mode)}</dd></div>
        <div><dt>Location</dt><dd>${escapeHtml(item.location)}</dd></div>
        <div><dt>Certificate</dt><dd>${item.certificate ? '✅ Yes' : '—'}</dd></div>
        ${item.seats ? `<div><dt>Seats</dt><dd>${escapeHtml(item.seats)}</dd></div>` : ''}
        ${item.accreditation ? `<div><dt>Accreditation</dt><dd>${escapeHtml(item.accreditation)}</dd></div>` : ''}
      </dl>

      ${
        item.note
          ? `<p class="aiia-note">ℹ️ ${escapeHtml(item.note)}</p>`
          : ''
      }

      <div class="chip-row chip-row-tight mb-3">
        ${(item.tags || []).map((t) => `<span class="skill-chip">${escapeHtml(t)}</span>`).join('')}
      </div>

      ${
        (item.extraLinks || []).length
          ? `<div class="flex gap-2 mb-3" style="flex-wrap:wrap;">
               ${item.extraLinks.map((l) => officialLinkButton(l.url, l.label, 'btn btn-ghost btn-sm')).join('')}
             </div>`
          : ''
      }

      <div class="internship-footer">
        <span class="text-caption">Verified ${formatDate(item.lastVerified)}</span>
        <div class="flex gap-2" style="flex-wrap:wrap;">
          ${officialLinkButton(item.sectionUrl, 'Section', 'btn btn-ghost btn-sm')}
          ${officialLinkButton(
            item.officialUrl,
            item.category === 'Internships' || item.category === 'Jobs' || item.category === 'Admissions'
              ? 'Apply on Official Portal'
              : 'View Official Source',
            'btn btn-primary btn-sm'
          )}
        </div>
      </div>
    </article>`;
}

function noticeCard(n) {
  return `
    <article class="card feed-card deadline-${deadlineTier(n.deadline)}">
      <div class="feed-head">
        <span class="feed-icon" aria-hidden="true">🔔</span>
        <div class="feed-main">
          <h3 class="feed-title">${escapeHtml(n.title)}</h3>
          <p class="text-caption">${escapeHtml(n.organisation)} · ${escapeHtml(n.category)}</p>
        </div>
      </div>
      <div class="feed-foot">
        ${deadlineBadge(n.deadline)}
        ${officialLinkButton(n.official_url, 'Official Document', 'btn btn-primary btn-sm')}
      </div>
    </article>`;
}

/* ---------- Filtering ---------- */

function filteredOpportunities() {
  const q = aiiaState.query.trim().toLowerCase();
  return AIIA_OPPORTUNITIES.filter((item) => {
    if (aiiaState.category && item.category !== aiiaState.category) return false;
    if (aiiaState.location && !item.location.toLowerCase().includes(aiiaState.location.toLowerCase())) return false;
    if (aiiaState.status && aiiaStatus(item).key !== aiiaState.status) return false;
    if (aiiaState.eligibility === 'specified' && item.eligibility === AIIA_UNSPECIFIED) return false;
    if (q) {
      const hay = [
        item.title, item.organization, item.category, item.domain,
        item.description, item.eligibility, item.location, ...(item.tags || []),
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderList() {
  const rows = filteredOpportunities();
  document.getElementById('aiiaCount').textContent =
    `${rows.length} ${rows.length === 1 ? 'opportunity' : 'opportunities'}`;
  document.getElementById('aiiaList').innerHTML = rows.length
    ? rows.map(aiiaCard).join('')
    : emptyState(
        '🔍',
        'Nothing matches those filters',
        'Try a different category, clear the search box, or switch the status filter to "All".',
        '<button class="btn btn-secondary" type="button" id="clearFilters">Clear all filters</button>'
      );
}

/* ---------- Page ---------- */

function drawHub(pageBody) {
  const open = AIIA_OPPORTUNITIES.filter((i) => aiiaStatus(i).key === 'open');
  const featured = AIIA_OPPORTUNITIES.filter((i) => i.featured);
  const counts = {};
  AIIA_OPPORTUNITIES.forEach((i) => { counts[i.category] = (counts[i.category] || 0) + 1; });
  const locations = [...new Set(AIIA_OPPORTUNITIES.map((i) => i.location))].sort();

  pageBody.innerHTML = `
    <!-- Hero -->
    <section class="aiia-hero mb-5">
      <div>
        <span class="source-badge source-official mb-2" style="display:inline-flex;">🌿 Ministry of Ayush, Government of India</span>
        <h1 class="text-page-heading mb-1">AIIA Opportunity Hub</h1>
        <p class="text-body mb-3">
          Courses, internships, training, research, CME, conferences, admissions and careers at the
          All India Institute of Ayurveda — the institute behind problem statement SIH26044.
        </p>
        <p class="text-caption">
          🌐 Every opportunity here is published by AIIA or AIIA Goa. Applications are made on the
          institute's own website, never through CareerNexus.
          ${officialLinkButton(AIIA_SITE_URL, 'aiia.gov.in', 'btn btn-ghost btn-sm')}
          ${officialLinkButton(AIIA_GOA_URL, 'aiiagoa.org', 'btn btn-ghost btn-sm')}
        </p>
      </div>
      <div class="aiia-hero-stats">
        <div><span class="stat-value">${AIIA_OPPORTUNITIES.length}</span><span class="text-label">Opportunities</span></div>
        <div><span class="stat-value">${open.length}</span><span class="text-label">Open Now</span></div>
        <div><span class="stat-value">${Object.keys(counts).length}</span><span class="text-label">Categories</span></div>
      </div>
    </section>

    <div id="liveBanner"></div>

    <!-- Search + filters -->
    <section class="card mb-5">
      <div class="admin-toolbar" style="margin-bottom:0;">
        <input class="form-input" id="aiiaSearch" placeholder="Search AIIA courses, internships, research..."
               value="${escapeHtml(aiiaState.query)}" style="min-width:260px;flex:1;" />
        <select class="form-input" id="aiiaLocation">
          <option value="">All locations</option>
          ${locations.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('')}
        </select>
        <select class="form-input" id="aiiaStatus">
          <option value="">Any status</option>
          <option value="open">Open</option>
          <option value="rolling">Rolling / no date</option>
          <option value="closed">Closed</option>
        </select>
        <select class="form-input" id="aiiaEligibility">
          <option value="">Any eligibility</option>
          <option value="specified">Eligibility published</option>
        </select>
        <span class="text-caption" id="aiiaCount"></span>
      </div>
    </section>

    <!-- Category rail -->
    <div class="admin-toolbar" id="aiiaChips">
      <button type="button" class="aiia-chip active" data-category="">All (${AIIA_OPPORTUNITIES.length})</button>
      ${AIIA_CATEGORY_ORDER.filter((c) => counts[c])
        .map(
          (c) => `<button type="button" class="aiia-chip" data-category="${escapeHtml(c)}">
                    ${AIIA_CATEGORY_ICONS[c] || '📘'} ${escapeHtml(c)} (${counts[c]})
                  </button>`
        )
        .join('')}
    </div>

    ${
      featured.length
        ? `<h2 class="text-section-heading mb-1">Featured</h2>
           <p class="text-caption mb-3">The openings a student is most likely to be looking for.</p>
           <div class="opp-grid mb-6">${featured.map(aiiaCard).join('')}</div>`
        : ''
    }

    <h2 class="text-section-heading mb-1">All AIIA Opportunities</h2>
    <p class="text-caption mb-4">
      Eligibility, duration and fees are quoted from the institute's own brochures. Where a
      document does not state a field — several are scanned images — the card says
      "${escapeHtml(AIIA_UNSPECIFIED)}" rather than guessing.
    </p>
    <div class="opp-grid mb-6" id="aiiaList"></div>

    <div id="liveNotices"></div>
  `;

  // --- wiring
  const search = document.getElementById('aiiaSearch');
  let t;
  search.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { aiiaState.query = search.value; renderList(); }, 180);
  });
  document.getElementById('aiiaLocation').addEventListener('change', (e) => {
    aiiaState.location = e.target.value; renderList();
  });
  document.getElementById('aiiaStatus').addEventListener('change', (e) => {
    aiiaState.status = e.target.value; renderList();
  });
  document.getElementById('aiiaEligibility').addEventListener('change', (e) => {
    aiiaState.eligibility = e.target.value; renderList();
  });
  document.getElementById('aiiaChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.aiia-chip');
    if (!chip) return;
    document.querySelectorAll('.aiia-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    aiiaState.category = chip.dataset.category;
    renderList();
  });

  // Save toggles and the empty-state reset, anywhere on the page.
  pageBody.addEventListener('click', (e) => {
    const save = e.target.closest('[data-save]');
    if (save) {
      const nowSaved = toggleSaved(save.dataset.save);
      save.textContent = nowSaved ? '★' : '☆';
      save.setAttribute('aria-pressed', String(nowSaved));
      save.title = nowSaved ? 'Remove from saved' : 'Save for later';
      showToast(nowSaved ? 'Saved to your list.' : 'Removed from your list.', 'success');
      return;
    }
    if (e.target.closest('#clearFilters')) {
      aiiaState = { ...aiiaState, category: '', location: '', status: '', eligibility: '', query: '' };
      drawHub(pageBody);
      renderList();
      renderLive();
    }
  });

  renderList();
  renderLive();
}

/* ---------- Live notices, layered on top ----------
   Optional by design. The catalogue above never waits on this. */
function renderLive() {
  const banner = document.getElementById('liveBanner');
  const holder = document.getElementById('liveNotices');
  if (!banner || !holder) return;

  if (aiiaState.liveError) {
    banner.innerHTML = `
      <div class="callout callout-warning mb-5">
        <strong>Live notices are unavailable right now.</strong>
        <p class="text-caption mt-1">
          Everything below is verified and up to date — only AIIA's live notice feed could not be
          reached (${escapeHtml(aiiaState.liveError)}).
        </p>
        <div class="mt-3">
          <button class="btn btn-secondary btn-sm" type="button" id="retryLive">Retry</button>
          ${officialLinkButton('https://aiia.gov.in/#/noticesArchive', 'Open the notice board', 'btn btn-ghost btn-sm')}
        </div>
      </div>`;
    document.getElementById('retryLive').addEventListener('click', loadLive);
    holder.innerHTML = '';
    return;
  }

  banner.innerHTML = '';
  if (!aiiaState.liveNotices.length) {
    holder.innerHTML = '';
    return;
  }
  holder.innerHTML = `
    <h2 class="text-section-heading mb-1">Latest Official Notices</h2>
    <p class="text-caption mb-3">
      Pulled automatically from AIIA's own notice feed, with the closing date the institute stated.
      <a href="updates.html" style="color:var(--primary);font-weight:600;">See all in Live Updates →</a>
    </p>
    <div class="feed-list">${aiiaState.liveNotices.slice(0, 6).map(noticeCard).join('')}</div>`;
}

async function loadLive() {
  aiiaState.liveError = '';
  renderLive();
  try {
    const feed = await api.getFeedItems({});
    aiiaState.liveNotices = (feed.items || []).filter((i) =>
      (i.organisation || '').toLowerCase().includes('ayurveda')
    );
  } catch (err) {
    // The catalogue is already on screen; this is an enhancement failing,
    // not the page failing, so it must never blank anything out.
    aiiaState.liveNotices = [];
    aiiaState.liveError = err.message || 'network error';
  }
  renderLive();
}

(function initAiia() {
  if (!requireAuth()) return;
  const name = localStorage.getItem('cn_student_name') || 'Student';
  const pageBody = mountAppShell('aiia.html', name);

  // Render from verified local data immediately — no spinner, no waiting
  // on a network round trip that this page does not need.
  drawHub(pageBody);

  // Then try to layer on live notices.
  loadLive();
})();
