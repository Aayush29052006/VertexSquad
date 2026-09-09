/**
 * CareerNexus — central website register (client side)
 *
 * Reads data/website-links.json, the one file that holds every external
 * destination the app points at. Edit that file to change a URL; nothing
 * in here or in any page needs touching.
 *
 * Two things worth knowing about how this is loaded:
 *
 *  1. The defaults below are not a second copy of the register — they are
 *     the handful of URLs the UI would otherwise render as dead links if
 *     the fetch failed. Everything else comes from the file. This is the
 *     lesson from the AIIA hub's "Failed to fetch": one network call with
 *     nothing behind it takes a whole page down.
 *
 *  2. `loadWebsiteLinks()` is fire-and-forget. Pages call `siteUrl(id)`
 *     synchronously and get the default until the file lands, so nothing
 *     has to await anything or re-render.
 */

/* Fallbacks for the destinations that appear in page chrome, where a
   missing href would be visible. Keys match "id" in website-links.json. */
const WEBSITE_LINK_FALLBACKS = {
  aiia_delhi: 'https://aiia.gov.in',
  aiia_goa: 'https://aiiagoa.org',
  ministry_ayush: 'https://ayush.gov.in',
  sih: 'https://sih.gov.in',
};

let WEBSITE_LINKS = [];
let WEBSITE_LINKS_BY_ID = {};
let websiteLinksLoaded = false;

/**
 * The registered URL for `id`.
 * Falls back to WEBSITE_LINK_FALLBACKS, then to '' — never to a guess.
 */
function siteUrl(id, fallback) {
  const entry = WEBSITE_LINKS_BY_ID[id];
  const raw = (entry && entry.url) || fallback || WEBSITE_LINK_FALLBACKS[id] || '';
  // Same guard as every other outbound link: http(s) only.
  return typeof safeUrl === 'function' ? safeUrl(raw) : raw;
}

/** The full entry for `id` (name, organization, category, purpose…). */
function siteEntry(id) {
  return WEBSITE_LINKS_BY_ID[id] || null;
}

/** Every registered site, optionally narrowed to one category. */
function sitesByCategory(category) {
  if (!category) return WEBSITE_LINKS;
  const wanted = String(category).toLowerCase();
  return WEBSITE_LINKS.filter((w) => (w.category || '').toLowerCase() === wanted);
}

/**
 * Load the register. Safe to call more than once — the second call is a
 * no-op. Resolves either way; failure is not an error worth surfacing,
 * because the fallbacks keep every visible link working.
 */
async function loadWebsiteLinks() {
  if (websiteLinksLoaded) return WEBSITE_LINKS;
  websiteLinksLoaded = true;
  try {
    // Relative to /pages/*.html, hence the ../ — the file is served by
    // serve.py out of frontend/data/.
    const res = await fetch('../data/website-links.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    WEBSITE_LINKS = Array.isArray(data.websites) ? data.websites : [];
    WEBSITE_LINKS_BY_ID = WEBSITE_LINKS.reduce((acc, w) => {
      if (w && w.id) acc[w.id] = w;
      return acc;
    }, {});
  } catch (err) {
    // Left deliberately quiet in the UI: siteUrl() still returns working
    // URLs, so there is nothing for the user to act on.
    console.warn('Website links register unavailable, using built-in defaults:', err.message);
  }
  return WEBSITE_LINKS;
}

/**
 * Warn if the JSON register and the fallback table above have drifted.
 *
 * The fallbacks exist because some URLs are needed synchronously, before
 * a fetch can resolve. That means a URL edited in website-links.json but
 * not here would silently keep the old value in those few places. Rather
 * than let that happen quietly, say so in the console — editing the JSON
 * is meant to be enough, and this is how you find out when it wasn't.
 */
function checkWebsiteLinkDrift() {
  const drifted = Object.entries(WEBSITE_LINK_FALLBACKS)
    .map(([id, fallback]) => {
      const entry = WEBSITE_LINKS_BY_ID[id];
      return entry && entry.url !== fallback
        ? `  ${id}: register has "${entry.url}", js/website-links.js still has "${fallback}"`
        : null;
    })
    .filter(Boolean);

  if (drifted.length) {
    console.warn(
      'Website links out of step with data/website-links.json.\n' +
        'Update WEBSITE_LINK_FALLBACKS in js/website-links.js to match:\n' +
        drifted.join('\n')
    );
  }
}

// Start the load as soon as the script runs, so the file is usually in
// place before the first page render finishes.
loadWebsiteLinks().then(checkWebsiteLinkDrift);
