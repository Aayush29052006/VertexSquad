/**
 * CareerNexus — Global configuration
 * Single source of truth for API base URL and feature flags.
 */
const CONFIG = {
  API_BASE_URL: 'http://localhost:8000/api',
  // Supabase's anon/public key is meant to be shipped in client-side code —
  // it's safe here because access is enforced by Row Level Security on the
  // Supabase project, not by hiding this key. The SERVICE ROLE key is the
  // one that must never appear in frontend code or this repo.
  SUPABASE_URL: 'https://cfmawwxrtstmiarbaqyh.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmbWF3d3hydHN0bWlhcmJhcXloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4MDAzMDUsImV4cCI6MjEwMzM3NjMwNX0.lZRKzjvynEDD1bCRLfRy_Fbfs-8QSVysH9uc3HmpUzY',
  // Flip to false only once the FastAPI backend is actually running and
  // reachable at API_BASE_URL — the backend source isn't on this machine
  // yet, so leaving this on true keeps the app fully working on mock data.
  USE_MOCK_DATA: true,
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
