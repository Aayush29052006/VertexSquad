/**
 * CareerNexus — Public Portfolio (shareable link, no login)
 * Reached only as portfolio.html?id=<student-id> — the link a student
 * copies from the "Share Your Portfolio" card on their own Profile page.
 * The private, editable view used to live here too; it's part of
 * profile.html now, alongside the same verification stamps
 * (verifiedBadge() lives in ui.js, shared by both).
 */

function sectionCard(title, subtitle, bodyHtml) {
  return `
    <section class="card mb-5">
      <h2 class="text-section-heading mb-1">${escapeHtml(title)}</h2>
      ${subtitle ? `<p class="text-caption mb-3">${escapeHtml(subtitle)}</p>` : ''}
      ${bodyHtml}
    </section>`;
}

function renderPortfolio(pageBody, pf) {
  const s = pf.student;
  const initials = (s.full_name || 'S')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

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

    <p class="text-caption text-center mt-5">Portfolio hosted on CareerNexus. Verification stamps are issued by the named institution or employer.</p>
  `;
}

(async function initPortfolio() {
  const publicId = new URLSearchParams(window.location.search).get('id');

  // No id -> this is someone looking for their OWN portfolio, which now
  // lives on the Profile page alongside the same verification stamps.
  if (!publicId) {
    window.location.replace('profile.html');
    return;
  }

  // Public view: no shell, no sidebar, no login required.
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
    renderPortfolio(pageBody, await api.getPublicPortfolio(publicId));
  } catch (err) {
    pageBody.innerHTML = errorState(err.message || 'This portfolio is not available.');
  }
})();
