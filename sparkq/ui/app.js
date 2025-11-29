'use strict';

// ===== STATE & GLOBALS =====

const API_BASE = `${window.location.protocol}//${window.location.host}`;
const REFRESH_MS = 10000;

const pages = {};
const Pages = {};

let currentPage = 'dashboard';
let dashboardTimer;
let statusTimer;
let statusErrorNotified = false;
const taskFilters = {
  streamId: '',
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

function injectEnqueueStyles() {
  if (document.getElementById('enqueue-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'enqueue-styles';
  style.textContent = `
    .autocomplete-wrapper { position: relative; }
    .autocomplete-list { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow); max-height: 240px; overflow-y: auto; z-index: 8; display: none; }
    .autocomplete-item { padding: 10px 12px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.12s ease; }
    .autocomplete-item:last-child { border-bottom: none; }
    .autocomplete-item:hover { background: var(--muted); }
    .autocomplete-item-title { display: block; font-weight: 700; }
    .autocomplete-item-desc { display: block; color: var(--subtle); font-size: 13px; margin-top: 4px; }
    .script-meta { margin-top: 12px; padding: 12px; border-radius: 10px; border: 1px solid var(--border); background: rgba(255, 255, 255, 0.02); }
    .script-meta h4 { margin: 0 0 6px 0; }
    .script-meta .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-top: 8px; }
    .script-helper { color: var(--subtle); font-size: 13px; margin-top: 4px; }
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
  showSuccess(`Theme changed to ${next} mode`);
}

// ===== PAGES =====

function statCard(label, value) {
  return `
    <div class="stat-card">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${formatNumber(value)}</div>
    </div>
  `;
}

async function loadDashboard() {
  const container = pages.dashboard;
  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="muted"><span class="loading"></span> Loading dashboard…</div>
    </div>
  `;

  let health = null;
  let stats = null;

  try {
    health = await api('GET', '/health', null, { action: 'load health status' });
  } catch (err) {
    showError(`Failed to load health status: ${err.message || err}`, err);
  }

  try {
    stats = await api('GET', '/stats', null, { action: 'load dashboard stats' });
  } catch (err) {
    showError(`Failed to load dashboard stats: ${err.message || err}`, err);
  }

  if (health) {
    setStatusIndicator(normalizeStatus(health), health);
    statusErrorNotified = false;
  }

  renderDashboard(container, health, stats);
}

function renderDashboard(container, health, stats) {
  const status = normalizeStatus(health);
  const statusLabel = formatStatusLabel(status);
  const uptime = formatValue(health?.uptime);
  const version = formatValue(health?.version, '—');

  const sessionCount = pickStat(stats, ['sessions', 'session_count', 'sessionCount']);
  const streamCount = pickStat(stats, ['streams', 'stream_count', 'streamCount']);
  const queuedTasks = pickStat(stats, ['queued_tasks', 'queued', 'queuedTasks']);
  const runningTasks = pickStat(stats, ['running_tasks', 'running', 'runningTasks']);

  container.innerHTML = `
    <div class="grid grid-2">
      <div class="card">
        <h2>Server Health</h2>
        <p class="muted">Status</p>
        <div class="stat-value">${statusLabel}</div>
        <p class="muted">Uptime: ${uptime}</p>
        <p class="muted">Version: ${version}</p>
      </div>
      <div class="card">
        <h2>Overview</h2>
        <div class="grid grid-2">
          ${statCard('Sessions', sessionCount)}
          ${statCard('Streams', streamCount)}
          ${statCard('Queued Tasks', queuedTasks)}
          ${statCard('Running Tasks', runningTasks)}
        </div>
      </div>
    </div>
  `;
}

Pages.Dashboard = { render: loadDashboard };

async function renderTasksPage() {
  const container = pages.tasks;
  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="muted"><span class="loading"></span> Loading tasks…</div>
    </div>
  `;

  let streams = [];
  try {
    const response = await api('GET', '/api/streams', null, { action: 'load streams' });
    streams = response?.streams || [];
  } catch (err) {
    handleApiError('load streams for filters', err);
  }

  let tasks = [];
  try {
    const query = [];
    if (taskFilters.streamId) {
      query.push(`stream_id=${encodeURIComponent(taskFilters.streamId)}`);
    }
    if (taskFilters.status) {
      query.push(`status=${encodeURIComponent(taskFilters.status)}`);
    }
    query.push(`offset=${taskPaginationState.offset}`);
    query.push(`limit=${taskPaginationState.limit}`);
    const path = `/api/tasks${query.length ? `?${query.join('&')}` : ''}`;
    const response = await api('GET', path, null, { action: 'load tasks' });
    tasks = response?.tasks || [];
    taskPaginationState.total = response?.total || tasks.length;
  } catch (err) {
    container.innerHTML = `
      <div class="card">
        <div class="muted">Unable to load tasks.</div>
      </div>
    `;
    handleApiError('load tasks', err);
    return;
  }

  const streamsById = {};
  streams.forEach((stream) => {
    streamsById[stream.id] = stream.name || stream.id;
  });

  const streamOptions = streams
    .map(
      (stream) =>
        `<option value="${stream.id}" ${stream.id === taskFilters.streamId ? 'selected' : ''}>${stream.name || stream.id}</option>`,
    )
    .join('');

  const statusOptions = [
    { value: '', label: 'All statuses' },
    { value: 'queued', label: 'Queued' },
    { value: 'running', label: 'Running' },
    { value: 'succeeded', label: 'Succeeded' },
    { value: 'failed', label: 'Failed' },
  ]
    .map(
      (option) =>
        `<option value="${option.value}" ${option.value === taskFilters.status ? 'selected' : ''}>${option.label}</option>`,
    )
    .join('');

  const rows = tasks
    .map((task) => {
      const timeStatus = getTaskTimeStatus(task);
      const streamName = streamsById[task.stream_id] || task.stream_id;
      const rowClass = timeStatus.isStale ? 'task-stale-error' : timeStatus.isWarned ? 'task-stale-warning' : '';
      const staleBadge = timeStatus.isStale
        ? `<span class="timeout-badge timeout-badge-error">⚠️ TIMEOUT</span>`
        : timeStatus.isWarned
          ? `<span class="timeout-badge timeout-badge-warning">⚠️ WARNING</span>`
          : '';

      return `
        <tr class="task-row ${rowClass}" data-task-id="${task.id}">
          <td style="width: 30px;"><input type="checkbox" class="task-checkbox" data-task-id="${task.id}" /></td>
          <td>${task.id}</td>
          <td>${streamName}</td>
          <td>${task.tool_name}</td>
          <td>${task.status} ${staleBadge}</td>
          <td>${formatValue(task.created_at, '—')}</td>
        </tr>
      `;
    })
    .join('');

  const table = tasks.length
    ? `
        <table class="table">
          <thead>
            <tr>
              <th style="width: 30px;"><input type="checkbox" id="select-all-tasks" title="Select all tasks" /></th>
              <th>ID</th>
              <th>Stream</th>
              <th>Tool</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      `
    : `<p class="muted">No tasks found.</p>`;

  const showingEnd = taskPaginationState.offset + tasks.length;
  const paginationInfo = tasks.length > 0 ? `<p class="muted" style="margin-top: 12px; font-size: 13px;">Found ${taskPaginationState.total} tasks (showing ${taskPaginationState.offset + 1}-${showingEnd})</p>` : '';
  const hasMore = showingEnd < taskPaginationState.total;
  const loadMoreBtnHtml = hasMore ? `<button class="button" id="load-more-tasks-btn" style="margin-top: 12px;">Load More</button>` : '';

  container.innerHTML = `
    <div class="card">
      <div class="grid grid-2">
        <div class="input-group">
          <label for="task-stream-filter">Stream</label>
          <select id="task-stream-filter">
            <option value="">All streams</option>
            ${streamOptions}
          </select>
        </div>
        <div class="input-group">
          <label for="task-status-filter">Status</label>
          <select id="task-status-filter">
            ${statusOptions}
          </select>
        </div>
      </div>
      ${table}
      ${paginationInfo}
      ${loadMoreBtnHtml}
    </div>
  `;

  const streamSelect = container.querySelector('#task-stream-filter');
  const statusSelect = container.querySelector('#task-status-filter');

  if (streamSelect) {
    streamSelect.value = taskFilters.streamId;
    streamSelect.addEventListener('change', () => {
      taskFilters.streamId = streamSelect.value;
      renderTasksPage();
    });
  }

  if (statusSelect) {
    statusSelect.value = taskFilters.status;
    statusSelect.addEventListener('change', () => {
      taskFilters.status = statusSelect.value;
      taskPaginationState.offset = 0;
      renderTasksPage();
    });
  }

  const loadMoreBtn = container.querySelector('#load-more-tasks-btn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      taskPaginationState.offset += taskPaginationState.limit;
      renderTasksPage();
    });
  }

  // Batch operations state (Phase 10)
  const selectedTasks = new Set();

  const selectAllCheckbox = container.querySelector('#select-all-tasks');
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      document.querySelectorAll('.task-checkbox').forEach((cb) => {
        cb.checked = e.target.checked;
        if (e.target.checked) {
          selectedTasks.add(cb.dataset.taskId);
        } else {
          selectedTasks.delete(cb.dataset.taskId);
        }
      });
      updateBulkActionsUI();
    });
  }

  document.querySelectorAll('.task-checkbox').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) {
        selectedTasks.add(cb.dataset.taskId);
      } else {
        selectedTasks.delete(cb.dataset.taskId);
      }
      updateBulkActionsUI();
    });

    cb.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });

  const taskRows = container.querySelectorAll('.task-row');
  taskRows.forEach((row) => {
    row.addEventListener('click', () => {
      const checkbox = row.querySelector('.task-checkbox');
      if (checkbox && !checkbox.disabled) {
        checkbox.checked = !checkbox.checked;
        if (checkbox.checked) {
          selectedTasks.add(checkbox.dataset.taskId);
        } else {
          selectedTasks.delete(checkbox.dataset.taskId);
        }
        updateBulkActionsUI();
      }
    });
  });

  function updateBulkActionsUI() {
    let bulkActionsDiv = container.querySelector('.bulk-actions');
    if (selectedTasks.size > 0) {
      if (!bulkActionsDiv) {
        bulkActionsDiv = document.createElement('div');
        bulkActionsDiv.className = 'bulk-actions';
        bulkActionsDiv.style.cssText = 'display: flex; gap: 10px; margin-bottom: 12px; align-items: center;';
        container.querySelector('.card').insertBefore(bulkActionsDiv, container.querySelector('.card').firstChild.nextSibling?.nextSibling);
      }
      bulkActionsDiv.innerHTML = `
        <span class="muted">${selectedTasks.size} selected</span>
        <button class="button" id="bulk-fail-btn" type="button">Fail Selected</button>
        <button class="button" id="bulk-requeue-btn" type="button">Requeue Selected</button>
      `;
      bulkActionsDiv.style.display = 'flex';

      document.getElementById('bulk-fail-btn')?.addEventListener('click', () => bulkFail());
      document.getElementById('bulk-requeue-btn')?.addEventListener('click', () => bulkRequeue());
    } else if (bulkActionsDiv) {
      bulkActionsDiv.style.display = 'none';
    }
  }

  async function bulkFail() {
    const confirmed = confirm(`Fail ${selectedTasks.size} selected task(s)?`);
    if (!confirmed) return;

    try {
      let failed = 0;
      for (const taskId of selectedTasks) {
        try {
          await api('POST', `/api/tasks/${taskId}/fail`, { reason: 'Bulk fail via UI' }, { action: 'fail task' });
          failed++;
        } catch (err) {
          console.error(`Failed to fail task ${taskId}:`, err);
        }
      }
      showSuccess(`Failed ${failed}/${selectedTasks.size} task(s)`);
      selectedTasks.clear();
      renderTasksPage();
    } catch (err) {
      handleApiError('bulk fail tasks', err);
    }
  }

  async function bulkRequeue() {
    const confirmed = confirm(`Requeue ${selectedTasks.size} selected task(s)?`);
    if (!confirmed) return;

    try {
      let requeued = 0;
      for (const taskId of selectedTasks) {
        try {
          await api('POST', `/api/tasks/${taskId}/requeue`, {}, { action: 'requeue task' });
          requeued++;
        } catch (err) {
          console.error(`Failed to requeue task ${taskId}:`, err);
        }
      }
      showSuccess(`Requeued ${requeued}/${selectedTasks.size} task(s)`);
      selectedTasks.clear();
      renderTasksPage();
    } catch (err) {
      handleApiError('bulk requeue tasks', err);
    }
  }

  updateBulkActionsUI();
}

async function renderTaskDetailModal(taskId) {
  const existing = document.getElementById('task-detail-modal');
  if (existing) {
    existing.remove();
  }

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'task-detail-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="muted"><span class="loading"></span> Loading task…</div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal(modal);
    }
  });

  let task;
  try {
    const response = await api('GET', `/api/tasks/${taskId}`, null, { action: 'load task details' });
    task = response?.task;
  } catch (err) {
    handleApiError('load task details', err);
    closeModal(modal);
    return;
  }

  const timeStatus = getTaskTimeStatus(task);
  const timeoutSeconds = getTaskTimeout(task);
  const elapsedSeconds = Math.round(timeStatus.elapsed);
  const remainingSeconds = Math.round(timeStatus.remaining);
  const timeoutStatus = buildTimeoutStatus(timeStatus);
  const claimedLabel = task.claimed_at ? `${task.claimed_at} (ISO8601)` : '—';

  const content = `
    <div class="modal-content">
      <div class="modal-header" style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
        <h3 style="margin: 0;">Task ${task.id}</h3>
        <button class="button secondary" data-action="close">Close</button>
      </div>
      <p class="muted">Status: ${task.status}</p>
      <div class="grid grid-2">
        <div><strong>Stream</strong><div>${formatValue(task.stream_id, '—')}</div></div>
        <div><strong>Tool</strong><div>${formatValue(task.tool_name, '—')}</div></div>
        <div><strong>Created</strong><div>${formatValue(task.created_at, '—')}</div></div>
        <div><strong>Claimed</strong><div>${formatValue(task.claimed_at, '—')}</div></div>
        <div><strong>Completed</strong><div>${formatValue(task.completed_at, '—')}</div></div>
        <div><strong>Failed</strong><div>${formatValue(task.failed_at, '—')}</div></div>
        <div><strong>Timeout</strong><div>${timeoutSeconds} seconds</div></div>
        <div><strong>Stale Warned</strong><div>${formatValue(task.stale_warned_at, '—')}</div></div>
      </div>

      <div class="timeout-info-section">
        <h4>Timeout Information</h4>
        <p><strong>Claimed At:</strong> ${claimedLabel}</p>
        <p><strong>Timeout:</strong> ${timeoutSeconds} seconds</p>
        <p><strong>Elapsed:</strong> ${elapsedSeconds} seconds</p>
        <p><strong>Remaining:</strong> ${remainingSeconds} seconds</p>
        <p><strong>Status:</strong> ${timeoutStatus.badge}</p>
        ${timeoutStatus.warning ? `<p class="muted">${timeoutStatus.warning}</p>` : ''}
      </div>

      ${task.result_summary ? `<div class="form-group"><label>Result</label><div>${task.result_summary}</div></div>` : ''}
      ${task.error_message ? `<div class="form-group"><label>Error</label><div>${task.error_message}</div></div>` : ''}

      <div class="modal-actions" style="display: flex; gap: 10px; justify-content: flex-end;">
        ${task.status === 'queued' ? '<button class="button primary" data-action="claim">Claim</button>' : ''}
        ${task.status === 'running' ? '<button class="button primary" data-action="complete">Complete</button><button class="button" data-action="fail">Fail</button>' : ''}
        ${task.status === 'failed' || task.status === 'succeeded' ? '<button class="button" data-action="requeue">Requeue</button>' : ''}
      </div>
    </div>
  `;

  modal.innerHTML = content;
  modal.querySelector('[data-action="close"]')?.addEventListener('click', () => closeModal(modal));

  attachTaskActionHandlers(modal, task);
}

function closeModal(modal) {
  if (modal && modal.parentNode) {
    modal.remove();
  }
}

function attachTaskActionHandlers(modal, task) {
  const claimBtn = modal.querySelector('[data-action="claim"]');
  if (claimBtn) {
    claimBtn.addEventListener('click', () => handleClaimTask(task.id, modal, claimBtn));
  }

  const completeBtn = modal.querySelector('[data-action="complete"]');
  if (completeBtn) {
    completeBtn.addEventListener('click', () => handleCompleteTask(task.id, modal, completeBtn));
  }

  const failBtn = modal.querySelector('[data-action="fail"]');
  if (failBtn) {
    failBtn.addEventListener('click', () => handleFailTask(task.id, modal, failBtn));
  }

  const requeueBtn = modal.querySelector('[data-action="requeue"]');
  if (requeueBtn) {
    requeueBtn.addEventListener('click', () => handleRequeueTask(task.id, modal, requeueBtn));
  }
}

async function handleClaimTask(taskId, modal, button) {
  try {
    await withButtonLoading(button, async () => api('POST', `/api/tasks/${taskId}/claim`, {}, { action: 'claim task' }));
    showSuccess(`Task ${taskId} claimed`);
    renderTasksPage();
    closeModal(modal);
    renderTaskDetailModal(taskId);
  } catch (err) {
    handleApiError('claim task', err);
  }
}

async function handleCompleteTask(taskId, modal, button) {
  const resultSummary = prompt('Enter result summary for this task:');
  if (!resultSummary) {
    showError('Result summary is required to complete the task.');
    return;
  }
  const resultData = prompt('Result data (optional):', resultSummary) || resultSummary;

  try {
    await withButtonLoading(button, async () =>
      api(
        'POST',
        `/api/tasks/${taskId}/complete`,
        {
          result_summary: resultSummary,
          result_data: resultData,
        },
        { action: 'complete task' },
      ),
    );
    showSuccess(`Task ${taskId} completed`);
    renderTasksPage();
    closeModal(modal);
    renderTaskDetailModal(taskId);
  } catch (err) {
    handleApiError('complete task', err);
  }
}

async function handleFailTask(taskId, modal, button) {
  const errorMessage = prompt('Enter error message for this task:');
  if (!errorMessage) {
    showError('Error message is required to fail the task.');
    return;
  }
  const errorType = prompt('Error type (optional):') || undefined;

  try {
    await withButtonLoading(button, async () =>
      api(
        'POST',
        `/api/tasks/${taskId}/fail`,
        {
          error_message: errorMessage,
          error_type: errorType,
        },
        { action: 'fail task' },
      ),
    );
    showSuccess(`Task ${taskId} failed`);
    renderTasksPage();
    closeModal(modal);
    renderTaskDetailModal(taskId);
  } catch (err) {
    handleApiError('fail task', err);
  }
}

async function handleRequeueTask(taskId, modal, button) {
  const shouldRequeue = confirm('Requeue this task?');
  if (!shouldRequeue) {
    return;
  }

  try {
    const response = await withButtonLoading(button, async () =>
      api('POST', `/api/tasks/${taskId}/requeue`, {}, { action: 'requeue task' }),
    );
    const newTaskId = response?.task?.id;
    const suffix = newTaskId ? ` as ${newTaskId}` : '';
    showSuccess(`Task ${taskId} requeued${suffix}`);
    renderTasksPage();
    closeModal(modal);
    if (newTaskId) {
      renderTaskDetailModal(newTaskId);
    }
  } catch (err) {
    handleApiError('requeue task', err);
  }
}

Pages.Tasks = { render: renderTasksPage, renderDetail: renderTaskDetailModal };

async function loadScriptIndex(force = false) {
  if (scriptIndexLoaded && !force) {
    return scriptIndexCache;
  }

  if (scriptIndexPromise && !force) {
    return scriptIndexPromise;
  }

  scriptIndexPromise = (async () => {
    try {
      const response = await api('GET', '/api/scripts/index', null, { action: 'load script index' });
      const scripts = normalizeScriptIndex(response);
      scriptIndexCache = scripts;
      scriptIndexLoaded = true;
      return scriptIndexCache;
    } catch (err) {
      scriptIndexCache = [];
      scriptIndexLoaded = false;
      handleApiError('load script index', err);
      return [];
    } finally {
      scriptIndexPromise = null;
    }
  })();

  return scriptIndexPromise;
}

async function renderEnqueuePage() {
  const container = pages.enqueue;
  if (!container) {
    return;
  }

  injectEnqueueStyles();

  container.innerHTML = `
    <div class="card">
      <div class="muted"><span class="loading"></span> Loading enqueue form…</div>
    </div>
  `;

  let streams = [];
  try {
    const response = await api('GET', '/api/streams', null, { action: 'load streams' });
    streams = response?.streams || [];
  } catch (err) {
    handleApiError('load streams for enqueue', err);
  }

  let scripts = [];
  try {
    scripts = await loadScriptIndex();
  } catch (err) {
    handleApiError('load script index', err);
  }

  const streamOptions = streams
    .map((stream) => {
      const label = stream.name && stream.name !== stream.id ? `${stream.name} (${stream.id})` : stream.name || stream.id;
      return `<option value="${stream.id}">${label}</option>`;
    })
    .join('');

  const taskClasses = ['FAST_SCRIPT', 'MEDIUM_SCRIPT', 'LLM_LITE', 'LLM_HEAVY'];

  container.innerHTML = `
    <div class="card">
      <h2>Enqueue Task</h2>

      <form id="enqueue-form" novalidate>
        <div class="grid grid-2">
          <div class="input-group">
            <label for="enqueue-stream">Stream</label>
            <input id="enqueue-stream" list="enqueue-stream-options" placeholder="Enter or choose a stream ID" required />
            <datalist id="enqueue-stream-options">
              ${streamOptions}
            </datalist>
          </div>
          <div class="input-group">
            <label for="enqueue-tool">Script</label>
            <div class="autocomplete-wrapper">
              <input id="enqueue-tool" type="text" autocomplete="off" placeholder="Start typing a script name" required />
              <div id="script-suggestions" class="autocomplete-list"></div>
            </div>
            <div id="script-helper" class="script-helper"></div>
          </div>
        </div>

        <div class="grid grid-2">
          <div class="input-group">
            <label for="enqueue-task-class">Task Class</label>
            <select id="enqueue-task-class" required>
              ${taskClasses.map((entry) => `<option value="${entry}">${entry}</option>`).join('')}
            </select>
          </div>
          <div class="input-group">
            <label for="enqueue-timeout">Timeout (seconds)</label>
            <input id="enqueue-timeout" type="number" min="1" step="1" placeholder="Optional" />
          </div>
        </div>

        <div class="grid grid-2">
          <div class="input-group">
            <label for="enqueue-prompt-path">Prompt Path (optional)</label>
            <input id="enqueue-prompt-path" type="text" placeholder="/path/to/prompt" />
          </div>
          <div class="input-group">
            <label for="enqueue-metadata">Metadata (JSON, optional)</label>
            <textarea id="enqueue-metadata" rows="3" placeholder='{"key":"value"}'></textarea>
          </div>
        </div>

        <div id="script-meta" class="script-meta muted">Select a script to view inputs, outputs, timeout, and task class.</div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px;">
          <button class="button primary" id="enqueue-submit" type="submit">Enqueue Task</button>
        </div>
      </form>
    </div>
  `;

  const form = container.querySelector('#enqueue-form');
  const toolInput = form.querySelector('#enqueue-tool');
  const suggestionsEl = form.querySelector('#script-suggestions');
  const helperEl = form.querySelector('#script-helper');
  const metaEl = form.querySelector('#script-meta');
  const timeoutInput = form.querySelector('#enqueue-timeout');
  const taskClassSelect = form.querySelector('#enqueue-task-class');
  const enqueueBtn = form.querySelector('#enqueue-submit');
  const streamInput = form.querySelector('#enqueue-stream');
  const promptInput = form.querySelector('#enqueue-prompt-path');
  const metadataInput = form.querySelector('#enqueue-metadata');

  let selectedScript = null;

  helperEl.textContent = scripts.length ? `${scripts.length} scripts available.` : 'No scripts loaded.';

  function buildTooltip(script) {
    if (!script) {
      return '';
    }
    const inputs = formatScriptField(script.inputs);
    const outputs = formatScriptField(script.outputs);
    return `Inputs: ${inputs || '—'} | Outputs: ${outputs || '—'}`;
  }

  function formatScriptField(value) {
    if (!value && value !== 0) {
      return '';
    }
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    return String(value);
  }

  function renderScriptMeta(script) {
    if (!script) {
      metaEl.textContent = 'Select a script to view inputs, outputs, timeout, and task class.';
      metaEl.classList.add('muted');
      metaEl.removeAttribute('title');
      return;
    }

    const inputs = formatScriptField(script.inputs) || '—';
    const outputs = formatScriptField(script.outputs) || '—';
    const timeout = script.timeout ? `${script.timeout}s` : '—';
    const taskClass = script.task_class || '—';
    const description = script.description || 'No description provided.';

    metaEl.classList.remove('muted');
    metaEl.title = buildTooltip(script);
    metaEl.innerHTML = `
      <h4>${script.name || 'Selected script'}</h4>
      <div class="muted" style="margin-bottom: 8px;">${description}</div>
      <div class="meta-grid">
        <div><strong>Inputs</strong><div>${inputs}</div></div>
        <div><strong>Outputs</strong><div>${outputs}</div></div>
        <div><strong>Timeout</strong><div>${timeout}</div></div>
        <div><strong>Task Class</strong><div>${taskClass}</div></div>
      </div>
    `;
  }

  function selectScript(script) {
    selectedScript = script;
    toolInput.value = script?.name || '';
    helperEl.textContent = script?.description || 'Script has no description.';
    helperEl.title = buildTooltip(script);

    if (script?.timeout && Number.isFinite(Number(script.timeout))) {
      timeoutInput.value = Number(script.timeout);
    }

    if (script?.task_class) {
      const optionExists = Array.from(taskClassSelect.options).some((opt) => opt.value === script.task_class);
      if (!optionExists) {
        const opt = document.createElement('option');
        opt.value = script.task_class;
        opt.textContent = script.task_class;
        taskClassSelect.appendChild(opt);
      }
      taskClassSelect.value = script.task_class;
    }

    renderScriptMeta(script);
    hideSuggestions();
  }

  function hideSuggestions() {
    suggestionsEl.style.display = 'none';
    suggestionsEl.innerHTML = '';
  }

  function renderSuggestions(list) {
    if (!list.length) {
      hideSuggestions();
      return;
    }

    suggestionsEl.innerHTML = list
      .slice(0, 10)
      .map(
        (entry) => `
          <div class="autocomplete-item" data-script-name="${encodeURIComponent(entry.name || '')}">
            <span class="autocomplete-item-title">${entry.name || 'Unnamed script'}</span>
            <span class="autocomplete-item-desc">${entry.description || 'No description'}</span>
          </div>
        `,
      )
      .join('');

    suggestionsEl.style.display = 'block';

    suggestionsEl.querySelectorAll('.autocomplete-item').forEach((item, index) => {
      item.addEventListener('click', () => {
        const script = list[index];
        selectScript(script);
      });
    });
  }

  function filterScripts(query) {
    const q = query.trim().toLowerCase();
    if (!q) {
      return scripts.slice(0, 10);
    }

    return scripts
      .filter((script) => {
        const name = String(script.name || '').toLowerCase();
        const description = String(script.description || '').toLowerCase();
        return name.includes(q) || description.includes(q);
      })
      .slice(0, 10);
  }

  function syncSelectionFromInput() {
    const value = toolInput.value.trim().toLowerCase();
    if (!value) {
      selectedScript = null;
      helperEl.textContent = scripts.length ? `${scripts.length} scripts available.` : 'No scripts loaded.';
      helperEl.removeAttribute('title');
      renderScriptMeta(null);
      return;
    }

    const match = scripts.find((entry) => String(entry.name || '').toLowerCase() === value);
    if (match) {
      selectScript(match);
    } else {
      selectedScript = null;
      helperEl.textContent = 'Custom script name will be used.';
      helperEl.removeAttribute('title');
      renderScriptMeta(null);
    }
  }

  toolInput.addEventListener('input', () => {
    const matches = filterScripts(toolInput.value);
    renderSuggestions(matches);
    syncSelectionFromInput();
  });

  toolInput.addEventListener('focus', () => {
    const matches = filterScripts(toolInput.value);
    renderSuggestions(matches);
  });

  toolInput.addEventListener('blur', () => {
    setTimeout(() => hideSuggestions(), 120);
  });

  attachValidationHandlers(form);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormErrors(form);
    const streamId = (streamInput?.value || '').trim();
    const toolName = (toolInput?.value || '').trim();
    const taskClass = (taskClassSelect?.value || '').trim();
    const timeoutVal = Number(timeoutInput?.value);
    const promptPath = (promptInput?.value || '').trim();
    const metadataRaw = (metadataInput?.value || '').trim();

    if (!validateRequiredFields(form)) {
      showError('Please fix the highlighted fields.');
      return;
    }

    let metadataParsed;
    if (metadataRaw) {
      try {
        metadataParsed = JSON.parse(metadataRaw);
      } catch (err) {
        markFieldError(metadataInput, 'Metadata must be valid JSON.');
        showError('Failed to enqueue task: Metadata must be valid JSON.', err);
        return;
      }
    }

    const payload = {
      stream_id: streamId,
      tool_name: toolName,
      task_class: taskClass,
    };

    if (Number.isFinite(timeoutVal) && timeoutVal > 0) {
      payload.timeout = timeoutVal;
    }
    if (promptPath) {
      payload.prompt_path = promptPath;
    }
    if (metadataParsed !== undefined) {
      payload.metadata = metadataParsed;
    }

    try {
      const response = await withButtonLoading(enqueueBtn, async () =>
        api('POST', '/api/tasks', payload, { action: 'enqueue task' }),
      );
      const taskId = response?.task?.id;
      const suffix = taskId ? ` as ${taskId}` : '';
      showSuccess(`Task enqueued${suffix}`);
      form.reset();
      selectedScript = null;
      renderScriptMeta(null);
      helperEl.textContent = scripts.length ? `${scripts.length} scripts available.` : 'No scripts loaded.';
    } catch (err) {
      handleApiError('enqueue task', err);
    }
  });

  if (pendingScriptSelection) {
    const match = scripts.find((entry) => String(entry.name || '') === String(pendingScriptSelection.name || ''));
    if (match) {
      selectScript(match);
    }
    pendingScriptSelection = null;
  }
}

Pages.Enqueue = { render: renderEnqueuePage };

async function renderSessionsPage() {
  const container = pages.sessions;
  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="muted"><span class="loading"></span> Loading sessions…</div>
    </div>
  `;

  let sessions = [];
  try {
    const response = await api('GET', '/api/sessions', null, { action: 'load sessions' });
    sessions = response?.sessions || [];
  } catch (err) {
    handleApiError('load sessions', err);
  }

  const rows = sessions
    .map((session) => `
      <tr>
        <td>${session.id}</td>
        <td>${session.name || '—'}</td>
        <td>${session.status || '—'}</td>
        <td>${formatValue(session.created_at, '—')}</td>
      </tr>
    `)
    .join('');

  const table = sessions.length
    ? `
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      `
    : `
        <div style="padding: 20px; text-align: center; background: rgba(0,0,0,0.05); border-radius: 4px;">
          <p class="muted">No sessions found.</p>
          <p class="muted" style="font-size: 13px; margin-top: 8px;">A project must be initialized before creating sessions.</p>
          <button class="button primary" id="setup-project-btn" style="margin-top: 12px;">Initialize Project</button>
        </div>
      `;

  container.innerHTML = `
    <div class="card">
      <h2>Sessions</h2>
      <div style="margin-bottom: 12px;">
        <button class="button primary" id="create-session-btn">Create Session</button>
      </div>
      ${table}
    </div>
  `;

  const createBtn = container.querySelector('#create-session-btn');
  if (createBtn) {
    createBtn.addEventListener('click', () => showProjectSetupModal());
  }

  // If no sessions, also show setup button in empty state
  const setupBtn = container.querySelector('#setup-project-btn');
  if (setupBtn) {
    setupBtn.addEventListener('click', () => showProjectSetupModal());
  }
}

async function showProjectSetupModal() {
  // Check if project exists
  try {
    const response = await api('GET', '/api/projects', null, { action: 'check projects' });
    if (response?.projects && response.projects.length > 0) {
      // Project exists, show session creation dialog
      handleCreateSession();
      return;
    }
  } catch (err) {
    // Project doesn't exist, proceed with setup
  }

  // Create setup modal
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <h2>Initialize Project</h2>
      <p class="muted">Before creating sessions, you need to initialize a project.</p>
      <form id="project-setup-form">
        <div class="input-group">
          <label for="setup-project-name">Project Name *</label>
          <input type="text" id="setup-project-name" placeholder="e.g., my-project" required />
        </div>
        <div class="input-group">
          <label for="setup-repo-path">Repository Path (optional)</label>
          <input type="text" id="setup-repo-path" placeholder="e.g., /path/to/repo" />
        </div>
        <div class="input-group">
          <label for="setup-prd-path">PRD File Path (optional)</label>
          <input type="text" id="setup-prd-path" placeholder="e.g., /path/to/prd.md" />
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px;">
          <button type="button" class="button secondary" id="setup-cancel-btn">Cancel</button>
          <button type="submit" class="button primary">Create Project</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  const form = modal.querySelector('#project-setup-form');
  const nameInput = modal.querySelector('#setup-project-name');
  const repoInput = modal.querySelector('#setup-repo-path');
  const prdInput = modal.querySelector('#setup-prd-path');
  const cancelBtn = modal.querySelector('#setup-cancel-btn');

  cancelBtn.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const projectName = nameInput.value.trim();
    if (!projectName) {
      showError('Project name is required');
      return;
    }

    try {
      await api(
        'POST',
        '/api/projects',
        {
          name: projectName,
          repo_path: repoInput.value.trim() || null,
          prd_path: prdInput.value.trim() || null,
        },
        { action: 'create project' }
      );
      showSuccess(`Project "${projectName}" created successfully`);
      modal.remove();
      renderSessionsPage();
    } catch (err) {
      handleApiError('create project', err);
    }
  });

  nameInput.focus();
}

async function handleCreateSession() {
  const sessionName = prompt('Enter session name:');
  if (!sessionName || !sessionName.trim()) {
    return;
  }

  try {
    await api('POST', '/api/sessions', { name: sessionName.trim() }, { action: 'create session' });
    showSuccess(`Session "${sessionName}" created`);
    renderSessionsPage();
  } catch (err) {
    const detail = err?.message || err || 'Unknown error';
    if (detail.includes('No project found')) {
      showError('No project found. Run "sparkq setup" first to initialize a project.');
    } else {
      handleApiError('create session', err);
    }
  }
}

// ===== PHASE 12: UNIFIED PROJECTS/SESSIONS/STREAMS PAGE =====

async function renderProjectsPage() {
  const container = pages.sessions;
  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="muted"><span class="loading"></span> Loading…</div>
    </div>
  `;

  let projects = [];
  let project = null;

  try {
    const response = await api('GET', '/api/projects', null, { action: 'load projects' });
    projects = response?.projects || [];
    project = projects.length > 0 ? projects[0] : null;
  } catch (err) {
    handleApiError('load projects', err);
  }

  const html = `
    <div class="projects-page">
      <div class="tabs-navigation">
        <button class="tab-btn active" data-tab="project">Project</button>
        <button class="tab-btn" data-tab="sessions">Sessions</button>
        <button class="tab-btn" data-tab="streams">Streams</button>
      </div>
      <div id="project-tab" class="tab-content active"></div>
      <div id="sessions-tab" class="tab-content"></div>
      <div id="streams-tab" class="tab-content"></div>
    </div>
  `;

  container.innerHTML = html;

  const tabBtns = container.querySelectorAll('.tab-btn');
  const tabContents = container.querySelectorAll('.tab-content');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const tabName = e.target.dataset.tab;
      tabBtns.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));
      e.target.classList.add('active');
      document.getElementById(`${tabName}-tab`).classList.add('active');

      if (tabName === 'project') {
        await renderProjectOverviewTab(project, container);
      } else if (tabName === 'sessions') {
        await renderSessionsTab(project, container);
      } else if (tabName === 'streams') {
        await renderStreamsTab(project, container);
      }
    });
  });

  await renderProjectOverviewTab(project, container);
}

async function renderProjectOverviewTab(project, container) {
  const tabContent = container.querySelector('#project-tab');

  if (!project) {
    tabContent.innerHTML = `
      <div class="card">
        <div style="padding: 20px; text-align: center;">
          <p class="muted">No project initialized.</p>
          <button class="button primary" id="init-project-btn" style="margin-top: 12px;">Initialize Project</button>
        </div>
      </div>
    `;
    tabContent.querySelector('#init-project-btn')?.addEventListener('click', () => showInitProjectModal());
    return;
  }

  let stats = { sessions: 0, streams: 0, tasks: 0 };
  try {
    const sessionsResp = await api('GET', '/api/sessions', null, { action: 'load sessions for stats' });
    const streamsResp = await api('GET', '/api/streams', null, { action: 'load streams for stats' });
    stats.sessions = sessionsResp?.sessions?.length || 0;
    stats.streams = streamsResp?.streams?.length || 0;
    const tasksResp = await api('GET', '/api/tasks?limit=1', null, { action: 'load task count' });
    stats.tasks = tasksResp?.total || 0;
  } catch (err) {
    console.error('Error loading stats:', err);
  }

  tabContent.innerHTML = `
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="margin: 0;">Project: ${project.name}</h2>
        <button class="button secondary" id="edit-project-btn">Edit</button>
      </div>

      <div style="background: rgba(74, 158, 255, 0.05); padding: 16px; border-radius: 8px; margin-bottom: 20px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
          <div>
            <div class="muted" style="font-size: 12px; margin-bottom: 4px;">Project ID</div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <code style="font-size: 13px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${project.id}</code>
              <button class="button secondary copy-btn" data-copy="${project.id}" title="Copy ID" style="padding: 4px 8px; font-size: 12px;">Copy</button>
            </div>
          </div>
          <div>
            <div class="muted" style="font-size: 12px; margin-bottom: 4px;">Repository</div>
            <div style="font-size: 13px; word-break: break-all;">${project.repo_path || '—'}</div>
          </div>
          <div>
            <div class="muted" style="font-size: 12px; margin-bottom: 4px;">PRD File</div>
            <div style="font-size: 13px; word-break: break-all;">${project.prd_path || '—'}</div>
          </div>
          <div>
            <div class="muted" style="font-size: 12px; margin-bottom: 4px;">Created</div>
            <div style="font-size: 13px;">${formatValue(project.created_at, '—')}</div>
          </div>
        </div>
      </div>

      <div style="background: rgba(0, 0, 0, 0.1); padding: 16px; border-radius: 8px; margin-bottom: 20px;">
        <h4 style="margin: 0 0 12px 0;">Activity Summary</h4>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; text-align: center;">
          <div style="cursor: pointer; padding: 8px; border-radius: 4px; transition: background 0.15s;" class="stat-link" data-tab="sessions">
            <div style="font-size: 24px; font-weight: bold; color: var(--accent);">${stats.sessions}</div>
            <div class="muted" style="font-size: 12px;">Active Sessions</div>
          </div>
          <div style="cursor: pointer; padding: 8px; border-radius: 4px; transition: background 0.15s;" class="stat-link" data-tab="streams">
            <div style="font-size: 24px; font-weight: bold; color: var(--accent);">${stats.streams}</div>
            <div class="muted" style="font-size: 12px;">Total Streams</div>
          </div>
          <div style="cursor: pointer; padding: 8px; border-radius: 4px; transition: background 0.15s;" class="stat-link">
            <div style="font-size: 24px; font-weight: bold; color: var(--accent);">${stats.tasks}</div>
            <div class="muted" style="font-size: 12px;">Queued Tasks</div>
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 10px;">
        <button class="button primary" id="create-session-from-project-btn">Create Session</button>
        <button class="button secondary" id="new-project-btn">New Project</button>
      </div>
    </div>
  `;

  tabContent.querySelector('#edit-project-btn')?.addEventListener('click', () => showEditProjectModal(project));
  tabContent.querySelector('#create-session-from-project-btn')?.addEventListener('click', () => showCreateSessionModal());
  tabContent.querySelector('#new-project-btn')?.addEventListener('click', () => showInitProjectModal());

  tabContent.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const text = btn.dataset.copy;
      navigator.clipboard.writeText(text).then(() => {
        showSuccess('Copied to clipboard');
        const originalText = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = originalText; }, 2000);
      });
    });
  });

  tabContent.querySelectorAll('.stat-link').forEach((link) => {
    link.addEventListener('click', () => {
      const tabName = link.dataset.tab;
      if (tabName) {
        const tabBtn = container.querySelector(`.tab-btn[data-tab="${tabName}"]`);
        tabBtn?.click();
      }
    });
    link.addEventListener('mouseenter', (e) => {
      e.target.style.background = 'rgba(74, 158, 255, 0.1)';
    });
    link.addEventListener('mouseleave', (e) => {
      e.target.style.background = '';
    });
  });
}

async function renderSessionsTab(project, container) {
  const tabContent = container.querySelector('#sessions-tab');
  tabContent.innerHTML = '<div class="card"><div class="muted"><span class="loading"></span> Loading sessions…</div></div>';

  if (!project) {
    tabContent.innerHTML = `
      <div class="card">
        <p class="muted">Initialize a project first to create sessions.</p>
      </div>
    `;
    return;
  }

  let sessions = [];
  try {
    const response = await api('GET', '/api/sessions', null, { action: 'load sessions' });
    sessions = response?.sessions || [];
  } catch (err) {
    handleApiError('load sessions', err);
  }

  const rows = sessions
    .map((session) => `
      <tr class="session-row" data-session-id="${session.id}" style="cursor: pointer;">
        <td><code style="font-size: 12px;">${session.id.substring(0, 12)}…</code></td>
        <td>${session.name || '—'}</td>
        <td><span class="badge badge-${session.status}">${session.status}</span></td>
        <td>${formatValue(session.created_at, '—')}</td>
        <td><button class="button secondary copy-btn" data-copy="${session.id}" style="padding: 4px 8px; font-size: 12px;" title="Copy session ID">Copy ID</button></td>
      </tr>
    `)
    .join('');

  const table = sessions.length
    ? `
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `
    : '<p class="muted">No sessions found. Create one to get started.</p>';

  tabContent.innerHTML = `
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="margin: 0;">Sessions</h3>
        <button class="button primary" id="create-session-btn">Create Session</button>
      </div>
      ${table}
    </div>
  `;

  tabContent.querySelector('#create-session-btn')?.addEventListener('click', () => showCreateSessionModal());

  tabContent.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = btn.dataset.copy;
      navigator.clipboard.writeText(text).then(() => {
        showSuccess('Copied to clipboard');
        const originalText = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = originalText; }, 2000);
      });
    });
  });

  tabContent.querySelectorAll('.session-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (!e.target.classList.contains('copy-btn') && !e.target.closest('.copy-btn')) {
        const sessionId = row.dataset.sessionId;
        showSessionDetailModal(sessionId);
      }
    });
  });
}

async function renderStreamsTab(project, container) {
  const tabContent = container.querySelector('#streams-tab');
  tabContent.innerHTML = '<div class="card"><div class="muted"><span class="loading"></span> Loading streams…</div></div>';

  if (!project) {
    tabContent.innerHTML = `
      <div class="card">
        <p class="muted">Initialize a project first.</p>
      </div>
    `;
    return;
  }

  let sessions = [];
  let streams = [];

  try {
    const sessionsResponse = await api('GET', '/api/sessions', null, { action: 'load sessions' });
    sessions = sessionsResponse?.sessions || [];
  } catch (err) {
    handleApiError('load sessions', err);
  }

  try {
    const streamsResponse = await api('GET', '/api/streams', null, { action: 'load streams' });
    streams = streamsResponse?.streams || [];
  } catch (err) {
    handleApiError('load streams', err);
  }

  const sessionsById = {};
  sessions.forEach((session) => {
    sessionsById[session.id] = session.name || session.id;
  });

  const rows = streams
    .map((stream) => `
      <tr class="stream-row" data-stream-id="${stream.id}" style="cursor: pointer;">
        <td><code style="font-size: 12px;">${stream.id.substring(0, 12)}…</code></td>
        <td>${sessionsById[stream.session_id] || '—'}</td>
        <td>${stream.name || '—'}</td>
        <td>${formatValue(stream.created_at, '—')}</td>
        <td><button class="button secondary copy-btn" data-copy="${stream.id}" style="padding: 4px 8px; font-size: 12px;" title="Copy stream ID">Copy ID</button></td>
      </tr>
    `)
    .join('');

  const sessionOptions = sessions
    .map((s) => `<option value="${s.id}">${s.name || s.id}</option>`)
    .join('');

  const table = streams.length
    ? `
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Session</th>
            <th>Name</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `
    : '<p class="muted">No streams found.</p>';

  tabContent.innerHTML = `
    <div class="card">
      <div style="margin-bottom: 16px;">
        <label for="stream-session-filter">Filter by Session:</label>
        <select id="stream-session-filter" style="margin-top: 4px; padding: 6px;">
          <option value="">All Sessions</option>
          ${sessionOptions}
        </select>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="margin: 0;">Streams</h3>
        <button class="button primary" id="create-stream-btn" ${sessions.length === 0 ? 'disabled' : ''}>Create Stream</button>
      </div>
      ${table}
    </div>
  `;

  tabContent.querySelector('#create-stream-btn')?.addEventListener('click', () => {
    const sessionId = tabContent.querySelector('#stream-session-filter')?.value;
    if (sessionId) {
      showCreateStreamModal(sessionId);
    } else {
      showError('Please select a session first');
    }
  });

  tabContent.querySelector('#stream-session-filter')?.addEventListener('change', () => {
    renderStreamsTab(project, container);
  });

  tabContent.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = btn.dataset.copy;
      navigator.clipboard.writeText(text).then(() => {
        showSuccess('Copied to clipboard');
        const originalText = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = originalText; }, 2000);
      });
    });
  });

  tabContent.querySelectorAll('.stream-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (!e.target.classList.contains('copy-btn') && !e.target.closest('.copy-btn')) {
        const streamId = row.dataset.streamId;
        showStreamDetailModal(streamId);
      }
    });
  });
}

async function showInitProjectModal() {
  const existing = document.getElementById('init-project-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'init-project-modal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="margin: 0;">Initialize Project</h2>
        <button class="button secondary" style="padding: 4px 8px;" data-action="close">✕</button>
      </div>
      <form id="init-project-form">
        <div class="input-group">
          <label for="init-project-name">Project Name *</label>
          <input type="text" id="init-project-name" placeholder="e.g., my-project" required autofocus />
        </div>
        <div class="input-group">
          <label for="init-repo-path">Repository Path (optional)</label>
          <input type="text" id="init-repo-path" placeholder="e.g., /path/to/repo" />
        </div>
        <div class="input-group">
          <label for="init-prd-path">PRD File Path (optional)</label>
          <input type="text" id="init-prd-path" placeholder="e.g., /path/to/prd.md" />
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px;">
          <button type="button" class="button secondary" data-action="cancel">Cancel</button>
          <button type="submit" class="button primary">Create Project</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  const form = modal.querySelector('#init-project-form');
  modal.querySelector('[data-action="close"]')?.addEventListener('click', () => modal.remove());
  modal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = modal.querySelector('#init-project-name').value.trim();
    if (!name) {
      showError('Project name is required');
      return;
    }

    try {
      await api('POST', '/api/projects', {
        name,
        repo_path: modal.querySelector('#init-repo-path').value.trim() || null,
        prd_path: modal.querySelector('#init-prd-path').value.trim() || null,
      }, { action: 'create project' });
      showSuccess(`Project "${name}" created`);
      modal.remove();
      renderProjectsPage();
    } catch (err) {
      handleApiError('create project', err);
    }
  });
}

async function showEditProjectModal(project) {
  const existing = document.getElementById('edit-project-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'edit-project-modal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="margin: 0;">Edit Project</h2>
        <button class="button secondary" style="padding: 4px 8px;" data-action="close">✕</button>
      </div>
      <form id="edit-project-form">
        <div class="input-group">
          <label for="edit-project-name">Project Name *</label>
          <input type="text" id="edit-project-name" value="${project.name}" required autofocus />
        </div>
        <div class="input-group">
          <label for="edit-repo-path">Repository Path (optional)</label>
          <input type="text" id="edit-repo-path" value="${project.repo_path || ''}" />
        </div>
        <div class="input-group">
          <label for="edit-prd-path">PRD File Path (optional)</label>
          <input type="text" id="edit-prd-path" value="${project.prd_path || ''}" />
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px;">
          <button type="button" class="button secondary" data-action="cancel">Cancel</button>
          <button type="submit" class="button primary">Save Changes</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  const form = modal.querySelector('#edit-project-form');
  modal.querySelector('[data-action="close"]')?.addEventListener('click', () => modal.remove());
  modal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = modal.querySelector('#edit-project-name').value.trim();
    if (!name) {
      showError('Project name is required');
      return;
    }

    try {
      await api('PUT', `/api/projects/${project.id}`, {
        name,
        repo_path: modal.querySelector('#edit-repo-path').value.trim() || null,
        prd_path: modal.querySelector('#edit-prd-path').value.trim() || null,
      }, { action: 'update project' });
      showSuccess(`Project updated`);
      modal.remove();
      renderProjectsPage();
    } catch (err) {
      handleApiError('update project', err);
    }
  });
}

async function showCreateSessionModal() {
  const existing = document.getElementById('create-session-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'create-session-modal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="margin: 0;">Create Session</h2>
        <button class="button secondary" style="padding: 4px 8px;" data-action="close">✕</button>
      </div>
      <form id="create-session-form">
        <div class="input-group">
          <label for="session-name">Session Name *</label>
          <input type="text" id="session-name" placeholder="e.g., inference-run-2024" required autofocus />
        </div>
        <div class="input-group">
          <label for="session-desc">Description (optional)</label>
          <textarea id="session-desc" placeholder="e.g., GPT-4 benchmark test" style="resize: vertical; min-height: 60px;"></textarea>
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px;">
          <button type="button" class="button secondary" data-action="cancel">Cancel</button>
          <button type="submit" class="button primary">Create Session</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  const form = modal.querySelector('#create-session-form');
  modal.querySelector('[data-action="close"]')?.addEventListener('click', () => modal.remove());
  modal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = modal.querySelector('#session-name').value.trim();
    if (!name) {
      showError('Session name is required');
      return;
    }

    try {
      await api('POST', '/api/sessions', { name }, { action: 'create session' });
      showSuccess(`Session "${name}" created`);
      modal.remove();
      renderProjectsPage();
    } catch (err) {
      handleApiError('create session', err);
    }
  });
}

async function showSessionDetailModal(sessionId) {
  const existing = document.getElementById('session-detail-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'session-detail-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="muted"><span class="loading"></span> Loading…</div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  let session, streams = [];
  try {
    const sessResp = await api('GET', `/api/sessions/${sessionId}`, null, { action: 'load session' });
    session = sessResp?.session;
    const streamsResp = await api('GET', '/api/streams', null, { action: 'load streams' });
    streams = (streamsResp?.streams || []).filter((s) => s.session_id === sessionId);
  } catch (err) {
    handleApiError('load session', err);
    modal.remove();
    return;
  }

  const streamsList = streams.map((s) => `<li>${s.name || s.id}</li>`).join('');

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="margin: 0;">Session Details</h2>
        <button class="button secondary" style="padding: 4px 8px;" data-action="close">✕</button>
      </div>

      <div style="background: rgba(0, 0, 0, 0.1); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <div class="muted" style="font-size: 12px;">ID</div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <code style="font-size: 12px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${session.id}</code>
              <button class="button secondary copy-btn" data-copy="${session.id}" style="padding: 4px 8px; font-size: 12px;">Copy</button>
            </div>
          </div>
          <div>
            <div class="muted" style="font-size: 12px;">Name</div>
            <div>${session.name || '—'}</div>
          </div>
          <div>
            <div class="muted" style="font-size: 12px;">Status</div>
            <div><span class="badge badge-${session.status}">${session.status}</span></div>
          </div>
          <div>
            <div class="muted" style="font-size: 12px;">Created</div>
            <div>${formatValue(session.created_at, '—')}</div>
          </div>
        </div>
      </div>

      ${streams.length > 0 ? `
        <div style="margin-bottom: 16px;">
          <h4 style="margin: 0 0 8px 0;">Streams (${streams.length})</h4>
          <ul style="margin: 0; padding-left: 20px;">${streamsList}</ul>
        </div>
      ` : ''}

      <div style="display: flex; gap: 10px;">
        <button class="button primary" id="create-stream-in-session-btn">Create Stream</button>
        <button class="button secondary" id="close-session-btn">Close Session</button>
        <button class="button secondary" id="delete-session-btn" style="margin-left: auto;">Delete</button>
        <button class="button secondary" data-action="close">Close</button>
      </div>
    </div>
  `;

  modal.querySelector('[data-action="close"]')?.addEventListener('click', () => modal.remove());
  modal.querySelector('#create-stream-in-session-btn')?.addEventListener('click', () => {
    modal.remove();
    showCreateStreamModal(sessionId);
  });

  modal.querySelector('#close-session-btn')?.addEventListener('click', async () => {
    if (confirm('Close this session?')) {
      try {
        await api('PUT', `/api/sessions/${sessionId}/end`, {}, { action: 'close session' });
        showSuccess('Session closed');
        modal.remove();
        renderProjectsPage();
      } catch (err) {
        handleApiError('close session', err);
      }
    }
  });

  modal.querySelector('#delete-session-btn')?.addEventListener('click', async () => {
    if (confirm('Delete this session? This action cannot be undone.')) {
      try {
        await api('PUT', `/api/sessions/${sessionId}/end`, null, { action: 'delete session' });
        showSuccess('Session deleted');
        modal.remove();
        renderProjectsPage();
      } catch (err) {
        handleApiError('delete session', err);
      }
    }
  });

  modal.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = btn.dataset.copy;
      navigator.clipboard.writeText(text).then(() => {
        showSuccess('Copied to clipboard');
        const originalText = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = originalText; }, 2000);
      });
    });
  });
}

