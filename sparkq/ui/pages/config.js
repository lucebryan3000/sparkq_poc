(function(Pages, API, Utils) {
  'use strict';

  const api = API.api;
  const formatValue = Utils.formatValue;
  const showError = Utils.showError;
  let cachedConfig = null;
  let configPromise = null;
  let lastFocusedElement = null;

  const TAB_LOADERS = {
    overview: loadOverviewTab,
    'task-execution': loadTaskExecutionTab,
    automation: loadAutomationTab,
    prompts: loadPromptsTab,
    scripts: loadScriptsTab,
    'agent-roles': loadAgentRolesTab,
    advanced: loadAdvancedTab,
  };

  function toJSONText(value) {
    try {
      return JSON.stringify(value ?? {}, null, 2);
    } catch (err) {
      return '';
    }
  }

  async function updateConfigEntry(namespace, key, value) {
    return api('PUT', `/api/config/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`, { value }, { action: 'update config' });
  }

  async function fetchConfig({ forceRefresh = false } = {}) {
    if (!forceRefresh && cachedConfig) {
      return cachedConfig;
    }
    if (configPromise && !forceRefresh) {
      return configPromise;
    }

    configPromise = api('GET', '/api/config', null, { action: 'load configuration' })
      .then((config) => {
        cachedConfig = config;
        configPromise = null;
        return config;
      })
      .catch((err) => {
        configPromise = null;
        throw err;
      });

    return configPromise;
  }

  function invalidateConfigCache() {
    cachedConfig = null;
    configPromise = null;
  }

  async function fetchStats() {
    return api('GET', '/stats', null, { action: 'load stats' });
  }

  function parseJSONField(elementId) {
    const el = document.getElementById(elementId);
    if (!el) {
      throw new Error(`Field ${elementId} not found`);
    }
    const raw = el.value || '';
    if (!raw.trim()) {
      return {};
    }
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(`Invalid JSON in ${elementId}: ${err.message}`);
    }
  }

  function getSettingsContainer() {
    return document.getElementById('settings-page') || document.getElementById('config-page') || document.querySelector('.page-content');
  }

  async function updateAgentRole(roleKey, payload) {
    return api('PUT', `/api/agent-roles/${encodeURIComponent(roleKey)}`, payload, { action: 'update agent role' });
  }

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function renderConfigPage(container) {
    if (!container) {
      return;
    }

    container.innerHTML = `
      <div class="card" style="margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <h1 style="margin:0 0 4px 0; font-size:22px;">Settings</h1>
            <p class="muted" style="margin:0;">Configure SparkQueue defaults, automation, and quick actions.</p>
          </div>
        </div>
      </div>
      <div class="config-tablist" role="tablist" aria-label="Configuration sections" data-tablist>
        <button type="button" id="overview-tab" class="tab-btn config-tab" role="tab" aria-selected="true" aria-controls="tab-content" data-tab-target="overview" data-active="true" tabindex="0">
          Overview
        </button>
        <button type="button" id="task-execution-tab" class="tab-btn config-tab" role="tab" aria-selected="false" aria-controls="tab-content" data-tab-target="task-execution" tabindex="-1">
          Task Execution
        </button>
        <button type="button" id="automation-tab" class="tab-btn config-tab" role="tab" aria-selected="false" aria-controls="tab-content" data-tab-target="automation" tabindex="-1">
          Automation
        </button>
        <button type="button" id="prompts-tab" class="tab-btn config-tab" role="tab" aria-selected="false" aria-controls="tab-content" data-tab-target="prompts" tabindex="-1">
          Quick Prompts
        </button>
        <button type="button" id="scripts-tab" class="tab-btn config-tab" role="tab" aria-selected="false" aria-controls="tab-content" data-tab-target="scripts" tabindex="-1">
          Scripts
        </button>
        <button type="button" id="agent-roles-tab" class="tab-btn config-tab" role="tab" aria-selected="false" aria-controls="tab-content" data-tab-target="agent-roles" tabindex="-1">
          Agent Roles
        </button>
        <button type="button" id="advanced-tab" class="tab-btn config-tab" role="tab" aria-selected="false" aria-controls="tab-content" data-tab-target="advanced" tabindex="-1">
          Advanced
        </button>
      </div>
      <div id="tab-content" role="tabpanel" tabindex="0" aria-labelledby="overview-tab"></div>
    `;

    // Attach tab switching handlers
    attachTabSwitching(container);

    const params = new URLSearchParams(window.location.search || '');
    const initialTab = params.get('tab');
    const startTab = TAB_LOADERS[initialTab] ? initialTab : 'overview';

    // Load default tab (Overview) or requested tab
    await setActiveTab(container, startTab, { forceReload: true });
  }

  function attachTabSwitching(container) {
    const tabList = container.querySelector('[data-tablist]');
    if (!tabList || tabList.dataset.bound === 'true') {
      return;
    }

    tabList.dataset.bound = 'true';

    tabList.addEventListener('click', (event) => {
      const tab = event.target.closest('.tab-btn');
      if (!tab || !tabList.contains(tab)) return;
      const tabKey = tab.dataset.tabTarget;
      if (!tabKey) return;
      event.preventDefault();
      setActiveTab(container, tabKey);
    });

    tabList.addEventListener('keydown', (event) => {
      const { key } = event;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) {
        return;
      }

      const tabs = getTabButtons(tabList);
      if (!tabs.length) return;

      let currentIndex = tabs.indexOf(document.activeElement);
      if (currentIndex === -1) {
        currentIndex = 0;
      }
      let nextIndex = currentIndex;

      if (key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % tabs.length;
      } else if (key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if (key === 'Home') {
        nextIndex = 0;
      } else if (key === 'End') {
        nextIndex = tabs.length - 1;
      }

      const targetTab = tabs[nextIndex];
      if (targetTab) {
        event.preventDefault();
        setActiveTab(container, targetTab.dataset.tabTarget, { focusTab: true });
      }
    });
  }

  function getTabButtons(tabList) {
    return Array.from(tabList.querySelectorAll('.tab-btn'));
  }

  function syncSettingsTabToUrl(tabKey) {
    if (!window.history || !window.history.replaceState) {
      return;
    }

    try {
      if (Utils.buildRoute) {
        const newPath = Utils.buildRoute('settings', tabKey ? { tab: tabKey } : {});
        window.history.replaceState({ page: 'settings', tab: tabKey }, '', newPath);
        return;
      }
    } catch (err) {
      console.debug('Failed to build settings route', err);
    }

    try {
      const url = new URL(window.location.href);
      if (tabKey) {
        url.searchParams.set('tab', tabKey);
      } else {
        url.searchParams.delete('tab');
      }
      window.history.replaceState({ page: 'settings', tab: tabKey }, '', url.pathname + url.search);
    } catch (err) {
      console.debug('Failed to sync settings tab to URL', err);
    }
  }

  async function setActiveTab(container, tabKey, options = {}) {
    const { forceReload = false, focusTab = false } = options;
    if (!TAB_LOADERS[tabKey]) {
      return;
    }

    const tabList = container.querySelector('[data-tablist]');
    const tabs = tabList ? getTabButtons(tabList) : [];
    const currentActive = tabs.find(tab => tab.getAttribute('aria-selected') === 'true');
    const isAlreadyActive = currentActive && currentActive.dataset.tabTarget === tabKey;

    tabs.forEach(tab => {
      const isActive = tab.dataset.tabTarget === tabKey;
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      tab.setAttribute('data-active', isActive ? 'true' : 'false');
      tab.tabIndex = isActive ? 0 : -1;
      tab.classList.toggle('active', isActive);

      if (focusTab && isActive) {
        tab.focus();
      }
    });

    const tabContent = container.querySelector('#tab-content');
    if (tabContent) {
      tabContent.setAttribute('aria-labelledby', `${tabKey}-tab`);
    }

    if (isAlreadyActive && !forceReload) {
      return;
    }

    syncSettingsTabToUrl(tabKey);

    const loader = TAB_LOADERS[tabKey];
    if (loader) {
      await loader(container);
    }
  }

  async function loadOverviewTab(container) {
    const tabContent = container.querySelector('#tab-content');
    if (!tabContent) return;

    tabContent.innerHTML = `
      <div class="card">
        <div class="muted"><span class="loading"></span> Loading overview…</div>
      </div>
    `;

    let stats = null;
    let config = null;
    try {
      [stats, config] = await Promise.all([
        fetchStats(),
        fetchConfig()
      ]);
    } catch (err) {
      tabContent.innerHTML = `
        <div class="card">
          <div class="muted">Unable to load overview data.</div>
        </div>
      `;
      showError(`Failed to load overview: ${err.message || err}`, err);
      return;
    }

    const server = config?.server || {};
    const database = config?.database || {};
    const queueRunner = config?.queue_runner || {};

    tabContent.innerHTML = `
      <div class="grid grid-3">
        <div class="card">
          <h2 style="margin: 0 0 16px; font-size: 18px;">📊 Stats</h2>
          <p><strong>Sessions:</strong> ${formatValue(stats.sessions, '0')}</p>
          <p><strong>Queues:</strong> ${formatValue(stats.queues, '0')}</p>
          <p><strong>Queued Tasks:</strong> ${formatValue(stats.queued_tasks, '0')}</p>
          <p><strong>Running Tasks:</strong> ${formatValue(stats.running_tasks, '0')}</p>
        </div>
        <div class="card">
          <h2 style="margin: 0 0 16px; font-size: 18px;">🖥️ Server</h2>
          <p><strong>Host:</strong> ${formatValue(server.host, '—')}</p>
          <p><strong>Port:</strong> ${formatValue(server.port, '—')}</p>
          <p class="muted" style="margin-top: 12px;">API running and healthy</p>
        </div>
        <div class="card">
          <h2 style="margin: 0 0 16px; font-size: 18px;">💾 Database</h2>
          <p><strong>Path:</strong> ${formatValue(database.path, '—')}</p>
          <p><strong>Mode:</strong> ${formatValue(database.mode, '—')}</p>
        </div>
      </div>
      <div class="card">
        <h2 style="margin: 0 0 16px; font-size: 18px;">⚡ Quick Actions</h2>
        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
          <button type="button" id="qa-purge-tasks" class="button secondary" style="padding: 10px 16px;">
            🗑️ Purge Old Tasks
          </button>
          <button type="button" id="qa-reload-config" class="button secondary" style="padding: 10px 16px;">
            🔄 Reload Config
          </button>
          <button type="button" id="qa-view-all-tasks" class="button secondary" style="padding: 10px 16px;">
            📋 View All Tasks
          </button>
        </div>
      </div>
    `;

    // Attach quick action handlers
    const purgeBtnQa = tabContent.querySelector('#qa-purge-tasks');
    if (purgeBtnQa) {
      purgeBtnQa.addEventListener('click', async () => {
        if (confirm('Run purge now? This will delete old completed/failed tasks according to purge settings.')) {
          try {
            await api('POST', '/api/purge', null, { action: 'purge tasks' });
            Utils.showToast('Purge completed successfully', 'success', 3000);
            await loadOverviewTab(container);
          } catch (err) {
            showError(`Failed to purge: ${err.message || err}`, err);
          }
        }
      });
    }

    const reloadBtnQa = tabContent.querySelector('#qa-reload-config');
    if (reloadBtnQa) {
      reloadBtnQa.addEventListener('click', async () => {
        try {
          await api('POST', '/api/reload', null, { action: 'reload config' });
          invalidateConfigCache();
          Utils.showToast('Configuration reloaded successfully', 'success', 3000);
          await loadOverviewTab(container);
        } catch (err) {
          showError(`Failed to reload config: ${err.message || err}`, err);
        }
      });
    }

    const viewAllBtnQa = tabContent.querySelector('#qa-view-all-tasks');
    if (viewAllBtnQa) {
      viewAllBtnQa.addEventListener('click', () => {
        if (Utils.navigateTo) {
          Utils.navigateTo('dashboard');
        } else {
          window.location.assign('/dashboard');
        }
      });
    }
  }

  async function loadTaskExecutionTab(container) {
    const tabContent = container.querySelector('#tab-content');
    if (!tabContent) return;

    tabContent.innerHTML = `
      <div class="card">
        <div class="muted"><span class="loading"></span> Loading configuration…</div>
      </div>
    `;

    let config = null;
    try {
      config = await fetchConfig();
    } catch (err) {
      tabContent.innerHTML = `
        <div class="card">
          <div class="muted">Unable to load configuration.</div>
        </div>
      `;
      showError(`Failed to load configuration: ${err.message || err}`, err);
      return;
    }

    const tools = config?.tools || {};
    const taskClasses = config?.task_classes || {};
    const defaults = config?.defaults || {};
    const defaultModel = defaults?.model || 'llm-sonnet';

    const toolEntries = Object.entries(tools || {});
    const taskClassEntries = Object.entries(taskClasses || {});
    const toolRows = toolEntries.length
      ? toolEntries
          .map(
            ([name, detail]) => `
              <tr>
                <td>${formatValue(name, '—')}</td>
                <td>${formatValue(detail?.description, '—')}</td>
                <td>${formatValue(detail?.task_class, '—')}</td>
                <td style="text-align:right;">
                  <button type="button" class="delete-tool-row button danger" data-name="${name}" style="padding:6px 10px; font-size:12px;">Delete</button>
                </td>
              </tr>
            `,
          )
          .join('')
      : `<tr><td colspan="4" class="muted" style="text-align:center;">No tools</td></tr>`;
    const taskClassRows = taskClassEntries.length
      ? taskClassEntries
          .map(
            ([name, detail]) => `
              <tr>
                <td>${formatValue(name, '—')}</td>
                <td>${formatValue(detail?.timeout, '—')}</td>
                <td>${formatValue(detail?.description, '—')}</td>
                <td style="text-align:right;">
                  <button type="button" class="delete-task-class-row button danger" data-name="${name}" style="padding:6px 10px; font-size:12px;">Delete</button>
                </td>
              </tr>
            `,
          )
          .join('')
      : `<tr><td colspan="4" class="muted" style="text-align:center;">No task classes</td></tr>`;

    // Build LLM tool options for the default model dropdown
    const llmTools = toolEntries.filter(([name]) => name.startsWith('llm-'));
    const llmToolOptions = llmTools.length
      ? llmTools.map(([name, detail]) =>
          `<option value="${name}" ${name === defaultModel ? 'selected' : ''}>${detail?.description || name}</option>`
        ).join('')
      : '<option value="llm-sonnet">Sonnet</option>';

    tabContent.innerHTML = `
      <div class="card">
        <h2>Default Settings</h2>
        <p class="muted">Configure default values for new tasks.</p>
        <div style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap; margin-bottom: 20px;">
          <div>
            <label style="display:block; margin-bottom:6px;" class="muted">Default Model</label>
            <select id="default-model-select" class="form-control form-select" style="min-width:200px;">
              ${llmToolOptions}
            </select>
            <p class="small-helper" style="margin-top: 4px;">Model used by default when creating new tasks</p>
          </div>
          <button type="button" id="save-default-model-btn" class="button primary" style="padding:10px 16px;">Save Default Model</button>
        </div>
      </div>
      <div class="card">
        <h2>Tools</h2>
        <p class="muted">Define executable tools that can be invoked via the API.</p>
        <div style="overflow-x:auto;">
          <table class="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Task Class</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${toolRows}
            </tbody>
          </table>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; margin-top:10px;">
          <div>
            <label style="display:block; margin-bottom:4px;" class="muted">Name</label>
            <input id="tool-name-input" type="text" placeholder="llm-haiku" class="form-control" style="width:160px;" />
          </div>
          <div>
            <label style="display:block; margin-bottom:4px;" class="muted">Description</label>
            <input id="tool-desc-input" type="text" placeholder="Description" class="form-control" style="width:200px;" />
          </div>
          <div>
            <label style="display:block; margin-bottom:4px;" class="muted">Task Class</label>
            <select id="tool-task-class-select" class="form-control form-select" style="min-width:160px;">
              ${(taskClassEntries || []).map(([name]) => `<option value="${name}">${name}</option>`).join('')}
            </select>
          </div>
          <button type="button" id="save-tool-row-btn" class="button primary" style="padding:10px 16px;">Save Tool</button>
        </div>
      </div>
      <div class="card">
        <h2>Task Classes</h2>
        <p class="muted">Define task execution classes with timeout limits.</p>
        <div style="overflow-x:auto;">
          <table class="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Timeout (s)</th>
                <th>Description</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${taskClassRows}
            </tbody>
          </table>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; margin-top:10px;">
          <div>
            <label style="display:block; margin-bottom:4px;" class="muted">Name</label>
            <input id="task-class-name-input" type="text" placeholder="LLM_LITE" class="form-control" style="width:160px;" />
          </div>
          <div>
            <label style="display:block; margin-bottom:4px;" class="muted">Timeout (seconds)</label>
            <input id="task-class-timeout-input" type="number" min="1" placeholder="300" class="form-control" style="width:140px;" />
          </div>
          <div>
            <label style="display:block; margin-bottom:4px;" class="muted">Description</label>
            <input id="task-class-desc-input" type="text" placeholder="Optional" class="form-control" style="width:200px;" />
          </div>
          <button type="button" id="save-task-class-row-btn" class="button primary" style="padding:10px 16px;">Save Task Class</button>
        </div>
      </div>
    `;

    // Attach handlers
    const saveDefaultModelBtn = tabContent.querySelector('#save-default-model-btn');
    if (saveDefaultModelBtn) {
      saveDefaultModelBtn.addEventListener('click', async () => {
        await Pages.Config.saveDefaultModel();
      });
    }
    const saveToolRowBtn = tabContent.querySelector('#save-tool-row-btn');
    if (saveToolRowBtn) {
      saveToolRowBtn.addEventListener('click', async () => {
        await Pages.Config.saveToolRow();
      });
    }
    const saveTaskClassRowBtn = tabContent.querySelector('#save-task-class-row-btn');
    if (saveTaskClassRowBtn) {
      saveTaskClassRowBtn.addEventListener('click', async () => {
        await Pages.Config.saveTaskClassRow();
      });
    }
    const deleteToolButtons = tabContent.querySelectorAll('.delete-tool-row');
    deleteToolButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.getAttribute('data-name');
        await Pages.Config.deleteToolRow(name);
      });
    });
    const deleteTaskClassButtons = tabContent.querySelectorAll('.delete-task-class-row');
    deleteTaskClassButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.getAttribute('data-name');
        await Pages.Config.deleteTaskClassRow(name);
      });
    });
  }

  async function loadAutomationTab(container) {
    const tabContent = container.querySelector('#tab-content');
    if (!tabContent) return;

    tabContent.innerHTML = `
      <div class="card">
        <div class="muted"><span class="loading"></span> Loading configuration…</div>
      </div>
    `;

    let config = null;
    try {
      config = await fetchConfig();
    } catch (err) {
      tabContent.innerHTML = `
        <div class="card">
          <div class="muted">Unable to load configuration.</div>
        </div>
      `;
      showError(`Failed to load configuration: ${err.message || err}`, err);
      return;
    }

    const purge = config?.purge || {};
    const queueRunner = config?.queue_runner || {};
    const staleHandling = config?.stale_handling || {};
    const warnMultiplier = staleHandling.warn_multiplier ?? 1.0;
    const failMultiplier = staleHandling.fail_multiplier ?? 2.0;
    const autoFailIntervalSeconds = queueRunner.auto_fail_interval_seconds ?? staleHandling.auto_fail_interval_seconds ?? '';

    tabContent.innerHTML = `
      <div class="card">
        <h2>Purge</h2>
        <p class="muted">Automatically delete old completed/failed tasks.</p>
        <div style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap;">
          <div>
            <label style="display:block; margin-bottom:6px;" class="muted">Older Than Days</label>
            <input id="purge-days" type="number" min="1" value="${formatValue(purge.older_than_days, '')}" class="form-control" style="width:120px;" />
          </div>
          <button type="button" id="save-purge-btn" class="button primary" style="padding:10px 16px;">Save Purge</button>
        </div>
      </div>
      <div class="card">
        <h2>Queue Runner</h2>
        <p class="muted">Controls background poll interval and auto-fail cadence.</p>
        <div style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap;">
          <div>
            <label style="display:block; margin-bottom:6px;" class="muted">Poll Interval (s)</label>
            <input id="qr-poll-interval" type="number" min="1" value="${formatValue(queueRunner.poll_interval, '')}" class="form-control" style="width:140px;" />
          </div>
          <div>
            <label style="display:block; margin-bottom:6px;" class="muted">Auto-fail Interval (s)</label>
            <input id="qr-auto-fail-interval" type="number" min="1" value="${formatValue(autoFailIntervalSeconds, '')}" class="form-control" style="width:160px;" />
          </div>
          <div style="flex:1; min-width:200px;">
            <label style="display:block; margin-bottom:6px;" class="muted">Base URL (optional)</label>
            <input id="qr-base-url" type="text" placeholder="http://host:port" value="${formatValue(queueRunner.base_url, '')}" class="form-control" style="width:100%;" />
          </div>
          <button type="button" id="save-queue-runner-btn" class="button primary" style="padding:10px 16px;">Save Queue Runner</button>
        </div>
      </div>
      <div class="card">
        <h2>Stale Handling</h2>
        <p>Warn at <strong>${formatValue(warnMultiplier, '1')}</strong>x timeout; auto-fail at <strong>${formatValue(failMultiplier, '2')}</strong>x.</p>
        <p class="muted">Auto-fail runs on the server cadence above. Use this to jump to running tasks and inspect warnings.</p>
        <button type="button" id="view-running-tasks-btn" class="button secondary" style="padding:10px 16px;">View Running Tasks</button>
      </div>
    `;

    // Attach handlers
    const purgeBtn = tabContent.querySelector('#save-purge-btn');
    if (purgeBtn) {
      purgeBtn.addEventListener('click', async () => {
        await Pages.Config.savePurge();
      });
    }
    const queueRunnerBtn = tabContent.querySelector('#save-queue-runner-btn');
    if (queueRunnerBtn) {
      queueRunnerBtn.addEventListener('click', async () => {
        await Pages.Config.saveQueueRunner();
      });
    }
    const viewRunningBtn = tabContent.querySelector('#view-running-tasks-btn');
    if (viewRunningBtn) {
      viewRunningBtn.addEventListener('click', () => {
        Pages.Config.goToRunningTasks();
      });
    }
  }

  async function loadAdvancedTab(container) {
    const tabContent = container.querySelector('#tab-content');
    if (!tabContent) return;

    tabContent.innerHTML = `
      <div class="card">
        <div class="muted"><span class="loading"></span> Loading configuration…</div>
      </div>
    `;

    let config = null;
    try {
      config = await fetchConfig();
    } catch (err) {
      tabContent.innerHTML = `
        <div class="card">
          <div class="muted">Unable to load configuration.</div>
        </div>
      `;
      showError(`Failed to load configuration: ${err.message || err}`, err);
      return;
    }

    const project = config?.project || {};
    const scriptDirs = config?.sparkq_scripts_dir || '';
    const projectScriptDirs = (config?.project_script_dirs || []).join(', ');
    const featureFlags = (config?.features && config.features.flags) || {};
    const uiBuildId = (config?.ui && config.ui.build_id) || '';
    const queueDefaults = (config?.defaults && config.defaults.queue) || {};

    const featureFlagsJSON = toJSONText(featureFlags);
    const queueDefaultsJSON = toJSONText(queueDefaults);

    tabContent.innerHTML = `
      <div class="card">
        <h2>Project Configuration</h2>
        <p class="muted">Core project settings (name, repo path, PRD path).</p>
        <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
          <div>
            <label style="display:block; margin-bottom:6px;" class="muted">Project Name</label>
            <input id="project-name" type="text" value="${formatValue(project.name, '')}" class="form-control" style="width:200px;" />
          </div>
          <div>
            <label style="display:block; margin-bottom:6px;" class="muted">Repo Path</label>
            <input id="project-repo-path" type="text" value="${formatValue(project.repo_path, '')}" class="form-control" style="width:300px;" />
          </div>
          <div>
            <label style="display:block; margin-bottom:6px;" class="muted">PRD Path (optional)</label>
            <input id="project-prd-path" type="text" value="${formatValue(project.prd_path, '')}" class="form-control" style="width:300px;" />
          </div>
          <button type="button" id="save-project-config-btn" class="button primary" style="padding:10px 16px;">Save Project</button>
        </div>
      </div>
      <div class="card">
        <h2>Script Directories</h2>
        <p class="muted">Directories to search for executable scripts.</p>
        <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
          <div>
            <label style="display:block; margin-bottom:6px;" class="muted">SparkQ Scripts Dir</label>
            <input id="sparkq-scripts-dir" type="text" value="${formatValue(scriptDirs, '')}" class="form-control" style="width:200px;" />
          </div>
          <div>
            <label style="display:block; margin-bottom:6px;" class="muted">Project Script Dirs (comma-separated)</label>
            <input id="project-script-dirs" type="text" value="${formatValue(projectScriptDirs, '')}" class="form-control" style="width:300px;" />
          </div>
          <button type="button" id="save-script-dirs-btn" class="button primary" style="padding:10px 16px;">Save Script Dirs</button>
        </div>
      </div>
      <div class="grid grid-2">
        <div class="card">
          <h2>Build Metadata</h2>
          <label style="display:block; margin-bottom:6px;" class="muted">Build ID</label>
          <div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
            <input id="build-id-input" type="text" value="${formatValue(uiBuildId, '')}" class="form-control" style="min-width:200px;" />
            <button type="button" id="save-build-btn" class="button primary" style="padding:10px 16px;">Save Build ID</button>
          </div>
        </div>
        <div class="card">
          <h2>Feature Flags</h2>
          <p class="muted" style="margin-top:0;">Edit JSON object of feature flags (key → boolean).</p>
          <textarea id="feature-flags-input" rows="4" class="form-control" style="width:100%; font-family:'Courier New', monospace; resize:vertical;">${featureFlagsJSON}</textarea>
          <div style="margin-top:10px; display:flex; gap:10px; justify-content:flex-end;">
            <button type="button" id="save-flags-btn" class="button primary" style="padding:10px 16px;">Save Flags</button>
          </div>
        </div>
      </div>
      <div class="card">
        <h2>Queue Defaults</h2>
        <p class="muted" style="margin-top:0;">Optional queue defaults (object). Leave empty to keep defaults.</p>
        <textarea id="queue-defaults-json-input" rows="6" class="form-control" style="width:100%; font-family:'Courier New', monospace; resize:vertical;">${queueDefaultsJSON}</textarea>
        <div style="margin-top:10px; display:flex; gap:10px; justify-content:flex-end;">
          <button type="button" id="save-queue-defaults-btn" class="button primary" style="padding:10px 16px;">Validate & Save</button>
        </div>
      </div>
      <div class="card">
        <h2>Config Management</h2>
        <p class="muted">Export or validate your configuration.</p>
        <div style="display:flex; gap:12px;">
          <button type="button" id="export-config-btn" class="button secondary" style="padding:10px 16px;">📥 Export Config</button>
          <button type="button" id="validate-config-btn" class="button secondary" style="padding:10px 16px;">✅ Validate Config</button>
        </div>
      </div>
    `;

    // Attach handlers
    const saveProjectBtn = tabContent.querySelector('#save-project-config-btn');
    if (saveProjectBtn) {
      saveProjectBtn.addEventListener('click', async () => {
        await Pages.Config.saveProjectConfig();
      });
    }
    const saveScriptDirsBtn = tabContent.querySelector('#save-script-dirs-btn');
    if (saveScriptDirsBtn) {
      saveScriptDirsBtn.addEventListener('click', async () => {
        await Pages.Config.saveScriptDirs();
      });
    }
    const buildBtn = tabContent.querySelector('#save-build-btn');
    if (buildBtn) {
      buildBtn.addEventListener('click', async () => {
        await Pages.Config.saveBuildId();
      });
    }
    const flagsBtn = tabContent.querySelector('#save-flags-btn');
    if (flagsBtn) {
      flagsBtn.addEventListener('click', async () => {
        await Pages.Config.saveFeatureFlags();
      });
    }
    const queueDefaultsBtn = tabContent.querySelector('#save-queue-defaults-btn');
    if (queueDefaultsBtn) {
      queueDefaultsBtn.addEventListener('click', async () => {
        await Pages.Config.saveQueueDefaults();
      });
    }
    const exportBtn = tabContent.querySelector('#export-config-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        await Pages.Config.exportConfig();
      });
    }
    const validateBtn = tabContent.querySelector('#validate-config-btn');
    if (validateBtn) {
      validateBtn.addEventListener('click', async () => {
        await Pages.Config.validateConfig();
      });
    }
  }

  async function loadPromptsTab(container) {
    const tabContent = container.querySelector('#tab-content');
    if (!tabContent) return;

    tabContent.innerHTML = `
      <div class="card">
        <div class="muted"><span class="loading"></span> Loading prompts…</div>
      </div>
    `;

    let prompts = [];
    try {
      const response = await api('GET', '/api/prompts', null, { action: 'load prompts' });
      prompts = response?.prompts || [];
    } catch (err) {
      tabContent.innerHTML = `
        <div class="card">
          <div class="muted">Unable to load prompts.</div>
        </div>
      `;
      showError(`Failed to load prompts: ${err.message || err}`, err);
      return;
    }

    // Extract unique categories (Phase 27)
    const categories = Array.from(new Set(prompts.map(p => p.category).filter(Boolean))).sort();

    const promptListHtml = prompts.length
      ? prompts.map(p => renderPromptItem(p)).join('')
      : '<p class="muted empty-state">No prompts yet. Click "New Prompt" to create one.</p>';

    const categoryFilterHtml = categories.length > 0
      ? `
        <div style="margin-bottom: 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <label for="category-filter" style="font-size: 13px; font-weight: 600; color: var(--text-secondary);">Filter by category:</label>
          <select id="category-filter" class="form-input" style="flex: 0 0 auto; padding: 6px 12px; font-size: 13px;">
            <option value="">All Categories</option>
            ${categories.map(cat => `<option value="${formatValue(cat, '')}">${formatValue(cat, '')}</option>`).join('')}
          </select>
        </div>
      `
      : '';

    tabContent.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Quick Prompts</h2>
          <button type="button" id="new-prompt-btn" class="button primary">
            + New Prompt
          </button>
        </div>
        ${categoryFilterHtml}
        <div id="prompt-list" class="prompt-list">
          ${promptListHtml}
        </div>
      </div>

      <!-- Modal for Create/Edit Prompt -->
      <div id="prompt-modal" class="modal-backdrop" style="display: none;" aria-hidden="true">
        <div class="prompt-modal" data-dialog role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="prompt-dialog-description" tabindex="-1">
          <div class="modal-header-enhanced">
            <div class="modal-header-content">
              <div class="modal-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 3l2 7h7l-5.5 4 2 7L12 17l-5.5 4 2-7L3 10h7z"/>
                </svg>
              </div>
              <div class="modal-header-text">
                <h2 id="modal-title" class="modal-title-enhanced">New Quick Prompt</h2>
                <p class="modal-subtitle">Create a reusable template with custom command trigger</p>
              </div>
            </div>
            <button type="button" id="close-modal-btn" aria-label="Close prompt dialog" class="modal-close-enhanced">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <form id="prompt-form" class="modal-form">
            <input type="hidden" id="prompt-id" value="">
            <p id="prompt-dialog-description" class="sr-only">Create or edit a reusable quick prompt template with command trigger.</p>

            <!-- Section: Identification -->
            <div class="form-section">
              <div class="section-header">
                <h3 class="section-title">Identification</h3>
                <span class="section-badge">Required</span>
              </div>

              <div class="input-group">
                <div class="input-wrapper">
                  <input type="text" id="prompt-command" required placeholder=" " class="form-input">
                  <label for="prompt-command" class="floating-label">
                    <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M9 5l7 7-7 7"/>
                    </svg>
                    Command
                  </label>
                </div>
                <p class="helper-text">
                  <svg class="helper-icon" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                    <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
                  </svg>
                  Lowercase, numbers, hyphens only. Trigger with '>command'
                </p>
              </div>

              <div class="input-group">
                <div class="input-wrapper">
                  <input type="text" id="prompt-label" required placeholder=" " class="form-input">
                  <label for="prompt-label" class="floating-label">
                    <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M4 7h16M4 12h16M4 17h10"/>
                    </svg>
                    Label
                  </label>
                </div>
                <p class="helper-text">
                  <svg class="helper-icon" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                    <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
                  </svg>
                  Display name in autocomplete menu
                </p>
              </div>
            </div>

            <!-- Section: Details -->
            <div class="form-section">
              <div class="section-header">
                <h3 class="section-title">Details</h3>
                <span class="section-badge optional">Optional</span>
              </div>

              <div class="input-group">
                <div class="input-wrapper">
                  <input type="text" id="prompt-description" placeholder=" " class="form-input">
                  <label for="prompt-description" class="floating-label">
                    <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    Description
                  </label>
                </div>
                <p class="helper-text">
                  <svg class="helper-icon" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                    <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
                  </svg>
                  Brief explanation of prompt purpose
                </p>
              </div>
            </div>

            <!-- Section: Template -->
            <div class="form-section">
              <div class="section-header">
                <h3 class="section-title">Template</h3>
                <span class="section-badge">Required</span>
              </div>

              <div class="input-group">
                <div class="input-wrapper textarea-wrapper">
                  <textarea id="prompt-template" required placeholder=" " rows="8" class="form-input form-textarea"></textarea>
                  <label for="prompt-template" class="floating-label">
                    <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
                    </svg>
                    Template Text
                  </label>
                </div>
                <p class="helper-text">
                  <svg class="helper-icon" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                    <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
                  </svg>
                  Text inserted when prompt is triggered
                </p>
              </div>
            </div>

            <!-- Actions -->
            <div class="modal-actions-enhanced">
              <button type="button" id="cancel-modal-btn" class="button-enhanced secondary">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
                Cancel
              </button>
              <button type="submit" class="button-enhanced primary">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <path d="M17 21v-8H7v8M7 3v5h8"/>
                </svg>
                Save Prompt
              </button>
            </div>
          </form>
        </div>
      </div>

    `;

    setupPromptModalAccessibility(tabContent);

    // Attach event listeners
    const newPromptBtn = tabContent.querySelector('#new-prompt-btn');
    if (newPromptBtn) {
      newPromptBtn.addEventListener('click', () => {
        Pages.Config.showPromptModal();
      });
    }

    const closeModalBtn = tabContent.querySelector('#close-modal-btn');
    const cancelModalBtn = tabContent.querySelector('#cancel-modal-btn');
    if (closeModalBtn) {
      closeModalBtn.addEventListener('click', () => {
        Pages.Config.hidePromptModal();
      });
    }
    if (cancelModalBtn) {
      cancelModalBtn.addEventListener('click', () => {
        Pages.Config.hidePromptModal();
      });
    }

    const promptForm = tabContent.querySelector('#prompt-form');
    if (promptForm) {
      promptForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await Pages.Config.submitPrompt();
      });
    }

    // Close modal on background click
    const modal = tabContent.querySelector('#prompt-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          Pages.Config.hidePromptModal();
        }
      });
    }

    // Attach edit/delete handlers to prompt items
    Pages.Config.attachPromptHandlers();
  }

  async function loadScriptsTab(container) {
    const tabContent = container.querySelector('#tab-content');
    if (!tabContent) return;

    const scriptsPage = Pages.Scripts;
    if (scriptsPage && typeof scriptsPage.render === 'function') {
      await scriptsPage.render(tabContent);
      return;
    }

    tabContent.innerHTML = `
      <div class="card">
        <p class="muted">Scripts module not available.</p>
      </div>
    `;
  }

  async function loadAgentRolesTab(container) {
    const tabContent = container.querySelector('#tab-content');
    if (!tabContent) return;

    tabContent.innerHTML = `
      <div class="card">
        <div class="muted"><span class="loading"></span> Loading agent roles…</div>
      </div>
    `;

    let roles = [];
    try {
      const response = await api('GET', '/api/agent-roles?active_only=false', null, { action: 'load agent roles' });
      roles = response?.roles || [];
    } catch (err) {
      tabContent.innerHTML = `
        <div class="card">
          <div class="muted">Unable to load agent roles.</div>
        </div>
      `;
      showError(`Failed to load agent roles: ${err.message || err}`, err);
      return;
    }

    const renderRoleCard = (role) => {
      const active = Boolean(role?.active);
      const badgeLabel = active ? 'Active' : 'Inactive';
      const toggleLabel = active ? 'Deactivate' : 'Activate';
      const badgeStyle = active
        ? 'background: rgba(46, 204, 113, 0.15); color: var(--success, #198754);'
        : 'background: var(--muted); color: var(--subtle);';
      return `
        <div class="role-card" data-role-key="${escapeHtml(role.key)}" style="border:1px solid var(--border); border-radius:10px; padding:12px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
            <div>
              <div class="muted" style="font-size:12px; letter-spacing:0.4px;">${escapeHtml(role.key)}</div>
              <div style="font-size:17px; font-weight:700;">${escapeHtml(role.label)}</div>
            </div>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
              <span style="padding:4px 10px; border-radius:999px; font-size:12px; font-weight:700; ${badgeStyle}">${badgeLabel}</span>
              <button type="button" class="button secondary role-toggle-btn" data-role-key="${escapeHtml(role.key)}" data-active="${active ? 'true' : 'false'}" style="padding:6px 12px;">${toggleLabel}</button>
              <button type="button" class="button role-edit-btn" data-role-key="${escapeHtml(role.key)}" style="padding:6px 12px;">Edit</button>
              <button type="button" class="button danger role-delete-btn" data-role-key="${escapeHtml(role.key)}" style="padding:6px 12px;">🗑️ Delete</button>
            </div>
          </div>
          <p class="muted" style="margin-top:10px; white-space:pre-line;">${escapeHtml(role.description)}</p>
        </div>
      `;
    };

    const listHtml = roles.length
      ? roles.map(renderRoleCard).join('')
      : '<p class="muted">No agent roles found.</p>';

    tabContent.innerHTML = `
      <div class="card">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
          <div>
            <h2 class="card-title" style="margin-bottom:4px;">Agent Roles</h2>
            <p class="muted" style="margin:0;">Toggle availability or adjust labels/descriptions. Changes affect new queue defaults and task creation; existing tasks keep their stored prompts.</p>
          </div>
          <button type="button" id="add-agent-role-btn" class="button primary" style="padding:8px 14px; white-space:nowrap;">+ Add Role</button>
        </div>
        <div id="agent-role-list">
          ${listHtml}
        </div>
      </div>
    `;

    const listEl = tabContent.querySelector('#agent-role-list');
    if (!listEl) return;

    listEl.querySelectorAll('.role-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const roleKey = btn.getAttribute('data-role-key');
        const currentActive = btn.getAttribute('data-active') === 'true';
        try {
          await updateAgentRole(roleKey, { active: !currentActive });
          Utils.showToast(!currentActive ? 'Role activated' : 'Role deactivated', 'success', 2500);
          await loadAgentRolesTab(container);
        } catch (err) {
          showError(`Failed to update role: ${err.message || err}`, err);
        }
      });
    });

    listEl.querySelectorAll('.role-edit-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const roleKey = btn.getAttribute('data-role-key');
        const role = roles.find((r) => r.key === roleKey);
        if (!role) return;

        const content = document.createElement('div');
        content.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:12px; min-width:320px; max-width:640px;">
            <div>
              <label class="muted" style="display:block; margin-bottom:6px;">Label</label>
              <input id="edit-role-label" class="form-control" type="text" value="${escapeHtml(role.label)}" style="width:100%;" />
            </div>
            <div>
              <label class="muted" style="display:block; margin-bottom:6px;">Description (used as prompt prefix)</label>
              <textarea id="edit-role-description" class="form-control" rows="6" style="width:100%; font-family:ui-monospace, monospace;">${escapeHtml(role.description)}</textarea>
            </div>
            <label style="display:flex; align-items:center; gap:8px; font-weight:600;">
              <input id="edit-role-active" type="checkbox" ${role.active ? 'checked' : ''} />
              Active
            </label>
          </div>
        `;

        const result = await Utils.showModal(`Edit Role: ${roleKey}`, content, [
          { label: 'Cancel', value: null },
          { label: 'Save', primary: true, value: 'save' },
        ]);
        if (result !== 'save') {
          return;
        }

        const labelInput = content.querySelector('#edit-role-label');
        const descInput = content.querySelector('#edit-role-description');
        const activeInput = content.querySelector('#edit-role-active');

        const newLabel = (labelInput?.value || '').trim();
        const newDescription = (descInput?.value || '').trim();
        const newActive = Boolean(activeInput?.checked);

        if (!newLabel) {
          showError('Label cannot be empty.');
          return;
        }
        if (!newDescription) {
          showError('Description cannot be empty.');
          return;
        }

        try {
          await updateAgentRole(roleKey, {
            label: newLabel,
            description: newDescription,
            active: newActive,
          });
          Utils.showToast('Role updated', 'success', 2500);
          await loadAgentRolesTab(container);
        } catch (err) {
          showError(`Failed to save role: ${err.message || err}`, err);
        }
      });
    });

    // Add delete button handlers
    listEl.querySelectorAll('.role-delete-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const roleKey = btn.getAttribute('data-role-key');
        const confirmed = await Utils.showConfirm('Delete Role', `Are you sure you want to delete role "${roleKey}"? This cannot be undone.`);
        if (!confirmed) return;

        try {
          await api('DELETE', `/api/agent-roles/${encodeURIComponent(roleKey)}`, null, { action: 'delete agent role' });
          Utils.showToast('Role deleted', 'success', 2500);
          await loadAgentRolesTab(container);
        } catch (err) {
          showError(`Failed to delete role: ${err.message || err}`, err);
        }
      });
    });

    // Add role creation button handler
    const addBtn = tabContent.querySelector('#add-agent-role-btn');
    if (addBtn) {
      addBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const content = document.createElement('div');
        content.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:12px; min-width:320px; max-width:640px;">
            <div>
              <label class="muted" style="display:block; margin-bottom:6px;">Role Key (identifier, lowercase)</label>
              <input id="new-role-key" class="form-control" type="text" placeholder="e.g., custom_agent" style="width:100%;" />
            </div>
            <div>
              <label class="muted" style="display:block; margin-bottom:6px;">Label</label>
              <input id="new-role-label" class="form-control" type="text" placeholder="e.g., Custom Agent" style="width:100%;" />
            </div>
            <div>
              <label class="muted" style="display:block; margin-bottom:6px;">Description (used as prompt prefix)</label>
              <textarea id="new-role-description" class="form-control" rows="6" placeholder="Describe this agent role..." style="width:100%; font-family:ui-monospace, monospace;"></textarea>
            </div>
            <label style="display:flex; align-items:center; gap:8px; font-weight:600;">
              <input id="new-role-active" type="checkbox" checked />
              Active
            </label>
          </div>
        `;

        const result = await Utils.showModal('Add New Agent Role', content, [
          { label: 'Cancel', value: null },
          { label: 'Create', primary: true, value: 'create' },
        ]);

        if (result !== 'create') {
          return;
        }

        const keyInput = content.querySelector('#new-role-key');
        const labelInput = content.querySelector('#new-role-label');
        const descInput = content.querySelector('#new-role-description');
        const activeInput = content.querySelector('#new-role-active');

        const newKey = (keyInput?.value || '').trim();
        const newLabel = (labelInput?.value || '').trim();
        const newDescription = (descInput?.value || '').trim();
        const newActive = Boolean(activeInput?.checked);

        if (!newKey) {
          showError('Role key cannot be empty.');
          return;
        }
        if (!newLabel) {
          showError('Label cannot be empty.');
          return;
        }
        if (!newDescription) {
          showError('Description cannot be empty.');
          return;
        }

        try {
          await api('POST', '/api/agent-roles', {
            key: newKey,
            label: newLabel,
            description: newDescription,
            active: newActive,
          }, { action: 'create agent role' });
          Utils.showToast('Role created', 'success', 2500);
          await loadAgentRolesTab(container);
        } catch (err) {
          showError(`Failed to create role: ${err.message || err}`, err);
        }
      });
    }
  }

  function renderPromptItem(prompt) {
    const description = prompt.description
      ? `<p class="prompt-description muted">${formatValue(prompt.description, '')}</p>`
      : '';

    const active = Boolean(prompt?.active !== 0);
    const badgeLabel = active ? 'Active' : 'Inactive';
    const toggleLabel = active ? 'Deactivate' : 'Activate';
    const badgeStyle = active
      ? 'background: rgba(46, 204, 113, 0.15); color: var(--success, #198754);'
      : 'background: var(--muted); color: var(--subtle);';

    const categoryBadge = prompt.category
      ? `<span class="prompt-category-badge" data-category="${formatValue(prompt.category, '')}" style="padding:4px 10px; border-radius:999px; font-size:11px; font-weight:600; background:rgba(100,150,200,0.15); color:var(--info, #0066cc); margin-right:8px;">${formatValue(prompt.category, '')}</span>`
      : '';

    return `
      <div class="prompt-item">
        <div class="prompt-item-main">
          <span class="prompt-icon">📝</span>
          <div>
            <p class="prompt-title">${formatValue(prompt.label, '—')}</p>
            <p class="prompt-command">&gt;${formatValue(prompt.command, '—')}</p>
            ${description}
          </div>
        </div>
        <div class="prompt-actions">
          ${categoryBadge}
          <span style="padding:4px 10px; border-radius:999px; font-size:12px; font-weight:700; ${badgeStyle}">${badgeLabel}</span>
          <button type="button" class="button secondary prompt-toggle-btn" data-prompt-id="${prompt.id}" data-active="${active ? 'true' : 'false'}" style="padding:6px 12px;">${toggleLabel}</button>
          <button type="button" class="edit-prompt-btn button secondary" data-prompt-id="${prompt.id}">
            Edit
          </button>
          <button type="button" class="delete-prompt-btn button danger" data-prompt-id="${prompt.id}">
            Delete
          </button>
        </div>
      </div>
    `;
  }

  async function loadPromptIntoForm(promptId) {
    let response = null;
    try {
      response = await api('GET', `/api/prompts/${promptId}`, null, { action: 'load prompt details' });
    } catch (err) {
      showError(`Failed to load prompt: ${err.message || err}`, err);
      return;
    }

    // API returns {"prompt": {...}} wrapper
    const prompt = response.prompt;
    if (!prompt) {
      showError('Invalid prompt data received from server');
      return;
    }

    const modalTitle = document.getElementById('modal-title');
    const modalSubtitle = document.querySelector('.modal-subtitle');
    const promptIdInput = document.getElementById('prompt-id');
    const commandInput = document.getElementById('prompt-command');
    const labelInput = document.getElementById('prompt-label');
    const descriptionInput = document.getElementById('prompt-description');
    const templateInput = document.getElementById('prompt-template');

    if (modalTitle) modalTitle.textContent = 'Edit Quick Prompt';
    if (modalSubtitle) modalSubtitle.textContent = `Editing: ${prompt.label}`;
    if (promptIdInput) promptIdInput.value = prompt.id || '';
    if (commandInput) commandInput.value = prompt.command || '';
    if (labelInput) labelInput.value = prompt.label || '';
    if (descriptionInput) descriptionInput.value = prompt.description || '';
    if (templateInput) templateInput.value = prompt.template_text || '';
  }

  function setupPromptModalAccessibility(tabContent) {
    const modal = tabContent.querySelector('#prompt-modal');
    if (!modal || modal.dataset.a11yBound === 'true') {
      return;
    }
    modal.dataset.a11yBound = 'true';
    modal.addEventListener('keydown', handlePromptModalKeydown);
  }

  function handlePromptModalKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      Pages.Config.hidePromptModal();
      return;
    }
    if (event.key === 'Tab') {
      trapFocusInModal(event);
    }
  }

  function trapFocusInModal(event) {
    const { dialog } = getPromptModalElements();
    if (!dialog) return;

    const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusable = Array.from(dialog.querySelectorAll(focusableSelectors)).filter(el => !el.disabled && el.getAttribute('aria-hidden') !== 'true');
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function getPromptModalElements() {
    const modal = document.getElementById('prompt-modal');
    const dialog = modal ? modal.querySelector('[data-dialog]') : null;
    return { modal, dialog };
  }

  Pages.Config = {
    async render(container) {
      await renderConfigPage(container);
    },

    showPromptModal(isEdit = false) {
      const { modal, dialog } = getPromptModalElements();
      const form = document.getElementById('prompt-form');
      const modalTitle = document.getElementById('modal-title');

      // Only reset form for new prompts (not for edits)
      if (!isEdit) {
        if (form) form.reset();
        if (modalTitle) modalTitle.textContent = 'New Quick Prompt';
        document.getElementById('prompt-id').value = '';
      }

      lastFocusedElement = document.activeElement;

      if (modal) {
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => {
          modal.classList.add('visible');
        });
      }
      if (dialog) {
        dialog.style.transform = 'scale(0.95)';
        requestAnimationFrame(() => {
          dialog.style.transform = 'scale(1)';
          dialog.focus();
        });
      }

      // Focus first input
      setTimeout(() => {
        const commandInput = document.getElementById('prompt-command');
        if (commandInput) commandInput.focus();
      }, 100);
    },

    hidePromptModal() {
      const { modal, dialog } = getPromptModalElements();
      if (modal) {
        modal.classList.remove('visible');
        if (dialog) {
          dialog.style.transform = 'scale(0.95)';
        }
        setTimeout(() => {
          modal.style.display = 'none';
          modal.setAttribute('aria-hidden', 'true');
        }, 200);
        document.body.style.overflow = '';
      }
      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
      }
      lastFocusedElement = null;
    },

    async submitPrompt() {
      const promptId = document.getElementById('prompt-id').value;
      const command = document.getElementById('prompt-command').value.trim();
      const label = document.getElementById('prompt-label').value.trim();
      const description = document.getElementById('prompt-description').value.trim();
      const templateText = document.getElementById('prompt-template').value.trim();

      // Validate command format
      const commandRegex = /^[a-z0-9][a-z0-9-]*$/;
      if (!commandRegex.test(command)) {
        showError('Command must start with lowercase letter/number and contain only lowercase letters, numbers, and hyphens.');
        return;
      }

      if (!label || !templateText) {
        showError('Label and template text are required.');
        return;
      }

      const payload = {
        command,
        label,
        template_text: templateText,
        description: description || null
      };

      try {
        if (promptId) {
          // Update existing prompt
          await api('PUT', `/api/prompts/${promptId}`, payload, { action: 'update prompt' });
          Utils.showToast('Prompt updated successfully');
        } else {
          // Create new prompt
          await api('POST', '/api/prompts', payload, { action: 'create prompt' });
          Utils.showToast('Prompt created successfully');
        }

        Pages.Config.hidePromptModal();

        // Reload prompts tab
        const container = getSettingsContainer();
        if (container) {
          await setActiveTab(container, 'prompts', { forceReload: true });
        }
      } catch (err) {
        showError(`Failed to save prompt: ${err.message || err}`, err);
      }
    },

    async editPrompt(promptId) {
      await loadPromptIntoForm(promptId);
      Pages.Config.showPromptModal(true);
    },

    async deletePrompt(promptId) {
      if (!confirm('Are you sure you want to delete this prompt?')) {
        return;
      }

      try {
        await api('DELETE', `/api/prompts/${promptId}`, null, { action: 'delete prompt' });
        Utils.showToast('Prompt deleted successfully');

        // Reload prompts tab
        const container = getSettingsContainer();
        if (container) {
          await setActiveTab(container, 'prompts', { forceReload: true });
        }
      } catch (err) {
        showError(`Failed to delete prompt: ${err.message || err}`, err);
      }
    },

    async updatePromptStatus(promptId, active) {
      try {
        await api('PUT', `/api/prompts/${promptId}`, { active }, { action: 'update prompt status' });
      } catch (err) {
        showError(`Failed to update prompt status: ${err.message || err}`, err);
        throw err;
      }
    },

    attachPromptHandlers() {
      const editBtns = document.querySelectorAll('.edit-prompt-btn');
      const deleteBtns = document.querySelectorAll('.delete-prompt-btn');
      const toggleBtns = document.querySelectorAll('.prompt-toggle-btn');
      const categoryFilter = document.getElementById('category-filter');

      editBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const promptId = btn.getAttribute('data-prompt-id');
          Pages.Config.editPrompt(promptId);
        });
      });

      deleteBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const promptId = btn.getAttribute('data-prompt-id');
          Pages.Config.deletePrompt(promptId);
        });
      });

      toggleBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
          const promptId = btn.getAttribute('data-prompt-id');
          const currentActive = btn.getAttribute('data-active') === 'true';
          try {
            await Pages.Config.updatePromptStatus(promptId, !currentActive);
            Utils.showToast(!currentActive ? 'Prompt activated' : 'Prompt deactivated', 'success', 2500);
            const container = getSettingsContainer();
            if (container) {
              await setActiveTab(container, 'prompts', { forceReload: true });
            }
          } catch (err) {
            showError(`Failed to update prompt status: ${err.message || err}`, err);
          }
        });
      });

      // Add category filter listener (Phase 27)
      if (categoryFilter) {
        categoryFilter.addEventListener('change', () => {
          const selectedCategory = categoryFilter.value;
          const promptItems = document.querySelectorAll('.prompt-item');

          promptItems.forEach(item => {
            const categoryBadge = item.querySelector('.prompt-category-badge');
            const itemCategory = categoryBadge ? categoryBadge.getAttribute('data-category') : '';

            // Show item if no filter selected or category matches
            item.style.display = selectedCategory === '' || itemCategory === selectedCategory ? '' : 'none';
          });
        });
      }
    },

    async savePurge() {
      const input = document.getElementById('purge-days');
      const container = getSettingsContainer();
      const raw = input ? input.value : '';
      const days = raw ? parseInt(raw, 10) : NaN;
      if (!Number.isInteger(days) || days <= 0) {
        showError('Enter a purge value greater than 0 (days).');
        return;
      }
      try {
        await updateConfigEntry('purge', 'config', { older_than_days: days });
        invalidateConfigCache();
        Utils.showToast('Purge settings saved', 'success', 3000);
        if (container) await loadAutomationTab(container);
      } catch (err) {
        showError(err.message || err);
      }
    },

    async saveQueueRunner() {
      const pollInput = document.getElementById('qr-poll-interval');
      const autoFailInput = document.getElementById('qr-auto-fail-interval');
      const baseUrlInput = document.getElementById('qr-base-url');
      const container = getSettingsContainer();

      const pollVal = pollInput ? parseInt(pollInput.value, 10) : NaN;
      const autoFailVal = autoFailInput ? parseInt(autoFailInput.value, 10) : NaN;
      const baseUrlVal = baseUrlInput ? baseUrlInput.value.trim() : '';

      if (!Number.isInteger(pollVal) || pollVal <= 0) {
        showError('Enter a queue runner poll interval greater than 0 (seconds).');
        return;
      }
      if (!Number.isInteger(autoFailVal) || autoFailVal <= 0) {
        showError('Enter an auto-fail interval greater than 0 (seconds).');
        return;
      }

      const payload = {
        poll_interval: pollVal,
        auto_fail_interval_seconds: autoFailVal,
      };
      if (baseUrlVal) {
        payload.base_url = baseUrlVal;
      }

      try {
        await updateConfigEntry('queue_runner', 'config', payload);
        invalidateConfigCache();
        Utils.showToast('Queue runner settings saved', 'success', 3000);
        if (container) await loadAutomationTab(container);
      } catch (err) {
        showError(err.message || err);
      }
    },

    goToRunningTasks() {
      if (Utils.navigateTo) {
        Utils.navigateTo('dashboard');
      } else {
        window.location.assign('/dashboard');
      }
    },

    async saveBuildId() {
      const input = document.getElementById('build-id-input');
      const container = getSettingsContainer();
      const value = input ? (input.value || '').trim() : '';
      if (!value) {
        showError('Build ID cannot be empty.');
        return;
      }
      try {
        await updateConfigEntry('ui', 'build_id', value);
        invalidateConfigCache();
        Utils.showToast('Build ID saved', 'success', 3000);
        if (container) await loadAdvancedTab(container);
      } catch (err) {
        showError(err.message || err);
      }
    },

    async saveFeatureFlags() {
      const container = getSettingsContainer();
      try {
        const flags = parseJSONField('feature-flags-input');
        await updateConfigEntry('features', 'flags', flags);
        invalidateConfigCache();
        Utils.showToast('Feature flags saved', 'success', 3000);
        if (container) await loadAdvancedTab(container);
      } catch (err) {
        showError(err.message || err);
      }
    },

    async saveTools() {
      const container = getSettingsContainer();
      try {
        const tools = parseJSONField('tools-json-input');
        await updateConfigEntry('tools', 'all', tools);
        invalidateConfigCache();
        Utils.showToast('Tools updated', 'success', 3000);
        if (container) await loadTaskExecutionTab(container);
      } catch (err) {
        showError(err.message || err);
      }
    },

    async saveTaskClasses() {
      const container = getSettingsContainer();
      try {
        const taskClasses = parseJSONField('task-classes-json-input');
        await updateConfigEntry('task_classes', 'all', taskClasses);
        invalidateConfigCache();
        Utils.showToast('Task classes updated', 'success', 3000);
        if (container) await loadTaskExecutionTab(container);
      } catch (err) {
        showError(err.message || err);
      }
    },

    async saveQueueDefaults() {
      const container = getSettingsContainer();
      try {
        const defaults = parseJSONField('queue-defaults-json-input');
        await updateConfigEntry('defaults', 'queue', defaults);
        invalidateConfigCache();
        Utils.showToast('Queue defaults updated', 'success', 3000);
        if (container) await loadAdvancedTab(container);
      } catch (err) {
        showError(err.message || err);
      }
    },

    async saveDefaultModel() {
      const container = getSettingsContainer();
      const modelSelect = document.getElementById('default-model-select');
      const selectedModel = modelSelect?.value || 'llm-sonnet';

      if (!selectedModel) {
        showError('Please select a default model.');
        return;
      }

      try {
        await updateConfigEntry('defaults', 'model', selectedModel);
        invalidateConfigCache();
        Utils.showToast('Default model saved', 'success', 3000);
        if (container) await loadTaskExecutionTab(container);
      } catch (err) {
        showError(err.message || err);
      }
    },

    async saveTaskClassRow() {
      const container = getSettingsContainer();
      const nameInput = document.getElementById('task-class-name-input');
      const timeoutInput = document.getElementById('task-class-timeout-input');
      const descInput = document.getElementById('task-class-desc-input');
      const name = (nameInput?.value || '').trim();
      const timeoutVal = timeoutInput ? parseInt(timeoutInput.value, 10) : NaN;
      const description = descInput?.value || null;

      if (!name) {
        showError('Task class name is required.');
        return;
      }
      if (!Number.isInteger(timeoutVal) || timeoutVal <= 0) {
        showError('Timeout must be greater than 0.');
        return;
      }

      try {
        await api('POST', '/api/task-classes', { name, timeout: timeoutVal, description }, { action: 'save task class' });
        invalidateConfigCache();
        Utils.showToast('Task class saved', 'success', 3000);
        if (container) await loadTaskExecutionTab(container);
      } catch (err) {
        showError(err.message || err);
      }
    },

    async deleteTaskClassRow(name) {
      const container = getSettingsContainer();
      if (!name) return;
      try {
        await api('DELETE', `/api/task-classes/${encodeURIComponent(name)}`, null, { action: 'delete task class' });
        invalidateConfigCache();
        Utils.showToast(`Task class ${name} deleted`, 'success', 3000);
        if (container) await loadTaskExecutionTab(container);
      } catch (err) {
        showError(err.message || err);
      }
    },

    async saveToolRow() {
      const container = getSettingsContainer();
      const nameInput = document.getElementById('tool-name-input');
      const descInput = document.getElementById('tool-desc-input');
      const taskClassSelect = document.getElementById('tool-task-class-select');
      const name = (nameInput?.value || '').trim();
      const description = descInput?.value || '';
      const taskClass = taskClassSelect?.value || '';

      if (!name) {
        showError('Tool name is required.');
        return;
      }
      if (!taskClass) {
        showError('Task class is required for a tool.');
        return;
      }

      try {
        await api('POST', '/api/tools', { name, description, task_class: taskClass }, { action: 'save tool' });
        invalidateConfigCache();
        Utils.showToast('Tool saved', 'success', 3000);
        if (container) await loadTaskExecutionTab(container);
      } catch (err) {
        showError(err.message || err);
      }
    },

    async deleteToolRow(name) {
      const container = getSettingsContainer();
      if (!name) return;
      try {
        await api('DELETE', `/api/tools/${encodeURIComponent(name)}`, null, { action: 'delete tool' });
        invalidateConfigCache();
        Utils.showToast(`Tool ${name} deleted`, 'success', 3000);
        if (container) await loadTaskExecutionTab(container);
      } catch (err) {
        showError(err.message || err);
      }
    },

    async saveProjectConfig() {
      const container = getSettingsContainer();
      const nameInput = document.getElementById('project-name');
      const repoPathInput = document.getElementById('project-repo-path');
      const prdPathInput = document.getElementById('project-prd-path');

      const name = (nameInput?.value || '').trim();
      const repoPath = (repoPathInput?.value || '').trim();
      const prdPath = (prdPathInput?.value || '').trim() || null;

      if (!name) {
        showError('Project name is required.');
        return;
      }
      if (!repoPath) {
        showError('Repo path is required.');
        return;
      }

      try {
        await updateConfigEntry('project', 'config', { name, repo_path: repoPath, prd_path: prdPath });
        invalidateConfigCache();
        Utils.showToast('Project configuration saved', 'success', 3000);
        if (container) await loadAdvancedTab(container);
      } catch (err) {
        showError(err.message || err);
      }
    },

    async saveScriptDirs() {
      const container = getSettingsContainer();
      const sparkqInput = document.getElementById('sparkq-scripts-dir');
      const projectInput = document.getElementById('project-script-dirs');

      const sparkqDir = (sparkqInput?.value || '').trim();
      const projectDirs = (projectInput?.value || '').trim()
        .split(',')
        .map(d => d.trim())
        .filter(d => d.length > 0);

      if (!sparkqDir) {
        showError('SparkQ scripts directory is required.');
        return;
      }

      try {
        await updateConfigEntry('sparkq_scripts_dir', 'config', sparkqDir);
        await updateConfigEntry('project_script_dirs', 'config', projectDirs);
        invalidateConfigCache();
        Utils.showToast('Script directories saved', 'success', 3000);
        if (container) await loadAdvancedTab(container);
      } catch (err) {
        showError(err.message || err);
      }
    },

    async exportConfig() {
      try {
        const config = await api('GET', '/api/config', null, { action: 'export config' });
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sparkq-config.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        Utils.showToast('Configuration exported', 'success', 3000);
      } catch (err) {
        showError(`Failed to export config: ${err.message || err}`, err);
      }
    },

    async validateConfig() {
      try {
        await api('POST', '/api/config/validate', null, { action: 'validate config' });
        Utils.showToast('Configuration is valid', 'success', 3000);
      } catch (err) {
        showError(`Configuration validation failed: ${err.message || err}`, err);
      }
    }
  };

  Pages.Settings = Pages.Config;

})(window.Pages, window.API, window.Utils);
