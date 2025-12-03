'use strict';

// ===== INITIALIZATION GUARDS =====
if (!window.API) window.API = {};
if (!window.Utils) window.Utils = {};
if (!window.Pages) window.Pages = {};
if (!window.ActionRegistry) window.ActionRegistry = {};

// Provide guarded fallbacks only if ui-utils hasn't populated them yet (avoid overwriting real implementations)
// Fallbacks use browser native dialogs; mark them with __fallback so callers can detect and use inline modals if needed
if (typeof window.Utils.showPrompt !== 'function') {
  window.Utils.showPrompt = async (title, message, defaultValue = '', _options = {}) => {
    const result = typeof window.prompt === 'function' ? window.prompt(message || title || '', defaultValue) : defaultValue;
    return result ?? null;
  };
  window.Utils.showPrompt.__fallback = true;
}
if (typeof window.Utils.showConfirm !== 'function') {
  window.Utils.showConfirm = async (_title, message, options = {}) => {
    const label = options && options.confirmLabel ? `${options.confirmLabel}: ${message || ''}` : (message || '');
    return typeof window.confirm === 'function' ? window.confirm(label) : false;
  };
  window.Utils.showConfirm.__fallback = true;
}
if (typeof window.Utils.showToast !== 'function') {
  window.Utils.showToast = (msg, type = 'info') => {
    console[type === 'error' ? 'error' : 'log'](`[toast:${type}] ${msg}`);
  };
  window.Utils.showToast.__fallback = true;
}

// ===== STATE & GLOBALS =====

const API_BASE = `${window.location.protocol}//${window.location.host}`;
const REFRESH_MS = 10000;

const pages = {};

let currentPage = 'dashboard';
let statusErrorNotified = false;
const taskFilters = {
  queueId: '',
  status: '',
};
let scriptIndexCache = [];
let scriptIndexLoaded = false;
let scriptIndexPromise = null;
let pendingScriptSelection = null;
let taskPaginationState = {
  offset: 0,
  limit: 50,
  total: 0,
};
const ROUTES = {
  dashboard: '/dashboard',
  settings: '/settings',
};
const LEGACY_ROUTES = {
  '/': { page: 'dashboard' },
  '/sparkqueue': { page: 'dashboard' },
  '/scripts': { page: 'settings', tab: 'scripts' },
  '/config': { page: 'settings' },
};

// ===== API CLIENT =====

async function api(method, path, body = null, { action } = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers = { Accept: 'application/json' };
  const fetchOptions = { method, headers };

  if (body !== null) {
    headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, fetchOptions);
  } catch (err) {
    const networkError = new Error(`Network error: ${err.message || err}`);
    networkError.cause = err;
    networkError.action = action;
    throw networkError;
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await safeJson(response) : null;

  if (!response.ok) {
    const detail = data?.message || data?.error || data?.detail || response.statusText || `Status ${response.status}`;
    const message = `API error: ${detail}`;
    const apiError = new Error(message);
    apiError.response = response;
    apiError.data = data;
    apiError.action = action;
    throw apiError;
  }

  return data;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (err) {
    const parseError = new Error('API error: Invalid JSON response');
    parseError.cause = err;
    throw parseError;
  }
}

// ===== ACTION REGISTRY & DELEGATION =====

const ActionRegistry = window.ActionRegistry;

function registerAction(name, handler) {
  if (!name || typeof handler !== 'function') {
    return;
  }
  ActionRegistry[name] = handler;
}

function callAPI(method, path, body = null, actionLabel = null) {
  const action = actionLabel || path;
  return api(method, path, body, { action });
}

function dispatchAction(action, target, event) {
  const handler = ActionRegistry[action];
  if (typeof handler === 'function') {
    try {
      handler(target, event);
    } catch (err) {
      console.error('[SparkQ] Action handler error:', action, err);
    }
  } else {
    console.warn('[SparkQ] No handler registered for action:', action, target);
  }
}

function delegatedHandler(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  if (event.type === 'click') {
    event.preventDefault();
    event.stopPropagation();
  }

  const action = target.dataset.action;
  if (!action) return;

  dispatchAction(action, target, event);
}

