/**
 * CareerNexus — Industry-Academia Collaboration
 * Guest lectures, workshops, live projects, innovation challenges, joint
 * research and consultancy. Students and faculty register; the organisation
 * that published the call sees who signed up.
 */

const COLLAB_TYPES = {
  guest_lecture: { label: 'Guest Lecture', icon: '🎤' },
  workshop: { label: 'Workshop', icon: '🛠️' },
  live_project: { label: 'Live Project', icon: '🚀' },
  innovation_challenge: { label: 'Innovation Challenge', icon: '🏆' },
  mentorship: { label: 'Mentorship', icon: '🧑‍🏫' },
  research: { label: 'Joint Research', icon: '🔬' },
  consultancy: { label: 'Consultancy', icon: '💡' },
};

let collabs = [];
let canPublish = false;

function collabCard(c) {
  const meta = COLLAB_TYPES[c.collab_type] || { label: c.collab_type, icon: '🤝' };
  const full = c.seats_left === 0;
  return `
    <article class="card card-hover collab-card">
      <div class="collab-head">
        <span class="collab-icon" aria-hidden="true">${meta.icon}</span>
        <div>
          <span class="opp-type">${escapeHtml(meta.label)}</span>
          <h3 class="text-card-heading mt-1">${escapeHtml(c.title)}</h3>
          <p class="company-name">${escapeHtml(c.organisation)}</p>
        </div>
      </div>

      ${c.description ? `<p class="text-caption mb-3">${escapeHtml(c.description)}</p>` : ''}

      <div class="internship-meta">
        ${c.starts_on ? `<span>📅 ${formatDate(c.starts_on)}</span>` : ''}
        <span>💻 ${escapeHtml(c.mode)}</span>
        ${c.location ? `<span>📍 ${escapeHtml(c.location)}</span>` : ''}
        <span>👥 ${c.registered} registered${c.seats ? ` of ${c.seats}` : ''}</span>
      </div>

      ${
        (c.skills_involved || []).length
          ? `<div class="internship-chips mt-2">${c.skills_involved.map((s) => skillChip(s)).join('')}</div>`
          : ''
      }

      <div class="internship-footer">
        <span class="text-caption">
          ${c.i_registered ? '✓ You are registered' : full ? 'This session is full' : c.seats ? `${c.seats_left} seats left` : 'Open registration'}
        </span>
        <div class="flex gap-2">
          ${
            canPublish
              ? `<button class="btn btn-ghost btn-sm" data-registrations="${escapeHtml(c.id)}">Who registered</button>`
              : ''
          }
          <button class="btn btn-primary btn-sm" data-register="${escapeHtml(c.id)}"
                  ${c.i_registered || full ? 'disabled' : ''}>
            ${c.i_registered ? 'Registered' : full ? 'Full' : 'Register'}
          </button>
        </div>
      </div>
    </article>`;
}

function render() {
  const type = document.getElementById('typeFilter').value;
  const rows = type ? collabs.filter((c) => c.collab_type === type) : collabs;
  document.getElementById('collabCount').textContent =
    `${rows.length} open ${rows.length === 1 ? 'call' : 'calls'}`;
  document.getElementById('collabList').innerHTML = rows.length
    ? rows.map(collabCard).join('')
    : emptyState('🤝', 'Nothing open right now', 'Companies and colleges publish collaboration calls here.');
}

