(function(Pages, API, Utils) {
  'use strict';

  const api = API.api;
  const formatValue = Utils.formatValue;
  const showError = Utils.showError;

  async function renderConfigPage(container) {
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

  Pages.Config = {
    async render(container) {
      await renderConfigPage(container);
    }
  };

})(window.Pages, window.API, window.Utils);
