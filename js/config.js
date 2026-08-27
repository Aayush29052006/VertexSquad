/**
 * CareerNexus — Global configuration
 * Single source of truth for API base URL and feature flags.
 */
const CONFIG = {
  API_BASE_URL: 'http://localhost:8000/api',
  SUPABASE_URL: '', // set by backend/deploy team; never commit real values
  SUPABASE_ANON_KEY: '', // public anon key only — never the service-role key
  USE_MOCK_DATA: true, // toggle off once FastAPI backend is live
  MATCH_THRESHOLDS: {
    EXCELLENT: 80,
    GOOD: 60,
    MODERATE: 40,
  },
};

function getMatchTier(score) {
  const t = CONFIG.MATCH_THRESHOLDS;
  if (score >= t.EXCELLENT) return { tier: 'excellent', label: 'Excellent Match' };
  if (score >= t.GOOD) return { tier: 'good', label: 'Good Match' };
  if (score >= t.MODERATE) return { tier: 'moderate', label: 'Moderate Match' };
  return { tier: 'low', label: 'Low Match' };
}