function setupDelegatedListeners() {
  document.body.addEventListener('click', delegatedHandler);
  document.body.addEventListener('change', delegatedHandler);
}

// ===== UTILITIES =====

function normalizeStatus(health) {
  if (!health) {
    return 'error';
  }
  const raw = String(health.status || health.state || '').toLowerCase();
  if (['ok', 'healthy', 'running', 'up'].includes(raw)) {
    return 'running';
  }
  if (['idle', 'ready', 'waiting'].includes(raw)) {
    return 'idle';
  }
  if (raw) {
    return raw;
  }
  return 'error';
}

function formatStatusLabel(state) {
  switch (state) {
    case 'running':
      return 'Running';
    case 'idle':
      return 'Idle';
    case 'ok':
    case 'healthy':
      return 'Healthy';
    case 'error':
      return 'Error';
    default:
      return state ? state.charAt(0).toUpperCase() + state.slice(1) : 'Unknown';
  }
}

function pickStat(stats, keys) {
  if (!stats) {
    return 0;
  }
  for (const key of keys) {
    if (typeof stats[key] === 'number') {
      return stats[key];
    }
    if (stats[key] && typeof stats[key].count === 'number') {
      return stats[key].count;
    }
  }
  return 0;
}

function formatNumber(value) {
  const num = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('en-US').format(num);
}

function formatValue(value, fallback = 'Unknown') {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return value;
}

function getTaskTimeout(task) {
  const timeout = Number(task?.timeout);
  if (Number.isFinite(timeout) && timeout > 0) {
    return timeout;
  }
  return 3600;
}

function getTaskTimeStatus(task) {
  const claimedAt = task?.claimed_at;
  const nowMs = Date.now();
  let elapsed = 0;

  if (claimedAt) {
    const claimedMs = Date.parse(claimedAt);
    if (!Number.isNaN(claimedMs)) {
      elapsed = Math.max(0, Math.floor((nowMs - claimedMs) / 1000));
    }
  }

  const timeout = getTaskTimeout(task);
  const remaining = timeout - elapsed;
  const isStale = remaining <= 0;
  const isWarned = Boolean(task?.stale_warned_at);

  return { elapsed, remaining, isStale, isWarned };
}

function buildTimeoutStatus(timeStatus) {
  const remainingLabel = Math.round(timeStatus.remaining);

  if (timeStatus.isStale) {
    return {
      badge: '<span class="timeout-badge timeout-badge-error">TIMEOUT - Will be auto-failed</span>',
      warning: 'This task has exceeded its timeout and will be automatically failed.',
    };
  }

  if (timeStatus.isWarned) {
    return {
      badge: '<span class="timeout-badge timeout-badge-warning">WARNING - Approaching timeout</span>',
      warning: `Task approaching timeout. ${Math.max(remainingLabel, 0)}s remaining`,
    };
  }

  if (timeStatus.remaining < 300) {
    return {
      badge: `<span class="timeout-badge timeout-badge-critical">CRITICAL - ${Math.max(remainingLabel, 0)}s remaining</span>`,
      warning: '',
    };
  }

  return {
    badge: `<span class="timeout-badge timeout-badge-ok">OK - ${Math.max(remainingLabel, 0)}s remaining</span>`,
    warning: '',
  };
}

function normalizeScriptIndex(response) {
  if (Array.isArray(response)) {
    return response;
  }
  if (Array.isArray(response?.scripts)) {
    return response.scripts;
  }
  if (Array.isArray(response?.index)) {
    return response.index;
  }
  return [];
}

// ===== ROUTING HELPERS =====

function normalizePath(pathname) {
  if (!pathname || pathname === '/') {
    return '/';
  }
  const trimmed = pathname.trim();
  if (!trimmed) {
    return '/';
  }
  return trimmed.replace(/\/+$/, '') || '/';
}

function buildRoute(page, options = {}) {
  const targetPage = page === 'settings' ? 'settings' : 'dashboard';
  const basePath = ROUTES[targetPage] || ROUTES.dashboard;
  const url = new URL(basePath, window.location.origin);
  if (options.tab) {
    url.searchParams.set('tab', options.tab);
  }
  return url.pathname + url.search;
}

