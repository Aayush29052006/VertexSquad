/**
 * CareerNexus — Live Updates
 *
 * Notices, vacancies and tenders pulled automatically from official
 * institution APIs, kept with the publisher's own closing dates and sorted
 * so whatever shuts first is at the top.
 *
 * Nothing here is written by us. Every card links to the institution's own
 * document, and there is no apply button, because the application happens
 * on their site.
 */

const FEED_ICONS = {
  Notice: '📢',
  Vacancy: '💼',
  Tender: '📋',
  News: '📰',
};

let feed = null;
let showClosed = false;

function feedRow(item) {
  return `
    <article class="card feed-card deadline-${deadlineTier(item.deadline)}">
      <div class="feed-head">
        <span class="feed-icon" aria-hidden="true">${FEED_ICONS[item.category] || '📄'}</span>
        <div class="feed-main">
          <h3 class="feed-title">${escapeHtml(item.title)}</h3>
          <p class="text-caption">
            ${escapeHtml(item.organisation)} · ${escapeHtml(item.category)}
            ${item.published_on ? ` · published ${formatDate(item.published_on)}` : ''}
          </p>
        </div>
      </div>
      <div class="feed-foot">
        ${deadlineBadge(item.deadline)}
        ${officialLinkButton(item.official_url, 'Official Document', 'btn btn-primary btn-sm')}
      </div>
    </article>`;
}

function sourceRow(s) {
  const state =
    s.status === 'ok' ? '<span class="sync-dot sync-ok" title="Last sync succeeded"></span>'
      : s.status === 'failed' ? '<span class="sync-dot sync-fail" title="Last sync failed"></span>'
        : '<span class="sync-dot sync-never" title="Not synced yet"></span>';
  return `
    <div class="aiia-link-row">
      <div>
        <strong>${state}${escapeHtml(s.name)}</strong>
        <p class="text-caption">
          ${s.status === 'ok'
            ? `${s.items_seen} items · last checked ${escapeHtml(s.last_run)}`
            : s.status === 'failed'
              ? `Unreachable at last check — showing what we already collected. ${escapeHtml((s.message || '').slice(0, 90))}`
              : 'Not checked yet'}
        </p>
      </div>
      ${officialLinkButton(s.homepage, 'Source', 'btn btn-ghost btn-sm')}
    </div>`;
}

function render() {
  const active = document.querySelector('.aiia-chip.active');
  const category = active ? active.dataset.category : '';
  const rows = category ? feed.items.filter((i) => i.category === category) : feed.items;

  document.getElementById('feedCount').textContent =
    `${rows.length} ${rows.length === 1 ? 'item' : 'items'}`;
  document.getElementById('feedList').innerHTML = rows.length
    ? rows.map(feedRow).join('')
    : emptyState('📭', 'Nothing here', showClosed
      ? 'No items in this category.'
      : 'Nothing open in this category. Tick "include closed" to see past items.');
}

async function load(pageBody, keepScroll) {
  feed = await api.getFeedItems({ include_closed: showClosed });
  if (!keepScroll) draw(pageBody);
  else {
    render();
    document.getElementById('lastSynced').textContent = feed.last_synced
      ? `Last checked ${feed.last_synced}` : 'Not checked yet';
  }
}

function draw(pageBody) {
  pageBody.innerHTML = `
    <h1 class="text-page-heading mb-1">Live Updates</h1>
    <p class="text-body mb-2">
      Notices, vacancies and tenders collected automatically from official institution
      APIs, with the closing date each publisher stated.
    </p>
    <p class="text-caption mb-4">
      🌐 Every item links to the institution's own document. Applications are made there,
      never through CareerNexus.
      <span id="lastSynced" class="ml-2"></span>
      ${isAdmin() ? '<button class="btn btn-secondary btn-sm" id="syncNow" type="button" style="margin-left:10px;">Sync now</button>' : ''}
    </p>

    <div class="stat-grid mb-5">
      <div class="card stat-card">
        <p class="stat-value">${feed.total}</p>
        <p class="text-label">Open Items</p>
      </div>
      <div class="card stat-card">
        <p class="stat-value">${feed.closing_soon}</p>
        <p class="text-label">Closing Within 7 Days</p>
      </div>
      <div class="card stat-card">
        <p class="stat-value">${feed.sources.filter((s) => s.status === 'ok').length}/${feed.sources.length}</p>
        <p class="text-label">Sources Reachable</p>
      </div>
    </div>

    <div class="admin-toolbar" id="feedChips">
      <button type="button" class="aiia-chip active" data-category="">All</button>
      ${feed.categories
        .map(
          (c) => `<button type="button" class="aiia-chip" data-category="${escapeHtml(c.name)}">
                    ${FEED_ICONS[c.name] || '📄'} ${escapeHtml(c.name)} (${c.count})
                  </button>`
        )
        .join('')}
      <label class="text-caption" style="display:flex;align-items:center;gap:6px;">
        <input type="checkbox" id="showClosed" ${showClosed ? 'checked' : ''} /> include closed
      </label>
      <span class="text-caption" id="feedCount"></span>
    </div>

    <div class="feed-list mb-6" id="feedList"></div>

    <h2 class="text-section-heading mb-1">Where This Comes From</h2>
    <p class="text-caption mb-3">
      These are the official endpoints we poll. A source that is unreachable is shown as
      such rather than silently dropping its items.
    </p>
    <div class="card"><div class="aiia-links">${feed.sources.map(sourceRow).join('')}</div></div>
  `;

  document.getElementById('lastSynced').textContent = feed.last_synced
    ? `Last checked ${feed.last_synced}` : 'Not checked yet';

  document.getElementById('feedChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.aiia-chip');
    if (!chip) return;
    document.querySelectorAll('.aiia-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    render();
  });

  document.getElementById('showClosed').addEventListener('change', async (e) => {
    showClosed = e.target.checked;
    await load(pageBody, false);
  });

  document.getElementById('syncNow')?.addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Syncing...';
    try {
      const res = await api.syncFeeds();
      showToast(
        `${res.sources_ok}/${res.sources_total} sources checked · ${res.new_items} new item${res.new_items === 1 ? '' : 's'}`,
        res.sources_ok === res.sources_total ? 'success' : 'error'
      );
      await load(pageBody, false);
    } catch (err) {
      showToast(err.message || 'Sync failed.', 'error');
      btn.disabled = false;
      btn.textContent = 'Sync now';
    }
  });

  render();
}

(async function initUpdates() {
  if (!requireAuth()) return;
  const name = localStorage.getItem('cn_student_name') || 'Student';
  const pageBody = mountAppShell('updates.html', name);
  pageBody.innerHTML = loadingState('Loading official updates...');
  try {
    await load(pageBody, false);
  } catch (err) {
    pageBody.innerHTML = errorState(err.message || 'Could not load updates.', 'location.reload');
  }
})();
