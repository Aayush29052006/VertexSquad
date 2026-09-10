/**
 * CareerNexus — AIIA verified opportunity catalogue
 *
 * SIH26044 is set by the All India Institute of Ayurveda, so this is the
 * data behind the AIIA Hub. It lives in the frontend on purpose: none of
 * it changes per user and none of it needs a database, so the Hub renders
 * even when the API is unreachable. The backend only ever *adds* to this
 * — live notices with their closing dates.
 *
 * HOW THIS WAS BUILT — every field here came from an official source:
 *   * programme names, announcement dates and document links were read off
 *     aiia.gov.in and its public JSON API
 *   * eligibility, duration, seats, fees and last dates were read out of
 *     the institute's own brochure PDFs
 *   * AIIA Goa items link to aiiagoa.org, the site AIIA's own footer
 *     points to, or to the Goa advertisement PDFs hosted on aiia.gov.in
 *
 * THE RULE THAT MATTERS: where the official document does not state a
 * field — several brochures are scanned images with no text — the value is
 * UNSPECIFIED, and the card says so. A guessed eligibility rule could get
 * a student turned away at the counter, which is worse than an honest gap.
 *
 * `status` is never stored. It is derived from the real deadline every
 * time the page loads, so a course cannot sit there claiming to be open
 * after its closing date has passed.
 */

const AIIA_UNSPECIFIED = 'Not specified by the official source';

/* Where an item actually comes from. Kept explicit because a third-party
   Ayurveda course must never look like AIIA is running it. */
const AIIA_SOURCE = {
  AIIA_DELHI: 'AIIA Delhi — Official',
  AIIA_GOA: 'AIIA Goa — Official',
  AYUSH: 'Ministry of Ayush — Official',
};

/* Both site roots come from the central register
   (data/website-links.json), via the fallback table in
   js/website-links.js which is loaded before this file.

   Why not read the fetched register directly? The opportunity list below
   is built in template literals when this script parses, which happens
   before any fetch can resolve. So the frontend keeps exactly one
   literal for each root — in website-links.js — and
   checkWebsiteLinkDrift() warns in the console if the JSON register and
   that literal ever disagree, rather than letting them quietly diverge. */
const AIIA_SITE_URL = (typeof WEBSITE_LINK_FALLBACKS !== 'undefined'
  && WEBSITE_LINK_FALLBACKS.aiia_delhi) || 'https://aiia.gov.in';
const AIIA_GOA_URL = (typeof WEBSITE_LINK_FALLBACKS !== 'undefined'
  && WEBSITE_LINK_FALLBACKS.aiia_goa) || 'https://aiiagoa.org';

