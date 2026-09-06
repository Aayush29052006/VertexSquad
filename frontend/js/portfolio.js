/**
 * CareerNexus — Verified Digital Portfolio
 * Renders both the private view (portfolio.html) and the shareable public
 * one (portfolio.html?id=stu_1001), which needs no login at all.
 *
 * The distinction that matters here is verified vs self-declared: a stamp
 * means a named faculty member, institution or employer signed for it.
 */

function verifiedBadge(v) {
  if (!v) return '<span class="stamp stamp-self" title="Added by the student, not yet verified">Self-declared</span>';
  const who = v.verified_by || 'Verified';
  const role = v.verifier_role ? ` (${roleLabel(v.verifier_role)})` : '';
  const title = `Verified by ${who}${role} on ${v.verified_at}${v.note ? ` — ${v.note}` : ''}`;
  return `<span class="stamp stamp-verified" title="${escapeHtml(title)}">✓ Verified</span>`;
}

function sectionCard(title, subtitle, bodyHtml) {
  return `
    <section class="card mb-5">
      <h2 class="text-section-heading mb-1">${escapeHtml(title)}</h2>
      ${subtitle ? `<p class="text-caption mb-3">${escapeHtml(subtitle)}</p>` : ''}
      ${bodyHtml}
    </section>`;
}

