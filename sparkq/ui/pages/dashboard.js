(function(Pages, API, Utils) {
  'use strict';

  const api = API.api;
  const formatNumber = Utils.formatNumber;
  const formatValue = Utils.formatValue;
  const normalizeStatus = Utils.normalizeStatus;
  const formatStatusLabel = Utils.formatStatusLabel;
  const pickStat = Utils.pickStat;
  const setStatusIndicator = Utils.setStatusIndicator;
  const showError = Utils.showError;

  let statusErrorNotified = false;

  function statCard(label, value) {
    return `
      <div class="stat-card">
        <div class="stat-label">${label}</div>
        <div class="stat-value">${formatNumber(value)}</div>
      </div>
    `;
  }

  async function loadDashboard(container) {
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

  Pages.Dashboard = {
    async render(container) {
      await loadDashboard(container);
    }
  };

})(window.Pages, window.API, window.Utils);
