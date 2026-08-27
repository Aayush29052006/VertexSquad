/**
 * CareerNexus — Mock data
 * Used ONLY while CONFIG.USE_MOCK_DATA is true. Mirrors the shape the
 * FastAPI backend is expected to return, so switching to real API calls
 * in api.js requires no changes to page-level JS.
 */
const MOCK = {
  student: {
    id: 'stu_1001',
    full_name: 'Aayush Chaudhari',
    email: 'aayushswapnali@gmail.com',
    phone: '+91 98765 43210',
    location: 'Pune, Maharashtra',
    photo_url: '',
    college: 'Vishwakarma Institute of Technology',
    degree: 'B.Tech',
    branch: 'Computer Engineering',
    current_year: '3rd Year',
    graduation_year: 2027,
    cgpa: 8.6,
    profile_completion: 82,
    placement_readiness: 78,
    skills: ['Python', 'JavaScript', 'React', 'SQL', 'Git', 'FastAPI', 'HTML', 'CSS'],
    soft_skills: ['Communication', 'Leadership', 'Problem Solving', 'Teamwork'],
    projects: [
      { id: 1, title: 'Campus Skill Tracker', description: 'A web app to track student skills and certifications for placement readiness.', tech: ['React', 'Node.js', 'MongoDB'], link: '' },
      { id: 2, title: 'AI Resume Parser', description: 'Extracts skills and experience from PDF resumes using NLP.', tech: ['Python', 'spaCy'], link: '' },
    ],
    certifications: [
      { id: 1, title: 'Google Data Analytics Certificate', issuer: 'Google', year: 2025 },
      { id: 2, title: 'AWS Cloud Practitioner', issuer: 'Amazon Web Services', year: 2025 },
    ],
    experience: [
      { id: 1, role: 'Web Development Intern', org: 'CodeCraft Labs', duration: 'May 2025 – Jul 2025', description: 'Built and shipped internal dashboard components using React.' },
    ],
    preferences: {
      preferred_roles: ['Frontend Developer', 'Full Stack Developer'],
      preferred_locations: ['Pune', 'Bengaluru', 'Remote'],
      work_mode: 'Hybrid',
      duration: '3-6 months',
    },
  },

  resume: {
    file_name: 'Aayush_Chaudhari_Resume.pdf',
    file_size_kb: 412,
    uploaded_at: '2026-08-20T10:30:00Z',
    status: 'processed',
  },

  extraction: {
    technical_skills: [
      { name: 'Python', confidence: 'High' },
      { name: 'JavaScript', confidence: 'High' },
      { name: 'React', confidence: 'High' },
      { name: 'SQL', confidence: 'Medium' },
      { name: 'Git', confidence: 'High' },
      { name: 'Docker', confidence: 'Medium' },
    ],
    soft_skills: ['Communication', 'Leadership', 'Problem Solving', 'Teamwork'],
    projects_found: 5,
    certifications_found: 3,
  },

  recommendations: [
    {
      id: 'int_1',
      title: 'Frontend Developer Intern',
      company: 'TechNova',
      location: 'Pune',
      work_mode: 'Hybrid',
      stipend: '₹15,000/month',
      duration: '3 months',
      deadline: '2026-09-15',
      match_score: 91,
      required_skills: ['JavaScript', 'HTML', 'CSS', 'React', 'TypeScript'],
      matched_skills: ['JavaScript', 'HTML', 'CSS', 'React'],
      missing_skills: ['TypeScript'],
      breakdown: { 'Required Skills': 90, 'Education Eligibility': 100, 'Preferences': 80, 'Projects': 90 },
    },
    {
      id: 'int_2',
      title: 'Full Stack Engineer Intern',
      company: 'FinEdge Solutions',
      location: 'Bengaluru',
      work_mode: 'Remote',
      stipend: '₹20,000/month',
      duration: '6 months',
      deadline: '2026-09-22',
      match_score: 78,
      required_skills: ['Python', 'FastAPI', 'React', 'SQL', 'Docker'],
      matched_skills: ['Python', 'FastAPI', 'React', 'SQL'],
      missing_skills: ['Docker'],
      breakdown: { 'Required Skills': 80, 'Education Eligibility': 100, 'Preferences': 70, 'Projects': 65 },
    },
    {
      id: 'int_3',
      title: 'Data Analyst Intern',
      company: 'InsightWorks',
      location: 'Remote',
      work_mode: 'Remote',
      stipend: '₹12,000/month',
      duration: '3 months',
      deadline: '2026-09-10',
      match_score: 64,
      required_skills: ['Python', 'SQL', 'Excel', 'Power BI'],
      matched_skills: ['Python', 'SQL'],
      missing_skills: ['Excel', 'Power BI'],
      breakdown: { 'Required Skills': 55, 'Education Eligibility': 100, 'Preferences': 60, 'Projects': 50 },
    },
    {
      id: 'int_4',
      title: 'Backend Developer Intern',
      company: 'CloudSprint',
      location: 'Hyderabad',
      work_mode: 'On-site',
      stipend: '₹18,000/month',
      duration: '4 months',
      deadline: '2026-10-01',
      match_score: 55,
      required_skills: ['Python', 'FastAPI', 'PostgreSQL', 'AWS', 'Docker'],
      matched_skills: ['Python', 'FastAPI'],
      missing_skills: ['PostgreSQL', 'AWS', 'Docker'],
      breakdown: { 'Required Skills': 40, 'Education Eligibility': 100, 'Preferences': 50, 'Projects': 40 },
    },
    {
      id: 'int_5',
      title: 'UI/UX Design Intern',
      company: 'PixelForge Studio',
      location: 'Mumbai',
      work_mode: 'Hybrid',
      stipend: '₹10,000/month',
      duration: '3 months',
      deadline: '2026-09-18',
      match_score: 38,
      required_skills: ['Figma', 'Adobe XD', 'CSS', 'User Research'],
      matched_skills: ['CSS'],
      missing_skills: ['Figma', 'Adobe XD', 'User Research'],
      breakdown: { 'Required Skills': 25, 'Education Eligibility': 100, 'Preferences': 30, 'Projects': 20 },
    },
  ],

  applications: [
    { id: 'app_1', internship_id: 'int_1', title: 'Frontend Developer Intern', company: 'TechNova', applied_on: '2026-08-18', status: 'shortlisted', match_score: 91 },
    { id: 'app_2', internship_id: 'int_2', title: 'Full Stack Engineer Intern', company: 'FinEdge Solutions', applied_on: '2026-08-15', status: 'under_review', match_score: 78 },
    { id: 'app_3', internship_id: 'int_4', title: 'Backend Developer Intern', company: 'CloudSprint', applied_on: '2026-08-10', status: 'rejected', match_score: 55 },
    { id: 'app_4', internship_id: 'int_3', title: 'Data Analyst Intern', company: 'InsightWorks', applied_on: '2026-08-05', status: 'applied', match_score: 64 },
  ],
};

function findInternship(id) {
  return MOCK.recommendations.find((i) => i.id === id) || null;
}
