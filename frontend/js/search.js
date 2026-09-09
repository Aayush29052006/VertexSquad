/**
 * CareerNexus — Opportunity Search
 *
 * Search across CareerNexus's verified opportunity collection: official
 * learning platforms, government schemes, company career pages, AIIA's
 * own programmes and anything a recruiter has posted here. All of it goes
 * through one backend endpoint (POST /api/search) over the same rows the
 * rest of the app renders, so there is no second catalogue.
 *
 * Scope is stated plainly in the UI: this searches CareerNexus's verified
 * collection, not the live internet. Every external URL comes from a
 * source that was checked, and the organisation-level destinations live
 * in the central register at data/website-links.json.
 */

const SEARCH_CATEGORIES = [
  'Courses', 'Internships', 'Certifications', 'Jobs',
  'Training', 'Research', 'Government', 'AIIA',
];

const SEARCH_PAGE_SIZE = 24;

const searchState = {
  q: '',
  category: '',
  mode: '',
  location: '',
  provider: '',
  status: '',
  fee: '',
  sort: 'relevance',
  offset: 0,
  results: [],
  total: 0,
  hasMore: false,
  byCategory: {},
  indexNote: '',
  indexSize: 0,
  loading: false,
  error: '',
  /* Increments on every request so a slow earlier response cannot
     overwrite the results of a later query. */
  requestId: 0,
};

const UNSPECIFIED = 'Not specified by the official source';

function selectField(id, label, options, value) {
  return `
    <div class="search-filter">
      <label for="${id}">${escapeHtml(label)}</label>
      <select class="form-select" id="${id}">
        ${options
          .map(
            (o) =>
              `<option value="${escapeHtml(o.value)}"${o.value === value ? ' selected' : ''}>${escapeHtml(o.label)}</option>`
          )
          .join('')}
      </select>
    </div>`;
}

function searchShell() {
  return `
    <div class="search-hero">
      <h1 class="text-page-heading">Search Opportunities</h1>
      <p class="text-body mt-2">
        Search across CareerNexus's verified opportunity database — courses,
        internships, certifications, jobs, training, research calls,
        government schemes and AIIA programmes. Every one links back to the
        organisation's own official page.
      </p>

      <div class="search-bar">
        <div class="search-bar-field">
          <span class="search-bar-icon" aria-hidden="true">🔍</span>
          <input class="search-bar-input" id="searchInput" type="search"
                 placeholder="Try “Python internship”, “AI course”, “AIIA”…"
                 autocomplete="off" aria-label="Search opportunities" />
          <div class="search-suggest" id="searchSuggest" hidden></div>
        </div>
        <button class="btn btn-primary btn-lg" id="searchGo" type="button">Search</button>
      </div>

      <div class="search-filters">
        ${selectField('catFilter', 'Category', [
          { value: '', label: 'All categories' },
          ...SEARCH_CATEGORIES.map((c) => ({ value: c, label: c })),
        ], searchState.category)}
        ${selectField('modeFilter', 'Mode', [
          { value: '', label: 'Any mode' },
          { value: 'Online', label: 'Online' },
          { value: 'Offline', label: 'Offline' },
          { value: 'Hybrid', label: 'Hybrid' },
        ], searchState.mode)}
        ${selectField('locFilter', 'Location', [
          { value: '', label: 'Anywhere' },
          { value: 'India', label: 'India' },
          { value: 'Remote', label: 'Remote' },
          { value: 'Delhi', label: 'Delhi' },
          { value: 'Goa', label: 'Goa' },
          { value: 'Bengaluru', label: 'Bengaluru' },
          { value: 'Pune', label: 'Pune' },
          { value: 'Mumbai', label: 'Mumbai' },
          { value: 'Hyderabad', label: 'Hyderabad' },
        ], searchState.location)}
        ${selectField('provFilter', 'Provider', [
          { value: '', label: 'Any provider' },
          { value: 'government', label: 'Government' },
          { value: 'company', label: 'Company' },
          { value: 'university', label: 'University / Institute' },
          { value: 'platform', label: 'Learning platform' },
          { value: 'aiia', label: 'AIIA' },
        ], searchState.provider)}
        ${selectField('statusFilter', 'Status', [
          { value: '', label: 'Any status' },
          { value: 'open', label: 'Open' },
          { value: 'closed', label: 'Closed' },
          { value: 'unknown', label: 'No deadline published' },
        ], searchState.status)}
        ${selectField('feeFilter', 'Fee', [
          { value: '', label: 'Any' },
          { value: 'free', label: 'Free' },
          { value: 'paid', label: 'Paid' },
          { value: 'unknown', label: 'Not published' },
        ], searchState.fee)}
        ${selectField('sortFilter', 'Sort by', [
          { value: 'relevance', label: 'Relevance' },
          { value: 'deadline', label: 'Deadline (soonest)' },
          { value: 'title', label: 'Title (A–Z)' },
        ], searchState.sort)}
      </div>

      <div class="search-cats" id="searchCats"></div>
    </div>

    <div class="search-summary" id="searchSummary"></div>
    <div id="searchBody"></div>
  `;
}

