(function(Pages, API, Utils) {
  'use strict';

  const api = API.api;
  const formatValue = Utils.formatValue;
  const normalizeScriptIndex = Utils.normalizeScriptIndex;
  const setPendingSelection = Utils.setPendingScriptSelection || ((script) => { pendingScriptSelection = script; });
  const navigateTo = Utils.navigateTo;

  let scriptIndexCache = [];
  let scriptIndexLoaded = false;
  let scriptIndexPromise = null;
  let pendingScriptSelection = null;
  let containerRef = null;

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

    containerRef = container;
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

    scriptIndexCache = scripts;
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
            <input id="scripts-search" data-action="scripts-search" type="text" placeholder="Search by name or description" class="form-control" />
          </div>
          <div class="input-group">
            <label for="scripts-task-class">Task Class</label>
            <select id="scripts-task-class" data-action="scripts-task-class" class="form-control form-select">
              <option value="">All task classes</option>
              ${taskClassOptions.map((value) => `<option value="${value}">${value}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="scripts-count" class="muted" style="margin-top: 6px;">Found ${scripts.length} scripts</div>
        <div id="scripts-results" style="margin-top: 12px;"></div>
      </div>
    `;

    applyFiltersInContainer(container);
  }

  Pages.Scripts = {
    async render(container) {
      await renderScriptsPage(container);
    }
  };

  function registerScriptsActions() {
    const register = (window.Actions && window.Actions.registerAction) || Utils.registerAction || window.registerAction;
    if (typeof register !== 'function') {
      console.warn('[Scripts] Action registry not available; scripts actions not registered.');
      return;
    }

    register('scripts-open', (el) => {
      const idx = Number(el?.dataset?.scriptIndex);
      if (Number.isNaN(idx)) return;
      const scripts = scriptIndexCache || [];
      const script = scripts[idx];
      if (script) {
        setPendingSelection(script);
      }
      if (navigateTo) {
        navigateTo('dashboard');
      } else {
        window.location.href = '/dashboard';
      }
    });

    register('scripts-search', () => {
      if (containerRef) {
        applyFiltersInContainer(containerRef);
      }
    });

    register('scripts-task-class', () => {
      if (containerRef) {
        applyFiltersInContainer(containerRef);
      }
    });
  }

  function applyFiltersInContainer(container) {
    const searchInput = container.querySelector('#scripts-search');
    const taskClassSelect = container.querySelector('#scripts-task-class');
    const resultsEl = container.querySelector('#scripts-results');
    const countEl = container.querySelector('#scripts-count');
    const scripts = scriptIndexCache || [];

    const query = (searchInput?.value || '').trim().toLowerCase();
    const taskClass = (taskClassSelect?.value || '').trim();
    const filtered = scripts.filter((script) => {
      const name = String(script.name || '').toLowerCase();
      const description = String(script.description || '').toLowerCase();
      const matchesQuery = !query || name.includes(query) || description.includes(query);
      const matchesClass = !taskClass || String(script.task_class || '') === taskClass;
      return matchesQuery && matchesClass;
    });

    if (countEl) {
      countEl.textContent = `Found ${filtered.length} scripts`;
    }
    renderTableInContainer(container, filtered);
  }

  function renderTableInContainer(container, list) {
    const resultsEl = container.querySelector('#scripts-results');
    if (!resultsEl) return;

    function formatScriptField(value) {
      if (!value && value !== 0) {
        return '';
      }
      if (Array.isArray(value)) {
        return value.join(', ');
      }
      return String(value);
    }

    if (!list.length) {
      resultsEl.innerHTML = `<p class="muted">No scripts match your filters.</p>`;
      return;
    }

    const rows = list
      .map(
        (script, index) => `
          <tr>
            <td><a href="#enqueue" class="link" data-action="scripts-open" data-script-index="${index}">${formatValue(script.name, 'Unnamed script')}</a></td>
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
  }

  registerScriptsActions();

})(window.Pages, window.API, window.Utils);