function resolveRoute(pathname = window.location.pathname, search = window.location.search) {
  const normalized = normalizePath(pathname);
  const searchParams = new URLSearchParams(search || '');

  if (normalized === ROUTES.dashboard) {
    return { page: 'dashboard', searchParams };
  }
  if (normalized === ROUTES.settings) {
    return { page: 'settings', searchParams };
  }

  const legacy = LEGACY_ROUTES[normalized];
  if (legacy) {
    const page = legacy.page || 'dashboard';
    const tab = legacy.tab || searchParams.get('tab') || undefined;
    const redirectPath = buildRoute(page, tab ? { tab } : {});
    return { page, redirectPath, searchParams };
  }

  return { page: 'dashboard', redirectPath: buildRoute('dashboard'), searchParams };
}

function navigateTo(page, options = {}) {
  const targetPage = page === 'settings' ? 'settings' : 'dashboard';
  const path = buildRoute(targetPage, options);
  const useReplace = options.replace === true;
  if (useReplace) {
    history.replaceState({ page: targetPage }, '', path);
  } else {
    history.pushState({ page: targetPage }, '', path);
  }
  currentPage = targetPage;
  router(targetPage);
}

function setPendingScriptSelection(selection) {
  pendingScriptSelection = selection || null;
}

function consumePendingScriptSelection() {
  const selection = pendingScriptSelection;
  pendingScriptSelection = null;
  return selection;
}

// ===== COMPONENTS =====

function setStatusIndicator(state, health = {}) {
  const statusEl = document.getElementById('status');
  if (!statusEl) {
    return;
  }

  statusEl.classList.remove('status-running', 'status-idle', 'status-error');
  if (state === 'running' || state === 'ok' || state === 'healthy') {
    statusEl.classList.add('status-running');
  } else if (state === 'idle') {
    statusEl.classList.add('status-idle');
  } else {
    statusEl.classList.add('status-error');
  }

  const label = formatStatusLabel(state);
  const detail = health?.message || '';
  statusEl.title = detail ? `${label} — ${detail}` : label;
}

function showAlert(message, type = 'info', duration = 5000) {
  if (!message) {
    return null;
  }

  const host = ensureAlertHost();
  const normalizedType = ['success', 'error', 'info', 'warning'].includes(type) ? type : 'info';
  const el = document.createElement('div');
  el.classList.add('alert', `alert-${normalizedType}`, normalizedType);
  el.setAttribute('role', 'alert');
  el.style.opacity = '0';
  el.style.transform = 'translateY(-8px)';
  el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

  const messageEl = document.createElement('div');
  messageEl.className = 'alert-message';
  messageEl.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'alert-close';
  closeBtn.setAttribute('aria-label', 'Dismiss alert');
  closeBtn.innerHTML = '&times;';
  closeBtn.style.background = 'transparent';
  closeBtn.style.border = 'none';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.color = 'inherit';
  closeBtn.style.fontSize = '16px';
  closeBtn.style.marginLeft = '10px';

  closeBtn.addEventListener('click', () => dismissAlert(el));

  el.appendChild(messageEl);
  el.appendChild(closeBtn);
  host.prepend(el);

  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
  });

  if (duration !== null && duration !== undefined) {
    el.dataset.timeoutId = String(
      setTimeout(() => dismissAlert(el), duration),
    );
  }

  return el;
}

function dismissAlert(el) {
  if (!el || el.dataset.dismissed === 'true') {
    return;
  }

  el.dataset.dismissed = 'true';
  const timeoutId = el.dataset.timeoutId ? Number(el.dataset.timeoutId) : null;
  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  el.style.opacity = '0';
  el.style.transform = 'translateY(-8px)';

  setTimeout(() => {
    if (el && el.parentNode) {
      el.remove();
    }
  }, 320);
}

function showError(message, error = null) {
  const formatted = message && !message.startsWith('Error:') ? `Error: ${message}` : message || 'Error';
  if (error) {
    console.error(formatted, error);
  } else {
    console.error(formatted);
  }
  return showAlert(formatted, 'error');
}

function showSuccess(message) {
  return showAlert(message, 'success');
}

// Copy-to-clipboard utility (Phase 10)
async function copyToClipboard(text, feedbackMs = 1500) {
  try {
    await navigator.clipboard.writeText(text);
    showSuccess('Copied to clipboard', feedbackMs);
  } catch (err) {
    showError('Copy failed', err);
  }
}

