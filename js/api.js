/**
 * CareerNexus — Central API layer
 * All backend communication funnels through this file. Page-level JS
 * never calls fetch() directly. Swap CONFIG.USE_MOCK_DATA to false once
 * the FastAPI backend endpoints below are live.
 */

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('cn_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${CONFIG.API_BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let message = 'Something went wrong. Please try again.';
    try {
      const body = await res.json();
      message = body.message || message;
    } catch (_) {
      /* non-JSON error body, keep default message */
    }
    throw new Error(message);
  }
  return res.json();
}

const api = {
  // ---------- Auth ----------
  async login(email, password) {
    if (CONFIG.USE_MOCK_DATA) {
      await delay(500);
      if (!email || !password) throw new Error('Email and password are required.');
      return { token: 'mock_token_123', student: MOCK.student };
    }
    return apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  },

  async register(payload) {
    if (CONFIG.USE_MOCK_DATA) {
      await delay(600);
      return { token: 'mock_token_123', student: { ...MOCK.student, ...payload } };
    }
    return apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
  },

  // ---------- Student profile ----------
  async getStudentProfile() {
    if (CONFIG.USE_MOCK_DATA) {
      await delay(400);
      return MOCK.student;
    }
    return apiRequest('/student/profile');
  },

  async updateStudentProfile(payload) {
    if (CONFIG.USE_MOCK_DATA) {
      await delay(500);
      Object.assign(MOCK.student, payload);
      return MOCK.student;
    }
    return apiRequest('/student/profile', { method: 'PUT', body: JSON.stringify(payload) });
  },

  // ---------- Resume ----------
  async uploadResume(file) {
    if (CONFIG.USE_MOCK_DATA) {
      await delay(1200);
      MOCK.resume = {
        file_name: file.name,
        file_size_kb: Math.round(file.size / 1024),
        uploaded_at: new Date().toISOString(),
        status: 'processed',
      };
      return MOCK.resume;
    }
    const formData = new FormData();
    formData.append('resume', file);
    const token = localStorage.getItem('cn_token');
    const res = await fetch(`${CONFIG.API_BASE_URL}/resume/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) throw new Error('Resume upload failed. Please try again.');
    return res.json();
  },

  async getResumeStatus() {
    if (CONFIG.USE_MOCK_DATA) {
      await delay(300);
      return MOCK.resume;
    }
    return apiRequest('/resume/status');
  },

  async getExtractedSkills() {
    if (CONFIG.USE_MOCK_DATA) {
      await delay(900);
      return MOCK.extraction;
    }
    return apiRequest('/resume/extracted-skills');
  },

  async confirmSkills(skills) {
    if (CONFIG.USE_MOCK_DATA) {
      await delay(500);
      MOCK.student.skills = skills;
      return { success: true, skills };
    }
    return apiRequest('/resume/confirm-skills', { method: 'POST', body: JSON.stringify({ skills }) });
  },

  // ---------- Internships ----------
  async getRecommendations(filters = {}) {
    if (CONFIG.USE_MOCK_DATA) {
      await delay(500);
      return MOCK.recommendations;
    }
    const query = new URLSearchParams(filters).toString();
    return apiRequest(`/internships/recommendations${query ? `?${query}` : ''}`);
  },

  async getInternshipDetails(id) {
    if (CONFIG.USE_MOCK_DATA) {
      await delay(400);
      const item = findInternship(id);
      if (!item) throw new Error('Internship not found.');
      return item;
    }
    return apiRequest(`/internships/${id}`);
  },

  async getMatchScore(id) {
    if (CONFIG.USE_MOCK_DATA) {
      await delay(300);
      const item = findInternship(id);
      return { match_score: item.match_score, breakdown: item.breakdown };
    }
    return apiRequest(`/internships/${id}/match-score`);
  },

  async getSkillGap(id) {
    if (CONFIG.USE_MOCK_DATA) {
      await delay(400);
      const item = findInternship(id);
      return {
        current_skills: MOCK.student.skills,
        required_skills: item.required_skills,
        missing_skills: item.missing_skills,
        priority: item.missing_skills.map((s, idx) => ({ skill: s, priority: idx === 0 ? 'HIGH' : 'MEDIUM' })),
      };
    }
    return apiRequest(`/internships/${id}/skill-gap`);
  },

  // ---------- Applications ----------
  async applyToInternship(id) {
    if (CONFIG.USE_MOCK_DATA) {
      await delay(700);
      const item = findInternship(id);
      const application = {
        id: `app_${Date.now()}`,
        internship_id: id,
        title: item.title,
        company: item.company,
        applied_on: new Date().toISOString().slice(0, 10),
        status: 'applied',
        match_score: item.match_score,
      };
      MOCK.applications.unshift(application);
      return application;
    }
    return apiRequest(`/internships/${id}/apply`, { method: 'POST' });
  },

  async getApplications() {
    if (CONFIG.USE_MOCK_DATA) {
      await delay(400);
      return MOCK.applications;
    }
    return apiRequest('/applications');
  },

  // ---------- What-if analysis (Phase 2, backend computes the score) ----------
  async getWhatIfScore(internshipId, addedSkills) {
    if (CONFIG.USE_MOCK_DATA) {
      await delay(500);
      const item = findInternship(internshipId);
      const bonus = Math.min(addedSkills.length * 7, 100 - item.match_score);
      return { current_match: item.match_score, potential_match: item.match_score + bonus };
    }
    return apiRequest(`/internships/${internshipId}/what-if`, {
      method: 'POST',
      body: JSON.stringify({ skills: addedSkills }),
    });
  },
};
