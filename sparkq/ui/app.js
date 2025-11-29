'use strict';

const API_BASE = 'http://127.0.0.1:8420/api';
const REFRESH_MS = 10000;

const pages = {};
let currentPage = 'dashboard';
let dashboardTimer;
let statusTimer;

document.addEventListener('DOMContentLoaded', () => {
  cachePages();
  setupNavTabs();
  window.addEventListener('hashchange', router);
  router();
  startStatusPolling();
  startDashboardPolling();
});

function cachePages() {
  pages.dashboard = document.getElementById('dashboard-page');
  pages.sessions = document.getElementById('sessions-page');
  pages.streams = document.getElementById('streams-page');
  pages.tasks = document.getElementById('tasks-page');
  pages.enqueue = document.getElementById('enqueue-page');
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
    const health = await api('GET', '/health');
    const status = normalizeStatus(health);
    setStatusIndicator(status, health);
  } catch (err) {
    setStatusIndicator('error');
  }
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

  const [health, stats] = await Promise.all([
    api('GET', '/health').catch(() => null),
    api('GET', '/stats').catch(() => null),
  ]);

  if (health) {
    setStatusIndicator(normalizeStatus(health), health);
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

function statCard(label, value) {
  return `
    <div class="stat-card">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${formatNumber(value)}</div>
    </div>
  `;
}

async function api(method, path, body = null) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers = { Accept: 'application/json' };
  const options = { method, headers };

  if (body !== null) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, options);
  } catch (err) {
    showAlert('Unable to reach SparkQ server.', 'error');
    throw err;
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await safeJson(response) : null;

  if (!response.ok) {
    const message = data?.message || data?.error || `Request failed (${response.status})`;
    showAlert(message, 'error');
    throw new Error(message);
  }

  return data;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (err) {
    return null;
  }
}

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

function showAlert(message, type = 'error', duration = 4200) {
  if (!message) {
    return;
  }
  const host = ensureAlertHost();
  const el = document.createElement('div');
  el.className = `alert ${type}`;
  el.textContent = message;
  host.appendChild(el);

  setTimeout(() => {
    el.remove();
  }, duration);
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
