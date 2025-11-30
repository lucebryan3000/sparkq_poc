(function(Pages, API, Utils) {
  'use strict';

  const api = API.api;
  const formatValue = Utils.formatValue;
  const normalizeScriptIndex = Utils.normalizeScriptIndex;

  let scriptIndexCache = [];
  let scriptIndexLoaded = false;
  let scriptIndexPromise = null;
  let pendingScriptSelection = null;

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
        Utils.handleApiError('load script index', err);
        return [];
      } finally {
        scriptIndexPromise = null;
      }
    })();

    return scriptIndexPromise;
  }

  async function renderScriptsPage(container) {
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

  Pages.Scripts = {
    async render(container) {
      await renderScriptsPage(container);
    }
  };

})(window.Pages, window.API, window.Utils);
