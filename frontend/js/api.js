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
      // FastAPI's HTTPException serializes to {"detail": "..."}, but a
      // request-validation failure makes `detail` an array of error
      // objects — rendering that straight into the UI shows
      // "[object Object]". Pull the first readable message out instead.
      const detail = body.detail;
      if (typeof detail === 'string') {
        message = detail;
      } else if (Array.isArray(detail) && detail.length) {
        message = detail[0].msg || detail[0].message || message;
      } else if (detail && typeof detail === 'object') {
        message = detail.msg || detail.message || message;
      } else {
        message = body.message || message;
      }
    } catch (_) {
      /* non-JSON error body, keep default message */
    }
    throw new Error(message);
  }
  // 204 No Content (e.g. DELETE) has no body to parse.
  if (res.status === 204) return null;
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

  // Exchange a Google ID token for a CareerNexus session.
  // The token is verified server-side against Google's public keys.
  async loginWithGoogle(credential) {
    if (CONFIG.USE_MOCK_DATA) {
      await delay(500);
      return { token: 'mock_token_123', student: MOCK.student };
    }
    return apiRequest('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    });
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

  // ---------- Connected Profiles ----------
  async githubImport(username) {
    if (CONFIG.USE_MOCK_DATA) {
      await delay(600);
      return {
        profile: { login: username, name: username, bio: 'Sample bio (mock data mode).', avatar_url: '', html_url: `https://github.com/${username}`, public_repos: 2, followers: 0 },
        repos: [
          { name: 'sample-project', description: 'A sample repository shown in mock data mode.', html_url: `https://github.com/${username}/sample-project`, language: 'JavaScript', topics: ['demo'], stars: 3, forks: 1, updated_at: '2026-01-01', is_fork: false },
        ],
        languages_detected: ['JavaScript'],
      };
    }
    return apiRequest(`/social/github-import?username=${encodeURIComponent(username)}`);
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

  // ---------- AI interview prep (backend calls Gemini) ----------
  async getInterviewPrep(internshipId) {
    if (CONFIG.USE_MOCK_DATA) {
      await delay(900);
      const item = findInternship(internshipId);
      return {
        role: item.title,
        company: item.company,
        source: 'fallback',
        questions: [
          { type: 'Technical', question: `Walk me through a project where you used ${item.required_skills[0]}.`, sample_answer: 'Describe the problem, your approach, one challenge, and the result.' },
          { type: 'Technical', question: `How would you close the gap on ${item.missing_skills[0] || 'a skill new to you'}?`, sample_answer: 'Name the gap, the resource, and a small project to prove it.' },
          { type: 'Behavioural', question: `Why do you want to intern at ${item.company}?`, sample_answer: 'Connect their work to a skill you are building and what you want to learn.' },
        ],
      };
    }
    return apiRequest(`/internships/${internshipId}/interview-prep`);
  },

  // ---------- AI career assistant ----------
  async askAssistant(message) {
    if (CONFIG.USE_MOCK_DATA) {
      await delay(700);
      return { reply: 'This is a demo reply. Connect the backend to get real AI career guidance.', source: 'fallback' };
    }
    return apiRequest('/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  },

  // ---------- Recruiter: post a new internship ----------
  async createInternship(payload) {
    if (CONFIG.USE_MOCK_DATA) {
      await delay(600);
      return { id: `int_${Date.now()}`, ...payload };
    }
    return apiRequest('/internships', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // ---------- Skill assessment ----------
  // The questionnaire the problem statement opens with. Correct answers are
  // never sent to the browser — scoring happens entirely on the server.
  getAssessmentQuestions() {
    return apiRequest('/assessment/questions');
  },
  submitAssessment(answers) {
    return apiRequest('/assessment/submit', { method: 'POST', body: JSON.stringify({ answers }) });
  },
  getAssessmentResult() {
    return apiRequest('/assessment/result');
  },

  // ---------- Learning programs ----------
  getLearningRecommendations() {
    return apiRequest('/learning/recommendations');
  },
  listLearningPrograms(filters = {}) {
    const q = new URLSearchParams(filters).toString();
    return apiRequest(`/learning/programs${q ? `?${q}` : ''}`);
  },
  createLearningProgram(payload) {
    return apiRequest('/learning/programs', { method: 'POST', body: JSON.stringify(payload) });
  },
  deleteLearningProgram(id) {
    return apiRequest(`/learning/programs/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // ---------- Opportunities (internships, jobs, apprenticeships, FDPs) ----------
  listOpportunities(filters = {}) {
    const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const q = new URLSearchParams(clean).toString();
    return apiRequest(`/opportunities${q ? `?${q}` : ''}`);
  },
  createOpportunity(payload) {
    return apiRequest('/opportunities', { method: 'POST', body: JSON.stringify(payload) });
  },

  // ---------- Recruiter portal ----------
  recruiter: {
    getPostings() {
      return apiRequest('/recruiter/postings');
    },
    getApplicants(filters = {}) {
      const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      const q = new URLSearchParams(clean).toString();
      return apiRequest(`/recruiter/applicants${q ? `?${q}` : ''}`);
    },
    setApplicationStatus(id, status) {
      return apiRequest(`/recruiter/applications/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    },
    completeInternship(applicationId) {
      return apiRequest(`/applications/${encodeURIComponent(applicationId)}/complete`, { method: 'POST' });
    },
  },

  // ---------- Internship progress & mentor feedback ----------
  getProgress(applicationId) {
    return apiRequest(`/applications/${encodeURIComponent(applicationId)}/progress`);
  },
  addProgress(applicationId, payload) {
    return apiRequest(`/applications/${encodeURIComponent(applicationId)}/progress`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  addMentorFeedback(logId, payload) {
    return apiRequest(`/progress/${encodeURIComponent(logId)}/feedback`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  // ---------- Verified digital portfolio ----------
  getMyPortfolio() {
    return apiRequest('/portfolio/me');
  },
  // Public: deliberately no auth header needed, so a recruiter can open the
  // shared link without an account.
  getPublicPortfolio(studentId) {
    return apiRequest(`/portfolio/${encodeURIComponent(studentId)}`);
  },
  verifyPortfolioItem(payload) {
    return apiRequest('/portfolio/verify', { method: 'POST', body: JSON.stringify(payload) });
  },
  getPendingVerifications() {
    return apiRequest('/verify/pending');
  },

  // ---------- Industry-academia collaboration ----------
  listCollaborations(filters = {}) {
    const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const q = new URLSearchParams(clean).toString();
    return apiRequest(`/collaborations${q ? `?${q}` : ''}`);
  },
  createCollaboration(payload) {
    return apiRequest('/collaborations', { method: 'POST', body: JSON.stringify(payload) });
  },
  registerForCollaboration(id, note = '') {
    return apiRequest(`/collaborations/${encodeURIComponent(id)}/register`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
  },
  getCollaborationRegistrations(id) {
    return apiRequest(`/collaborations/${encodeURIComponent(id)}/registrations`);
  },

  // ---------- Secure documents ----------
  listDocuments() {
    return apiRequest('/documents');
  },
  async uploadDocument(file, title, docType) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    formData.append('doc_type', docType);
    const token = localStorage.getItem('cn_token');
    const res = await fetch(`${CONFIG.API_BASE_URL}/documents`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      let message = 'Upload failed. Please try again.';
      try {
        message = (await res.json()).detail || message;
      } catch (_) { /* non-JSON body */ }
      throw new Error(message);
    }
    return res.json();
  },
  getDocument(id) {
    return apiRequest(`/documents/${encodeURIComponent(id)}`);
  },
  deleteDocument(id) {
    return apiRequest(`/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // ---------- Official feed automation ----------
  // Items pulled from institution APIs, with the publisher's own deadline.
  getFeedItems(filters = {}) {
    const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v !== undefined));
    const q = new URLSearchParams(clean).toString();
    return apiRequest(`/feeds/items${q ? `?${q}` : ''}`);
  },
  // Admin-only: makes outbound requests to other people's servers.
  syncFeeds() {
    return apiRequest('/feeds/sync', { method: 'POST' });
  },
  getDeadlines(withinDays = 30) {
    return apiRequest(`/deadlines?within_days=${encodeURIComponent(withinDays)}`);
  },

  // ---------- AIIA opportunity hub ----------
  // Read-only: everything it returns lives on aiia.gov.in.
  getAiiaHub() {
    return apiRequest('/aiia');
  },

  // ---------- Unified search ----------
  // One call covers courses, internships, jobs, government schemes and
  // AIIA programmes: the backend searches the same rows those pages use,
  // so there is no second catalogue to keep in step.
  // `terms` is the client-expanded vocabulary from js/search-core.js.
  search(params = {}) {
    return apiRequest('/search', {
      method: 'POST',
      body: JSON.stringify({
        q: params.q || '',
        terms: params.terms || [],
        category: params.category || '',
        mode: params.mode || '',
        location: params.location || '',
        provider: params.provider || '',
        status: params.status || '',
        fee: params.fee || '',
        sort: params.sort || 'relevance',
        limit: params.limit || 24,
        offset: params.offset || 0,
      }),
    });
  },

  // ---------- Team & Contact ----------
  // Both are public: someone who is not signed in must be able to read
  // the team page and send a message.
  getTeam() {
    return apiRequest('/team');
  },
  getContactMeta() {
    return apiRequest('/contact/meta');
  },
  sendContactMessage(payload) {
    return apiRequest('/contact', { method: 'POST', body: JSON.stringify(payload) });
  },

  // ---------- Institution analytics ----------
  getInstitutionAnalytics() {
    return apiRequest('/institution/analytics');
  },

  // ---------- Admin panel (role === 'admin' enforced server-side) ----------
  admin: {
    getStats() {
      return apiRequest('/admin/stats');
    },
    getSkillGaps() {
      return apiRequest('/admin/skill-gaps');
    },
    listStudents(search = '') {
      const q = search ? `?search=${encodeURIComponent(search)}` : '';
      return apiRequest(`/admin/students${q}`);
    },
    getStudent(id) {
      return apiRequest(`/admin/students/${encodeURIComponent(id)}`);
    },
    updateStudent(id, patch) {
      return apiRequest(`/admin/students/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
    },
    deleteStudent(id) {
      return apiRequest(`/admin/students/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    listInternships() {
      return apiRequest('/admin/internships');
    },
    createInternship(payload) {
      return apiRequest('/admin/internships', { method: 'POST', body: JSON.stringify(payload) });
    },
    updateInternship(id, payload) {
      return apiRequest(`/admin/internships/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    },
    deleteInternship(id) {
      return apiRequest(`/admin/internships/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    // Every contact-form message, including any the mailer could not
    // deliver — this is what keeps a failed send from being a black hole.
    listContactMessages() {
      return apiRequest('/admin/contact-messages');
    },
    listApplications(status = '') {
      const q = status ? `?status=${encodeURIComponent(status)}` : '';
      return apiRequest(`/admin/applications${q}`);
    },
    updateApplication(id, status) {
      return apiRequest(`/admin/applications/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    },
  },
};
