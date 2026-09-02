/**
 * CareerNexus — Resume Upload & AI Skill Extraction
 */
let skillDecisions = {}; // name -> boolean (kept)
let extractionData = null;

function renderResumeIdle(pageBody, resume) {
  pageBody.innerHTML = `
    <h1 class="text-page-heading mb-2">Resume</h1>
    <p class="text-body mb-5">Upload your resume so CareerNexus AI can extract your skills, projects, and certifications.</p>

    ${resume ? `
      <div class="card mb-5">
        <h2 class="text-section-heading mb-3">Current Resume</h2>
        <div class="file-row">
          <div class="file-icon">PDF</div>
          <div style="flex:1;">
            <p style="font-weight:700;">${escapeHtml(resume.file_name)}</p>
            <p class="text-caption">${resume.file_size_kb} KB · Uploaded ${formatDate(resume.uploaded_at)}</p>
          </div>
          <span class="badge badge-success">Processed</span>
        </div>
        <button class="btn btn-secondary mt-4" id="replaceBtn">Replace Resume</button>
        <button class="btn btn-ghost mt-4" id="reviewAgainBtn">Review Extracted Skills</button>
      </div>
    ` : ''}

    <div class="card" id="uploadCard" ${resume ? 'hidden' : ''}>
      <div class="upload-zone" id="uploadZone" tabindex="0" role="button" aria-label="Upload resume">
        <div class="upload-icon">📄</div>
        <h3 class="text-card-heading">Upload Your Resume</h3>
        <p class="text-caption mt-2">Drag & Drop PDF / DOCX (Max 5MB), or</p>
        <button class="btn btn-primary mt-3" id="chooseFileBtn" type="button">Choose File</button>
        <input type="file" id="fileInput" accept=".pdf,.doc,.docx" hidden />
      </div>
    </div>

    <div id="uploadProgress"></div>
    <div id="analysisSection"></div>
  `;

  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');
  const chooseFileBtn = document.getElementById('chooseFileBtn');

  chooseFileBtn?.addEventListener('click', () => fileInput.click());
  uploadZone?.addEventListener('click', () => fileInput.click());
  uploadZone?.addEventListener('keydown', (e) => { if (e.key === 'Enter') fileInput.click(); });
  fileInput?.addEventListener('change', () => { if (fileInput.files[0]) handleFileUpload(fileInput.files[0]); });

  ['dragover', 'dragleave', 'drop'].forEach((evt) => {
    uploadZone?.addEventListener(evt, (e) => {
      e.preventDefault();
      if (evt === 'dragover') uploadZone.classList.add('dragover');
      if (evt === 'dragleave' || evt === 'drop') uploadZone.classList.remove('dragover');
      if (evt === 'drop' && e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]);
    });
  });

  document.getElementById('replaceBtn')?.addEventListener('click', () => {
    document.getElementById('uploadCard').hidden = false;
  });
  document.getElementById('reviewAgainBtn')?.addEventListener('click', runExtraction);
}

const RESUME_MAX_BYTES = 5 * 1024 * 1024; // 5MB — UX guard only; the backend must enforce this too

async function handleFileUpload(file) {
  const validTypes = ['.pdf', '.doc', '.docx'];
  // Extension check is a UX convenience, not a security control — the real
  // type/content validation has to happen server-side, since a client can
  // always lie about a file's name or MIME type.
  const isValid = validTypes.some((ext) => file.name.toLowerCase().endsWith(ext));
  if (!isValid) {
    showToast('Please upload a PDF or DOCX file.', 'error');
    return;
  }
  if (file.size > RESUME_MAX_BYTES) {
    showToast('File is too large. Please upload a resume under 5MB.', 'error');
    return;
  }

  const progress = document.getElementById('uploadProgress');
  progress.innerHTML = `
    <div class="card mt-5">
      <div class="flex items-center gap-3">
        <div class="spinner"></div>
        <div>
          <p style="font-weight:600;">Uploading ${escapeHtml(file.name)}...</p>
          <p class="text-caption">Please wait while we securely upload your file.</p>
        </div>
      </div>
    </div>
  `;

  try {
    await api.uploadResume(file);
    document.getElementById('uploadCard').hidden = true;
    await runExtraction();
  } catch (err) {
    progress.innerHTML = errorState(err.message || 'Resume upload failed. Please try uploading the file again.', null);
  }
}