async function showCreateStreamModal(sessionId) {
  const existing = document.getElementById('create-stream-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'create-stream-modal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="margin: 0;">Create Stream</h2>
        <button class="button secondary" style="padding: 4px 8px;" data-action="close">✕</button>
      </div>
      <form id="create-stream-form">
        <div class="input-group">
          <label for="stream-name">Stream Name *</label>
          <input type="text" id="stream-name" placeholder="e.g., inference-batch-1" required autofocus />
        </div>
        <div class="input-group">
          <label for="stream-instructions">Instructions (optional)</label>
          <textarea id="stream-instructions" placeholder="e.g., Process images with GPT-4 vision" style="resize: vertical; min-height: 80px;"></textarea>
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px;">
          <button type="button" class="button secondary" data-action="cancel">Cancel</button>
          <button type="submit" class="button primary">Create Stream</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  const form = modal.querySelector('#create-stream-form');
  modal.querySelector('[data-action="close"]')?.addEventListener('click', () => modal.remove());
  modal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = modal.querySelector('#stream-name').value.trim();
    if (!name) {
      showError('Stream name is required');
      return;
    }

    try {
      await api('POST', '/api/streams', {
        session_id: sessionId,
        name,
        instructions: modal.querySelector('#stream-instructions').value.trim() || null,
      }, { action: 'create stream' });
      showSuccess(`Stream "${name}" created`);
      modal.remove();
      renderProjectsPage();
    } catch (err) {
      handleApiError('create stream', err);
    }
  });
}

