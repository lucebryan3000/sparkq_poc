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

  async function renderConfigPage(container) {
    if (!container) {
      return;
    }

    // Create tab structure with inline styles
    container.innerHTML = `
      <div style="margin-bottom: 20px; border-bottom: 2px solid #3f3f46;">
        <div style="display: flex; gap: 0;" role="tablist" aria-label="Configuration sections" data-tablist>
          <button type="button" id="overview-tab" class="tab-btn" role="tab" aria-selected="true" aria-controls="tab-content" data-tab-target="overview" style="padding: 12px 24px; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; font-size: 14px; font-weight: 500; color: #a1a1aa; transition: all 0.2s;" data-active="true" tabindex="0">
            Overview
          </button>
          <button type="button" id="task-execution-tab" class="tab-btn" role="tab" aria-selected="false" aria-controls="tab-content" data-tab-target="task-execution" style="padding: 12px 24px; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; font-size: 14px; font-weight: 500; color: #a1a1aa; transition: all 0.2s;" tabindex="-1">
            Task Execution
          </button>
          <button type="button" id="automation-tab" class="tab-btn" role="tab" aria-selected="false" aria-controls="tab-content" data-tab-target="automation" style="padding: 12px 24px; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; font-size: 14px; font-weight: 500; color: #a1a1aa; transition: all 0.2s;" tabindex="-1">
            Automation
          </button>
          <button type="button" id="prompts-tab" class="tab-btn" role="tab" aria-selected="false" aria-controls="tab-content" data-tab-target="prompts" style="padding: 12px 24px; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; font-size: 14px; font-weight: 500; color: #a1a1aa; transition: all 0.2s;" tabindex="-1">
            Quick Prompts
          </button>
          <button type="button" id="advanced-tab" class="tab-btn" role="tab" aria-selected="false" aria-controls="tab-content" data-tab-target="advanced" style="padding: 12px 24px; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; font-size: 14px; font-weight: 500; color: #a1a1aa; transition: all 0.2s;" tabindex="-1">
            Advanced
          </button>
        </div>
      </div>
      <div id="tab-content" role="tabpanel" tabindex="0" aria-labelledby="overview-tab"></div>
    `;

    // Attach tab switching handlers
    attachTabSwitching(container);

    // Load default tab (Overview)
    await setActiveTab(container, 'overview', { forceReload: true });
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
      tab.style.color = isActive ? '#f4f4f5' : '#a1a1aa';
      tab.style.borderBottomColor = isActive ? '#3b82f6' : 'transparent';

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
          <button type="button" id="qa-purge-tasks" style="padding: 10px 16px; background: #27272a; color: #f4f4f5; border: 1px solid #3f3f46; border-radius: 6px; cursor: pointer;">
            🗑️ Purge Old Tasks
          </button>
          <button type="button" id="qa-reload-config" style="padding: 10px 16px; background: #27272a; color: #f4f4f5; border: 1px solid #3f3f46; border-radius: 6px; cursor: pointer;">
            🔄 Reload Config
          </button>
          <button type="button" id="qa-view-all-tasks" style="padding: 10px 16px; background: #27272a; color: #f4f4f5; border: 1px solid #3f3f46; border-radius: 6px; cursor: pointer;">
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
        const navBtn = document.querySelector(".nav-tab[data-tab='sparkqueue']");
        if (navBtn) {
          navBtn.click();
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
                  <button type="button" class="delete-tool-row" data-name="${name}" style="padding:6px 10px; background:#27272a; color:#ef4444; border:1px solid #3f3f46; border-radius:4px; cursor:pointer; font-size:12px;">Delete</button>
                </td>
              </tr>
            `,
          )
          .join('')
      : `<tr><td colspan="4" style="text-align:center; color:#a1a1aa;">No tools</td></tr>`;
    const taskClassRows = taskClassEntries.length
      ? taskClassEntries
          .map(
            ([name, detail]) => `
              <tr>
                <td>${formatValue(name, '—')}</td>
                <td>${formatValue(detail?.timeout, '—')}</td>
                <td>${formatValue(detail?.description, '—')}</td>
                <td style="text-align:right;">
                  <button type="button" class="delete-task-class-row" data-name="${name}" style="padding:6px 10px; background:#27272a; color:#ef4444; border:1px solid #3f3f46; border-radius:4px; cursor:pointer; font-size:12px;">Delete</button>
                </td>
              </tr>
            `,
          )
          .join('')
      : `<tr><td colspan="4" style="text-align:center; color:#a1a1aa;">No task classes</td></tr>`;

    tabContent.innerHTML = `
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
            <label style="display:block; margin-bottom:4px; color:#a1a1aa;">Name</label>
            <input id="tool-name-input" type="text" placeholder="llm-haiku" style="width:160px; padding:8px 10px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5;" />
          </div>
          <div>
            <label style="display:block; margin-bottom:4px; color:#a1a1aa;">Description</label>
            <input id="tool-desc-input" type="text" placeholder="Description" style="width:200px; padding:8px 10px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5;" />
          </div>
          <div>
            <label style="display:block; margin-bottom:4px; color:#a1a1aa;">Task Class</label>
            <select id="tool-task-class-select" style="padding:8px 10px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5; min-width:160px;">
              ${(taskClassEntries || []).map(([name]) => `<option value="${name}">${name}</option>`).join('')}
            </select>
          </div>
          <button type="button" id="save-tool-row-btn" style="padding:10px 16px; background:#3b82f6; color:white; border:none; border-radius:6px; cursor:pointer;">Save Tool</button>
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
            <label style="display:block; margin-bottom:4px; color:#a1a1aa;">Name</label>
            <input id="task-class-name-input" type="text" placeholder="LLM_LITE" style="width:160px; padding:8px 10px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5;" />
          </div>
          <div>
            <label style="display:block; margin-bottom:4px; color:#a1a1aa;">Timeout (seconds)</label>
            <input id="task-class-timeout-input" type="number" min="1" placeholder="300" style="width:140px; padding:8px 10px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5;" />
          </div>
          <div>
            <label style="display:block; margin-bottom:4px; color:#a1a1aa;">Description</label>
            <input id="task-class-desc-input" type="text" placeholder="Optional" style="width:200px; padding:8px 10px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5;" />
          </div>
          <button type="button" id="save-task-class-row-btn" style="padding:10px 16px; background:#3b82f6; color:white; border:none; border-radius:6px; cursor:pointer;">Save Task Class</button>
        </div>
      </div>
    `;

    // Attach handlers
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
            <label style="display:block; margin-bottom:6px; color:#a1a1aa;">Older Than Days</label>
            <input id="purge-days" type="number" min="1" value="${formatValue(purge.older_than_days, '')}" style="width:120px; padding:8px 10px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5;" />
          </div>
          <button type="button" id="save-purge-btn" style="padding:10px 16px; background:#3b82f6; color:white; border:none; border-radius:6px; cursor:pointer;">Save Purge</button>
        </div>
      </div>
      <div class="card">
        <h2>Queue Runner</h2>
        <p class="muted">Controls background poll interval and auto-fail cadence.</p>
        <div style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap;">
          <div>
            <label style="display:block; margin-bottom:6px; color:#a1a1aa;">Poll Interval (s)</label>
            <input id="qr-poll-interval" type="number" min="1" value="${formatValue(queueRunner.poll_interval, '')}" style="width:140px; padding:8px 10px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5;" />
          </div>
          <div>
            <label style="display:block; margin-bottom:6px; color:#a1a1aa;">Auto-fail Interval (s)</label>
            <input id="qr-auto-fail-interval" type="number" min="1" value="${formatValue(autoFailIntervalSeconds, '')}" style="width:160px; padding:8px 10px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5;" />
          </div>
          <div style="flex:1; min-width:200px;">
            <label style="display:block; margin-bottom:6px; color:#a1a1aa;">Base URL (optional)</label>
            <input id="qr-base-url" type="text" placeholder="http://host:port" value="${formatValue(queueRunner.base_url, '')}" style="width:100%; padding:8px 10px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5;" />
          </div>
          <button type="button" id="save-queue-runner-btn" style="padding:10px 16px; background:#3b82f6; color:white; border:none; border-radius:6px; cursor:pointer;">Save Queue Runner</button>
        </div>
      </div>
      <div class="card">
        <h2>Stale Handling</h2>
        <p>Warn at <strong>${formatValue(warnMultiplier, '1')}</strong>x timeout; auto-fail at <strong>${formatValue(failMultiplier, '2')}</strong>x.</p>
        <p class="muted">Auto-fail runs on the server cadence above. Use this to jump to running tasks and inspect warnings.</p>
        <button type="button" id="view-running-tasks-btn" style="padding:10px 16px; background:#27272a; color:#f4f4f5; border:1px solid #3f3f46; border-radius:6px; cursor:pointer;">View Running Tasks</button>
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
            <label style="display:block; margin-bottom:6px; color:#a1a1aa;">Project Name</label>
            <input id="project-name" type="text" value="${formatValue(project.name, '')}" style="width:200px; padding:8px 10px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5;" />
          </div>
          <div>
            <label style="display:block; margin-bottom:6px; color:#a1a1aa;">Repo Path</label>
            <input id="project-repo-path" type="text" value="${formatValue(project.repo_path, '')}" style="width:300px; padding:8px 10px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5;" />
          </div>
          <div>
            <label style="display:block; margin-bottom:6px; color:#a1a1aa;">PRD Path (optional)</label>
            <input id="project-prd-path" type="text" value="${formatValue(project.prd_path, '')}" style="width:300px; padding:8px 10px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5;" />
          </div>
          <button type="button" id="save-project-config-btn" style="padding:10px 16px; background:#3b82f6; color:white; border:none; border-radius:6px; cursor:pointer;">Save Project</button>
        </div>
      </div>
      <div class="card">
        <h2>Script Directories</h2>
        <p class="muted">Directories to search for executable scripts.</p>
        <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
          <div>
            <label style="display:block; margin-bottom:6px; color:#a1a1aa;">SparkQ Scripts Dir</label>
            <input id="sparkq-scripts-dir" type="text" value="${formatValue(scriptDirs, '')}" style="width:200px; padding:8px 10px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5;" />
          </div>
          <div>
            <label style="display:block; margin-bottom:6px; color:#a1a1aa;">Project Script Dirs (comma-separated)</label>
            <input id="project-script-dirs" type="text" value="${formatValue(projectScriptDirs, '')}" style="width:300px; padding:8px 10px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5;" />
          </div>
          <button type="button" id="save-script-dirs-btn" style="padding:10px 16px; background:#3b82f6; color:white; border:none; border-radius:6px; cursor:pointer;">Save Script Dirs</button>
        </div>
      </div>
      <div class="grid grid-2">
        <div class="card">
          <h2>Build Metadata</h2>
          <label style="display:block; margin-bottom:6px; color:#a1a1aa;">Build ID</label>
          <div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
            <input id="build-id-input" type="text" value="${formatValue(uiBuildId, '')}" style="min-width:200px; padding:8px 10px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5;" />
            <button type="button" id="save-build-btn" style="padding:10px 16px; background:#3b82f6; color:white; border:none; border-radius:6px; cursor:pointer;">Save Build ID</button>
          </div>
        </div>
        <div class="card">
          <h2>Feature Flags</h2>
          <p class="muted" style="margin-top:0;">Edit JSON object of feature flags (key → boolean).</p>
          <textarea id="feature-flags-input" rows="4" style="width:100%; padding:10px 12px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5; font-family:'Courier New', monospace; resize:vertical;">${featureFlagsJSON}</textarea>
          <div style="margin-top:10px; display:flex; gap:10px; justify-content:flex-end;">
            <button type="button" id="save-flags-btn" style="padding:10px 16px; background:#3b82f6; color:white; border:none; border-radius:6px; cursor:pointer;">Save Flags</button>
          </div>
        </div>
      </div>
      <div class="card">
        <h2>Queue Defaults</h2>
        <p class="muted" style="margin-top:0;">Optional queue defaults (object). Leave empty to keep defaults.</p>
        <textarea id="queue-defaults-json-input" rows="6" style="width:100%; padding:10px 12px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5; font-family:'Courier New', monospace; resize:vertical;">${queueDefaultsJSON}</textarea>
        <div style="margin-top:10px; display:flex; gap:10px; justify-content:flex-end;">
          <button type="button" id="save-queue-defaults-btn" style="padding:10px 16px; background:#3b82f6; color:white; border:none; border-radius:6px; cursor:pointer;">Validate & Save</button>
        </div>
      </div>
      <div class="card">
        <h2>Config Management</h2>
        <p class="muted">Export or validate your configuration.</p>
        <div style="display:flex; gap:12px;">
          <button type="button" id="export-config-btn" style="padding:10px 16px; background:#27272a; color:#f4f4f5; border:1px solid #3f3f46; border-radius:6px; cursor:pointer;">📥 Export Config</button>
          <button type="button" id="validate-config-btn" style="padding:10px 16px; background:#27272a; color:#f4f4f5; border:1px solid #3f3f46; border-radius:6px; cursor:pointer;">✅ Validate Config</button>
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

    const promptListHtml = prompts.length
      ? prompts.map(p => renderPromptItem(p)).join('')
      : '<p class="muted" style="text-align: center; padding: 40px 0;">No prompts yet. Click "New Prompt" to create one.</p>';

    tabContent.innerHTML = `
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="margin: 0;">Quick Prompts</h2>
          <button type="button" id="new-prompt-btn" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">
            + New Prompt
          </button>
        </div>
        <div id="prompt-list">
          ${promptListHtml}
        </div>
      </div>

      <!-- Modal for Create/Edit Prompt -->
      <div id="prompt-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); z-index: 1000; overflow-y: auto;" aria-hidden="true">
        <div style="min-height: 100%; display: flex; align-items: center; justify-content: center; padding: 20px;">
          <div data-dialog role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="prompt-dialog-description" tabindex="-1" style="background: #1a1f2e; border-radius: 8px; max-width: 600px; width: 100%; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);">
            <div style="padding: 24px; border-bottom: 1px solid #3f3f46;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <h2 id="modal-title" style="margin: 0;">New Prompt</h2>
                <button type="button" id="close-modal-btn" aria-label="Close prompt dialog" style="background: none; border: none; color: #a1a1aa; font-size: 24px; cursor: pointer; padding: 0; width: 32px; height: 32px; line-height: 1;">×</button>
              </div>
            </div>
            <div style="padding: 24px;">
              <form id="prompt-form">
                <input type="hidden" id="prompt-id" value="">
                <p id="prompt-dialog-description" style="margin: 0 0 16px; color: #a1a1aa; font-size: 13px;">Create or edit a reusable quick prompt template.</p>

                <div style="margin-bottom: 20px;">
                  <label for="prompt-command" style="display: block; margin-bottom: 8px; font-weight: 500; color: #f4f4f5;">Command</label>
                  <input type="text" id="prompt-command" required placeholder="e.g., code-review" style="width: 100%; padding: 10px 12px; background: #27272a; border: 1px solid #3f3f46; border-radius: 6px; color: #f4f4f5; font-size: 14px;">
                  <p style="margin: 6px 0 0; font-size: 12px; color: #71717a;">Lowercase letters, numbers, and hyphens only. Used with '>' trigger.</p>
                </div>

                <div style="margin-bottom: 20px;">
                  <label for="prompt-label" style="display: block; margin-bottom: 8px; font-weight: 500; color: #f4f4f5;">Label</label>
                  <input type="text" id="prompt-label" required placeholder="e.g., Code Review" style="width: 100%; padding: 10px 12px; background: #27272a; border: 1px solid #3f3f46; border-radius: 6px; color: #f4f4f5; font-size: 14px;">
                  <p style="margin: 6px 0 0; font-size: 12px; color: #71717a;">Display name shown in autocomplete popup.</p>
                </div>

                <div style="margin-bottom: 20px;">
                  <label for="prompt-description" style="display: block; margin-bottom: 8px; font-weight: 500; color: #f4f4f5;">Description (optional)</label>
                  <input type="text" id="prompt-description" placeholder="Brief description..." style="width: 100%; padding: 10px 12px; background: #27272a; border: 1px solid #3f3f46; border-radius: 6px; color: #f4f4f5; font-size: 14px;">
                </div>

                <div style="margin-bottom: 20px;">
                  <label for="prompt-template" style="display: block; margin-bottom: 8px; font-weight: 500; color: #f4f4f5;">Template Text</label>
                  <textarea id="prompt-template" required placeholder="Enter the template text that will be inserted..." rows="8" style="width: 100%; padding: 10px 12px; background: #27272a; border: 1px solid #3f3f46; border-radius: 6px; color: #f4f4f5; font-size: 14px; font-family: 'Courier New', monospace; resize: vertical;"></textarea>
                  <p style="margin: 6px 0 0; font-size: 12px; color: #71717a;">The text that will replace the command when selected.</p>
                </div>

                <div style="display: flex; gap: 12px; justify-content: flex-end;">
                  <button type="button" id="cancel-modal-btn" style="padding: 10px 20px; background: #27272a; color: #f4f4f5; border: 1px solid #3f3f46; border-radius: 6px; cursor: pointer; font-size: 14px;">
                    Cancel
                  </button>
                  <button type="submit" style="padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">
                    Save Prompt
                  </button>
                </div>
              </form>
            </div>
          </div>
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

  function renderPromptItem(prompt) {
    const description = prompt.description
      ? `<p style="margin: 4px 0 0; font-size: 13px; color: #71717a;">${formatValue(prompt.description, '')}</p>`
      : '';

    return `
      <div class="prompt-item" style="padding: 16px; border: 1px solid #3f3f46; border-radius: 6px; margin-bottom: 12px; background: #27272a;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 4px;">
              <span style="font-size: 20px;">📝</span>
              <div>
                <p style="margin: 0; font-weight: 600; color: #f4f4f5; font-size: 15px;">${formatValue(prompt.label, '—')}</p>
                <p style="margin: 4px 0 0; font-size: 13px; color: #a1a1aa; font-family: 'Courier New', monospace;">&gt;${formatValue(prompt.command, '—')}</p>
              </div>
            </div>
            ${description}
          </div>
          <div style="display: flex; gap: 8px; margin-left: 16px;">
            <button type="button" class="edit-prompt-btn" data-prompt-id="${prompt.id}" style="padding: 6px 12px; background: #27272a; color: #f4f4f5; border: 1px solid #3f3f46; border-radius: 4px; cursor: pointer; font-size: 13px;">
              Edit
            </button>
            <button type="button" class="delete-prompt-btn" data-prompt-id="${prompt.id}" style="padding: 6px 12px; background: #27272a; color: #ef4444; border: 1px solid #3f3f46; border-radius: 4px; cursor: pointer; font-size: 13px;">
              Delete
            </button>
          </div>
        </div>
      </div>
    `;
  }

  async function loadPromptIntoForm(promptId) {
    let prompt = null;
    try {
      prompt = await api('GET', `/api/prompts/${promptId}`, null, { action: 'load prompt details' });
    } catch (err) {
      showError(`Failed to load prompt: ${err.message || err}`, err);
      return;
    }

    const modalTitle = document.getElementById('modal-title');
    const promptIdInput = document.getElementById('prompt-id');
    const commandInput = document.getElementById('prompt-command');
    const labelInput = document.getElementById('prompt-label');
    const descriptionInput = document.getElementById('prompt-description');
    const templateInput = document.getElementById('prompt-template');

    if (modalTitle) modalTitle.textContent = 'Edit Prompt';
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

    showPromptModal() {
      const { modal, dialog } = getPromptModalElements();
      const form = document.getElementById('prompt-form');
      const modalTitle = document.getElementById('modal-title');

      // Reset form for new prompt
      if (form) form.reset();
      if (modalTitle) modalTitle.textContent = 'New Prompt';
      document.getElementById('prompt-id').value = '';

      lastFocusedElement = document.activeElement;

      if (modal) {
        modal.style.display = 'block';
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
      }
      if (dialog) {
        dialog.focus();
      }

      // Focus first input
      setTimeout(() => {
        const commandInput = document.getElementById('prompt-command');
        if (commandInput) commandInput.focus();
      }, 100);
    },

    hidePromptModal() {
      const { modal } = getPromptModalElements();
      if (modal) {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
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
        const container = document.querySelector('.page-content');
        if (container) {
          await setActiveTab(container, 'prompts', { forceReload: true });
        }
      } catch (err) {
        showError(`Failed to save prompt: ${err.message || err}`, err);
      }
    },

    async editPrompt(promptId) {
      await loadPromptIntoForm(promptId);
      Pages.Config.showPromptModal();
    },

    async deletePrompt(promptId) {
      if (!confirm('Are you sure you want to delete this prompt?')) {
        return;
      }

      try {
        await api('DELETE', `/api/prompts/${promptId}`, null, { action: 'delete prompt' });
        Utils.showToast('Prompt deleted successfully');

        // Reload prompts tab
        const container = document.querySelector('.page-content');
        if (container) {
          await setActiveTab(container, 'prompts', { forceReload: true });
        }
      } catch (err) {
        showError(`Failed to delete prompt: ${err.message || err}`, err);
      }
    },

    attachPromptHandlers() {
      const editBtns = document.querySelectorAll('.edit-prompt-btn');
      const deleteBtns = document.querySelectorAll('.delete-prompt-btn');

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
    },

    async savePurge() {
      const input = document.getElementById('purge-days');
      const container = document.querySelector('.page-content');
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
      const container = document.querySelector('.page-content');

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
      const navBtn = document.querySelector(".nav-tab[data-tab='sparkqueue']");
      if (navBtn) {
        navBtn.click();
      }
      setTimeout(() => {
        const statusSelect = document.querySelector('#sparkqueue-page #task-status-filter');
        if (statusSelect) {
          statusSelect.value = 'running';
          statusSelect.dispatchEvent(new Event('change'));
        }
      }, 150);
    },

    async saveBuildId() {
      const input = document.getElementById('build-id-input');
      const container = document.querySelector('.page-content');
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
      const container = document.querySelector('.page-content');
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
      const container = document.querySelector('.page-content');
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
      const container = document.querySelector('.page-content');
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
      const container = document.querySelector('.page-content');
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

    async saveTaskClassRow() {
      const container = document.querySelector('.page-content');
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
      const container = document.querySelector('.page-content');
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
      const container = document.querySelector('.page-content');
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
      const container = document.querySelector('.page-content');
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
      const container = document.querySelector('.page-content');
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
      const container = document.querySelector('.page-content');
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

})(window.Pages, window.API, window.Utils);