function handleApiError(action, err) {
  const detail = err?.message || err || 'Unknown error';
  return showError(`Failed to ${action}: ${detail}`, err);
}

function ensureAlertHost() {
  let host = document.getElementById('alert-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'alert-host';
    document.body.appendChild(host);
  }
  return host;
}

async function withButtonLoading(button, action, loadingLabel = 'Loading...') {
  if (typeof action !== 'function') {
    return null;
  }

  const originalHtml = button ? button.innerHTML : '';
  if (button) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.dataset.originalHtml = originalHtml;
    button.innerHTML = `<span class="loading" style="width: 16px; height: 16px; border-width: 2px;"></span> ${loadingLabel}`;
  }

  try {
    return await action();
  } finally {
    if (button) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.innerHTML = button.dataset.originalHtml || originalHtml;
    }
  }
}

function attachValidationHandlers(form) {
  if (!form) {
    return;
  }
  const inputs = form.querySelectorAll('input, textarea, select');
  inputs.forEach((input) => {
    input.addEventListener('input', () => clearFieldError(input));
    input.addEventListener('blur', () => {
      if (input.required && !String(input.value || '').trim()) {
        markFieldError(input, 'This field is required.');
      }
    });
  });
}

function clearFormErrors(form) {
  if (!form) {
    return;
  }
  const inputs = form.querySelectorAll('.input-invalid, [aria-invalid="true"]');
  inputs.forEach((input) => clearFieldError(input));
}

function validateRequiredFields(form) {
  if (!form) {
    return true;
  }

  let isValid = true;
  form.querySelectorAll('[required]').forEach((field) => {
    const value = String(field.value || '').trim();
    if (!value) {
      markFieldError(field, 'This field is required.');
      isValid = false;
    } else {
      clearFieldError(field);
    }
  });

  return isValid;
}

function markFieldError(field, message) {
  if (!field) {
    return;
  }

  field.classList.add('input-invalid');
  field.setAttribute('aria-invalid', 'true');
  field.style.borderColor = 'var(--error)';

  const messageEl = getFieldErrorElement(field);
  if (messageEl) {
    messageEl.textContent = message || 'This field is required.';
    messageEl.style.display = 'block';
  }
}

function clearFieldError(field) {
  if (!field) {
    return;
  }

  field.classList.remove('input-invalid');
  field.removeAttribute('aria-invalid');
  field.style.borderColor = '';

  const messageEl = getFieldErrorElement(field);
  if (messageEl) {
    messageEl.textContent = '';
    messageEl.style.display = 'none';
  }
}

function getFieldErrorElement(field) {
  const container = field.closest('.input-group') || field.closest('.form-group') || field.parentElement;
  if (!container) {
    return null;
  }

  let messageEl = container.querySelector('.input-error');
  if (!messageEl) {
    messageEl = document.createElement('div');
    messageEl.className = 'input-error';
    messageEl.style.color = 'var(--error)';
    messageEl.style.fontSize = '12px';
    messageEl.style.marginTop = '4px';
    messageEl.style.display = 'none';
    container.appendChild(messageEl);
  }
  return messageEl;
}