/* ---------- One result card ----------
   Every field the brief asks for, and where the official source does not
   publish one we say so rather than filling the gap. */
function resultCard(row) {
  const fact = (label, value) => {
    const unspecified = !value || value === UNSPECIFIED;
    return `
      <div class="result-fact">
        <span class="k">${escapeHtml(label)}</span>
        <span class="v${unspecified ? ' is-unspecified' : ''}">${escapeHtml(unspecified ? UNSPECIFIED : value)}</span>
      </div>`;
  };

  const url = safeUrl(row.official_url);
  const internal = row.internal_url ? escapeHtml(row.internal_url) : '';

  return `
    <article class="card card-hover result-card">
      <div class="result-head">
        <div>
          <p class="result-title">${escapeHtml(row.title)}</p>
          <p class="result-org">${escapeHtml(row.organisation)}</p>
        </div>
        <span class="result-cat">${escapeHtml(row.category)}</span>
      </div>

      <div class="flex items-center gap-2" style="flex-wrap:wrap;">
        ${row.verified
          ? '<span class="source-official">✅ Verified official source</span>'
          : '<span class="source-platform">Posted on CareerNexus</span>'}
        ${row.deadline ? deadlineBadge(row.deadline) : ''}
      </div>

      ${row.description ? `<p class="result-desc">${escapeHtml(row.description)}</p>` : ''}

      <div class="result-facts">
        ${fact('Eligibility', row.eligibility)}
        ${fact('Location', row.location)}
        ${fact('Mode', row.mode)}
        ${fact('Duration', row.duration)}
        ${fact('Fee / Stipend', row.fee)}
        ${fact('Deadline', row.deadline)}
      </div>

      <div class="result-foot">
        <span class="result-source">Source: ${escapeHtml(row.source_name || row.organisation)}</span>
        <span class="flex gap-2" style="flex-wrap:wrap;">
          ${internal ? `<a class="btn btn-ghost btn-sm" href="${internal}">Open in CareerNexus</a>` : ''}
          ${url
            ? officialLinkButton(url, 'Official Website', 'btn btn-primary btn-sm')
            : '<span class="result-source">No official link published</span>'}
        </span>
      </div>
    </article>`;
}