function renderPortfolio(pageBody, pf, isPublic) {
  const s = pf.student;
  const initials = (s.full_name || 'S')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const shareUrl = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(s.id)}`;

  pageBody.innerHTML = `
    <div class="card portfolio-header mb-5">
      <div class="portfolio-identity">
        ${
          s.photo_url
            ? `<img class="portfolio-photo" src="${escapeHtml(s.photo_url)}" alt="" />`
            : `<div class="avatar avatar-lg" aria-hidden="true">${escapeHtml(initials)}</div>`
        }
        <div>
          <h1 class="text-page-heading mb-1">${escapeHtml(s.full_name)}</h1>
          <p class="text-body">${escapeHtml([s.degree, s.branch].filter(Boolean).join(' · ') || 'Student')}</p>
          <p class="text-caption">${escapeHtml(
            [s.college, s.graduation_year ? `Class of ${s.graduation_year}` : ''].filter(Boolean).join(' · ')
          )}</p>
        </div>
      </div>
      <div class="credibility">
        ${matchRingSvg(pf.credibility, 96)}
        <div>
          <p class="text-label">Verified Credibility</p>
          <p class="text-caption">${pf.verified_items} of ${pf.total_items} items signed off<br />by faculty, institution or employer</p>
        </div>
      </div>
    </div>

    ${
      pf.assessment
        ? `<div class="card mb-5">
             <h2 class="text-section-heading mb-3">Assessed Skill Profile</h2>
             <div class="assessment-strip">
               ${[
                 ['Overall', pf.assessment.overall_score],
                 ['Technical', pf.assessment.technical_score],
                 ['Soft Skills', pf.assessment.soft_score],
                 ['Aptitude', pf.assessment.aptitude_score],
               ]
                 .map(
                   ([label, v]) => `
                 <div class="assessment-stat">
                   <span class="score-big">${v}%</span>
                   <span class="text-label">${label}</span>
                 </div>`
                 )
                 .join('')}
             </div>
             <p class="text-caption mt-3">Scored by the platform on ${escapeHtml(pf.assessment.submitted_at)} — not self-reported.</p>
           </div>`
        : ''
    }

    ${sectionCard(
      'Skills',
      'Every skill carries its own verification status.',
      pf.skills.length
        ? `<div class="verified-list">${pf.skills
            .map(
              (sk) => `
          <div class="verified-item">
            <span class="vi-name">${escapeHtml(sk.name)}</span>
            ${verifiedBadge(sk.verification)}
          </div>`
            )
            .join('')}</div>`
        : '<p class="text-body">No skills added yet.</p>'
    )}

    ${
      pf.soft_skills.length
        ? sectionCard('Soft Skills', '', `<div class="chip-row">${pf.soft_skills.map((s2) => skillChip(s2)).join('')}</div>`)
        : ''
    }

    ${sectionCard(
      'Internships & Experience',
      'Hours and mentor ratings come from the weekly logs kept during the internship.',
      pf.internships.length
        ? pf.internships
            .map(
              (i) => `
          <div class="verified-item verified-item-block">
            <div>
              <strong>${escapeHtml(i.title)}</strong>
              <p class="text-caption">${escapeHtml(i.company)}${i.duration ? ` · ${escapeHtml(i.duration)}` : ''}</p>
              <p class="text-caption">
                ${i.weeks_logged} ${i.weeks_logged === 1 ? 'week' : 'weeks'} logged
                ${i.total_hours ? ` · ${i.total_hours} hours` : ''}
                ${i.mentor_rating ? ` · mentor rating ${i.mentor_rating}/5` : ''}
              </p>
            </div>
            ${verifiedBadge(i.verification)}
          </div>`
            )
            .join('')
        : '<p class="text-body">No completed internships yet.</p>'
    )}

    ${sectionCard(
      'Projects',
      '',
      pf.projects.length
        ? pf.projects
            .map(
              (p) => `
          <div class="verified-item verified-item-block">
            <div>
              <strong>${escapeHtml(p.title || 'Untitled project')}</strong>
              ${p.description ? `<p class="text-caption">${escapeHtml(p.description)}</p>` : ''}
              ${(p.tech || []).length ? `<div class="chip-row mt-1">${p.tech.map((t) => skillChip(t)).join('')}</div>` : ''}
            </div>
            ${verifiedBadge(p.verification)}
          </div>`
            )
            .join('')
        : '<p class="text-body">No projects added yet.</p>'
    )}

    ${sectionCard(
      'Certifications',
      '',
      pf.certifications.length
        ? pf.certifications
            .map(
              (cert) => `
          <div class="verified-item verified-item-block">
            <div>
              <strong>${escapeHtml(cert.title || '')}</strong>
              <p class="text-caption">${escapeHtml([cert.issuer, cert.year].filter(Boolean).join(' · '))}</p>
            </div>
            ${verifiedBadge(cert.verification)}
          </div>`
            )
            .join('')
        : '<p class="text-body">No certifications added yet.</p>'
    )}

    ${
      isPublic
        ? `<p class="text-caption text-center mt-5">Portfolio hosted on CareerNexus. Verification stamps are issued by the named institution or employer.</p>`
        : `<div class="card">
             <h2 class="text-section-heading mb-1">Share Your Portfolio</h2>
             <p class="text-caption mb-3">
               This link opens without a login, so a recruiter can read it straight away. It shows your
               verified work only — never your email, phone or CGPA.
             </p>
             <div class="flex gap-2" style="flex-wrap:wrap;">
               <input class="form-input" id="shareUrl" readonly value="${escapeHtml(shareUrl)}" style="flex:1;min-width:260px;" />
               <button class="btn btn-primary" id="copyShare" type="button">Copy Link</button>
               <a class="btn btn-secondary" href="${escapeHtml(shareUrl)}" target="_blank" rel="noopener">Preview</a>
             </div>
           </div>`
    }
  `;

  document.getElementById('copyShare')?.addEventListener('click', async () => {
    const input = document.getElementById('shareUrl');
    try {
      await navigator.clipboard.writeText(input.value);
      showToast('Portfolio link copied.', 'success');
    } catch (_) {
      // clipboard blocked (insecure context or denied) — select it so the
      // user can copy by hand rather than getting nothing at all.
      input.select();
      showToast('Press Ctrl+C to copy the selected link.');
    }
  });
}

(async function initPortfolio() {
  const publicId = new URLSearchParams(window.location.search).get('id');

  // Public view: no shell, no sidebar, no login required.
  if (publicId) {
    document.body.classList.add('public-portfolio');
    const root = document.getElementById('appShell');
    root.innerHTML = `
      <div class="public-wrap">
        <header class="public-topbar">
          <a class="brand" href="../index.html">
            <img class="brand-mark" src="../assets/logos/careernexus-logo.png" alt="" />
            <span class="brand-name">CareerNexus</span>
          </a>
        </header>
        <main class="page-body" id="pageBody"></main>
      </div>`;
    const pageBody = document.getElementById('pageBody');
    pageBody.innerHTML = loadingState('Loading portfolio...');
    try {
      renderPortfolio(pageBody, await api.getPublicPortfolio(publicId), true);
    } catch (err) {
      pageBody.innerHTML = errorState(err.message || 'This portfolio is not available.');
    }
    return;
  }

  if (!requireAuth()) return;
  const studentName = localStorage.getItem('cn_student_name') || 'Student';
  const pageBody = mountAppShell('portfolio.html', studentName);
  pageBody.innerHTML = loadingState('Building your portfolio...');
  try {
    renderPortfolio(pageBody, await api.getMyPortfolio(), false);
  } catch (err) {
    pageBody.innerHTML = errorState(err.message || 'Could not load your portfolio.', 'location.reload');
  }
})();