async function showStreamDetailModal(streamId) {
  const existing = document.getElementById('stream-detail-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'stream-detail-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="muted"><span class="loading"></span> Loading…</div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  let stream, session;
  try {
    const streamResp = await api('GET', `/api/streams/${streamId}`, null, { action: 'load stream' });
    stream = streamResp?.stream;
    const sessResp = await api('GET', `/api/sessions/${stream.session_id}`, null, { action: 'load session' });
    session = sessResp?.session;
  } catch (err) {
    handleApiError('load stream', err);
    modal.remove();
    return;
  }

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="margin: 0;">Stream Details</h2>
        <button class="button secondary" style="padding: 4px 8px;" data-action="close">✕</button>
      </div>

      <div style="background: rgba(0, 0, 0, 0.1); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <div class="muted" style="font-size: 12px;">ID</div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <code style="font-size: 12px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${stream.id}</code>
              <button class="button secondary copy-btn" data-copy="${stream.id}" style="padding: 4px 8px; font-size: 12px;">Copy</button>
            </div>
          </div>
          <div>
            <div class="muted" style="font-size: 12px;">Name</div>
            <div>${stream.name || '—'}</div>
          </div>
          <div>
            <div class="muted" style="font-size: 12px;">Session</div>
            <div>${session?.name || '—'}</div>
          </div>
          <div>
            <div class="muted" style="font-size: 12px;">Status</div>
            <div><span class="badge badge-${stream.status}">${stream.status}</span></div>
          </div>
        </div>
        ${stream.instructions ? `<div><strong>Instructions:</strong> ${stream.instructions}</div>` : ''}
      </div>

      <div style="display: flex; gap: 10px;">
        <button class="button primary" id="view-stream-tasks-btn">View Tasks</button>
        <button class="button secondary" id="delete-stream-btn">Delete</button>
        <button class="button secondary" data-action="close">Close</button>
      </div>
    </div>
  `;

  modal.querySelector('[data-action="close"]')?.addEventListener('click', () => modal.remove());

  modal.querySelector('#view-stream-tasks-btn')?.addEventListener('click', () => {
    modal.remove();
    const navBtn = document.querySelector('.nav-tab[data-page="tasks"]');
    if (navBtn) {
      navBtn.click();
      taskFilters.streamId = streamId;
      renderTasksPage();
    }
  });

  modal.querySelector('#delete-stream-btn')?.addEventListener('click', async () => {
    if (confirm('Delete this stream? This action cannot be undone.')) {
      try {
        await api('PUT', `/api/streams/${streamId}/end`, null, { action: 'delete stream' });
        showSuccess('Stream deleted');
        modal.remove();
        renderProjectsPage();
      } catch (err) {
        handleApiError('delete stream', err);
      }
    }
  });

  modal.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = btn.dataset.copy;
      navigator.clipboard.writeText(text).then(() => {
        showSuccess('Copied to clipboard');
        const originalText = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = originalText; }, 2000);
      });
    });
  });
}

Pages.Sessions = { render: renderProjectsPage };

async function renderStreamsPage() {
  const container = pages.streams;
  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="muted"><span class="loading"></span> Loading streams…</div>
    </div>
  `;

  let sessions = [];
  let streams = [];

  try {
    const sessionsResponse = await api('GET', '/api/sessions', null, { action: 'load sessions' });
    sessions = sessionsResponse?.sessions || [];
  } catch (err) {
    handleApiError('load sessions', err);
  }

  try {
    const streamsResponse = await api('GET', '/api/streams', null, { action: 'load streams' });
    streams = streamsResponse?.streams || [];
  } catch (err) {
    handleApiError('load streams', err);
  }

  const sessionsById = {};
  sessions.forEach((session) => {
    sessionsById[session.id] = session.name || session.id;
  });

  const rows = streams
    .map((stream) => `
      <tr>
        <td>${stream.id}</td>
        <td>${stream.name || '—'}</td>
        <td>${sessionsById[stream.session_id] || stream.session_id || '—'}</td>
        <td>${stream.status || '—'}</td>
        <td>${formatValue(stream.created_at, '—')}</td>
      </tr>
    `)
    .join('');

  const table = streams.length
    ? `
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Session</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      `
    : `<p class="muted">No streams found.</p>`;

  container.innerHTML = `
    <div class="card">
      <h2>Streams</h2>
      <div style="margin-bottom: 12px;">
        <button class="button primary" id="create-stream-btn">Create Stream</button>
      </div>
      ${table}
    </div>
  `;

  const createBtn = container.querySelector('#create-stream-btn');
  if (createBtn) {
    createBtn.addEventListener('click', () => handleCreateStream(container, sessions));
  }
}

async function handleCreateStream(container, sessions) {
  if (!sessions.length) {
    return;
  }

  const streamName = prompt('Enter stream name:');
  if (!streamName || !streamName.trim()) {
    return;
  }

  const sessionOptions = sessions.map((s) => `${s.id}: ${s.name || 'Unnamed'}`).join('\n');
  const sessionId = prompt(`Select session ID:\n\n${sessionOptions}`);
  if (!sessionId || !sessionId.trim()) {
    return;
  }

  const instructions = prompt('Enter stream instructions (optional):') || null;

  try {
    const payload = {
      session_id: sessionId.trim(),
      name: streamName.trim(),
    };
    if (instructions) {
      payload.instructions = instructions;
    }
    await api('POST', '/api/streams', payload, { action: 'create stream' });
    showSuccess(`Stream "${streamName}" created`);
    renderStreamsPage();
  } catch (err) {
    handleApiError('create stream', err);
  }
}

Pages.Streams = { render: renderStreamsPage };

async function renderConfigPage() {
  const container = pages.config;
  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="muted"><span class="loading"></span> Loading configuration…</div>
    </div>
  `;

  let config = null;
  try {
    config = await api('GET', '/api/config', null, { action: 'load configuration' });
  } catch (err) {
    container.innerHTML = `
      <div class="card">
        <div class="muted">Unable to load configuration.</div>
      </div>
    `;
    showError(`Failed to load configuration: ${err.message || err}`, err);
    return;
  }

  const server = config?.server || {};
  const database = config?.database || {};
  const purge = config?.purge || {};
  const tools = config?.tools || {};
  const taskClasses = config?.task_classes || {};

  const toolEntries = Object.entries(tools);
  const toolRows = toolEntries
    .map(
      ([name, detail]) => `
        <tr>
          <td>${formatValue(name, '—')}</td>
          <td>${formatValue(detail?.description, '—')}</td>
          <td>${formatValue(detail?.task_class, '—')}</td>
        </tr>
      `,
    )
    .join('');
  const toolsTable = toolEntries.length
    ? `
        <table class="table">
          <thead>
            <tr>
              <th>Tool Name</th>
              <th>Description</th>
              <th>Task Class</th>
            </tr>
          </thead>
          <tbody>
            ${toolRows}
          </tbody>
        </table>
      `
    : `<p class="muted">No tools configured.</p>`;

  const taskClassEntries = Object.entries(taskClasses);
  const taskClassRows = taskClassEntries
    .map(
      ([name, detail]) => `
        <tr>
          <td>${formatValue(name, '—')}</td>
          <td>${formatValue(detail?.timeout, '—')}</td>
        </tr>
      `,
    )
    .join('');
  const taskClassTable = taskClassEntries.length
    ? `
        <table class="table">
          <thead>
            <tr>
              <th>Class Name</th>
              <th>Timeout</th>
            </tr>
          </thead>
          <tbody>
            ${taskClassRows}
          </tbody>
        </table>
      `
    : `<p class="muted">No task classes configured.</p>`;

  container.innerHTML = `
    <div class="grid grid-2">
      <div class="card">
        <h2>Server</h2>
        <p><strong>Host:</strong> ${formatValue(server.host, '—')}</p>
        <p><strong>Port:</strong> ${formatValue(server.port, '—')}</p>
      </div>
      <div class="card">
        <h2>Database</h2>
        <p><strong>Path:</strong> ${formatValue(database.path, '—')}</p>
        <p><strong>Mode:</strong> ${formatValue(database.mode, '—')}</p>
      </div>
    </div>
    <div class="card">
      <h2>Purge</h2>
      <p><strong>Older Than Days:</strong> ${formatValue(purge.older_than_days, '—')}</p>
    </div>
    <div class="card">
      <h2>Tools</h2>
      ${toolsTable}
    </div>
    <div class="card">
      <h2>Task Classes</h2>
      ${taskClassTable}
    </div>
  `;
}

Pages.Config = { render: renderConfigPage };

async function renderScriptsPage() {
  const container = pages.scripts;
  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="muted"><span class="loading"></span> Loading scripts…</div>
    </div>
  `;

  let scripts = [];
  try {
    scripts = await loadScriptIndex();
  } catch (err) {
    scripts = [];
  }

  if (!Array.isArray(scripts) || !scripts.length) {
    container.innerHTML = `
      <div class="card">
        <h2>Scripts</h2>
        <p class="muted">No scripts loaded.</p>
      </div>
    `;
    return;
  }

  const taskClassOptions = Array.from(
    new Set(
      scripts
        .map((entry) => entry.task_class)
        .filter((value) => value !== undefined && value !== null && value !== ''),
    ),
  ).sort();

  container.innerHTML = `
    <div class="card">
      <h2>Scripts</h2>
      <div class="grid grid-2">
        <div class="input-group">
          <label for="scripts-search">Search</label>
          <input id="scripts-search" type="text" placeholder="Search by name or description" />
        </div>
        <div class="input-group">
          <label for="scripts-task-class">Task Class</label>
          <select id="scripts-task-class">
            <option value="">All task classes</option>
            ${taskClassOptions.map((value) => `<option value="${value}">${value}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="scripts-count" class="muted" style="margin-top: 6px;">Found ${scripts.length} scripts</div>
      <div id="scripts-results" style="margin-top: 12px;"></div>
    </div>
  `;

  const searchInput = container.querySelector('#scripts-search');
  const taskClassSelect = container.querySelector('#scripts-task-class');
  const resultsEl = container.querySelector('#scripts-results');
  const countEl = container.querySelector('#scripts-count');

  function formatScriptField(value) {
    if (!value && value !== 0) {
      return '';
    }
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    return String(value);
  }

  function renderTable(list) {
    if (!list.length) {
      resultsEl.innerHTML = `<p class="muted">No scripts match your filters.</p>`;
      return;
    }

    const rows = list
      .map(
        (script, index) => `
          <tr>
            <td><a href="#enqueue" class="link" data-script-index="${index}">${formatValue(script.name, 'Unnamed script')}</a></td>
            <td>${formatValue(script.description, '—')}</td>
            <td>${script.timeout ? `${script.timeout}s` : '—'}</td>
            <td>${formatValue(script.task_class, '—')}</td>
            <td>${formatScriptField(script.inputs) || '—'}</td>
            <td>${formatScriptField(script.outputs) || '—'}</td>
          </tr>
        `,
      )
      .join('');

    resultsEl.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Timeout</th>
            <th>Task Class</th>
            <th>Inputs</th>
            <th>Outputs</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;

    resultsEl.querySelectorAll('[data-script-index]').forEach((link) => {
      const idx = Number(link.dataset.scriptIndex);
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const script = list[idx];
        if (script) {
          pendingScriptSelection = script;
        }
        window.location.hash = '#enqueue';
      });
    });
  }

  function applyFilters() {
    const query = (searchInput?.value || '').trim().toLowerCase();
    const taskClass = (taskClassSelect?.value || '').trim();
    const filtered = scripts.filter((script) => {
      const name = String(script.name || '').toLowerCase();
      const description = String(script.description || '').toLowerCase();
      const matchesQuery = !query || name.includes(query) || description.includes(query);
      const matchesClass = !taskClass || String(script.task_class || '') === taskClass;
      return matchesQuery && matchesClass;
    });

    countEl.textContent = `Found ${filtered.length} scripts`;
    renderTable(filtered);
  }

  searchInput?.addEventListener('input', applyFilters);
  taskClassSelect?.addEventListener('change', applyFilters);

  applyFilters();
}

Pages.Scripts = { render: renderScriptsPage };

// ===== MAIN APP =====

function cachePages() {
  pages.dashboard = document.getElementById('dashboard-page');
  pages.sessions = document.getElementById('sessions-page');
  pages.streams = document.getElementById('streams-page');
  pages.tasks = document.getElementById('tasks-page');
  pages.enqueue = document.getElementById('enqueue-page');
  pages.config = document.getElementById('config-page');
  pages.scripts = document.getElementById('scripts-page');
}

function setupNavTabs() {
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.page;
      window.location.hash = `#${target}`;
    });
  });
}

