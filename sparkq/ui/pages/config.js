(function(Pages, API, Utils) {
  'use strict';

  const api = API.api;
  const formatValue = Utils.formatValue;
  const showError = Utils.showError;
  let cachedConfig = null;

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
        <div style="display: flex; gap: 0;">
          <button id="general-tab" class="tab-btn" style="padding: 12px 24px; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; font-size: 14px; font-weight: 500; color: #a1a1aa; transition: all 0.2s;" data-active="true">
            General
          </button>
          <button id="prompts-tab" class="tab-btn" style="padding: 12px 24px; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; font-size: 14px; font-weight: 500; color: #a1a1aa; transition: all 0.2s;">
            Quick Prompts
          </button>
        </div>
      </div>
      <div id="tab-content"></div>
    `;

    // Attach tab switching handlers
    attachTabSwitching(container);

    // Load default tab (General)
    await loadGeneralTab(container);
  }

  function attachTabSwitching(container) {
    const tabs = container.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', async (e) => {
        // Remove active state from all tabs
        tabs.forEach(t => {
          t.style.color = '#a1a1aa';
          t.style.borderBottomColor = 'transparent';
          t.setAttribute('data-active', 'false');
        });

        // Add active state to clicked tab
        e.target.style.color = '#f4f4f5';
        e.target.style.borderBottomColor = '#3b82f6';
        e.target.setAttribute('data-active', 'true');

        // Load appropriate tab content
        const tabContent = container.querySelector('#tab-content');
        if (e.target.id === 'general-tab') {
          await loadGeneralTab(container);
        } else if (e.target.id === 'prompts-tab') {
          await loadPromptsTab(container);
        }
      });
    });

    // Set initial active state
    const generalTab = container.querySelector('#general-tab');
    if (generalTab) {
      generalTab.style.color = '#f4f4f5';
      generalTab.style.borderBottomColor = '#3b82f6';
    }
  }

  async function loadGeneralTab(container) {
    const tabContent = container.querySelector('#tab-content');
    if (!tabContent) return;

    tabContent.innerHTML = `
      <div class="card">
        <div class="muted"><span class="loading"></span> Loading configuration…</div>
      </div>
    `;

    let config = null;
    try {
      config = await api('GET', '/api/config', null, { action: 'load configuration' });
      cachedConfig = config;
    } catch (err) {
      tabContent.innerHTML = `
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
    const featureFlags = (config?.features && config.features.flags) || {};
    const uiBuildId = (config?.ui && config.ui.build_id) || '';
    const queueDefaults = (config?.defaults && config.defaults.queue) || {};

    const toolsJSON = toJSONText(tools);
    const taskClassJSON = toJSONText(taskClasses);
    const featureFlagsJSON = toJSONText(featureFlags);
    const queueDefaultsJSON = toJSONText(queueDefaults);
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
                  <button class="delete-tool-row" data-name="${name}" style="padding:6px 10px; background:#27272a; color:#ef4444; border:1px solid #3f3f46; border-radius:4px; cursor:pointer; font-size:12px;">Delete</button>
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
                  <button class="delete-task-class-row" data-name="${name}" style="padding:6px 10px; background:#27272a; color:#ef4444; border:1px solid #3f3f46; border-radius:4px; cursor:pointer; font-size:12px;">Delete</button>
                </td>
              </tr>
            `,
          )
          .join('')
      : `<tr><td colspan="4" style="text-align:center; color:#a1a1aa;">No task classes</td></tr>`;

    tabContent.innerHTML = `
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
        <div style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap;">
          <div>
            <label style="display:block; margin-bottom:6px; color:#a1a1aa;">Older Than Days</label>
            <input id="purge-days" type="number" min="1" value="${formatValue(purge.older_than_days, '')}" style="width:120px; padding:8px 10px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5;" />
          </div>
          <button id="save-purge-btn" style="padding:10px 16px; background:#3b82f6; color:white; border:none; border-radius:6px; cursor:pointer;">Save Purge</button>
        </div>
      </div>
      <div class="grid grid-2">
        <div class="card">
          <h2>Build Metadata</h2>
          <label style="display:block; margin-bottom:6px; color:#a1a1aa;">Build ID</label>
          <div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
            <input id="build-id-input" type="text" value="${formatValue(uiBuildId, '')}" style="min-width:200px; padding:8px 10px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5;" />
            <button id="save-build-btn" style="padding:10px 16px; background:#3b82f6; color:white; border:none; border-radius:6px; cursor:pointer;">Save Build ID</button>
          </div>
        </div>
        <div class="card">
          <h2>Feature Flags</h2>
          <p class="muted" style="margin-top:0;">Edit JSON object of feature flags (key → boolean).</p>
          <textarea id="feature-flags-input" rows="6" style="width:100%; padding:10px 12px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5; font-family:'Courier New', monospace; resize:vertical;">${featureFlagsJSON}</textarea>
          <div style="margin-top:10px; display:flex; gap:10px; justify-content:flex-end;">
            <button id="save-flags-btn" style="padding:10px 16px; background:#3b82f6; color:white; border:none; border-radius:6px; cursor:pointer;">Save Flags</button>
          </div>
        </div>
      </div>
      <div class="grid grid-2">
        <div class="card">
          <h2>Tools (JSON editor)</h2>
          <p class="muted" style="margin-top:0;">JSON object keyed by tool name with description/task_class.</p>
          <textarea id="tools-json-input" rows="10" style="width:100%; padding:10px 12px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5; font-family:'Courier New', monospace; resize:vertical;">${toolsJSON}</textarea>
          <div style="margin-top:10px; display:flex; gap:10px; justify-content:flex-end;">
            <button id="save-tools-btn" style="padding:10px 16px; background:#3b82f6; color:white; border:none; border-radius:6px; cursor:pointer;">Validate & Save</button>
          </div>
          <div style="margin-top:16px; border-top:1px solid #3f3f46; padding-top:12px;">
            <h3 style="margin:0 0 8px;">Tools (row editor)</h3>
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
              <button id="save-tool-row-btn" style="padding:10px 16px; background:#3b82f6; color:white; border:none; border-radius:6px; cursor:pointer;">Save Tool</button>
            </div>
          </div>
        </div>
        <div class="card">
          <h2>Task Classes (JSON editor)</h2>
          <p class="muted" style="margin-top:0;">JSON object keyed by class name with timeout (seconds).</p>
          <textarea id="task-classes-json-input" rows="10" style="width:100%; padding:10px 12px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5; font-family:'Courier New', monospace; resize:vertical;">${taskClassJSON}</textarea>
          <div style="margin-top:10px; display:flex; gap:10px; justify-content:flex-end;">
            <button id="save-task-classes-btn" style="padding:10px 16px; background:#3b82f6; color:white; border:none; border-radius:6px; cursor:pointer;">Validate & Save</button>
          </div>
          <div style="margin-top:16px; border-top:1px solid #3f3f46; padding-top:12px;">
            <h3 style="margin:0 0 8px;">Task Classes (row editor)</h3>
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
              <button id="save-task-class-row-btn" style="padding:10px 16px; background:#3b82f6; color:white; border:none; border-radius:6px; cursor:pointer;">Save Task Class</button>
            </div>
          </div>
        </div>
      </div>
      <div class="card">
        <h2>Queue Defaults (JSON editor)</h2>
        <p class="muted" style="margin-top:0;">Optional queue defaults (object). Leave empty to keep defaults.</p>
        <textarea id="queue-defaults-json-input" rows="6" style="width:100%; padding:10px 12px; background:#27272a; border:1px solid #3f3f46; border-radius:6px; color:#f4f4f5; font-family:'Courier New', monospace; resize:vertical;">${queueDefaultsJSON}</textarea>
        <div style="margin-top:10px; display:flex; gap:10px; justify-content:flex-end;">
          <button id="save-queue-defaults-btn" style="padding:10px 16px; background:#3b82f6; color:white; border:none; border-radius:6px; cursor:pointer;">Validate & Save</button>
        </div>
      </div>
    `;

    // Attach handlers
    const purgeBtn = tabContent.querySelector('#save-purge-btn');
    if (purgeBtn) {
      purgeBtn.addEventListener('click', async () => {
        await Pages.Config.savePurge();
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
    const toolsBtn = tabContent.querySelector('#save-tools-btn');
    if (toolsBtn) {
      toolsBtn.addEventListener('click', async () => {
        await Pages.Config.saveTools();
      });
    }
    const taskClassesBtn = tabContent.querySelector('#save-task-classes-btn');
    if (taskClassesBtn) {
      taskClassesBtn.addEventListener('click', async () => {
        await Pages.Config.saveTaskClasses();
      });
    }
    const queueDefaultsBtn = tabContent.querySelector('#save-queue-defaults-btn');
    if (queueDefaultsBtn) {
      queueDefaultsBtn.addEventListener('click', async () => {
        await Pages.Config.saveQueueDefaults();
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
          <button id="new-prompt-btn" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">
            + New Prompt
          </button>
        </div>
        <div id="prompt-list">
          ${promptListHtml}
        </div>
      </div>

      <!-- Modal for Create/Edit Prompt -->
      <div id="prompt-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); z-index: 1000; overflow-y: auto;">
        <div style="min-height: 100%; display: flex; align-items: center; justify-content: center; padding: 20px;">
          <div style="background: #1a1f2e; border-radius: 8px; max-width: 600px; width: 100%; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);">
            <div style="padding: 24px; border-bottom: 1px solid #3f3f46;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <h2 id="modal-title" style="margin: 0;">New Prompt</h2>
                <button id="close-modal-btn" style="background: none; border: none; color: #a1a1aa; font-size: 24px; cursor: pointer; padding: 0; width: 32px; height: 32px; line-height: 1;">×</button>
              </div>
            </div>
            <div style="padding: 24px;">
              <form id="prompt-form">
                <input type="hidden" id="prompt-id" value="">

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
            <button class="edit-prompt-btn" data-prompt-id="${prompt.id}" style="padding: 6px 12px; background: #27272a; color: #f4f4f5; border: 1px solid #3f3f46; border-radius: 4px; cursor: pointer; font-size: 13px;">
              Edit
            </button>
            <button class="delete-prompt-btn" data-prompt-id="${prompt.id}" style="padding: 6px 12px; background: #27272a; color: #ef4444; border: 1px solid #3f3f46; border-radius: 4px; cursor: pointer; font-size: 13px;">
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

  Pages.Config = {
    async render(container) {
      await renderConfigPage(container);
    },

    showPromptModal() {
      const modal = document.getElementById('prompt-modal');
      const form = document.getElementById('prompt-form');
      const modalTitle = document.getElementById('modal-title');

      // Reset form for new prompt
      if (form) form.reset();
      if (modalTitle) modalTitle.textContent = 'New Prompt';
      document.getElementById('prompt-id').value = '';

      if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
      }

      // Focus first input
      setTimeout(() => {
        const commandInput = document.getElementById('prompt-command');
        if (commandInput) commandInput.focus();
      }, 100);
    },

    hidePromptModal() {
      const modal = document.getElementById('prompt-modal');
      if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
      }
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
          await loadPromptsTab(container);

          // Reattach tab switching (since we reloaded content)
          attachTabSwitching(container);

          // Set prompts tab as active
          const tabs = container.querySelectorAll('.tab-btn');
          tabs.forEach(t => {
            t.style.color = '#a1a1aa';
            t.style.borderBottomColor = 'transparent';
            t.setAttribute('data-active', 'false');
          });
          const promptsTab = container.querySelector('#prompts-tab');
          if (promptsTab) {
            promptsTab.style.color = '#f4f4f5';
            promptsTab.style.borderBottomColor = '#3b82f6';
            promptsTab.setAttribute('data-active', 'true');
          }

          // Reattach edit/delete handlers
          Pages.Config.attachPromptHandlers();
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
          await loadPromptsTab(container);

          // Reattach tab switching
          attachTabSwitching(container);

          // Set prompts tab as active
          const tabs = container.querySelectorAll('.tab-btn');
          tabs.forEach(t => {
            t.style.color = '#a1a1aa';
            t.style.borderBottomColor = 'transparent';
            t.setAttribute('data-active', 'false');
          });
          const promptsTab = container.querySelector('#prompts-tab');
          if (promptsTab) {
            promptsTab.style.color = '#f4f4f5';
            promptsTab.style.borderBottomColor = '#3b82f6';
            promptsTab.setAttribute('data-active', 'true');
          }

          // Reattach edit/delete handlers
          Pages.Config.attachPromptHandlers();
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
      await updateConfigEntry('purge', 'config', { older_than_days: days });
      Utils.showToast('Purge settings saved', 'success', 3000);
      if (container) await loadGeneralTab(container);
    },

    async saveBuildId() {
      const input = document.getElementById('build-id-input');
      const container = document.querySelector('.page-content');
      const value = input ? (input.value || '').trim() : '';
      if (!value) {
        showError('Build ID cannot be empty.');
        return;
      }
      await updateConfigEntry('ui', 'build_id', value);
      Utils.showToast('Build ID saved', 'success', 3000);
      if (container) await loadGeneralTab(container);
    },

    async saveFeatureFlags() {
      const container = document.querySelector('.page-content');
      try {
        const flags = parseJSONField('feature-flags-input');
        await updateConfigEntry('features', 'flags', flags);
        Utils.showToast('Feature flags saved', 'success', 3000);
        if (container) await loadGeneralTab(container);
      } catch (err) {
        showError(err.message || err);
      }
    },

    async saveTools() {
      const container = document.querySelector('.page-content');
      try {
        const tools = parseJSONField('tools-json-input');
        await updateConfigEntry('tools', 'all', tools);
        Utils.showToast('Tools updated', 'success', 3000);
        if (container) await loadGeneralTab(container);
      } catch (err) {
        showError(err.message || err);
      }
    },

    async saveTaskClasses() {
      const container = document.querySelector('.page-content');
      try {
        const taskClasses = parseJSONField('task-classes-json-input');
        await updateConfigEntry('task_classes', 'all', taskClasses);
        Utils.showToast('Task classes updated', 'success', 3000);
        if (container) await loadGeneralTab(container);
      } catch (err) {
        showError(err.message || err);
      }
    },

    async saveQueueDefaults() {
      const container = document.querySelector('.page-content');
      try {
        const defaults = parseJSONField('queue-defaults-json-input');
        await updateConfigEntry('defaults', 'queue', defaults);
        Utils.showToast('Queue defaults updated', 'success', 3000);
        if (container) await loadGeneralTab(container);
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
        Utils.showToast('Task class saved', 'success', 3000);
        if (container) await loadGeneralTab(container);
      } catch (err) {
        showError(err.message || err);
      }
    },

    async deleteTaskClassRow(name) {
      const container = document.querySelector('.page-content');
      if (!name) return;
      try {
        await api('DELETE', `/api/task-classes/${encodeURIComponent(name)}`, null, { action: 'delete task class' });
        Utils.showToast(`Task class ${name} deleted`, 'success', 3000);
        if (container) await loadGeneralTab(container);
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
        Utils.showToast('Tool saved', 'success', 3000);
        if (container) await loadGeneralTab(container);
      } catch (err) {
        showError(err.message || err);
      }
    },

    async deleteToolRow(name) {
      const container = document.querySelector('.page-content');
      if (!name) return;
      try {
        await api('DELETE', `/api/tools/${encodeURIComponent(name)}`, null, { action: 'delete tool' });
        Utils.showToast(`Tool ${name} deleted`, 'success', 3000);
        if (container) await loadGeneralTab(container);
      } catch (err) {
        showError(err.message || err);
      }
    }
  };

})(window.Pages, window.API, window.Utils);