function injectStaleStyles() {
  if (document.getElementById('stale-indicator-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'stale-indicator-styles';
  style.textContent = `
    .task-stale-error { background: rgba(244, 67, 54, 0.12); color: #f44336; }
    .task-stale-error td { color: #f44336; }
    .task-stale-warning { background: rgba(255, 193, 7, 0.14); color: #ff9800; }
    .task-stale-warning td { color: #ff9800; }
    .timeout-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 999px; font-weight: 700; font-size: 12px; border: 1px solid transparent; }
    .timeout-badge-error { background: rgba(244, 67, 54, 0.14); border-color: #f44336; color: #f44336; }
    .timeout-badge-warning { background: rgba(255, 193, 7, 0.16); border-color: #ffc107; color: #ff9800; }
    .timeout-badge-critical { background: rgba(255, 152, 0, 0.16); border-color: #ff9800; color: #ff9800; }
    .timeout-badge-ok { background: rgba(76, 175, 80, 0.14); border-color: #4caf50; color: #4caf50; }
    .timeout-info-section { margin-top: 14px; padding: 12px; border-radius: 12px; border: 1px solid var(--border); background: rgba(255, 255, 255, 0.02); }
    .timeout-info-section h4 { margin: 0 0 6px 0; }
  `;

  document.head.appendChild(style);
}

// Theme toggle utilities (Phase 10)
function initTheme() {
  const stored = localStorage.getItem('theme');
  const preference = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const theme = stored || preference;
  applyTheme(theme);
}

function applyTheme(theme) {
  const doc = document.documentElement;
  if (theme === 'dark') {
    doc.setAttribute('data-theme', 'dark');
  } else {
    doc.removeAttribute('data-theme');
  }
  localStorage.setItem('theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
}

// ===== MAIN APP =====

function cachePages() {
  pages.dashboard = document.getElementById('dashboard-page');
  pages.settings = document.getElementById('settings-page') || document.getElementById('config-page');

  // Verify all pages were cached
  const missing = [];
  ['dashboard', 'settings'].forEach(name => {
    if (!pages[name]) {
      missing.push(name);
    }
  });
  if (missing.length > 0) {
    console.error('[SparkQ] Missing page elements:', missing);
  }
}

function resolvePageComponent(pageKey) {
  if (pageKey === 'settings') {
    return window.Pages.Settings || window.Pages.Config;
  }
  if (pageKey === 'dashboard') {
    return window.Pages.Dashboard;
  }
  const fallbackKey = pageKey.charAt(0).toUpperCase() + pageKey.slice(1);
  return window.Pages[fallbackKey];
}

function setupNavigationButtons() {
  const brandBtn = document.getElementById('navbar-brand-btn');
  if (brandBtn) {
    brandBtn.dataset.action = 'nav-dashboard';
  }

  const settingsBtn = document.getElementById('settings-nav-btn');
  if (settingsBtn) {
    settingsBtn.dataset.action = 'nav-settings';
  }
}

function setupPopstateListener() {
  window.addEventListener('popstate', () => {
    const { page, redirectPath } = resolveRoute(window.location.pathname, window.location.search);
    if (redirectPath) {
      history.replaceState({ page }, '', redirectPath);
    }
    currentPage = page === 'settings' ? 'settings' : 'dashboard';
    router(currentPage);
  });
}

function applyInitialRoute() {
  const { page, redirectPath } = resolveRoute(window.location.pathname, window.location.search);
  if (redirectPath) {
    history.replaceState({ page }, '', redirectPath);
  }
  currentPage = page === 'settings' ? 'settings' : 'dashboard';
  router(currentPage);
}

function updateActiveNav(page) {
  const header = document.querySelector('.app-header');
  if (header) {
    header.dataset.activePage = page;
  }

  const brandBtn = document.getElementById('navbar-brand-btn');
  const settingsBtn = document.getElementById('settings-nav-btn');
  if (brandBtn) {
    brandBtn.classList.toggle('active', page === 'dashboard');
    if (page === 'dashboard') {
      brandBtn.setAttribute('aria-current', 'page');
      brandBtn.setAttribute('title', 'Dashboard');
    } else {
      brandBtn.removeAttribute('aria-current');
      brandBtn.setAttribute('title', 'Go to dashboard');
    }
  }
  if (settingsBtn) {
    settingsBtn.classList.toggle('active', page === 'settings');
    if (page === 'settings') {
      settingsBtn.setAttribute('aria-current', 'page');
      settingsBtn.setAttribute('title', 'Settings');
    } else {
      settingsBtn.removeAttribute('aria-current');
      settingsBtn.setAttribute('title', 'Open settings');
    }
  }
}

async function router(page = currentPage) {
  const targetPage = page === 'settings' ? 'settings' : 'dashboard';
  Object.keys(pages).forEach((pageName) => {
    if (pages[pageName]) {
      pages[pageName].style.display = pageName === targetPage ? 'block' : 'none';
    }
  });

  const component = resolvePageComponent(targetPage);
  if (component && typeof component.render === 'function') {
    try {
      await component.render(pages[targetPage]);
    } catch (err) {
      console.error('[SparkQ] Error rendering page:', targetPage, err);
      if (pages[targetPage]) {
        pages[targetPage].innerHTML = `<div class="card"><p class="error">Error loading ${targetPage}: ${err.message}</p></div>`;
      }
    }
  } else {
    console.error('[SparkQ] Page renderer not found:', targetPage);
    if (pages[targetPage]) {
      pages[targetPage].innerHTML = `<div class="card"><p class="error">Page module not loaded: ${targetPage}</p></div>`;
    }
  }

  updateActiveNav(targetPage);
}

function registerCoreActions() {
  registerAction('nav-dashboard', () => navigateTo('dashboard'));
  registerAction('nav-settings', () => navigateTo('settings'));
}

async function refreshStatus() {
  try {
    const health = await api('GET', '/health', null, { action: 'refresh status' });
    if (health) {
      setStatusIndicator(normalizeStatus(health), health);
      statusErrorNotified = false;
    }
  } catch (err) {
    setStatusIndicator('error');
    if (!statusErrorNotified) {
      showError(`Failed to refresh status: ${err.message || err}`, err);
      statusErrorNotified = true;
    }
  }
}

// Keyboard shortcuts handler (Phase 10)
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ignore if typing in input/textarea
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      return;
    }

    // Escape: Close modals (safety net)
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal').forEach((modal) => {
        if (modal && modal.parentNode) {
          modal.remove();
        }
      });
    }

    // Ctrl/Cmd+K: Search/focus (Phase 10)
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
    }

    // Ctrl/Cmd+Shift+T: Toggle theme
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 't') {
      e.preventDefault();
      toggleTheme();
    }
  });
}