const AIIA_OPPORTUNITIES = [
  /* ---------------- Courses (AIIA Delhi) ---------------- */
  {
    id: 'aiia_aesthetic_assistant',
    title: 'Ayurvedic Aesthetic Assistant Course',
    organization: 'All India Institute of Ayurveda, New Delhi',
    category: 'Courses',
    domain: 'Ayurveda',
    description:
      'Skill course training technically skilled Ayurvedic aesthetic assistants, designed to the HSSC Qualification Pack HSS/Q3607 at NSQF Level 3. Academic session 2026-27.',
    eligibility:
      '10th pass from any recognised board (state board / CBSE / ICSE or another board recognised by the Government of India), as per the HSSC Qualification Pack',
    duration:
      '480 hours — 150 hours theory, 180 hours practical and 150 hours mandatory on-the-job training',
    seats: 'Maximum 30 students per batch',
    fee: AIIA_UNSPECIFIED,
    location: 'AIIA, New Delhi',
    mode: 'Offline',
    deadline: '2026-09-10',
    certificate: true,
    accreditation: 'Health Sector Skill Council (HSSC) & Ayurveda Training Accreditation Board (ATAB)',
    sourceType: AIIA_SOURCE.AIIA_DELHI,
    officialUrl: 'https://aiia.gov.in/pdf/Flyer_20082026_merged.pdf',
    sectionUrl: 'https://aiia.gov.in/#/coursesAvailable',
    tags: ['AIIA', 'Ayurveda', 'Government', 'Course', 'Certificate'],
    lastVerified: '2026-09-10',
    featured: true,
  },
  {
    id: 'aiia_garbhini_mitra',
    title: 'Garbhini Mitra Course',
    organization: 'Department of Prasuti Tantra & Stri Roga, AIIA New Delhi',
    category: 'Courses',
    domain: 'Ayurveda',
    description:
      'Course in Ayurvedic maternal and newborn care — Sutika Paricharya, breastfeeding counselling, newborn massage, postnatal Abhyanga and Swedana, and neonatal care. AIIA extended the last date for applications to 15 September 2026 by a separate notice.',
    eligibility:
      '10+2 passed from any board recognised by the Government of India. Candidates interested in maternal and women healthcare may apply',
    duration: '6 months, 2 hours per day (3:00 PM – 5:00 PM), Monday to Friday',
    seats: '20 seats per batch',
    fee: AIIA_UNSPECIFIED,
    location: 'AIIA, New Delhi',
    mode: 'Offline',
    deadline: '2026-09-15',
    certificate: true,
    accreditation: 'Health Sector Skill Council (HSSC) & Ayurveda Training Accreditation Board (ATAB)',
    sourceType: AIIA_SOURCE.AIIA_DELHI,
    officialUrl: 'https://aiia.gov.in/pdf/Academic_Brochure_08082026.pdf',
    sectionUrl: 'https://aiia.gov.in/#/coursesAvailable',
    tags: ['AIIA', 'Ayurveda', 'Government', 'Course', 'Certificate'],
    lastVerified: '2026-09-10',
  },
  {
    id: 'aiia_panchakarma_technician',
    title: 'Panchakarma Technician Course, Batch 2026-27',
    organization: 'Department of Panchakarma, AIIA New Delhi',
    category: 'Courses',
    domain: 'Ayurveda',
    description:
      'One-year technician training in Panchakarma therapy procedures. Selection is on merit with an interview or entrance examination, followed by counselling and a medical check. Applications for the 2026 batch have closed — AIIA published the provisional selection list on 21 August 2026 and the selection process is under way.',
    eligibility:
      '10+2 passed from any recognised school (state board / CBSE / ICSE or another board recognised by the Government of India). Age limit 16–35',
    duration: 'One year',
    seats: '30 students per batch',
    fee: AIIA_UNSPECIFIED,
    location: 'AIIA, New Delhi',
    mode: 'Offline',
    deadline: '2026-07-30',
    certificate: true,
    accreditation: 'Health Sector Skill Council (HSSC) & Ayurveda Training Accreditation Board (ATAB)',
    sourceType: AIIA_SOURCE.AIIA_DELHI,
    officialUrl: 'https://aiia.gov.in/#/coursesAvailable',
    sectionUrl: 'https://aiia.gov.in/#/coursesAvailable',
    tags: ['AIIA', 'Ayurveda', 'Government', 'Course', 'Certificate', 'Panchakarma'],
    lastVerified: '2026-09-10',
  },
  {
    id: 'aiia_yoga_wellness_trainer',
    title: 'Yoga Wellness Trainer Course',
    organization: 'Department of Swasthavritta, AIIA New Delhi',
    category: 'Courses',
    domain: 'Yoga & Wellness',
    description:
      'Six-month Yoga Wellness Trainer course for the 2026 academic year, affiliated with the Health Sector Skill Council and the National Skill Development Corporation. Applications for the 2026-27 intake closed on 5 July 2026 (the last date was extended once by notice). Watch the courses page for the next intake.',
    eligibility: '12th pass. Candidates awaiting their +12 result may apply provisionally',
    duration: 'Six months, 3 hours per day (1 July 2026 – 31 December 2026)',
    seats: '20 students per batch',
    fee: AIIA_UNSPECIFIED,
    location: 'AIIA, New Delhi',
    mode: 'Offline',
    deadline: '2026-07-05',
    certificate: true,
    accreditation: 'Health Sector Skill Council (HSSC) & National Skill Development Corporation (NSDC)',
    sourceType: AIIA_SOURCE.AIIA_DELHI,
    officialUrl: 'https://aiia.gov.in/#/coursesAvailable',
    sectionUrl: 'https://aiia.gov.in/#/coursesAvailable',
    tags: ['AIIA', 'Yoga', 'Government', 'Course', 'Certificate'],
    lastVerified: '2026-09-10',
  },
  {
    id: 'aiia_hospital_management',
    title: 'Certificate Course in Hospital Management 2026',
    organization: 'All India Institute of Ayurveda, New Delhi',
    category: 'Courses',
    domain: 'Healthcare Management',
    description:
      'Certificate course in hospital administration and management for the 2026 session, announced by institute notification.',
    eligibility: AIIA_UNSPECIFIED,
    duration: AIIA_UNSPECIFIED,
    seats: AIIA_UNSPECIFIED,
    fee: AIIA_UNSPECIFIED,
    location: 'AIIA, New Delhi',
    mode: 'Offline',
    deadline: '',
    certificate: true,
    sourceType: AIIA_SOURCE.AIIA_DELHI,
    officialUrl: 'https://aiia.gov.in/pdf/CCHM_2026_Admission_Notification_AIIA.pdf',
    sectionUrl: 'https://aiia.gov.in/#/coursesAvailable',
    tags: ['AIIA', 'Government', 'Course', 'Certificate', 'Management'],
    lastVerified: '2026-09-10',
    note: 'The notification is a scanned document, so eligibility, duration and fees are not machine-readable. Open the official notification for those details.',
  },
  {
    id: 'aiia_dietician_poshan',
    title: 'Ayurveda Dietician and Poshan Sahayak Course',
    organization: 'All India Institute of Ayurveda, New Delhi',
    category: 'Courses',
    domain: 'Ayurveda Nutrition',
    description:
      'Course in Ayurvedic dietetics and nutrition support. AIIA invited applications by public notice in February 2026.',
    eligibility: AIIA_UNSPECIFIED,
    duration: AIIA_UNSPECIFIED,
    fee: AIIA_UNSPECIFIED,
    location: 'AIIA, New Delhi',
    mode: 'Offline',
    deadline: '',
    certificate: true,
    sourceType: AIIA_SOURCE.AIIA_DELHI,
    officialUrl: 'https://aiia.gov.in/#/noticesArchive',
    sectionUrl: 'https://aiia.gov.in/#/coursesAvailable',
    tags: ['AIIA', 'Ayurveda', 'Government', 'Course', 'Nutrition'],
    lastVerified: '2026-09-10',
  },

  /* ---------------- Courses (AIIA Goa) ----------------
     A separate campus. Labelled AIIA Goa so nobody reads it as Delhi. */
  {
    id: 'aiia_goa_dietician',
    title: 'Ayurveda Dietician Course — AIIA Goa',
    organization: 'All India Institute of Ayurveda, Goa',
    category: 'Courses',
    domain: 'Ayurveda Nutrition',
    description:
      'Ayurveda Dietician course advertised by the AIIA Goa satellite campus. Run by AIIA Goa, not the Delhi campus.',
    eligibility: AIIA_UNSPECIFIED,
    duration: AIIA_UNSPECIFIED,
    fee: AIIA_UNSPECIFIED,
    location: 'AIIA Goa',
    mode: 'Offline',
    deadline: '',
    certificate: true,
    sourceType: AIIA_SOURCE.AIIA_GOA,
    officialUrl: 'https://aiia.gov.in/pdf/Advt-of-Ayurveda-Dietician-Course-AIIA-Goa.pdf',
    sectionUrl: 'https://aiiagoa.org',
    tags: ['AIIA', 'AIIA Goa', 'Ayurveda', 'Government', 'Course', 'Nutrition'],
    lastVerified: '2026-09-10',
    note: 'The advertisement is a scanned document, so eligibility, duration and fees are not machine-readable.',
  },

  /* ---------------- Internships ----------------
     Only what AIIA actually publishes. The institute posts a notice for
     BAMS student internship; nothing else is claimed here. */
  {
    id: 'aiia_bams_internship',
    title: 'Internship for BAMS Students',
    organization: 'All India Institute of Ayurveda, New Delhi',
    category: 'Internships',
    domain: 'Ayurveda',
    description:
      'AIIA publishes a notice governing internship for BAMS students, together with the prescribed internship letter format.',
    eligibility: 'BAMS students — see the official notice for the exact criteria',
    duration: AIIA_UNSPECIFIED,
    fee: AIIA_UNSPECIFIED,
    location: 'AIIA, New Delhi',
    mode: 'Offline',
    deadline: '',
    certificate: true,
    sourceType: AIIA_SOURCE.AIIA_DELHI,
    officialUrl: 'https://aiia.gov.in/pdf/Notice_235.pdf',
    sectionUrl: 'https://aiia.gov.in/#/studentCorner',
    extraLinks: [
      { label: 'Internship Letter Format', url: 'https://aiia.gov.in/pdf/Final-Revised-Letter-Format-of-Internship-Form-2.pdf' },
    ],
    tags: ['AIIA', 'Ayurveda', 'Government', 'Internship', 'BAMS'],
    lastVerified: '2026-09-10',
    featured: true,
    note: 'The notice is a scanned document, so duration and full eligibility are not machine-readable. Open it for the details.',
  },

  /* ---------------- Training programmes ---------------- */
  {
    id: 'aiia_molecular_biology',
    title: 'Skill Development Training in Molecular Biology Techniques',
    organization: 'ITMBU Academic Block, AIIA New Delhi',
    category: 'Training',
    domain: 'Research Methods',
    description:
      'Hands-on training integrating Ayurveda classics with molecular biology techniques: expert online lectures plus five days of in-person skill training. The most recent intake ran 25 June – 24 July 2026 and applications for it have closed. New intakes are announced on the training and workshops page.',
    eligibility:
      'Essential: completed MD Ayurveda or M.Sc Life Sciences. Desirable: basic knowledge of molecular biology techniques',
    duration: '30 days — online lectures plus 5 days of skill training at ITMBU, AIIA New Delhi',
    seats: '10 seats',
    fee: 'See the official notice',
    location: 'ITMBU Academic Block, AIIA New Delhi',
    mode: 'Hybrid',
    deadline: '2026-06-15',
    certificate: true,
    sourceType: AIIA_SOURCE.AIIA_DELHI,
    officialUrl: 'https://aiia.gov.in/#/trainingWorkshop',
    sectionUrl: 'https://aiia.gov.in/#/trainingWorkshop',
    tags: ['AIIA', 'Government', 'Training', 'Research', 'Molecular Biology'],
    lastVerified: '2026-09-10',
  },
  {
    id: 'aiia_qc_pharmacology',
    title: 'Hands-on Training in QC & Pharmacology Labs',
    organization: 'Quality Control & Pharmacology Laboratories, AIIA New Delhi',
    category: 'Training',
    domain: 'Research Methods',
    description:
      'Practical laboratory training in quality control and pharmacology methods, advertised by the institute in May 2026.',
    eligibility: AIIA_UNSPECIFIED,
    duration: AIIA_UNSPECIFIED,
    fee: AIIA_UNSPECIFIED,
    location: 'AIIA, New Delhi',
    mode: 'Offline',
    deadline: '',
    certificate: true,
    sourceType: AIIA_SOURCE.AIIA_DELHI,
    officialUrl: 'https://aiia.gov.in/pdf/Hands_on_Training.pdf',
    sectionUrl: 'https://aiia.gov.in/#/trainingWorkshop',
    tags: ['AIIA', 'Government', 'Training', 'Research', 'Pharmacology'],
    lastVerified: '2026-09-10',
    note: 'The advertisement carries almost no text layer, so the details are not machine-readable.',
  },

  /* ---------------- Workshops ---------------- */
  {
    id: 'aiia_ayurprabha',
    title: 'AYURPRABHA-2K26 — Workshop on Ayurveda Dermatology & Cosmetology',
    organization: 'All India Institute of Ayurveda, New Delhi',
    category: 'Workshops',
    domain: 'Ayurveda Dermatology',
    description:
      'Six-day workshop in Ayurvedic dermatology and cosmetology, including an introduction to sophisticated instruments for skin analysis.',
    eligibility: AIIA_UNSPECIFIED,
    duration: '6 days',
    fee: 'Selected candidates are informed by e-mail for fee submission',
    location: 'AIIA, New Delhi',
    mode: 'Offline',
    deadline: '2026-08-12',
    certificate: true,
    sourceType: AIIA_SOURCE.AIIA_DELHI,
    officialUrl: 'https://aiia.gov.in/pdf/AYURPRABHA.pdf',
    sectionUrl: 'https://aiia.gov.in/#/trainingWorkshop',
    tags: ['AIIA', 'Ayurveda', 'Government', 'Workshop', 'Dermatology'],
    lastVerified: '2026-09-10',
  },

  /* ---------------- CME ---------------- */
  {
    id: 'aiia_ecme_ayurvidya',
    title: 'e-CME Courses on the Ayurvidya Portal',
    organization: 'All India Institute of Ayurveda, New Delhi',
    category: 'CME',
    domain: 'Continuing Education',
    description:
      'Continuing medical education delivered online through the Ayurvidya portal, run in scheduled batches. AIIA published the schedule for the second batch in July 2026.',
    eligibility: AIIA_UNSPECIFIED,
    duration: AIIA_UNSPECIFIED,
    fee: AIIA_UNSPECIFIED,
    location: 'Online',
    mode: 'Online',
    deadline: '',
    certificate: true,
    sourceType: AIIA_SOURCE.AIIA_DELHI,
    officialUrl: 'https://aiia.gov.in/#/noticesArchive',
    sectionUrl: 'https://aiia.gov.in/#/trainingWorkshop',
    tags: ['AIIA', 'Government', 'CME', 'Online'],
    lastVerified: '2026-09-10',
  },
  {
    id: 'aiia_goa_cme_rachana',
    title: 'CME on Rachana Sharir — AIIA Goa',
    organization: 'All India Institute of Ayurveda, Goa',
    category: 'CME',
    domain: 'Ayurveda Anatomy',
    description:
      'Continuing medical education programme on Rachana Sharir (Ayurvedic anatomy), held at the AIIA Goa campus.',
    eligibility: AIIA_UNSPECIFIED,
    duration: AIIA_UNSPECIFIED,
    fee: AIIA_UNSPECIFIED,
    location: 'AIIA Goa',
    mode: 'Offline',
    deadline: '',
    certificate: true,
    sourceType: AIIA_SOURCE.AIIA_GOA,
    officialUrl: 'https://aiia.gov.in/pdf/CME-Rachana-Sharir-AIIA-Goa-2025.pdf',
    sectionUrl: 'https://aiiagoa.org',
    tags: ['AIIA', 'AIIA Goa', 'Government', 'CME', 'Anatomy'],
    lastVerified: '2026-09-10',
  },
  {
    id: 'aiia_goa_cme_program',
    title: 'CME Programme — AIIA Goa',
    organization: 'All India Institute of Ayurveda, Goa',
    category: 'CME',
    domain: 'Continuing Education',
    description: 'Continuing medical education programme announced by the AIIA Goa campus.',
    eligibility: AIIA_UNSPECIFIED,
    duration: AIIA_UNSPECIFIED,
    fee: AIIA_UNSPECIFIED,
    location: 'AIIA Goa',
    mode: 'Offline',
    deadline: '',
    certificate: true,
    sourceType: AIIA_SOURCE.AIIA_GOA,
    officialUrl: 'https://aiia.gov.in/pdf/CME-Program-AIIA-GOA.pdf',
    sectionUrl: 'https://aiiagoa.org',
    tags: ['AIIA', 'AIIA Goa', 'Government', 'CME'],
    lastVerified: '2026-09-10',
  },

  /* ---------------- Conferences & seminars ---------------- */
  {
    id: 'aiia_kaumaracon',
    title: 'KAUMARACON-2026 — International Conference on Kaumarabhritya',
    organization: 'Department of Kaumarabhritya, AIIA New Delhi',
    category: 'Conferences',
    domain: 'Ayurvedic Paediatrics',
    description:
      'International conference on Kaumarabhritya (Ayurvedic paediatrics). The first circular carries the call for participation.',
    eligibility: AIIA_UNSPECIFIED,
    duration: AIIA_UNSPECIFIED,
    fee: AIIA_UNSPECIFIED,
    location: 'AIIA, New Delhi',
    mode: 'Offline',
    deadline: '',
    certificate: false,
    sourceType: AIIA_SOURCE.AIIA_DELHI,
    officialUrl: 'https://aiia.gov.in/pdf/KAUMARACON-2026.jpeg',
    sectionUrl: 'https://aiia.gov.in/#/eventsList',
    tags: ['AIIA', 'Ayurveda', 'Government', 'Conference', 'Paediatrics'],
    lastVerified: '2026-09-10',
  },
  {
    id: 'aiia_saushrutam',
    title: 'SAUSHRUTAM 2K26 — International Seminar on Shalya Tantra',
    organization: 'Department of Shalya Tantra, AIIA New Delhi',
    category: 'Seminars',
    domain: 'Ayurvedic Surgery',
    description: 'International seminar on Shalya Tantra (Ayurvedic surgery).',
    eligibility: AIIA_UNSPECIFIED,
    duration: AIIA_UNSPECIFIED,
    fee: AIIA_UNSPECIFIED,
    location: 'AIIA, New Delhi',
    mode: 'Offline',
    deadline: '',
    certificate: false,
    sourceType: AIIA_SOURCE.AIIA_DELHI,
    officialUrl: 'https://aiia.gov.in/pdf/Saushrutam_2026.pdf',
    sectionUrl: 'https://aiia.gov.in/#/eventsList',
    tags: ['AIIA', 'Ayurveda', 'Government', 'Seminar', 'Surgery'],
    lastVerified: '2026-09-10',
  },

  /* ---------------- Admissions & research ---------------- */
  {
    id: 'aiia_phd',
    title: 'PhD in Ayurveda 2026-2027',
    organization: 'All India Institute of Ayurveda, New Delhi',
    category: 'Admissions',
    domain: 'Ayurveda Research',
    description:
      'Doctoral admission in Ayurveda through the AIIA PhD entrance examination. Entrance notices, answer keys, results and interview schedules are all published on the institute notice board.',
    eligibility: 'See the official PhD admission notification',
    duration: AIIA_UNSPECIFIED,
    fee: AIIA_UNSPECIFIED,
    location: 'AIIA, New Delhi',
    mode: 'Offline',
    deadline: '',
    certificate: true,
    sourceType: AIIA_SOURCE.AIIA_DELHI,
    officialUrl: 'https://aiia.gov.in/#/academicadmission',
    sectionUrl: 'https://aiia.gov.in/#/phdprogram',
    tags: ['AIIA', 'Ayurveda', 'Government', 'Admission', 'Research', 'PhD'],
    lastVerified: '2026-09-10',
    featured: true,
  },
  {
    id: 'aiia_pg_courses',
    title: 'Postgraduate Courses (MD/MS Ayurveda)',
    organization: 'All India Institute of Ayurveda, New Delhi',
    category: 'Admissions',
    domain: 'Ayurveda',
    description:
      'Postgraduate specialisations across the institute departments — Kayachikitsa, Panchakarma, Shalya Tantra, Kaumarabhritya, Dravyaguna, Swasthavritta and others.',
    eligibility: 'See the official postgraduate course page',
    duration: AIIA_UNSPECIFIED,
    fee: AIIA_UNSPECIFIED,
    location: 'AIIA, New Delhi',
    mode: 'Offline',
    deadline: '',
    certificate: true,
    sourceType: AIIA_SOURCE.AIIA_DELHI,
    officialUrl: 'https://aiia.gov.in/#/postgraduatecourse',
    sectionUrl: 'https://aiia.gov.in/#/coursesAvailable',
    tags: ['AIIA', 'Ayurveda', 'Government', 'Admission', 'Postgraduate'],
    lastVerified: '2026-09-10',
  },
  {
    id: 'aiia_research_projects',
    title: 'Research Projects & Collaboration',
    organization: 'All India Institute of Ayurveda, New Delhi',
    category: 'Research',
    domain: 'Ayurveda Research',
    description:
      'Ongoing and completed research projects at AIIA, the institute research guidelines, and the form for submitting a research proposal.',
    eligibility: 'See the institute research guidelines',
    duration: AIIA_UNSPECIFIED,
    fee: AIIA_UNSPECIFIED,
    location: 'AIIA, New Delhi',
    mode: 'Offline',
    deadline: '',
    certificate: false,
    sourceType: AIIA_SOURCE.AIIA_DELHI,
    officialUrl: 'https://aiia.gov.in/#/ongoingresearchprojects',
    sectionUrl: 'https://aiia.gov.in/#/guidelinesforresearch',
    extraLinks: [
      { label: 'Research Guidelines', url: 'https://aiia.gov.in/#/guidelinesforresearch' },
      { label: 'Research Form', url: 'https://aiia.gov.in/#/researchform' },
      { label: 'IJAR Journal', url: 'https://aiia.gov.in/#/internationalJournalofAyurvedaResearch' },
    ],
    tags: ['AIIA', 'Ayurveda', 'Government', 'Research'],
    lastVerified: '2026-09-10',
  },
  {
    id: 'aiia_goa_recruitment',
    title: 'Recruitment at AIIA Goa (Faculty, Research & Contractual)',
    organization: 'All India Institute of Ayurveda, Goa',
    category: 'Jobs',
    domain: 'Careers',
    description:
      'Faculty, Senior Research Fellow, project-consultant and other contractual posts at the AIIA Goa satellite campus. Individual advertisements open and close through the year — the current one is on AIIA’s live vacancy board.',
    eligibility: 'Varies by post — see the current advertisement on the vacancy board',
    duration: 'Direct, deputation & contractual',
    fee: 'Not applicable',
    location: 'AIIA Goa',
    mode: 'Offline',
    deadline: '',
    certificate: false,
    sourceType: AIIA_SOURCE.AIIA_GOA,
    officialUrl: 'https://aiia.gov.in/#/archivesVacancies',
    sectionUrl: 'https://aiia.gov.in/#/archivesVacancies',
    tags: ['AIIA', 'AIIA Goa', 'Government', 'Career', 'Job', 'Faculty', 'Research'],
    lastVerified: '2026-09-10',
  },

  /* ---------------- Jobs & careers ---------------- */
  {
    id: 'aiia_vacancies',
    title: 'AIIA Recruitment & Vacancies',
    organization: 'All India Institute of Ayurveda, New Delhi',
    category: 'Jobs',
    domain: 'Careers',
    description:
      'Teaching, non-teaching and project posts at AIIA. Advertisements, screening-test results and shortlists are published continuously on the institute vacancy board.',
    eligibility: 'Varies by post — see each advertisement',
    duration: AIIA_UNSPECIFIED,
    fee: 'Not applicable',
    location: 'AIIA, New Delhi',
    mode: 'Offline',
    deadline: '',
    certificate: false,
    sourceType: AIIA_SOURCE.AIIA_DELHI,
    officialUrl: 'https://aiia.gov.in/#/archivesVacancies',
    sectionUrl: 'https://aiia.gov.in/#/archivesVacancies',
    tags: ['AIIA', 'Government', 'Career', 'Job', 'Recruitment'],
    lastVerified: '2026-09-10',
    featured: true,
  },

  /* ---------------- Student programmes ---------------- */
  {
    id: 'aiia_student_corner',
    title: 'Student Corner & Institute Resources',
    organization: 'All India Institute of Ayurveda, New Delhi',
    category: 'Student Programs',
    domain: 'Student Life',
    description:
      'Notices and resources for enrolled students, the Student Council Committee, examination results and the institute placement cell.',
    eligibility: 'Enrolled AIIA students',
    duration: AIIA_UNSPECIFIED,
    fee: 'Not applicable',
    location: 'AIIA, New Delhi',
    mode: 'Offline',
    deadline: '',
    certificate: false,
    sourceType: AIIA_SOURCE.AIIA_DELHI,
    officialUrl: 'https://aiia.gov.in/#/studentCorner',
    sectionUrl: 'https://aiia.gov.in/#/studentcouncilcommittee',
    extraLinks: [
      { label: 'Exams & Results', url: 'https://aiia.gov.in/#/examsResults' },
      { label: 'Placement Cell', url: 'https://aiia.gov.in/#/placementcell' },
      { label: 'Syllabus', url: 'https://aiia.gov.in/#/syllabus' },
    ],
    tags: ['AIIA', 'Government', 'Student Program'],
    lastVerified: '2026-09-10',
  },

  /* ---------------- Notifications ---------------- */
  {
    id: 'aiia_notifications',
    title: 'Official Notices & Announcements',
    organization: 'All India Institute of Ayurveda, New Delhi',
    category: 'Notifications',
    domain: 'Announcements',
    description:
      'The institute notice board and news archive. Live notices with their closing dates are also collected automatically in the Live Updates section.',
    eligibility: 'Open to all',
    duration: AIIA_UNSPECIFIED,
    fee: 'Not applicable',
    location: 'Online',
    mode: 'Online',
    deadline: '',
    certificate: false,
    sourceType: AIIA_SOURCE.AIIA_DELHI,
    officialUrl: 'https://aiia.gov.in/#/noticesArchive',
    sectionUrl: 'https://aiia.gov.in/#/newsArchive',
    tags: ['AIIA', 'Government', 'Notification'],
    lastVerified: '2026-09-10',
  },
];

