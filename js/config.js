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
  // The FastAPI backend is real and running locally now (see
  // CareerNexus-backend/backend/). Flip this back to true if you ever need
  // to browse the frontend without the backend server up.
  USE_MOCK_DATA: false,
  // Google Sign-In. A Google OAuth *client ID* is public by design (it is
  // visible in every page that uses Google sign-in) — the client SECRET is
  // the part that must stay server-side, and we never use it here.
  // Create one at https://console.cloud.google.com/apis/credentials
  // (OAuth client ID -> Web application), then paste it below AND set the
  // same value as GOOGLE_CLIENT_ID in backend/.env.
  // Leave blank to hide the Google button entirely.
  GOOGLE_CLIENT_ID: '892645924851-th5b6j33ck4gs0qf6q7262qhbbihdgci.apps.googleusercontent.com',
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