function router() {
  const target = (window.location.hash || '#dashboard').replace('#', '') || 'dashboard';
  const page = pages[target] ? target : 'dashboard';
  currentPage = page;

  Object.entries(pages).forEach(([name, el]) => {
    if (!el) {
      return;
    }
    el.classList.toggle('active', name === page);
  });

  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.page === page);
  });

  if (page === 'dashboard') {
    loadDashboard();
  } else if (page === 'tasks') {
    renderTasksPage();
  } else if (page === 'enqueue' && typeof renderEnqueuePage === 'function') {
    renderEnqueuePage();
  } else if (page === 'sessions' && typeof renderSessionsPage === 'function') {
    renderSessionsPage();
  } else if (page === 'streams' && typeof renderStreamsPage === 'function') {
    renderStreamsPage();
  } else if (page === 'config' && typeof renderConfigPage === 'function') {
    renderConfigPage();
  } else if (page === 'scripts' && typeof renderScriptsPage === 'function') {
    renderScriptsPage();
  }
}

function startStatusPolling() {
  if (statusTimer) {
    clearInterval(statusTimer);
  }
  refreshStatus();
  statusTimer = setInterval(refreshStatus, REFRESH_MS);
}

function startDashboardPolling() {
  if (dashboardTimer) {
    clearInterval(dashboardTimer);
  }
  dashboardTimer = setInterval(() => {
    if (currentPage === 'dashboard') {
      loadDashboard();
    }
  }, REFRESH_MS);
}

