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

  fab.addEventListener('click', () => (panel.hidden ? openPanel() : closePanel()));
  closeBtn.addEventListener('click', closePanel);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) closePanel();
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