function updateThemeButtonIcon() {
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (!themeBtn) {
    return;
  }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  themeBtn.innerHTML = isDark ? '☀️' : '🌙';
  themeBtn.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
}

function attachThemeButtonListener() {
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', toggleTheme);
  }
}

async function syncBuildIdFromServer() {
  try {
    const resp = await api('GET', '/api/version', null, { action: 'version sync' });
    const serverBuild = resp?.build_id;
    if (serverBuild) {
      window.__BUILD_ID__ = serverBuild;
      const buildEl = document.getElementById('build-id');
      if (buildEl) {
        buildEl.textContent = `UI v${serverBuild}`;
        buildEl.style.display = 'inline-flex';
      }
    }
  } catch (err) {
    console.warn('[SparkQ] Failed to sync build id from server:', err);
  }
}

// ===== EXPORTS =====

window.API = Object.assign(window.API || {}, { api });
window.Utils = Object.assign(window.Utils || {}, {
  normalizeStatus,
  formatStatusLabel,
  pickStat,
  formatNumber,
  formatValue,
  getTaskTimeout,
  getTaskTimeStatus,
  buildTimeoutStatus,
  normalizeScriptIndex,
  setStatusIndicator,
  showAlert,
  dismissAlert,
  showError,
  showSuccess,
  copyToClipboard,
  handleApiError,
  ensureAlertHost,
  withButtonLoading,
  attachValidationHandlers,
  clearFormErrors,
  validateRequiredFields,
  markFieldError,
  clearFieldError,
  getFieldErrorElement,
  injectStaleStyles,
  initTheme,
  applyTheme,
  toggleTheme,
  navigateTo,
  buildRoute,
  resolveRoute,
  setPendingScriptSelection,
  consumePendingScriptSelection,
  registerAction,
  callAPI,
  ActionRegistry,
});
window.Actions = Object.assign(window.Actions || {}, {
  registerAction,
  callAPI,
  ActionRegistry,
});

// ===== INITIALIZATION =====

function initApp() {
  cachePages();
  initTheme();
  setupKeyboardShortcuts();
  updateThemeButtonIcon();
  setupDelegatedListeners();
  registerCoreActions();
  attachThemeButtonListener();
  setupNavigationButtons();
  setupPopstateListener();
  applyInitialRoute();
  syncBuildIdFromServer();
}

// Expose deferred initializer so index.html can run after all assets load.
window.__SPARKQ_RUN_APP = window.__SPARKQ_RUN_APP || function () {
  if (window.__SPARKQ_APP_INITIALIZED) return;
  window.__SPARKQ_APP_INITIALIZED = true;
  initApp();
};
