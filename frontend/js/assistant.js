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
    // The panel's size is only measurable once it is visible, so decide
    // which way it should open now rather than while it was hidden.
    updatePanelFlip();
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

  /* ---------- Drag to move, drag the corner to resize ----------
     Position and size are remembered per device so the panel stays where
     the user put it while moving between pages. Double-click the header
     to snap it back to the launcher button. */
  const BOX_KEY = 'cn_assistant_box';
  const FAB_KEY = 'cn_assistant_fab';
  const head = panel.querySelector('.assistant-head');

  function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
  }

  /* ---------- The launcher button itself is draggable ----------
     The panel is absolutely positioned inside `root`, so moving the root
     carries the button and the panel together. */
  let suppressFabClick = false;

  function fabSize() {
    return { w: fab.offsetWidth || 56, h: fab.offsetHeight || 56 };
  }

  /* The panel opens up-and-left of the button by default. Near the top or
     left edge there is no room for that, so flip it the other way. */
  function updatePanelFlip() {
    if (!root.classList.contains('is-free')) {
      root.classList.remove('flip-down', 'flip-right');
      return;
    }
    const r = fab.getBoundingClientRect();
    const needed = panel.offsetHeight || 480;
    root.classList.toggle('flip-down', r.top < needed + 12);
    root.classList.toggle('flip-right', r.left < (panel.offsetWidth || 360));
  }

  function placeFab(x, y) {
    const { w, h } = fabSize();
    root.classList.add('is-free');
    root.style.left = `${clamp(x, 0, Math.max(0, window.innerWidth - w))}px`;
    root.style.top = `${clamp(y, 0, Math.max(0, window.innerHeight - h))}px`;
  }

  function saveFabPos() {
    if (!root.classList.contains('is-free')) return;
    const r = fab.getBoundingClientRect();
    try {
      localStorage.setItem(FAB_KEY, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) }));
    } catch (e) {
      /* private mode / storage blocked - position just won't persist */
    }
  }

  function resetFab() {
    root.classList.remove('is-free', 'flip-down', 'flip-right');
    root.style.left = root.style.top = '';
    try {
      localStorage.removeItem(FAB_KEY);
    } catch (e) { /* nothing to clean up */ }
  }

  try {
    const saved = JSON.parse(localStorage.getItem(FAB_KEY) || 'null');
    if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
      placeFab(saved.x, saved.y);
      updatePanelFlip();
    }
  } catch (e) {
    /* corrupt value - ignore and keep the default corner */
  }

  let fabDrag = null;

  fab.addEventListener('pointerdown', (e) => {
    const r = fab.getBoundingClientRect();
    fabDrag = { dx: e.clientX - r.left, dy: e.clientY - r.top, startX: e.clientX, startY: e.clientY, moved: false };
    fab.setPointerCapture(e.pointerId);
  });

  fab.addEventListener('pointermove', (e) => {
    if (!fabDrag) return;
    // A few pixels of travel is a click, not a drag — otherwise the button
    // would be almost impossible to press.
    if (!fabDrag.moved) {
      if (Math.hypot(e.clientX - fabDrag.startX, e.clientY - fabDrag.startY) < 4) return;
      fabDrag.moved = true;
      fab.classList.add('is-dragging');
    }
    placeFab(e.clientX - fabDrag.dx, e.clientY - fabDrag.dy);
    updatePanelFlip();
  });

  function endFabDrag(e) {
    if (!fabDrag) return;
    const moved = fabDrag.moved;
    fabDrag = null;
    fab.classList.remove('is-dragging');
    try { fab.releasePointerCapture(e.pointerId); } catch (_) {}
    if (moved) {
      suppressFabClick = true;
      saveFabPos();
      updatePanelFlip();
    }
  }
  fab.addEventListener('pointerup', endFabDrag);
  fab.addEventListener('pointercancel', endFabDrag);

  // Double-click snaps the launcher back to its corner. The two clicks
  // toggle the panel open then shut, so its state is left as it was.
  fab.addEventListener('dblclick', (e) => {
    e.preventDefault();
    resetFab();
  });

  fab.title = 'Drag to move · double-click to reset';

  function applyBox(box) {
    if (!box) return;
    if (box.w) panel.style.width = `${box.w}px`;
    if (box.h) panel.style.height = `${box.h}px`;
    if (typeof box.x === 'number' && typeof box.y === 'number') {
      panel.classList.add('is-free');
      // Keep it on screen even if the window is smaller than last time.
      const w = box.w || panel.offsetWidth || 360;
      const h = box.h || panel.offsetHeight || 480;
      panel.style.left = `${clamp(box.x, 0, Math.max(0, window.innerWidth - w))}px`;
      panel.style.top = `${clamp(box.y, 0, Math.max(0, window.innerHeight - h))}px`;
    }
  }

  function saveBox() {
    const box = { w: panel.offsetWidth, h: panel.offsetHeight };
    if (panel.classList.contains('is-free')) {
      const r = panel.getBoundingClientRect();
      box.x = Math.round(r.left);
      box.y = Math.round(r.top);
    }
    try {
      localStorage.setItem(BOX_KEY, JSON.stringify(box));
    } catch (e) {
      /* private mode / storage blocked - position just won't persist */
    }
  }

  try {
    applyBox(JSON.parse(localStorage.getItem(BOX_KEY) || 'null'));
  } catch (e) {
    /* corrupt value - ignore and use the default position */
  }

  let drag = null;

  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.assistant-close')) return; // let the X do its job
    const r = panel.getBoundingClientRect();
    // Freeze the current on-screen position before switching anchors,
    // otherwise the panel jumps on the first drag.
    panel.classList.add('is-free');
    panel.style.left = `${r.left}px`;
    panel.style.top = `${r.top}px`;
    panel.style.width = `${r.width}px`;
    panel.style.height = `${r.height}px`;
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height };
    head.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  head.addEventListener('pointermove', (e) => {
    if (!drag) return;
    panel.style.left = `${clamp(e.clientX - drag.dx, 0, window.innerWidth - drag.w)}px`;
    panel.style.top = `${clamp(e.clientY - drag.dy, 0, window.innerHeight - drag.h)}px`;
  });

  function endDrag(e) {
    if (!drag) return;
    drag = null;
    try { head.releasePointerCapture(e.pointerId); } catch (_) {}
    saveBox();
  }
  head.addEventListener('pointerup', endDrag);
  head.addEventListener('pointercancel', endDrag);

  // Double-click the header to snap everything back to the default corner —
  // the panel's own position and size, and the launcher it hangs off.
  head.addEventListener('dblclick', () => {
    panel.classList.remove('is-free');
    panel.style.left = panel.style.top = panel.style.width = panel.style.height = '';
    try { localStorage.removeItem(BOX_KEY); } catch (_) {}
    resetFab();
  });

  // Remember the size after a corner-resize.
  if (window.ResizeObserver) {
    let t;
    new ResizeObserver(() => {
      if (panel.hidden || drag) return;
      clearTimeout(t);
      t = setTimeout(saveBox, 250);
    }).observe(panel);
  }

  // If the window shrinks, pull the launcher and the panel back into view.
  window.addEventListener('resize', () => {
    if (root.classList.contains('is-free')) {
      const f = fab.getBoundingClientRect();
      placeFab(f.left, f.top);
      updatePanelFlip();
      saveFabPos();
    }
    if (!panel.classList.contains('is-free') || panel.hidden) return;
    const r = panel.getBoundingClientRect();
    panel.style.left = `${clamp(r.left, 0, Math.max(0, window.innerWidth - r.width))}px`;
    panel.style.top = `${clamp(r.top, 0, Math.max(0, window.innerHeight - r.height))}px`;
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