async function refreshStatus() {
  try {
    const health = await api('GET', '/health', null, { action: 'refresh status' });
    const status = normalizeStatus(health);
    setStatusIndicator(status, health);
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

    // Escape: Close modals
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal').forEach((modal) => {
        if (modal && modal.parentNode) {
          modal.remove();
        }
      });
    }

    // Ctrl+K: Focus search (if available)
    if (e.ctrlKey && e.key === 'k') {
      e.preventDefault();
      const searchInput = document.querySelector('[data-search]') || document.querySelector('input[type="search"]');
      if (searchInput) {
        searchInput.focus();
      }
    }

    // Ctrl+Shift+T: Navigate to Tasks page
    if (e.ctrlKey && e.shiftKey && e.key === 'T') {
      e.preventDefault();
      window.location.hash = '#tasks';
    }

    // Ctrl+Shift+E: Navigate to Enqueue page
    if (e.ctrlKey && e.shiftKey && e.key === 'E') {
      e.preventDefault();
      window.location.hash = '#enqueue';
    }

    // Ctrl+Shift+D: Navigate to Dashboard
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      window.location.hash = '#dashboard';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  cachePages();
  setupNavTabs();
  injectStaleStyles();
  setupKeyboardShortcuts();
  loadScriptIndex().catch(() => {});

  // Setup theme toggle button (Phase 10)
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      toggleTheme();
      updateThemeButtonIcon();
    });
    updateThemeButtonIcon();
  }

  window.addEventListener('hashchange', router);
  router();
  startStatusPolling();
  startDashboardPolling();
});

function updateThemeButtonIcon() {
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.textContent = isDark ? '☀️' : '🌙';
  }
}