function renderCategoryChips() {
  const host = document.getElementById('searchCats');
  if (!host) return;
  const counts = searchState.byCategory || {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  host.innerHTML = [
    `<button type="button" class="search-cat${searchState.category === '' ? ' active' : ''}" data-cat="">
       All${total ? ` <span class="n">${total}</span>` : ''}
     </button>`,
    ...SEARCH_CATEGORIES.filter((c) => counts[c]).map(
      (c) => `<button type="button" class="search-cat${searchState.category === c ? ' active' : ''}" data-cat="${escapeHtml(c)}">
                ${escapeHtml(c)} <span class="n">${counts[c]}</span>
              </button>`
    ),
  ].join('');
}

function renderSummary() {
  const host = document.getElementById('searchSummary');
  if (!host) return;
  if (searchState.loading && !searchState.results.length) {
    host.innerHTML = '<span class="search-count">Searching…</span>';
    return;
  }
  const shown = searchState.results.length;
  host.innerHTML = `
    <span class="search-count">
      ${searchState.total
        ? `<strong>${searchState.total}</strong> result${searchState.total === 1 ? '' : 's'}${
            searchState.q ? ` for “${escapeHtml(searchState.q)}”` : ''
          }${shown < searchState.total ? ` · showing ${shown}` : ''}`
        : ''}
    </span>
    <span class="text-caption">${escapeHtml(searchState.indexNote || '')}</span>`;
}

/* Pages inside CareerNexus that match the query. Rendered above the
   catalogue because "resume" or "skill gap" almost always means "take me
   to that page", and no course row will ever answer it. */
function pagesSection() {
  const pages = searchState.q ? searchLocalPages(expandSearchTerms(searchState.q), 4) : [];
  if (!pages.length) return '';
  return `
    <div class="card mb-4">
      <p class="text-label mb-2">In CareerNexus</p>
      ${pages
        .map(
          (pg) => `
        <a class="gs-row" href="${escapeHtml(pg.href)}">
          <span class="gs-row-icon" aria-hidden="true">${pg.icon}</span>
          <span class="gs-row-body">
            <span class="gs-row-title">${escapeHtml(pg.label)}</span>
            <span class="gs-row-meta">Open this page</span>
          </span>
        </a>`
        )
        .join('')}
    </div>`;
}

function renderBody() {
  const host = document.getElementById('searchBody');
  if (!host) return;

  if (searchState.error) {
    host.innerHTML = errorState(searchState.error, 'runSearch');
    return;
  }
  if (searchState.loading && !searchState.results.length) {
    host.innerHTML = pagesSection() + skeletonCards(6);
    return;
  }
  if (!searchState.results.length) {
    const chips = SEARCH_POPULAR.slice(0, 5)
      .map((t) => `<button type="button" class="gs-chip" data-suggest="${escapeHtml(t)}">${escapeHtml(t)}</button>`)
      .join('');
    host.innerHTML = pagesSection() + emptyState(
      '🔍',
      searchState.q
        ? `No opportunities found for “${searchState.q}”`
        : 'Search the verified opportunity database',
      searchState.q
        ? 'Nothing in the verified collection matched. Try searching for:'
        : 'Type what you are looking for, or try searching for:',
      `<div class="gs-chips mt-3" style="justify-content:center;">${chips}</div>`
    );
    return;
  }

  host.innerHTML = `
    ${pagesSection()}
    <div class="search-results">${searchState.results.map(resultCard).join('')}</div>
    ${searchState.hasMore
      ? `<div class="search-more">
           <button class="btn btn-secondary" id="loadMore" type="button">
             ${searchState.loading ? 'Loading…' : `Load more (${searchState.total - searchState.results.length} left)`}
           </button>
         </div>`
      : ''}`;
}

function renderAll() {
  renderCategoryChips();
  renderSummary();
  renderBody();
}

async function runSearch(append = false) {
  if (!append) searchState.offset = 0;
  searchState.loading = true;
  searchState.error = '';
  renderAll();

  const mine = ++searchState.requestId;
  try {
    const data = await api.search({
      q: searchState.q,
      // Same expansion the header box uses, so both boxes understand
      // "make my cv" and "AI course" identically.
      terms: expandSearchTerms(searchState.q),
      category: searchState.category,
      mode: searchState.mode,
      location: searchState.location,
      provider: searchState.provider,
      status: searchState.status,
      fee: searchState.fee,
      sort: searchState.sort,
      limit: SEARCH_PAGE_SIZE,
      offset: searchState.offset,
    });
    if (mine !== searchState.requestId) return; // superseded

    searchState.results = append ? [...searchState.results, ...data.results] : data.results;
    searchState.total = data.total;
    searchState.hasMore = data.has_more;
    searchState.byCategory = data.by_category || {};
    searchState.indexNote = data.index_note || '';
    searchState.indexSize = data.index_size || 0;
  } catch (err) {
    if (mine !== searchState.requestId) return;
    searchState.error = err.message || 'Search is unavailable right now.';
    if (!append) searchState.results = [];
  } finally {
    if (mine === searchState.requestId) {
      searchState.loading = false;
      renderAll();
    }
  }
}

function renderSuggestions() {
  const host = document.getElementById('searchSuggest');
  if (!host) return;
  const recent = recentSearches();
  const chip = (t) => `<button type="button" class="gs-chip" data-suggest="${escapeHtml(t)}">${escapeHtml(t)}</button>`;
  host.innerHTML = `
    ${recent.length
      ? `<div class="gs-group">
           <div class="gs-group-head">
             <span>Recent</span>
             <button type="button" class="gs-clear" id="clearRecent">Clear</button>
           </div>
           <div class="gs-chips">${recent.map(chip).join('')}</div>
         </div>`
      : ''}
    <div class="gs-group">
      <p class="gs-group-head"><span>Popular searches</span></p>
      <div class="gs-chips">${SEARCH_POPULAR.map(chip).join('')}</div>
    </div>`;
  host.hidden = false;
}

function wireSearchPage() {
  const input = document.getElementById('searchInput');
  const suggest = document.getElementById('searchSuggest');

  const submit = () => {
    searchState.q = input.value.trim();
    if (searchState.q) rememberSearch(searchState.q);
    suggest.hidden = true;
    // Keep the address bar in step so a search can be shared or reloaded.
    const url = new URL(window.location.href);
    if (searchState.q) url.searchParams.set('q', searchState.q);
    else url.searchParams.delete('q');
    window.history.replaceState({}, '', url);
    runSearch(false);
  };

  document.getElementById('searchGo').addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'Escape') { suggest.hidden = true; }
  });
  input.addEventListener('focus', () => { if (!input.value.trim()) renderSuggestions(); });

  document.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-suggest]');
    if (chip) {
      input.value = chip.dataset.suggest;
      submit();
      return;
    }
    if (e.target.closest('#clearRecent')) {
      clearRecentSearches();
      renderSuggestions();
      return;
    }
    const cat = e.target.closest('[data-cat]');
    if (cat) {
      searchState.category = cat.dataset.cat;
      const sel = document.getElementById('catFilter');
      if (sel) sel.value = searchState.category;
      runSearch(false);
      return;
    }
    if (e.target.closest('#loadMore')) {
      searchState.offset = searchState.results.length;
      runSearch(true);
      return;
    }
    if (!e.target.closest('.search-bar-field')) suggest.hidden = true;
  });

  const bind = (id, key) => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      searchState[key] = e.target.value;
      runSearch(false);
    });
  };
  bind('catFilter', 'category');
  bind('modeFilter', 'mode');
  bind('locFilter', 'location');
  bind('provFilter', 'provider');
  bind('statusFilter', 'status');
  bind('feeFilter', 'fee');
  bind('sortFilter', 'sort');
}

(function initSearchPage() {
  if (!requireAuth()) return;
  const name = localStorage.getItem('cn_student_name') || 'Student';
  const body = mountAppShell('search.html', name);

  // A query handed over from the header box, or a shared link.
  searchState.q = new URLSearchParams(window.location.search).get('q') || '';

  body.innerHTML = searchShell();
  document.getElementById('searchInput').value = searchState.q;
  wireSearchPage();
  runSearch(false);
})();
