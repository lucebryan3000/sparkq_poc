(function(Pages, API, Utils) {
  'use strict';

  const api = API.api;
  const formatValue = Utils.formatValue;
  const showError = Utils.showError;

  async function renderConfigPage(container) {
    if (!container) {
      return;
    }

    // Create tab structure with CSS classes
    container.innerHTML = `
      <div class="tab-button-group">
        <button id="general-tab" class="tab-button active" data-active="true">
          General
        </button>
        <button id="prompts-tab" class="tab-button">
          Quick Prompts
        </button>
      </div>
      <div id="tab-content"></div>
    `;

    // Attach tab switching handlers
    attachTabSwitching(container);

    // Load default tab (General)
    await loadGeneralTab(container);
  }

  function attachTabSwitching(container) {
    const tabs = container.querySelectorAll('.tab-button');
    tabs.forEach(tab => {
      tab.addEventListener('click', async (e) => {
        // Remove active state from all tabs
        tabs.forEach(t => {
          t.classList.remove('active');
          t.setAttribute('data-active', 'false');
        });

        // Add active state to clicked tab
        e.target.classList.add('active');
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
          <button id="new-prompt-btn" class="button-primary" style="padding: 8px 16px; font-size: 14px;">
            + New Prompt
          </button>
        </div>
        <div id="prompt-list">
          ${promptListHtml}
        </div>
      </div>

      <!-- Modal for Create/Edit Prompt -->
      <div id="prompt-modal" class="modal-overlay" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 1000; overflow-y: auto;">
        <div style="min-height: 100%; display: flex; align-items: center; justify-content: center; padding: 20px;">
          <div class="modal-content" style="border-radius: 8px; max-width: 600px; width: 100%; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);">
            <div class="modal-header" style="padding: 24px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <h2 id="modal-title" style="margin: 0;">New Prompt</h2>
                <button id="close-modal-btn" class="modal-close-btn" type="button">×</button>
              </div>
            </div>
            <div style="padding: 24px;">
              <form id="prompt-form">
                <input type="hidden" id="prompt-id" value="">

                <div class="form-group">
                  <label for="prompt-command" class="form-label">Command</label>
                  <input type="text" id="prompt-command" class="form-input" required placeholder="e.g., code-review">
                  <p class="form-help-text">Lowercase letters, numbers, and hyphens only. Used with '>' trigger.</p>
                </div>

                <div class="form-group">
                  <label for="prompt-label" class="form-label">Label</label>
                  <input type="text" id="prompt-label" class="form-input" required placeholder="e.g., Code Review">
                  <p class="form-help-text">Display name shown in autocomplete popup.</p>
                </div>

                <div class="form-group">
                  <label for="prompt-description" class="form-label">Description (optional)</label>
                  <input type="text" id="prompt-description" class="form-input" placeholder="Brief description...">
                </div>

                <div class="form-group">
                  <label for="prompt-template" class="form-label">Template Text</label>
                  <textarea id="prompt-template" class="form-textarea" required placeholder="Enter the template text that will be inserted..." rows="8" style="font-family: 'Courier New', monospace; resize: vertical;"></textarea>
                  <p class="form-help-text">The text that will replace the command when selected.</p>
                </div>

                <div style="display: flex; gap: 12px; justify-content: flex-end;">
                  <button type="button" id="cancel-modal-btn" class="button-secondary">
                    Cancel
                  </button>
                  <button type="submit" class="button-primary">
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
      ? `<p class="config-card-description">${formatValue(prompt.description, '')}</p>`
      : '';

    return `
      <div class="config-card">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 4px;">
              <span style="font-size: 20px;">📝</span>
              <div>
                <p class="config-card-title">${formatValue(prompt.label, '—')}</p>
                <p class="config-card-description" style="font-family: 'Courier New', monospace;">&gt;${formatValue(prompt.command, '—')}</p>
              </div>
            </div>
            ${description}
          </div>
          <div style="display: flex; gap: 8px; margin-left: 16px;">
            <button class="edit-prompt-btn button-secondary" data-prompt-id="${prompt.id}" style="padding: 6px 12px; font-size: 13px;">
              Edit
            </button>
            <button class="delete-prompt-btn button-secondary" data-prompt-id="${prompt.id}" style="padding: 6px 12px; font-size: 13px; color: var(--status-error);">
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
    }
  };

})(window.Pages, window.API, window.Utils);
