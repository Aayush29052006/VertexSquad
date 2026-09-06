/**
 * CareerNexus — Secure Documents
 * Certificates, internship reports and academic records. Files are readable
 * only by their owner and by verifying staff; the backend enforces that on
 * every download, so a document id is not a password.
 */

const DOC_TYPES = {
  certificate: { label: 'Certificate', icon: '🎖️' },
  report: { label: 'Internship Report', icon: '📑' },
  academic_record: { label: 'Academic Record', icon: '🎓' },
  other: { label: 'Other', icon: '📎' },
};

let documents = [];

function docRow(d) {
  const meta = DOC_TYPES[d.doc_type] || DOC_TYPES.other;
  return `
    <div class="verified-item verified-item-block">
      <div class="doc-info">
        <span class="vi-icon" aria-hidden="true">${meta.icon}</span>
        <div>
          <strong>${escapeHtml(d.title)}</strong>
          <p class="text-caption">${escapeHtml(meta.label)} · ${escapeHtml(d.file_name)} · ${d.size_kb} KB · ${escapeHtml(d.uploaded_at)}</p>
        </div>
      </div>
      <div class="row-actions">
        <button class="btn btn-secondary btn-sm" data-open="${escapeHtml(d.id)}">Open</button>
        <button class="btn btn-ghost btn-sm" data-delete="${escapeHtml(d.id)}">Delete</button>
      </div>
    </div>`;
}

function renderList() {
  const list = document.getElementById('docList');
  list.innerHTML = documents.length
    ? `<div class="verified-list">${documents.map(docRow).join('')}</div>`
    : emptyState('🗂️', 'No documents yet', 'Upload a certificate or internship report to keep it with your profile.');
}

/* Only these render inline. A blob URL inherits this app's origin, so an
   uploaded .html or .svg opened as its own type would run script with access
   to the viewer's session — and staff open other people's documents. Anything
   outside this list is served as a generic download instead of being
   rendered. The backend rejects them at upload too; this is the second lock. */
const INLINE_SAFE_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

/* Turn the stored base64 back into a file and hand it to the browser. We do
   this rather than linking to the API directly because the endpoint needs an
   Authorization header, which a plain <a href> cannot send. */
function openDocument(doc) {
  const bytes = Uint8Array.from(atob(doc.data_b64), (ch) => ch.charCodeAt(0));
  const declared = (doc.content_type || '').split(';')[0].trim().toLowerCase();
  const type = INLINE_SAFE_TYPES.has(declared) ? declared : 'application/octet-stream';
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);

  if (type === 'application/octet-stream') {
    // Not a type we will render — save it instead of opening it.
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.file_name || 'document';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } else {
    window.open(url, '_blank', 'noopener');
  }
  // Give the new tab (or the download) time to take the blob before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

(async function initDocuments() {
  if (!requireAuth()) return;
  const name = localStorage.getItem('cn_student_name') || 'Student';
  const pageBody = mountAppShell('documents.html', name);
  pageBody.innerHTML = loadingState('Loading your documents...');

  try {
    documents = await api.listDocuments();

    pageBody.innerHTML = `
      <h1 class="text-page-heading mb-1">My Documents</h1>
      <p class="text-body mb-5">
        Certificates, internship reports and academic records, kept with your profile. Only you and
        the staff who verify your portfolio can open these — never another student.
      </p>

      <section class="card mb-5">
        <h2 class="text-section-heading mb-3">Upload a Document</h2>
        <form id="docForm">
          <div class="form-grid-2">
            <div>
              <label class="form-label" for="docTitle">Title</label>
              <input class="form-input mb-3" id="docTitle" required placeholder="AWS Cloud Practitioner certificate" />
            </div>
            <div>
              <label class="form-label" for="docType">Type</label>
              <select class="form-input mb-3" id="docType">
                ${Object.entries(DOC_TYPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
              </select>
            </div>
          </div>
          <label class="form-label" for="docFile">File (PDF or image, up to 5 MB)</label>
          <input class="form-input mb-3" id="docFile" type="file" accept=".pdf,.png,.jpg,.jpeg" required />
          <button class="btn btn-primary" type="submit" id="uploadBtn">Upload</button>
          <p class="form-error mt-3" id="docError" hidden></p>
        </form>
      </section>

      <section class="card">
        <h2 class="text-section-heading mb-3">Your Documents</h2>
        <div id="docList"></div>
      </section>
    `;

    renderList();

    document.getElementById('docForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById('docFile');
      const errorEl = document.getElementById('docError');
      const btn = document.getElementById('uploadBtn');
      errorEl.hidden = true;

      const file = fileInput.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        errorEl.textContent = 'That file is larger than 5 MB.';
        errorEl.hidden = false;
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Uploading...';
      try {
        const saved = await api.uploadDocument(
          file,
          document.getElementById('docTitle').value.trim(),
          document.getElementById('docType').value
        );
        documents.unshift(saved);
        renderList();
        e.target.reset();
        showToast('Document uploaded.', 'success');
      } catch (err) {
        errorEl.textContent = err.message || 'Upload failed.';
        errorEl.hidden = false;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Upload';
      }
    });

    pageBody.addEventListener('click', async (e) => {
      const openBtn = e.target.closest('[data-open]');
      if (openBtn) {
        openBtn.disabled = true;
        try {
          openDocument(await api.getDocument(openBtn.dataset.open));
        } catch (err) {
          showToast(err.message || 'Could not open that document.', 'error');
        } finally {
          openBtn.disabled = false;
        }
        return;
      }

      const delBtn = e.target.closest('[data-delete]');
      if (delBtn) {
        const doc = documents.find((d) => d.id === delBtn.dataset.delete);
        if (!window.confirm(`Delete "${doc ? doc.title : 'this document'}"? This cannot be undone.`)) return;
        delBtn.disabled = true;
        try {
          await api.deleteDocument(delBtn.dataset.delete);
          documents = documents.filter((d) => d.id !== delBtn.dataset.delete);
          renderList();
          showToast('Document deleted.', 'success');
        } catch (err) {
          showToast(err.message || 'Could not delete that document.', 'error');
          delBtn.disabled = false;
        }
      }
    });
  } catch (err) {
    pageBody.innerHTML = errorState(err.message || 'Could not load your documents.', 'location.reload');
  }
})();
