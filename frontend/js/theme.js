/**
 * CareerNexus — Theme controller
 * Applies/persists the light/dark theme and wires up every toggle control
 * on the page (navbar icon button, or the labeled switch on Settings).
 * The blocking snippet in each page's <head> already set the attribute
 * before first paint; this file keeps it in sync with user interaction.
 */
const THEME_STORAGE_KEY = 'cn_theme';

function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function setTheme(theme) {
  const resolved = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', resolved);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, resolved);
  } catch (e) {
    /* private browsing / storage blocked — theme still applies for this load */
  }
  syncThemeControls(resolved);
}

function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

function syncThemeControls(theme) {
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(theme === 'dark'));
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  });
  document.querySelectorAll('[data-theme-option]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-theme-option') === theme);
  });
}

document.addEventListener('click', (e) => {
  const toggleBtn = e.target.closest('[data-theme-toggle]');
  if (toggleBtn) {
    toggleTheme();
    return;
  }
  const optionBtn = e.target.closest('[data-theme-option]');
  if (optionBtn) {
    setTheme(optionBtn.getAttribute('data-theme-option'));
  }
});

document.addEventListener('DOMContentLoaded', () => syncThemeControls(getTheme()));