function showRegistrations(list, title) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2 class="text-section-heading mb-1">${escapeHtml(title)}</h2>
      <p class="text-caption mb-4">${list.length} registered</p>
      ${
        list.length
          ? `<div class="verified-list">${list
              .map(
                (p) => `
            <div class="verified-item">
              <div>
                <strong>${escapeHtml(p.name)}</strong>
                <p class="text-caption">${escapeHtml([roleLabel(p.role), p.college].filter(Boolean).join(' · '))}</p>
                ${p.note ? `<p class="text-caption">"${escapeHtml(p.note)}"</p>` : ''}
              </div>
              <span class="text-caption">${escapeHtml(p.registered_at)}</span>
            </div>`
              )
              .join('')}</div>`
          : '<p class="text-body">Nobody has registered yet.</p>'
      }
      <button class="btn btn-secondary mt-4" data-close-modal type="button">Close</button>
    </div>`;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close-modal]')) overlay.remove();
  });
  document.body.appendChild(overlay);
}

(async function initCollaborations() {
  if (!requireAuth()) return;
  const name = localStorage.getItem('cn_student_name') || 'Student';
  const pageBody = mountAppShell('collaborations.html', name);
  pageBody.innerHTML = loadingState('Loading collaboration calls...');

  canPublish = hasRole(ROLES.RECRUITER, ROLES.INSTITUTION, ROLES.FACULTY);

  try {
    collabs = await api.listCollaborations();
    const types = [...new Set(collabs.map((c) => c.collab_type))];

    pageBody.innerHTML = `
      <div class="flex items-center justify-between mb-1" style="flex-wrap:wrap;gap:12px;">
        <h1 class="text-page-heading">Industry–Academia Collaboration</h1>
        ${canPublish ? '<button class="btn btn-primary" id="newCollabBtn" type="button">+ Publish a Call</button>' : ''}
      </div>
      <p class="text-body mb-4">
        Guest lectures, workshops, live projects, innovation challenges and joint research —
        the places where a company and a college actually work together.
      </p>

      <div class="admin-toolbar">
        <select class="form-input" id="typeFilter">
          <option value="">All types</option>
          ${types.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml((COLLAB_TYPES[t] || {}).label || t)}</option>`).join('')}
        </select>
        <span class="text-caption" id="collabCount"></span>
      </div>

      <div class="opp-grid" id="collabList"></div>
    `;

    document.getElementById('typeFilter').addEventListener('change', render);
    render();

    pageBody.addEventListener('click', async (e) => {
      const reg = e.target.closest('[data-register]');
      if (reg) {
        reg.disabled = true;
        reg.textContent = 'Registering...';
        try {
          await api.registerForCollaboration(reg.dataset.register);
          const c = collabs.find((x) => x.id === reg.dataset.register);
          if (c) {
            c.i_registered = true;
            c.registered += 1;
            if (c.seats) c.seats_left = Math.max(0, c.seats - c.registered);
          }
          showToast('Registered. The organiser can see your name now.', 'success');
          render();
        } catch (err) {
          showToast(err.message || 'Could not register.', 'error');
          reg.disabled = false;
          reg.textContent = 'Register';
        }
        return;
      }

      const view = e.target.closest('[data-registrations]');
      if (view) {
        try {
          const c = collabs.find((x) => x.id === view.dataset.registrations);
          showRegistrations(await api.getCollaborationRegistrations(view.dataset.registrations), c ? c.title : 'Registrations');
        } catch (err) {
          showToast(err.message || 'Could not load registrations.', 'error');
        }
        return;
      }

      if (e.target.closest('#newCollabBtn')) openPublishForm();
    });
  } catch (err) {
    pageBody.innerHTML = errorState(err.message || 'Could not load collaborations.', 'location.reload');
  }
})();

function openPublishForm() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <form class="modal" id="collabForm">
      <h2 class="text-section-heading mb-4">Publish a Collaboration Call</h2>

      <label class="form-label">Title</label>
      <input class="form-input mb-3" name="title" required placeholder="Guest lecture on modern backend engineering" />

      <label class="form-label">Organisation</label>
      <input class="form-input mb-3" name="organisation" required placeholder="Your company or college" />

      <label class="form-label">Type</label>
      <select class="form-input mb-3" name="collab_type">
        ${Object.entries(COLLAB_TYPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
      </select>

      <label class="form-label">Description</label>
      <textarea class="form-input mb-3" name="description" rows="3" placeholder="What will happen, and who is it for?"></textarea>

      <div class="form-grid-2">
        <div>
          <label class="form-label">Mode</label>
          <select class="form-input mb-3" name="mode">
            <option>Hybrid</option><option>Remote</option><option>On-site</option>
          </select>
        </div>
        <div>
          <label class="form-label">Location</label>
          <input class="form-input mb-3" name="location" placeholder="Jalgaon" />
        </div>
        <div>
          <label class="form-label">Starts on</label>
          <input class="form-input mb-3" name="starts_on" type="date" />
        </div>
        <div>
          <label class="form-label">Seats (0 = unlimited)</label>
          <input class="form-input mb-3" name="seats" type="number" min="0" value="0" />
        </div>
      </div>

      <label class="form-label">Audience</label>
      <select class="form-input mb-3" name="audience">
        <option value="both">Students and faculty</option>
        <option value="student">Students only</option>
        <option value="faculty">Faculty only</option>
      </select>

      <label class="form-label">Skills involved (comma separated)</label>
      <input class="form-input mb-4" name="skills_involved" placeholder="Python, SQL, Communication" />

      <p class="form-error mb-3" id="collabError" hidden></p>
      <div class="flex gap-2">
        <button class="btn btn-primary" type="submit">Publish</button>
        <button class="btn btn-secondary" type="button" data-close-modal>Cancel</button>
      </div>
    </form>`;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close-modal]')) overlay.remove();
  });

  overlay.querySelector('#collabForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    const errorEl = overlay.querySelector('#collabError');
    errorEl.hidden = true;
    try {
      await api.createCollaboration({
        ...data,
        seats: Number(data.seats || 0),
        skills_involved: data.skills_involved.split(',').map((s) => s.trim()).filter(Boolean),
      });
      showToast('Collaboration call published.', 'success');
      overlay.remove();
      window.location.reload();
    } catch (err) {
      errorEl.textContent = err.message || 'Could not publish.';
      errorEl.hidden = false;
    }
  });

  document.body.appendChild(overlay);
}
