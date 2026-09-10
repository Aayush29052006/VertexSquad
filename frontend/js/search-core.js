/**
 * CareerNexus — Search vocabulary & local page index
 *
 * Shared by the header search box (ui.js) and the Opportunity Search page
 * (search.js), so both understand the same words. Two jobs:
 *
 *  1. Turn what someone typed into terms worth matching. "make my cv"
 *     should reach the Resume page even though the word "resume" never
 *     appears in the query, and "AI course" should reach machine-learning
 *     material. That is what SEARCH_SYNONYMS is for — it is a plain
 *     dictionary, not a model, so it is predictable and easy to extend.
 *
 *  2. Rank the app's own pages against those terms, because the most
 *     common thing a search box is asked is "where is X" and the answer
 *     is a page, not a catalogue row. Catalogue rows are ranked by the
 *     backend (POST /api/search) with the same expanded terms.
 *
 * Scope: CareerNexus's own pages and its verified opportunity database.
 * Searching the live internet is a separate feature that has deliberately
 * not been built — there is no search API, no crawler, and nothing here
 * fabricates a result or a URL.
 */

/* Words that mean the same thing to a student but not to a substring
   match. Key = what someone types, value = what to also look for. */
const SEARCH_SYNONYMS = {
  cv: ['resume'],
  resume: ['cv', 'resume'],
  'curriculum vitae': ['resume', 'cv'],
  biodata: ['resume', 'cv'],
  ai: ['ai', 'artificial intelligence', 'machine learning', 'ml'],
  'artificial intelligence': ['ai', 'machine learning'],
  ml: ['machine learning', 'ai'],
  'machine learning': ['ml', 'ai'],
  ds: ['data science'],
  'data science': ['data', 'analytics', 'data science'],
  analytics: ['data', 'data science'],
  webdev: ['web development', 'frontend', 'full stack'],
  'web development': ['frontend', 'backend', 'full stack', 'javascript', 'react'],
  frontend: ['web development', 'react', 'javascript'],
  backend: ['web development', 'node', 'api'],
  'full stack': ['web development', 'frontend', 'backend'],
  intern: ['internship'],
  internships: ['internship'],
  interns: ['internship'],
  job: ['job', 'placement', 'full-time'],
  jobs: ['job', 'placement'],
  placement: ['job', 'placement'],
  course: ['course', 'certification', 'training'],
  courses: ['course', 'certification'],
  cert: ['certification', 'certificate'],
  certificate: ['certification'],
  certification: ['certificate', 'course'],
  training: ['training', 'workshop', 'course'],
  govt: ['government'],
  government: ['government', 'ministry', 'scheme'],
  sarkari: ['government'],
  scholarship: ['fellowship', 'scholarship'],
  fellowship: ['scholarship', 'fellowship'],
  research: ['research', 'project', 'fellowship'],
  aiia: ['aiia', 'ayurveda', 'ayush'],
  ayurveda: ['aiia', 'ayurveda', 'ayush'],
  ayush: ['aiia', 'ayurveda', 'ayush'],
  panchakarma: ['aiia', 'panchakarma', 'ayurveda'],
  yoga: ['yoga', 'wellness', 'aiia'],
  skill: ['skill', 'skills'],
  'skill gap': ['skill gap', 'gap', 'skills'],
  gap: ['skill gap'],
  test: ['assessment', 'quiz'],
  quiz: ['assessment'],
  exam: ['assessment'],
  assessment: ['assessment', 'test', 'quiz'],
  portfolio: ['portfolio', 'verified', 'achievements'],
  profile: ['profile', 'account'],
  remote: ['remote', 'work from home', 'online'],
  wfh: ['remote', 'work from home'],
  free: ['free', 'no cost'],
  python: ['python'],
  java: ['java'],
  sql: ['sql', 'database'],
  cloud: ['cloud', 'aws', 'azure'],
  devops: ['devops', 'docker', 'kubernetes'],
};

/* Words too common to be worth matching on their own. */
const SEARCH_STOPWORDS = new Set([
  'a', 'an', 'the', 'for', 'of', 'in', 'on', 'to', 'my', 'me', 'i', 'is',
  'are', 'and', 'or', 'with', 'want', 'need', 'how', 'do', 'get', 'find',
  'show', 'search', 'looking', 'make', 'build', 'create', 'best', 'good',
  'any', 'some', 'new', 'near', 'about', 'please', 'help',
]);

/**
 * Expand a raw query into the terms actually worth matching.
 * Returns [] for an empty query, which callers read as "no filtering".
 */