/* Category order for the filter rail — the student journey first, then
   staff-facing things. Counts are computed at render time. */
const AIIA_CATEGORY_ORDER = [
  'Courses',
  'Internships',
  'Training',
  'Research',
  'CME',
  'Workshops',
  'Seminars',
  'Conferences',
  'Admissions',
  'Fellowships',
  'Jobs',
  'Student Programs',
  'Notifications',
];

const AIIA_CATEGORY_ICONS = {
  Courses: '🎓',
  Internships: '💼',
  Training: '🔬',
  Research: '🧪',
  CME: '💻',
  Workshops: '🛠️',
  Seminars: '📢',
  Conferences: '🎤',
  Admissions: '📝',
  Fellowships: '🏅',
  Jobs: '🏢',
  'Student Programs': '🎒',
  Notifications: '🔔',
};

/* Derived, never stored — a listing must not claim to be open once its
   real closing date has gone. Items with no published date are "rolling"
   rather than open, because we genuinely do not know. */
function aiiaStatus(item) {
  const left = typeof daysUntil === 'function' ? daysUntil(item.deadline) : null;
  if (left === null) return { key: 'rolling', label: 'Rolling / see source', tier: 'none' };
  if (left < 0) return { key: 'closed', label: 'Closed', tier: 'closed' };
  if (left <= 7) return { key: 'open', label: 'Closing soon', tier: left <= 3 ? 'urgent' : 'soon' };
  return { key: 'open', label: 'Open', tier: 'open' };
}