async function runExtraction() {
  const progress = document.getElementById('uploadProgress');
  const analysisSection = document.getElementById('analysisSection');
  analysisSection.innerHTML = '';
  progress.innerHTML = `<div class="loading-state"><div class="spinner spinner-lg"></div><p>Analyzing your resume with AI...</p></div>`;

  try {
    extractionData = await api.getExtractedSkills();
    skillDecisions = {};
    extractionData.technical_skills.forEach((s) => { skillDecisions[s.name] = true; });
    progress.innerHTML = `
      <div class="card mt-5" style="border-color:var(--success);">
        <div class="flex items-center gap-2">
          <span style="color:var(--success);font-size:1.3rem;">✓</span>
          <h3 class="text-card-heading">AI Analysis Complete</h3>
        </div>
        <div class="analysis-summary">
          <div class="analysis-stat"><div class="num">${extractionData.technical_skills.length}</div><div class="text-caption">Skills Detected</div></div>
          <div class="analysis-stat"><div class="num">${extractionData.projects_found}</div><div class="text-caption">Projects Found</div></div>
          <div class="analysis-stat"><div class="num">${extractionData.certifications_found}</div><div class="text-caption">Certifications Found</div></div>
        </div>
      </div>
    `;
    renderExtraction(analysisSection);
  } catch (err) {
    progress.innerHTML = errorState(err.message || 'Resume analysis failed. Please try uploading the file again.', null);
  }
}

function renderExtraction(container) {
  container.innerHTML = `
    <div class="card mt-5">
      <h2 class="text-section-heading mb-3">AI Resume Analysis</h2>

      <h3 class="text-card-heading mb-2">Technical Skills</h3>
      ${extractionData.technical_skills.map((s) => `
        <div class="confidence-row">
          <span>✓ ${escapeHtml(s.name)}</span>
          ${s.confidence ? `<span class="badge ${s.confidence === 'High' ? 'badge-success' : 'badge-warning'}">${escapeHtml(s.confidence)} Confidence</span>` : ''}
        </div>
      `).join('')}

      <h3 class="text-card-heading mt-5 mb-2">Soft Skills</h3>
      <div class="chip-row">${extractionData.soft_skills.map((s) => `<span class="badge badge-neutral">${escapeHtml(s)}</span>`).join('')}</div>
    </div>

    <div class="card mt-5">
      <h2 class="text-section-heading mb-2">Confirm Your Skills</h2>
      <p class="text-caption mb-4">Review what our AI detected. Remove anything inaccurate, or add a skill it missed.</p>
      <div id="chipContainer">${renderSkillChips()}</div>

      <div class="flex gap-2 mt-4">
        <input class="form-input" id="addSkillInput" placeholder="Add a skill (e.g. Docker)" style="max-width:260px;" />
        <button class="btn btn-secondary" id="addSkillBtn" type="button">Add Skill</button>
      </div>

      <button class="btn btn-primary btn-lg mt-5" id="confirmSkillsBtn">Confirm Skills</button>
    </div>
  `;

  document.getElementById('addSkillBtn').addEventListener('click', () => {
    const input = document.getElementById('addSkillInput');
    const value = input.value.trim();
    if (!value) return;
    if (!(value in skillDecisions)) {
      extractionData.technical_skills.push({ name: value, confidence: null });
    }
    skillDecisions[value] = true;
    input.value = '';
    document.getElementById('chipContainer').innerHTML = renderSkillChips();
    attachChipEvents();
  });

  document.getElementById('confirmSkillsBtn').addEventListener('click', async () => {
    const finalSkills = Object.keys(skillDecisions).filter((k) => skillDecisions[k]);
    try {
      await api.confirmSkills(finalSkills);
      showToast('Skills confirmed. Finding your best matches...', 'success');
      setTimeout(() => { window.location.href = 'internships.html'; }, 900);
    } catch (err) {
      showToast(err.message || 'Failed to confirm skills.', 'error');
    }
  });

  attachChipEvents();
}

function renderSkillChips() {
  return Object.keys(skillDecisions).map((name) => {
    const kept = skillDecisions[name];
    return `
      <span class="skill-confirm-chip ${kept ? 'kept' : 'removed'}" data-skill="${escapeHtml(name)}">
        ${kept ? '✓' : '✕'} ${escapeHtml(name)}
        <button type="button" data-toggle="${escapeHtml(name)}" aria-label="${kept ? 'Remove' : 'Restore'} ${escapeHtml(name)}">${kept ? '×' : '↺'}</button>
      </span>
    `;
  }).join('');
}

function attachChipEvents() {
  document.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const skill = btn.getAttribute('data-toggle');
      skillDecisions[skill] = !skillDecisions[skill];
      document.getElementById('chipContainer').innerHTML = renderSkillChips();
      attachChipEvents();
    });
  });
}

(async function initResume() {
  if (!requireAuth()) return;
  const studentName = localStorage.getItem('cn_student_name') || 'Student';
  const pageBody = mountAppShell('resume.html', studentName);
  pageBody.innerHTML = loadingState('Loading resume status...');

  try {
    const resume = await api.getResumeStatus();
    renderResumeIdle(pageBody, resume && resume.file_name ? resume : null);
  } catch (err) {
    pageBody.innerHTML = errorState(err.message || 'Unable to load resume information.', 'location.reload');
  }
})();