function expandSearchTerms(query) {
  const raw = String(query || '').toLowerCase().trim();
  if (!raw) return [];

  const terms = new Set();
  const add = (t) => {
    const v = String(t || '').trim();
    if (v.length > 1) terms.add(v);
  };

  // Multi-word keys first: "data science" must be recognised before it is
  // split into "data" and "science".
  Object.keys(SEARCH_SYNONYMS)
    .filter((k) => k.includes(' '))
    .forEach((phrase) => {
      if (raw.includes(phrase)) {
        add(phrase);
        SEARCH_SYNONYMS[phrase].forEach(add);
      }
    });

  raw
    .split(/[^a-z0-9+#.]+/)
    .filter((w) => w.length > 1 && !SEARCH_STOPWORDS.has(w))
    .forEach((word) => {
      add(word);
      (SEARCH_SYNONYMS[word] || []).forEach(add);
      // Cheap plural handling, so "courses" and "course" behave alike.
      if (word.endsWith('s') && word.length > 3) {
        const single = word.slice(0, -1);
        add(single);
        (SEARCH_SYNONYMS[single] || []).forEach(add);
      }
    });

  return [...terms];
}

/* ---------- The app's own pages ----------
   Built from NAV_ITEMS so a page added to the sidebar becomes searchable
   without being registered twice. `keywords` is what someone might call
   the page when they don't know its label. */
const PAGE_KEYWORDS = {
  'dashboard.html': ['home', 'overview', 'summary', 'progress'],
  'assessment.html': ['test', 'quiz', 'exam', 'evaluate', 'skill test'],
  'profile.html': ['account', 'details', 'college', 'degree', 'edit profile'],
  'resume.html': ['cv', 'curriculum vitae', 'biodata', 'resume builder', 'upload resume', 'make my cv'],
  'skill-gap.html': ['gap', 'missing skills', 'what to learn', 'weakness'],
  'learning.html': ['course', 'courses', 'certification', 'learning path', 'study', 'training'],
  'internships.html': ['internship', 'intern', 'apply', 'matches'],
  'opportunities.html': ['job', 'jobs', 'placement', 'apprenticeship', 'live project', 'openings'],
  'updates.html': ['notices', 'vacancies', 'tenders', 'deadlines', 'news', 'alerts'],
  'aiia.html': ['aiia', 'ayurveda', 'ayush', 'panchakarma', 'yoga', 'institute'],
  'applications.html': ['applied', 'status', 'tracker', 'my applications'],
  'what-if.html': ['simulate', 'scenario', 'what if', 'forecast'],
  'documents.html': ['certificates', 'upload', 'files', 'marksheet'],
  'portfolio.html': ['achievements', 'verified', 'showcase', 'share profile'],
  'collaborations.html': ['industry', 'academia', 'guest lecture', 'workshop', 'mou'],
  'recruiter.html': ['hiring', 'applicants', 'shortlist', 'postings'],
  'post-opportunity.html': ['publish', 'new posting', 'advertise', 'hire'],
  'faculty.html': ['fdp', 'faculty development', 'mentor'],
  'verify.html': ['approve', 'verification', 'sign off', 'queue'],
  'institution.html': ['analytics', 'cohort', 'placement report', 'tpo'],
  'admin.html': ['platform', 'manage', 'operator', 'moderation'],
  'settings.html': ['theme', 'password', 'preferences', 'dark mode', 'logout'],
  'search.html': ['find', 'discover', 'browse', 'explore', 'opportunity search'],
  'team.html': ['team', 'contact', 'contact us', 'about', 'who made this', 'support',
                'help', 'email', 'feedback', 'get in touch', 'vertexsquad', 'developers'],
};

/**
 * Pages the signed-in role can actually open, ranked against `terms`.
 * Returns at most `limit` entries; [] when nothing is a real match, so
 * the caller can show its own empty state.
 */
function searchLocalPages(terms, limit = 5) {
  if (!terms.length) return [];
  if (typeof NAV_ITEMS === 'undefined') return [];

  const role = typeof currentRole === 'function' ? currentRole() : 'student';
  const visible = NAV_ITEMS.filter((item) => item.roles.includes(role));

  // Reachable by everyone but not necessarily in NAV_ITEMS. Filtered
  // against what the sidebar already offers, or a page that lives in both
  // lists is ranked and shown twice.
  const extras = [
    { href: 'settings.html', icon: '⚙️', label: 'Settings' },
    { href: 'search.html', icon: '🔍', label: 'Opportunity Search' },
    { href: 'team.html', icon: '👥', label: 'Team & Contact' },
  ].filter((extra) => !visible.some((item) => item.href === extra.href));

  return [...visible, ...extras]
    .map((item) => {
      const label = item.label.toLowerCase();
      const keywords = (PAGE_KEYWORDS[item.href] || []).join(' ');
      let score = 0;
      terms.forEach((term) => {
        if (label === term) score += 20;
        else if (label.includes(term)) score += 10;
        if (keywords.includes(term)) score += 6;
        if (item.href.replace('.html', '').includes(term)) score += 4;
      });
      return { ...item, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/* The suggestions offered before anything is typed, and in the empty
   state. Chosen to demonstrate what the index actually contains. */
const SEARCH_POPULAR = [
  'Python internship',
  'AI course',
  'Web development',
  'Data Science',
  'AIIA',
  'Government internship',
  'Free certification',
  'Remote internship',
];

const SEARCH_RECENT_KEY = 'cn_recent_searches';
const SEARCH_RECENT_MAX = 6;

function recentSearches() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SEARCH_RECENT_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string').slice(0, SEARCH_RECENT_MAX) : [];
  } catch (_) {
    return [];
  }
}

function rememberSearch(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return;
  try {
    const next = [q, ...recentSearches().filter((s) => s.toLowerCase() !== q.toLowerCase())]
      .slice(0, SEARCH_RECENT_MAX);
    localStorage.setItem(SEARCH_RECENT_KEY, JSON.stringify(next));
  } catch (_) {
    /* remembering searches is a convenience, not worth an error */
  }
}

function clearRecentSearches() {
  try {
    localStorage.removeItem(SEARCH_RECENT_KEY);
  } catch (_) {
    /* nothing to do */
  }
}
