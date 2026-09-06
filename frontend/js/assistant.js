/**
 * CareerNexus — Floating AI Career Assistant
 * Self-injecting chat widget. Include this script on any authenticated page
 * and the launcher appears bottom-right. All Gemini calls go through the
 * backend (`/api/assistant/chat`) — the API key never reaches the browser.
 */
(function initAssistant() {
  // Only for signed-in users; the landing/auth pages don't get the widget.
  if (!localStorage.getItem('cn_token')) return;

  const SUGGESTIONS = [
    'What skills should I learn next?',
    'How do I improve my resume?',
    'How should I prepare for an interview?',
  ];

  const root = document.createElement('div');
  root.className = 'assistant-root';
  root.innerHTML = `
    <button class="assistant-fab" id="assistantFab" aria-label="Open career assistant" aria-expanded="false">
      <span class="assistant-fab-icon" aria-hidden="true">💬</span>
    </button>

    <section class="assistant-panel" id="assistantPanel" role="dialog" aria-label="AI Career Assistant" hidden>
      <header class="assistant-head">
        <div>
          <p class="assistant-title">Career Assistant</p>
          <p class="assistant-sub">Powered by AI</p>
        </div>
        <button class="assistant-close" id="assistantClose" aria-label="Close assistant">&times;</button>
      </header>

      <div class="assistant-log" id="assistantLog" aria-live="polite"></div>

      <div class="assistant-suggestions" id="assistantSuggestions">
        ${SUGGESTIONS.map((s) => `<button type="button" class="assistant-chip" data-q="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('')}
      </div>

      <form class="assistant-form" id="assistantForm">
        <input id="assistantInput" class="assistant-input" autocomplete="off"
               placeholder="Ask about skills, resumes, interviews..." maxlength="1000" />
        <button class="assistant-send" type="submit" id="assistantSend" aria-label="Send">➤</button>
      </form>
    </section>
  `;
  document.body.appendChild(root);

  const fab = document.getElementById('assistantFab');
  const panel = document.getElementById('assistantPanel');
  const closeBtn = document.getElementById('assistantClose');
  const log = document.getElementById('assistantLog');
  const form = document.getElementById('assistantForm');
  const input = document.getElementById('assistantInput');
  const sendBtn = document.getElementById('assistantSend');
  const suggestions = document.getElementById('assistantSuggestions');

  let greeted = false;
  let busy = false;
  // Set when a drag ends, so the click that follows a drag does not also
  // toggle the panel. Declared here because the click handler below runs
  // before the drag code that sets it.
  let suppressFabClick = false;

  function addMessage(text, who) {
    const el = document.createElement('div');
    el.className = `assistant-msg assistant-msg-${who}`;
    el.textContent = text; // textContent, never innerHTML — AI output is untrusted
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function openPanel() {
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    // The panel can only be measured once it is visible, so work out where
    // it should sit now rather than while it was hidden.
    positionPanel();
    if (!greeted) {
      const name = (localStorage.getItem('cn_student_name') || 'there').split(' ')[0];
      addMessage(`Hi ${name}! Ask me anything about your skills, resume, or interviews.`, 'bot');
      greeted = true;
    }
    input.focus();
  }

  function closePanel() {
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
  }

  fab.addEventListener('click', () => {
    // A drag ends with a click event too; ignore that one so moving the
    // button never also opens the panel.
    if (suppressFabClick) {
      suppressFabClick = false;
      return;
    }
    panel.hidden ? openPanel() : closePanel();
  });
  closeBtn.addEventListener('click', closePanel);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) closePanel();
  });

  /* ---------- Move the whole widget, resize the panel ----------
     The launcher and the chat panel are one unit: the panel is anchored to
     the button, so dragging either the button or the panel's header moves
     both together and the panel never drifts away from its launcher.

     Two things are remembered per device: where the widget sits, and how
     big the panel is. Double-click either handle to put both back. */
  const POS_KEY = 'cn_assistant_pos';
  const SIZE_KEY = 'cn_assistant_size';
  const head = panel.querySelector('.assistant-head');
  const GAP = 12;   // space between the button and the panel
  const EDGE = 8;   // smallest gap we leave against the viewport edge

  function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
  }

  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch (e) {
      return null; // corrupt value - fall back to the default
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* private mode / storage blocked - it just won't persist */
    }
  }

  /* ---------- Panel placement ----------
     The panel opens above the button and right-aligned to it, which is what
     you want in the default bottom-right corner. Once the widget has been
     dragged elsewhere that can fall off the screen, so each edge is checked
     and flipped to the opposite side when there is no room, then clamped
     into the viewport regardless. */
  function positionPanel() {
    if (panel.hidden) return;

    const f = fab.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const w = panel.offsetWidth || 360;
    const h = panel.offsetHeight || 480;
    const maxTop = window.innerHeight - h - EDGE;
    const maxLeft = window.innerWidth - w - EDGE;

    let top;
    let left;

    // Right-aligned with the button reads best, but flip to left-aligned
    // rather than run off the left edge.
    const alignedLeft = f.right - w >= EDGE ? f.right - w : f.left;

    if (f.top - h - GAP >= EDGE) {
      // Room above — the usual case for a button in a bottom corner.
      top = f.top - h - GAP;
      left = alignedLeft;
    } else if (f.bottom + GAP + h <= window.innerHeight - EDGE) {
      // Room below — the usual case once it has been dragged near the top.
      top = f.bottom + GAP;
      left = alignedLeft;
    } else if (f.left - GAP - w >= EDGE) {
      // Too tall for either, but it fits to the left of the button.
      left = f.left - GAP - w;
      top = clamp(f.top + f.height / 2 - h / 2, EDGE, Math.max(EDGE, maxTop));
    } else if (f.right + GAP + w <= window.innerWidth - EDGE) {
      // ...or to the right of it.
      left = f.right + GAP;
      top = clamp(f.top + f.height / 2 - h / 2, EDGE, Math.max(EDGE, maxTop));
    } else {
      // Nowhere clear on a window this small: keep the panel fully visible
      // and let it sit under the button, which stays on top and clickable.
      top = f.bottom + GAP;
      left = alignedLeft;
    }

    top = clamp(top, EDGE, Math.max(EDGE, maxTop));
    left = clamp(left, EDGE, Math.max(EDGE, maxLeft));

    // The panel is absolutely positioned inside the root, so convert the
    // viewport coordinates we just worked out into offsets from the root.
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left = `${Math.round(left - rootRect.left)}px`;
    panel.style.top = `${Math.round(top - rootRect.top)}px`;
  }

  /* ---------- Widget position ---------- */
  function moveWidget(x, y) {
    const w = fab.offsetWidth || 56;
    const h = fab.offsetHeight || 56;
    root.classList.add('is-free');
    root.style.left = `${clamp(x, 0, Math.max(0, window.innerWidth - w))}px`;
    root.style.top = `${clamp(y, 0, Math.max(0, window.innerHeight - h))}px`;
    positionPanel();
  }

  function saveWidgetPos() {
    if (!root.classList.contains('is-free')) return;
    const r = fab.getBoundingClientRect();
    writeJson(POS_KEY, { x: Math.round(r.left), y: Math.round(r.top) });
  }

  // Clearing the inline width/height makes the panel resize back to its CSS
  // default, which trips the ResizeObserver below. Without this guard that
  // observer would immediately save the default as if the user had chosen
  // it, pinning a fixed pixel size and undoing half the reset.
  let ignoreResizeUntil = 0;

  function resetWidget() {
    root.classList.remove('is-free');
    root.style.left = root.style.top = '';
    panel.style.left = panel.style.top = panel.style.right = panel.style.bottom = '';
    panel.style.width = panel.style.height = '';
    ignoreResizeUntil = Date.now() + 600;
    try {
      localStorage.removeItem(POS_KEY);
      localStorage.removeItem(SIZE_KEY);
    } catch (e) { /* nothing to clean up */ }
    positionPanel();
  }

  /* ---------- Restore what was saved ---------- */
  (function restore() {
    // Earlier builds stored the panel's own position and size together, and
    // the launcher position separately. Carry the size across and drop the
    // rest, so nobody's resized panel snaps back to the default.
    const legacyBox = readJson('cn_assistant_box');
    const legacyFab = readJson('cn_assistant_fab');
    if (legacyBox || legacyFab) {
      if (legacyBox && legacyBox.w && !readJson(SIZE_KEY)) {
        writeJson(SIZE_KEY, { w: legacyBox.w, h: legacyBox.h });
      }
      if (legacyFab && typeof legacyFab.x === 'number' && !readJson(POS_KEY)) {
        writeJson(POS_KEY, { x: legacyFab.x, y: legacyFab.y });
      }
      try {
        localStorage.removeItem('cn_assistant_box');
        localStorage.removeItem('cn_assistant_fab');
      } catch (e) { /* nothing to clean up */ }
    }

    const size = readJson(SIZE_KEY);
    if (size && size.w && size.h) {
      // Never restore a size bigger than the window it is opening into.
      panel.style.width = `${clamp(size.w, 300, window.innerWidth - 2 * EDGE)}px`;
      panel.style.height = `${clamp(size.h, 300, window.innerHeight - 2 * EDGE)}px`;
    }

    const pos = readJson(POS_KEY);
    if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
      moveWidget(pos.x, pos.y);
    }
  })();

  /* ---------- Dragging ----------
     Both the button and the panel header move the whole widget. The button
     also has to stay clickable, so a few pixels of travel is still treated
     as a click and only real movement suppresses the click that follows. */
  let drag = null;

  function startDrag(e, handle) {
    // Let the close button and the panel's resize corner do their own jobs.
    if (e.target.closest('.assistant-close')) return;
    const f = fab.getBoundingClientRect();
    drag = {
      handle,
      dx: e.clientX - f.left,
      dy: e.clientY - f.top,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    handle.setPointerCapture(e.pointerId);
  }

  function onDragMove(e) {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 4) return;
      drag.moved = true;
      fab.classList.add('is-dragging');
    }
    moveWidget(e.clientX - drag.dx, e.clientY - drag.dy);
  }

  function endDrag(e) {
    if (!drag) return;
    const { handle, moved } = drag;
    drag = null;
    fab.classList.remove('is-dragging');
    try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
    if (moved) {
      if (handle === fab) suppressFabClick = true;
      saveWidgetPos();
    }
  }

  [fab, head].forEach((handle) => {
    handle.addEventListener('pointerdown', (e) => {
      startDrag(e, handle);
      // Dragging the header would otherwise select the title text.
      if (handle === head) e.preventDefault();
    });
    handle.addEventListener('pointermove', onDragMove);
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
    handle.addEventListener('dblclick', (e) => {
      e.preventDefault();
      resetWidget();
    });
  });

  fab.title = 'Drag to move · double-click to reset';
  head.title = 'Drag to move · double-click to reset';

  /* ---------- Resizing ----------
     The corner grip is the browser's own (CSS `resize: both`), so all we do
     is remember the new size and keep the panel anchored to the button. */
  if (window.ResizeObserver) {
    let t;
    new ResizeObserver(() => {
      if (panel.hidden || drag) return;
      positionPanel();
      if (Date.now() < ignoreResizeUntil) return; // a reset, not the user
      clearTimeout(t);
      t = setTimeout(() => {
        if (Date.now() < ignoreResizeUntil) return;
        writeJson(SIZE_KEY, { w: panel.offsetWidth, h: panel.offsetHeight });
      }, 250);
    }).observe(panel);
  }

  // Keep everything on screen when the window changes size.
  window.addEventListener('resize', () => {
    if (root.classList.contains('is-free')) {
      const f = fab.getBoundingClientRect();
      moveWidget(f.left, f.top);
      saveWidgetPos();
    } else {
      positionPanel();
    }
  });

  async function ask(question) {
    if (busy || !question.trim()) return;
    busy = true;
    suggestions.hidden = true;
    input.value = '';
    sendBtn.disabled = true;

    addMessage(question, 'user');
    const thinking = addMessage('Thinking...', 'bot');
    thinking.classList.add('assistant-thinking');

    try {
      const res = await api.askAssistant(question);
      thinking.classList.remove('assistant-thinking');
      thinking.textContent = res.reply;
    } catch (err) {
      thinking.classList.remove('assistant-thinking');
      thinking.classList.add('assistant-msg-error');
      thinking.textContent = err.message || 'Sorry, I could not reach the assistant. Please try again.';
    } finally {
      busy = false;
      sendBtn.disabled = false;
      log.scrollTop = log.scrollHeight;
      input.focus();
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    ask(input.value);
  });

  suggestions.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-q]');
    if (btn) ask(btn.dataset.q);
  });
})();
