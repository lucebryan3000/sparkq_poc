(function(Pages, API, Utils, Components) {
  'use strict';

  const api = API.api;
  const showError = Utils.showError;
  const formatTimestamp = Utils.formatTimestamp || ((value) => value || '—');
  const formatDuration = Utils.formatDuration || ((value) => value || '—');
  const QuickAdd = Components?.QuickAdd || window.QuickAdd;

  function formatProgress(stats) {
    if (!stats) {
      return '0/0';
    }
    if (stats.progress) {
      return stats.progress;
    }
    const done = Number(stats.done) || 0;
    const total = Number(stats.total) || 0;
    if (total > 0) {
      return `${done}/${total}`;
    }
    const running = Number(stats.running) || 0;
    const queued = Number(stats.queued) || 0;
    const denominator = total || done + running + queued;
    return `${done}/${denominator || 0}`;
  }

  function formatQueueStatus(status) {
    if (!status) {
      return 'Unknown';
    }
    const lower = String(status).toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }

  function statusDotClass(status) {
    const lower = String(status || '').toLowerCase();
    return lower === 'active' ? 'active' : 'planned';
  }

  function tabStatusClass(status) {
    const lower = String(status || '').toLowerCase();
    if (lower === 'active' || lower === 'running') {
      return 'status-active';
    }
    if (lower === 'idle') {
      return 'status-idle';
    }
    if (lower === 'ended' || lower === 'failed') {
      return 'status-ended';
    }
    return 'status-planned';
  }

  function queueBadgeClass(status) {
    const lower = String(status || '').toLowerCase();
    if (lower === 'active' || lower === 'running') {
      return 'badge-active';
    }
    if (lower === 'queued' || lower === 'pending' || lower === 'planned' || lower === 'idle') {
      return 'badge-queued';
    }
    if (lower === 'ended' || lower === 'failed') {
      return 'badge-ended';
    }
    return 'badge';
  }

  function statusPillClass(status) {
    const lower = String(status || '').toLowerCase();
    if (['running', 'in_progress', 'in-progress'].includes(lower)) {
      return 'status-pill--running';
    }
    if (lower === 'queued' || lower === 'pending') {
      return 'status-pill--queued';
    }
    if (['succeeded', 'completed', 'done', 'success'].includes(lower)) {
      return 'status-pill--succeeded';
    }
    if (['failed', 'error', 'ended', 'timeout', 'cancelled', 'canceled'].includes(lower)) {
      return 'status-pill--failed';
    }
    return '';
  }

  function renderStatusPill(status) {
    const label = (status || 'unknown').toString();
    const pillClass = statusPillClass(status);
    return `<span class="status-pill${pillClass ? ` ${pillClass}` : ''}">${label}</span>`;
  }

  function slugifyName(name) {
    const base = (name || 'Task').toString().trim();
    const slug = base.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug ? slug.toUpperCase() : 'TASK';
  }

  function taskPreview(task) {
    if (!task) return '—';
    const payload = task.payload;
    let prompt = '';
    if (typeof payload === 'string') {
      const trimmed = payload.trim();
      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          prompt = typeof parsed.prompt === 'string' ? parsed.prompt : '';
        } catch (_) {
          prompt = trimmed;
        }
      } else {
        prompt = trimmed;
      }
    } else if (payload && typeof payload === 'object') {
      if (typeof payload.prompt === 'string') {
        prompt = payload.prompt;
      } else {
        prompt = JSON.stringify(payload);
      }
    }
    if (!prompt) return '—';
    const clean = prompt.replace(/\s+/g, ' ').trim();
    return clean.length > 80 ? `${clean.slice(0, 80)}…` : clean;
  }

  function buildFallbackModal(title, contentBuilder) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal modal-overlay';
      overlay.style.opacity = '0';
      overlay.style.zIndex = '9999';

      const modal = document.createElement('div');
      modal.className = 'modal-content';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.style.transform = 'scale(0.95)';
      modal.style.maxWidth = '420px';
      modal.style.minWidth = '280px';
      modal.tabIndex = -1;

      const header = document.createElement('div');
      header.className = 'modal-header';
      const titleEl = document.createElement('h2');
      titleEl.className = 'modal-title';
      titleEl.textContent = title || '';
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'modal-close-button';
      closeBtn.setAttribute('aria-label', 'Close dialog');
      closeBtn.innerHTML = '&times;';
      header.append(titleEl, closeBtn);

      const body = document.createElement('div');
      body.className = 'modal-body';

      const footer = document.createElement('div');
      footer.className = 'modal-actions';

      const cleanup = (value) => {
        overlay.classList.remove('visible');
        modal.style.transform = 'scale(0.95)';
        setTimeout(() => overlay.remove(), 200);
        resolve(value);
      };

      const { contentEl, onSubmit } = contentBuilder({ cleanup });
      body.appendChild(contentEl);

      overlay.append(modal);
      modal.append(header, body, footer);
      document.body.appendChild(overlay);

      requestAnimationFrame(() => {
        overlay.classList.add('visible');
        modal.style.transform = 'scale(1)';
        const focusTarget = modal.querySelector('input, textarea, button');
        if (focusTarget) {
          focusTarget.focus({ preventScroll: true });
          if (focusTarget.select) focusTarget.select();
        }
      });

      closeBtn.addEventListener('click', () => cleanup(null));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cleanup(null);
      });
      modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          cleanup(null);
        }
      });

      if (typeof onSubmit === 'function') {
        footer.appendChild(onSubmit({ cleanup }));
      }
    });
  }

  async function safePrompt(title, message, defaultValue = '', options = {}) {
    const MODAL_TIMEOUT = 60000; // 60 second timeout
    const promptFn = Utils?.showPrompt;
    if (typeof promptFn === 'function') {
      try {
        return await Promise.race([
          promptFn(title, message, defaultValue, options),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Modal timeout - no response from user')), MODAL_TIMEOUT)
          )
        ]);
      } catch (err) {
        if (err.message.includes('timeout')) {
          console.warn('[Dashboard] showPrompt timeout, using fallback modal');
          Utils.showToast('Modal dialog timed out, switching to fallback input', 'warning');
        } else {
          console.warn('[Dashboard] showPrompt failed, using fallback modal:', err);
        }
      }
    }

    return buildFallbackModal(title || 'Input', ({ cleanup }) => {
      const contentEl = document.createElement('div');
      const msg = document.createElement('p');
      msg.className = 'muted';
      msg.style.margin = '0 0 12px';
      msg.textContent = message || '';
      contentEl.appendChild(msg);

      let inputEl;
      if (options.textarea) {
        inputEl = document.createElement('textarea');
        inputEl.rows = options.rows || 4;
        inputEl.style.minHeight = '120px';
      } else {
        inputEl = document.createElement('input');
        inputEl.type = options.type || 'text';
      }
      inputEl.className = 'form-control';
      inputEl.value = defaultValue || '';
      inputEl.placeholder = options.placeholder || '';
      inputEl.style.width = '100%';
      inputEl.style.boxSizing = 'border-box';
      contentEl.appendChild(inputEl);

      const onSubmit = () => {
        const val = inputEl.value;
        cleanup(val ?? null);
      };

      const submitButton = document.createElement('button');
      submitButton.className = 'button primary';
      submitButton.textContent = 'OK';
      submitButton.type = 'button';
      submitButton.addEventListener('click', onSubmit);

      const cancelButton = document.createElement('button');
      cancelButton.className = 'button secondary';
      cancelButton.textContent = 'Cancel';
      cancelButton.type = 'button';
      cancelButton.addEventListener('click', () => cleanup(null));

      const buttonsWrapper = document.createElement('div');
      buttonsWrapper.className = 'modal-actions';
      buttonsWrapper.append(cancelButton, submitButton);

      return {
        contentEl,
        onSubmit: () => buttonsWrapper,
      };
    });
  }

  async function safeConfirm(title, message, options = {}) {
    const MODAL_TIMEOUT = 60000; // 60 second timeout
    const confirmFn = Utils?.showConfirm;
    if (typeof confirmFn === 'function') {
      try {
        return await Promise.race([
          confirmFn(title, message, options),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Modal timeout - no response from user')), MODAL_TIMEOUT)
          )
        ]);
      } catch (err) {
        if (err.message.includes('timeout')) {
          console.warn('[Dashboard] showConfirm timeout, using fallback modal');
          Utils.showToast('Confirmation dialog timed out, switching to fallback', 'warning');
        } else {
          console.warn('[Dashboard] showConfirm failed, using fallback modal:', err);
        }
      }
    }

    return buildFallbackModal(title || 'Confirm', ({ cleanup }) => {
      const contentEl = document.createElement('div');
      const msg = document.createElement('p');
      msg.className = 'muted';
      msg.style.margin = '0 0 12px';
      msg.textContent = message || '';
      contentEl.appendChild(msg);

      const confirmButton = document.createElement('button');
      confirmButton.className = 'button primary';
      confirmButton.textContent = options.confirmLabel || 'OK';
      confirmButton.type = 'button';
      confirmButton.addEventListener('click', () => cleanup(true));

      const cancelButton = document.createElement('button');
      cancelButton.className = 'button secondary';
      cancelButton.textContent = options.cancelLabel || 'Cancel';
      cancelButton.type = 'button';
      cancelButton.addEventListener('click', () => cleanup(false));

      const buttonsWrapper = document.createElement('div');
      buttonsWrapper.className = 'modal-actions';
      buttonsWrapper.append(cancelButton, confirmButton);

      return {
        contentEl,
        onSubmit: () => buttonsWrapper,
      };
    });
  }

  let toolNameCache = null;

  function prettifyToolName(name) {
    if (!name) return '—';
    return name
      .replace(/[-_]+/g, ' ')
      .split(' ')
      .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ''))
      .join(' ')
      .trim();
  }

  async function loadToolNameCache() {
    if (toolNameCache) {
      return toolNameCache;
    }
    try {
      const res = await api('GET', '/api/tools', null, { action: 'load tools' });
      const cache = {};
      (res?.tools || []).forEach((tool) => {
        const name = tool?.name;
        if (!name) return;
        const friendly = tool?.description || prettifyToolName(name);
        cache[name] = friendly;
      });
      toolNameCache = cache;
      return toolNameCache;
    } catch (err) {
      console.error('Failed to load tools for friendly names:', err);
      toolNameCache = {};
      return toolNameCache;
    }
  }

  function getFriendlyToolName(toolName) {
    if (!toolName) return '—';
    const friendly = toolNameCache?.[toolName];
    if (friendly) return friendly;
    return prettifyToolName(toolName);
  }

    function renderTaskRow(task, displayId, readOnly = false) {
      const statusLabel = (task?.status || 'queued').toString();
      const statusPill = renderStatusPill(statusLabel);
      const statusNormalized = statusLabel.toLowerCase();
      const timestamp = formatTimestamp(task?.created_at);
    const label = task?.friendly_id || displayId || `Task #${task?.id || '—'}`;
    const preview = taskPreview(task);
    const toolLabel = task?.friendlyTool || getFriendlyToolName(task?.tool_name);
    const allowActions = !readOnly;
    const disableModify = statusNormalized === 'queued' || statusNormalized === 'running';
    const disabledAttr = disableModify ? 'disabled title="Unavailable while running/queued"' : '';
    const deleteDisabledAttr = readOnly ? 'disabled title="Actions disabled in read-only mode"' : '';
    const actionsCell = readOnly
      ? '<div class="task-cell actions muted">View only</div>'
      : `<div class="task-cell actions">
          <button class="task-rerun-btn" data-action="dashboard-task-rerun" data-task-id="${task?.id}" data-queue-id="${task?.queue_id || ''}" title="Rerun task" aria-label="Rerun task" ${disableModify ? 'disabled' : ''}>⟳</button>
          <button class="task-edit-btn" data-action="dashboard-task-edit" data-task-id="${task?.id}" data-queue-id="${task?.queue_id || ''}" title="Edit task" aria-label="Edit task" ${disableModify ? 'disabled' : ''}>✏️</button>
          <button class="task-delete-btn" data-action="dashboard-task-delete" data-task-id="${task?.id}" data-queue-id="${task?.queue_id || ''}" title="Delete task" aria-label="Delete task" ${deleteDisabledAttr}>✖️</button>
        </div>`;

      return `
        <div class="task-row" data-task-id="${task?.id || ''}" data-status="${statusNormalized}">
          <div class="task-cell status">${statusPill}</div>
          <div class="task-cell id" data-action="dashboard-task-row-open" data-task-id="${task?.id || ''}" data-queue-id="${task?.queue_id || ''}">${label}</div>
          <div class="task-cell tool" data-action="dashboard-task-row-open" data-task-id="${task?.id || ''}" data-queue-id="${task?.queue_id || ''}">${toolLabel || '—'}</div>
          <div class="task-cell preview" data-action="dashboard-task-row-open" data-task-id="${task?.id || ''}" data-queue-id="${task?.queue_id || ''}" title="${preview}">${preview}</div>
          <div class="task-cell created" data-action="dashboard-task-row-open" data-task-id="${task?.id || ''}" data-queue-id="${task?.queue_id || ''}">${timestamp}</div>
          ${actionsCell}
        </div>
      `;
    }

  Pages.Dashboard = {
    currentQueueId: null,
    currentSessionId: null,
    queuesCache: [],
    taskViewState: {},
    _rendering: false,
    quickAddInstance: null,
    queueFilter: null,
    archivedQueueId: null,

    async render(container) {
      // Prevent concurrent renders
      if (this._rendering) {
        console.log('[Dashboard] Skipping render - already rendering');
        return;
      }
      this._rendering = true;

      try {
        if (!container) {
          return;
        }

        // Always ensure we have the correct page container
        const actualContainer = container?.id === 'dashboard-page' ? container : document.getElementById('dashboard-page');
        if (!actualContainer) {
          console.error('Dashboard page container not found');
          return;
        }

        actualContainer.innerHTML = `
          <div class="card">
            <div class="muted"><span class="loading"></span> Loading queues…</div>
          </div>
        `;

        let sessions = [];
        let queues = [];
        let activeSession = null;

        // Restore persisted filters
        if (!this.queueFilter) {
          const savedFilter = localStorage.getItem('dashboard.queueFilter');
          this.queueFilter = savedFilter === 'archived' ? 'archived' : 'active';
        }
        if (!this.archivedQueueId) {
          const savedArchived = localStorage.getItem('dashboard.archivedQueueId');
          this.archivedQueueId = savedArchived || null;
        }

        try {
          const sessionsResponse = await api('GET', '/api/sessions', null, { action: 'load sessions' });
          sessions = sessionsResponse?.sessions || [];
        } catch (err) {
          console.error('Failed to load sessions:', err);
        }

        try {
          const response = await api('GET', '/api/queues', null, { action: 'load queues' });
          queues = response?.queues || [];
        } catch (err) {
          showError(`Failed to load queues: ${err.message || err}`, err);
        }

        this.queuesCache = queues;
        this.sessionsCache = sessions;
        const activeQueues = (queues || []).filter((q) => String(q.status || '').toLowerCase() !== 'archived');
        const archivedQueues = (queues || []).filter((q) => String(q.status || '').toLowerCase() === 'archived');

        // Fallback to active if archived view has no data
        if (this.queueFilter === 'archived' && !archivedQueues.length && activeQueues.length) {
          this.queueFilter = 'active';
          localStorage.setItem('dashboard.queueFilter', this.queueFilter);
        }

        if (!queues.length) {
          this.currentQueueId = null;
          // Get the first session or use a placeholder
          activeSession = sessions.length > 0 ? sessions[0] : null;
          if (activeSession) {
            this.currentSessionId = activeSession.id;
          }
          const sessionSelector = this.renderSessionSelector(activeSession, sessions);
          const headingBlock = `
            <div class="card dashboard-heading-card">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
                <div>
                  <h1 style="margin:0 0 4px 0; font-size:22px;">Dashboard</h1>
                  <p class="muted" style="margin:0;">Monitor queues, sessions, and quick actions in one place.</p>
                </div>
              </div>
            </div>
          `;

          actualContainer.innerHTML = `
            ${headingBlock}
            <div class="session-tabs-section">
              <div class="section-title">Sessions</div>
              ${sessionSelector}
            </div>

            <div class="queue-tabs-section">
              <div class="section-title">Queues</div>
              <div id="queue-tabs" class="queue-tabs">
                <button class="new-queue-btn" id="dashboard-new-queue-btn" data-action="dashboard-new-queue">+ New Queue</button>
              </div>
            </div>
            <div id="queue-content">
              <div class="card">
                <p class="muted">No queues yet. Create one to get started.</p>
              </div>
            </div>
          `;
          return;
        }

        // Resolve selection by filter
        if (this.queueFilter === 'archived') {
          if (!this.archivedQueueId || !archivedQueues.some((q) => q.id === this.archivedQueueId)) {
            this.archivedQueueId = archivedQueues[0]?.id || null;
            localStorage.setItem('dashboard.archivedQueueId', this.archivedQueueId || '');
          }
        } else {
          if (!this.currentQueueId || !activeQueues.some((queue) => queue.id === this.currentQueueId)) {
            this.currentQueueId = activeQueues[0]?.id || null;
          }
        }

        // Get the session for the first queue in the current view
        const firstQueue = this.queueFilter === 'archived' ? archivedQueues[0] : activeQueues[0];
        if (firstQueue) {
          activeSession = sessions.find((s) => s.id === firstQueue.session_id) || sessions[0];
          if (activeSession) {
            this.currentSessionId = activeSession.id;
          }
        }

        const sessionSelector = this.renderSessionSelector(activeSession, sessions);
        const headingBlock = `
          <div class="card dashboard-heading-card">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
              <div>
                <h1 style="margin:0 0 4px 0; font-size:22px;">Dashboard</h1>
                <p class="muted" style="margin:0;">Monitor queues, sessions, and quick actions in one place.</p>
              </div>
            </div>
          </div>
        `;

        actualContainer.innerHTML = `
          ${headingBlock}
          <div class="session-tabs-section">
            <div class="section-title">Sessions</div>
            ${sessionSelector}
          </div>

          <div class="queue-tabs-section">
            <div class="section-title queue-filter-header">
              <span>Queues</span>
              <div id="queue-filter-buttons" class="queue-filter-buttons">
                <button id="queue-filter-active" data-action="dashboard-filter-active" class="button secondary queue-filter-toggle ${this.queueFilter === 'active' ? 'active' : ''}">Active</button>
                <button id="queue-filter-archived" data-action="dashboard-filter-archived" class="button secondary queue-filter-toggle ${this.queueFilter === 'archived' ? 'active' : ''}">Archived</button>
              </div>
            </div>
            <div id="queue-tabs" class="queue-tabs"></div>
          </div>

          <div id="queue-content"></div>
        `;

        this.sessionsCache = sessions;

        const tabsContainer = actualContainer.querySelector('#queue-tabs');
        const contentContainer = actualContainer.querySelector('#queue-content');

        if (this.queueFilter === 'archived') {
          this.renderArchivedQueuePicker(tabsContainer, archivedQueues);
          await this.renderArchivedQueueContent(contentContainer, archivedQueues);
        } else {
          this.renderQueueTabs(tabsContainer, activeQueues);
          await this.renderQueueContent(contentContainer, this.currentQueueId);
        }
      } finally {
        this._rendering = false;
      }
    },

    async reloadAfterQueueOperation(selectQueueId) {
      await this.refreshQueues(selectQueueId);
    },

    renderArchivedQueuePicker(container, archivedQueues) {
      if (!container) return;
      const options = archivedQueues
        .map((q) => `<option value="${q.id}" ${q.id === this.archivedQueueId ? 'selected' : ''}>${q.name || prettifyToolName(q.id)}</option>`)
        .join('');
      container.innerHTML = `
        <div class="card" style="padding:10px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <span class="muted" style="font-size:13px;">Archived queues</span>
          <select id="archived-queue-select" class="form-control" style="min-width:200px;" data-action="dashboard-select-archived">
            ${options || '<option value=\"\">No archived queues</option>'}
          </select>
        </div>
      `;
    },

    renderQueueTabs(container, queues) {
      if (!container) {
        return;
      }

      const tabsHtml = queues
        .map((queue) => {
          const isActive = queue.id === this.currentQueueId;
          const progress = formatProgress(queue.stats);
          const statusLabel = formatQueueStatus(queue.status);
          const dotClass = statusDotClass(queue.status);
          const statusClass = tabStatusClass(queue.status);

          return `
            <div class="queue-tab ${isActive ? 'active' : ''}" data-queue-id="${queue.id}" data-action="dashboard-select-queue">
              <div class="tab-header">
                <span class="status-dot ${dotClass}"></span>
                <span>${queue.name || queue.id}</span>
              </div>
              <div class="tab-progress">${progress}</div>
              <div class="tab-status ${statusClass}">${statusLabel}</div>
            </div>
          `;
        })
        .join('');

      container.innerHTML = `
        ${tabsHtml}
        <button class="new-queue-btn" id="dashboard-new-queue-btn" data-action="dashboard-new-queue">+ New Queue</button>
      `;
    },

    getQueueFromCache(queueId) {
      if (!queueId) return null;
      return (this.queuesCache || []).find((q) => String(q.id) === String(queueId)) || null;
    },

    handleQueueTabSelect(queueId) {
      if (!queueId || queueId === this.currentQueueId) {
        return;
      }
      this.currentQueueId = queueId;
      const pageContainer = document.getElementById('dashboard-page');
      const tabsContainer = pageContainer?.querySelector('#queue-tabs');
      const contentContainer = pageContainer?.querySelector('#queue-content');

      if (tabsContainer) {
        this.renderQueueTabs(tabsContainer, this.queuesCache || []);
      }

      const filterButtons = document.getElementById('queue-filter-buttons');
      if (filterButtons) {
        filterButtons.style.display = 'none';
      }

      if (contentContainer) {
        this.renderQueueContent(contentContainer, queueId);
      }
    },

    handleFilterChange(nextFilter) {
      const normalized = nextFilter === 'archived' ? 'archived' : 'active';
      if (this.queueFilter === normalized) return;
      this.queueFilter = normalized;
      localStorage.setItem('dashboard.queueFilter', this.queueFilter);
      if (normalized === 'archived') {
        this.currentQueueId = null;
        const archivedQueues = (this.queuesCache || []).filter((q) => String(q.status || '').toLowerCase() === 'archived');
        this.archivedQueueId = archivedQueues[0]?.id || null;
        localStorage.setItem('dashboard.archivedQueueId', this.archivedQueueId || '');
        this.refreshQueues(this.archivedQueueId);
        const filterButtons = document.getElementById('queue-filter-buttons');
        if (filterButtons) {
          filterButtons.style.display = 'inline-flex';
        }
        return;
      }

      const filterButtons = document.getElementById('queue-filter-buttons');
      if (filterButtons) {
        filterButtons.style.display = 'inline-flex';
      }
      this.refreshQueues(this.currentQueueId);
    },

    handleArchivedSelect(nextId) {
      const queueId = nextId || null;
      this.archivedQueueId = queueId;
      localStorage.setItem('dashboard.archivedQueueId', this.archivedQueueId || '');
      const archivedQueues = (this.queuesCache || []).filter((q) => String(q.status || '').toLowerCase() === 'archived');
      const contentContainer = document.getElementById('queue-content');
      this.renderArchivedQueueContent(contentContainer, archivedQueues);
    },

    async handleEditQueue(queueId) {
      Utils.showToast('Opening editor...', 'info');
      const queue = this.getQueueFromCache(queueId);
      const queueName = queue?.name || queue?.id || 'Queue';
      const newName = await safePrompt('Edit Queue', 'Queue name:', queueName);
      if (!newName || !newName.trim()) {
        return;
      }

      const instructions = await safePrompt('Queue Instructions', 'Enter queue instructions (optional):', '', { textarea: true });

      try {
        const payload = {};
        if (newName.trim() !== queueName) {
          payload.name = newName.trim();
        }
        if (instructions && instructions.trim()) {
          payload.instructions = instructions;
        }

        if (Object.keys(payload).length > 0) {
          await api('PUT', `/api/queues/${queueId}`, payload, { action: 'update queue' });
          Utils.showToast('Queue updated', 'success');
          await this.refreshQueues(queueId);
        }
      } catch (err) {
        console.error('Failed to update queue:', err);
        Utils.showToast('Failed to update queue', 'error');
      }
    },

    async handleArchiveQueue(queueId) {
      Utils.showToast('Opening confirmation...', 'info');
      const queue = this.getQueueFromCache(queueId);
      const queueName = queue?.name || queue?.id || 'Queue';
      const confirmed = await safeConfirm('Archive Queue', `Archive "${queueName}"?`);
      if (!confirmed) return;

      try {
        await api('PUT', `/api/queues/${queueId}/archive`, null, { action: 'archive queue' });
        Utils.showToast(`Queue "${queueName}" archived`, 'success');
        await this.refreshQueues();
      } catch (err) {
        console.error('Failed to archive queue:', err);
        Utils.showToast('Failed to archive queue', 'error');
      }
    },

    async handleDeleteQueue(queueId) {
      Utils.showToast('Requesting confirmation...', 'info');
      const queue = this.getQueueFromCache(queueId);
      const queueName = queue?.name || queue?.id || 'Queue';
      const confirmed = await safeConfirm('Delete Queue', `Are you sure you want to delete "${queueName}"? This cannot be undone.`);
      if (!confirmed) return;

      try {
        await api('DELETE', `/api/queues/${queueId}`, null, { action: 'delete queue' });
        Utils.showToast(`Queue "${queueName}" deleted`, 'success');
        this.currentQueueId = null;
        await this.refreshQueues();
      } catch (err) {
        console.error('Failed to delete queue:', err);
        Utils.showToast('Failed to delete queue', 'error');
      }
    },

    async handleUnarchiveQueue(queueId) {
      Utils.showToast('Restoring queue...', 'info');
      try {
        await api('PUT', `/api/queues/${queueId}/unarchive`, null, { action: 'unarchive queue' });
        Utils.showToast('Queue unarchived', 'success');
        this.queueFilter = 'active';
        localStorage.setItem('dashboard.queueFilter', this.queueFilter);
        await this.refreshQueues(queueId);
      } catch (err) {
        console.error('Failed to unarchive queue:', err);
        Utils.showToast('Failed to unarchive queue', 'error');
      }
    },

    handleSessionSelect(event) {
      if (!event?.target) return;
      const sessionId = event.target.value;
      if (!sessionId) return;
      this.currentSessionId = sessionId;
      const container = document.getElementById('dashboard-page');
      this.render(container);
    },

    async handleSessionRename() {
      Utils.showToast('Opening editor...', 'info');
      const sessionId = this.currentSessionId;
      if (!sessionId) return;
      const currentSession = (this.sessionsCache || []).find((s) => s.id === sessionId);
      if (!currentSession) return;

      const newName = await safePrompt('Rename Session', 'Enter new session name:', currentSession.name || '');
      if (!newName || !newName.trim()) return;

      try {
        await api('PUT', `/api/sessions/${sessionId}`, { name: newName.trim() }, { action: 'rename session' });
        Utils.showToast('Session renamed', 'success');
        const container = document.getElementById('dashboard-page');
        this.render(container);
      } catch (err) {
        console.error('Failed to rename session:', err);
        Utils.showToast('Failed to rename session', 'error');
      }
    },

    async handleSessionDelete() {
      Utils.showToast('Requesting confirmation...', 'info');
      const sessionId = this.currentSessionId;
      if (!sessionId) return;
      const currentSession = (this.sessionsCache || []).find((s) => s.id === sessionId);
      if (!currentSession) return;

      const confirmed = await safeConfirm('Delete Session', `Are you sure you want to delete "${currentSession.name || currentSession.id}"? This cannot be undone.`);
      if (!confirmed) return;

      try {
        await api('DELETE', `/api/sessions/${sessionId}`, null, { action: 'delete session' });
        Utils.showToast('Session deleted', 'success');
        const container = document.getElementById('dashboard-page');
        this.render(container);
      } catch (err) {
        console.error('Failed to delete session:', err);
        Utils.showToast('Failed to delete session', 'error');
      }
    },

    attachQueueFilterHandlers(container) {
      const activeBtn = container.querySelector('#queue-filter-active');
      const archivedBtn = container.querySelector('#queue-filter-archived');
      const setStyles = () => {
        if (activeBtn && archivedBtn) {
          activeBtn.classList.toggle('active', this.queueFilter === 'active');
          archivedBtn.classList.toggle('active', this.queueFilter === 'archived');
        }
      };
      setStyles();
      if (activeBtn) {
        activeBtn.addEventListener('click', () => {
          if (this.queueFilter !== 'active') {
            this.queueFilter = 'active';
            localStorage.setItem('dashboard.queueFilter', this.queueFilter);
            this.currentQueueId = null;
            this.refreshQueues(this.currentQueueId);
            setStyles();
            // Show filter buttons when returning to overview
            const filterButtons = document.getElementById('queue-filter-buttons');
            if (filterButtons) {
              filterButtons.style.display = 'inline-flex';
            }
          }
        });
      }
      if (archivedBtn) {
        archivedBtn.addEventListener('click', () => {
          if (this.queueFilter !== 'archived') {
            this.queueFilter = 'archived';
            localStorage.setItem('dashboard.queueFilter', this.queueFilter);
            this.currentQueueId = null;
            this.refreshQueues(this.archivedQueueId);
            setStyles();
            // Show filter buttons when returning to overview
            const filterButtons = document.getElementById('queue-filter-buttons');
            if (filterButtons) {
              filterButtons.style.display = 'inline-flex';
            }
          }
        });
      }
    },

    async handleCreateQueue() {
      // Load sessions for queue creation
      let sessions = [];
      try {
        const sessionsResponse = await api('GET', '/api/sessions', null, { action: 'load sessions' });
        sessions = sessionsResponse?.sessions || [];
      } catch (err) {
        console.error('Failed to load sessions:', err);
        Utils.showToast('Unable to load sessions', 'error');
        return;
      }

      if (!sessions.length) {
        // Auto-create a session when none exist
        const defaultSessionName = `Session ${new Date().toISOString().substring(0, 10)}`;
        try {
          const sessionResponse = await api('POST', '/api/sessions', { name: defaultSessionName }, { action: 'create session' });
          const newSession = sessionResponse?.session || sessionResponse;
          sessions = [newSession];
          Utils.showToast(`Created session "${defaultSessionName}"`, 'info');
        } catch (err) {
          console.error('Failed to create session:', err);
          Utils.showToast('Failed to create session', 'error');
          return;
        }
      }

      const preferredSession = this.currentSessionId
        ? sessions.find((s) => s.id === this.currentSessionId) || sessions[0]
        : sessions[0];
      const sessionId = preferredSession?.id;
      if (!sessionId) {
        showError('No session available to create a queue', new Error('No session'));
        return;
      }

      // Prompt user for a friendly queue name using in-app modal (avoid browser popups)
      const defaultName = `Queue ${new Date().toISOString().substring(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-6)}`;
      let baseName = null;
      try {
        baseName = await Utils.showPrompt('New Queue', 'Enter a queue name:', defaultName);
      } catch (err) {
        console.warn('[Dashboard] showPrompt failed for queue creation, falling back to window.prompt', err);
        baseName = typeof window.prompt === 'function' ? window.prompt('Enter a queue name:', defaultName) : defaultName;
      }
      if (!baseName || !baseName.trim()) {
        Utils.showToast('Queue creation cancelled', 'info');
        return;
      }
      baseName = baseName.trim();
      this.currentSessionId = sessionId;

      const attemptCreate = async (name) => {
        const payload = { session_id: sessionId, name: name.trim() };
        const response = await api('POST', '/api/queues', payload, { action: 'create queue' });
        const newQueueId = response?.id || response?.queue_id || response?.queue?.id;
        Utils.showToast(`Queue "${name.trim()}" created`, 'success');
        this.queueFilter = 'active';
        await this.refreshQueues(newQueueId);
      };

      try {
        try {
          await attemptCreate(baseName);
        } catch (err) {
          const message = (err?.message || '').toLowerCase();
          if (message.includes('unique') || message.includes('exists')) {
            const suggestion = `${baseName}-${Date.now().toString().slice(-6)}`;
            const retryName = await Utils.showPrompt('Queue name exists', 'Enter a different queue name:', suggestion);
            if (!retryName || !retryName.trim()) {
              Utils.showToast('Queue creation cancelled', 'info');
              return;
            }
            const finalName = retryName.trim();
            console.warn('[Dashboard] Queue name conflict, retrying with:', finalName);
            await attemptCreate(finalName);
          } else {
            throw err;
          }
        }
      } catch (err) {
        console.error('Failed to create queue:', err);
        showError(`Failed to create queue: ${err.message || err}`, err);
        Utils.showToast(`Failed to create queue: ${err.message || err}`, 'error');
      }
    },

    async renderQueueContent(container, queueId, { readOnly = false } = {}) {
      if (!container) {
        return;
      }

      const queue = this.queuesCache.find((s) => s.id === queueId) || {};
      const queueName = queue.name || queue.id || 'Queue';
      const progress = formatProgress(queue.stats);
      const isArchived = String(queue.status || '').toLowerCase() === 'archived';
      const hideQuickAdd = readOnly || isArchived;
      const showUnarchive = isArchived;

      container.innerHTML = `
          <div class="card">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px;">
              <div>
                <h2 style="margin: 0;">${queueName}${isArchived ? ' (Archived)' : ''}</h2>
                <div class="muted" style="font-size: 12px;">Progress: ${progress}</div>
              </div>
              ${hideQuickAdd ? '' : `
                <div style="display: flex; gap: 8px; align-items: center;">
                  <button id="dashboard-edit-btn" data-action="dashboard-edit-queue" data-queue-id="${queueId}" class="button secondary" style="padding: 6px 12px; font-size: 13px; gap: 6px; display: flex; align-items: center;" title="Edit queue">✏️ Edit</button>
                  <button id="dashboard-archive-btn" data-action="dashboard-archive-queue" data-queue-id="${queueId}" class="button secondary" style="padding: 6px 12px; font-size: 13px; gap: 6px; display: flex; align-items: center;" title="Archive queue">📦 Archive</button>
                  <button id="dashboard-delete-btn" data-action="dashboard-delete-queue" data-queue-id="${queueId}" class="button secondary" style="padding: 6px 12px; font-size: 13px; gap: 6px; display: flex; align-items: center;" title="Delete queue">🗑️ Delete</button>
                </div>
              `}
              ${showUnarchive ? `
                <div style="display: flex; gap: 8px; align-items: center;">
                  <button id="dashboard-unarchive-btn" data-action="dashboard-unarchive-queue" data-queue-id="${queueId}" class="button secondary" style="padding: 6px 12px; font-size: 13px; gap: 6px; display: flex; align-items: center;" title="Unarchive queue">⬆️ Unarchive</button>
                </div>
              ` : ''}
            </div>
            ${hideQuickAdd ? '<div class="muted" style="font-size:12px;">Archived queues are read-only. Actions are disabled.</div>' : '<div id="dashboard-quick-add"></div>'}
          </div>

        <div id="dashboard-tasks" style="margin-top: 16px;"></div>
      `;

      if (!hideQuickAdd) {
        this.renderQuickAdd(queueId, queueName);
      }

      const tasksContainer = container.querySelector('#dashboard-tasks');
      if (tasksContainer) {
        await this.renderTasks(tasksContainer, queueId, { readOnly: hideQuickAdd, forceStatus: hideQuickAdd ? ['succeeded', 'failed'] : null });
      }
    },

    async renderArchivedQueueContent(container, archivedQueues) {
      if (!container) return;
      if (!archivedQueues.length) {
        container.innerHTML = `
          <div class="card">
            <p class="muted">No archived queues.</p>
          </div>
        `;
        return;
      }
      const targetQueueId = this.archivedQueueId || archivedQueues[0].id;
      const queue = archivedQueues.find((q) => q.id === targetQueueId) || archivedQueues[0];
      this.archivedQueueId = queue.id;
      localStorage.setItem('dashboard.archivedQueueId', this.archivedQueueId);

      await this.renderQueueContent(container, queue.id, { readOnly: true });
    },

    renderQuickAdd(queueId, queueName) {
      const quickAddContainer = document.getElementById('dashboard-quick-add');

      if (!quickAddContainer) {
        return;
      }

      if (!QuickAdd) {
        quickAddContainer.innerHTML = `<div class="muted">QuickAdd component not available.</div>`;
        return;
      }

      if (!this.quickAddInstance) {
        this.quickAddInstance = new QuickAdd('dashboard-quick-add', queueId, queueName);
        window.quickAdd = this.quickAddInstance;
      } else {
        this.quickAddInstance.setStream(queueId, queueName);
      }

      this.quickAddInstance.setRefreshCallback((newTask) => {
        const tasksContainer = document.getElementById('dashboard-tasks');
        if (tasksContainer) {
          // If a new task was provided, insert it immediately without full reload
          if (newTask) {
            this.prependTaskToList(tasksContainer, newTask);
          } else {
            // Otherwise do full refresh
            this.renderTasks(tasksContainer, queueId);
          }
        }
      });

      this.quickAddInstance.render();
    },

    async refreshQueues(selectQueueId) {
      const pageContainer = document.getElementById('dashboard-page');
      const tabsContainer = pageContainer?.querySelector('#queue-tabs');
      const contentContainer = pageContainer?.querySelector('#queue-content');

      if (!pageContainer || !tabsContainer || !contentContainer) {
        await this.render(pageContainer || document.getElementById('dashboard-page'));
        return;
      }

      let queues = [];
      try {
        const response = await api('GET', '/api/queues', null, { action: 'refresh queues' });
        queues = response?.queues || [];
      } catch (err) {
        showError(`Failed to refresh queues: ${err.message || err}`, err);
        return;
      }

      this.queuesCache = queues;
      const activeQueues = (queues || []).filter((q) => String(q.status || '').toLowerCase() !== 'archived');
      const archivedQueues = (queues || []).filter((q) => String(q.status || '').toLowerCase() === 'archived');

      if (!queues.length) {
        this.currentQueueId = null;
        tabsContainer.innerHTML = `<button class="new-queue-btn" id="dashboard-new-queue-btn" data-action="dashboard-new-queue">+ New Queue</button>`;
        contentContainer.innerHTML = `
          <div class="card">
            <p class="muted">No queues yet. Create one to get started.</p>
          </div>
        `;
        return;
      }

      if (this.queueFilter === 'archived') {
        if (!this.archivedQueueId || !archivedQueues.some((q) => q.id === this.archivedQueueId)) {
          this.archivedQueueId = archivedQueues[0]?.id || null;
          localStorage.setItem('dashboard.archivedQueueId', this.archivedQueueId || '');
        }
        this.renderArchivedQueuePicker(tabsContainer, archivedQueues);
        await this.renderArchivedQueueContent(contentContainer, archivedQueues);
      } else {
        const queueExists = (id) => activeQueues.some((q) => q.id === id);
        const activeQueueId = queueExists(selectQueueId)
          ? selectQueueId
          : queueExists(this.currentQueueId)
            ? this.currentQueueId
            : activeQueues[0]?.id;

        this.currentQueueId = activeQueueId;
        this.renderQueueTabs(tabsContainer, activeQueues);
        await this.renderQueueContent(contentContainer, activeQueueId);
      }
    },

    async renderTasks(container, queueId, { readOnly = false, forceStatus = null } = {}) {
      if (!container) {
        return;
      }

      container.innerHTML = `
        <div class="card">
          <div class="muted"><span class="loading"></span> Loading tasks…</div>
        </div>
      `;

      let tasks = [];

      try {
        const response = await api('GET', `/api/tasks?queue_id=${encodeURIComponent(queueId)}`, null, { action: 'load tasks' });
        tasks = response?.tasks || [];
        await loadToolNameCache();
      } catch (err) {
        container.innerHTML = `
          <div class="card">
            <div class="muted">Unable to load tasks for this queue.</div>
          </div>
        `;
        showError(`Failed to load tasks: ${err.message || err}`, err);
        return;
      }

      tasks = tasks.map((task) => ({
        ...task,
        friendlyTool: getFriendlyToolName(task.tool_name),
        friendlyLabel: task.friendly_id || task.friendlyLabel,
      }));

      const pageSize = 10;
      const baseStatuses = ['queued', 'running', 'succeeded', 'failed'];
      const statusOptionsRaw = tasks.map((t) => String(t.status || 'queued').toLowerCase()).filter(Boolean);
      const statusOptions = Array.from(new Set([...baseStatuses, ...statusOptionsRaw]));
      const defaultStatuses = forceStatus && forceStatus.length
        ? forceStatus.map((s) => s.toLowerCase())
        : statusOptions;

      const state = this.taskViewState[queueId]
        ? { ...this.taskViewState[queueId] }
        : { statuses: new Set(defaultStatuses), page: 0 };
      const normalizedStatuses = new Set(
        [...(state.statuses || [])].filter((s) => statusOptions.includes(s))
      );
      if (!normalizedStatuses.size) {
        defaultStatuses.forEach((s) => normalizedStatuses.add(s));
      }
      state.statuses = normalizedStatuses;
      state.page = state.page || 0;
      this.taskViewState[queueId] = state;

      const applyFilters = () => tasks.filter((t) => state.statuses.has(String(t.status || '').toLowerCase()));

      const renderTaskTable = () => {
        const filtered = applyFilters();
        const total = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        if (state.page >= totalPages) {
          state.page = totalPages - 1;
        }
        const startIdx = state.page * pageSize;
        const pageTasks = filtered.slice(startIdx, startIdx + pageSize);
        const rangeLabel = total
          ? `${startIdx + 1}-${Math.min(startIdx + pageSize, total)} of ${total}`
          : '0 of 0';
        const filterLabel = readOnly ? 'Filter (read-only)' : `Filter (${state.statuses.size}/${defaultStatuses.length})`;

        const taskRows = pageTasks.length
          ? pageTasks.map((task) => renderTaskRow(task, task.friendlyLabel, readOnly)).join('')
          : '<p class="muted">No tasks match filters.</p>';

      container.innerHTML = `
        <div class="card">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px;">
            <h3 style="margin: 0;">Tasks</h3>
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                ${readOnly ? '' : `
                  <div class="filter-dropdown" style="position:relative;">
                    <button data-action="dashboard-task-filter-toggle" data-queue-id="${queueId}" class="button secondary" style="padding:6px 10px;font-size:13px;">${filterLabel}</button>
                    <div class="task-filter-menu" data-queue-id="${queueId}" style="display:none;">
                      ${defaultStatuses.map((status) => {
                        const checked = state.statuses.has(status) ? 'checked' : '';
                        const label = status.charAt(0).toUpperCase() + status.slice(1);
                        const inputId = `task-filter-${queueId}-${status}`;
                        return `<label for="${inputId}" style="display:flex;align-items:center;gap:8px;padding:4px 6px;cursor:pointer;">
                          <input id="${inputId}" type="checkbox" data-action="dashboard-task-filter-checkbox" data-status="${status}" data-queue-id="${queueId}" ${checked} />
                          <span>${label}</span>
                        </label>`;
                      }).join('')}
                      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:8px;">
                        <button data-action="dashboard-task-filter-reset" data-queue-id="${queueId}" class="button secondary" style="padding:4px 8px;font-size:12px;">Reset</button>
                        <button data-action="dashboard-task-filter-close" data-queue-id="${queueId}" class="button secondary" style="padding:4px 8px;font-size:12px;">Close</button>
                      </div>
                    </div>
                  </div>
                `}
                <div class="pager" style="display:flex;align-items:center;gap:6px;">
                  <button data-action="dashboard-task-page-prev" data-queue-id="${queueId}" class="button secondary" style="padding:6px 8px;font-size:12px;" ${state.page === 0 ? 'disabled' : ''}>Prev</button>
                  <span class="muted" style="font-size:12px;">${rangeLabel}</span>
                  <button data-action="dashboard-task-page-next" data-queue-id="${queueId}" class="button secondary" style="padding:6px 8px;font-size:12px;" ${startIdx + pageSize >= total ? 'disabled' : ''}>Next</button>
                </div>
                <span class="muted" style="font-size:12px;">${tasks.length} total</span>
              </div>
            </div>
          <div class="task-table">
            <div class="task-row head task-row-header">
              <div class="task-cell status">Status</div>
              <div class="task-cell id">Task</div>
              <div class="task-cell tool">Tool</div>
              <div class="task-cell preview">Preview</div>
              <div class="task-cell created">Created</div>
              <div class="task-cell actions">Actions</div>
            </div>
            ${taskRows}
          </div>
        </div>
      `;

        // Cache current page tasks for row-level handlers
        this.setTaskRenderCache(pageTasks);
      };

      renderTaskTable();
    },

    /**
     * Prepend a new task to the task list without full reload
     * @param {HTMLElement} container - The tasks container element
     * @param {Object} newTask - The task object to prepend
     */
    prependTaskToList(container, newTask) {
      const taskTable = container.querySelector('.task-table');
      if (!taskTable) {
        console.warn('Task table not found, falling back to full refresh');
        this.renderTasks(container, newTask.queue_id);
        return;
      }

      // Generate HTML for the new task row
      const displayId = newTask.friendly_id || `#${newTask.id}`;
        const taskRowHtml = renderTaskRow(newTask, displayId, false);

      // Find the header row
      const headerRow = taskTable.querySelector('.task-row-header');
      if (!headerRow) {
        console.warn('Task table header not found, falling back to full refresh');
        this.renderTasks(container, newTask.queue_id);
        return;
      }

      // Insert the new row after the header
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = taskRowHtml.trim();
      const newRow = tempDiv.firstChild;

      headerRow.insertAdjacentElement('afterend', newRow);

      // Update the total count if it exists
      const totalElement = container.querySelector('.queue-info-total');
      if (totalElement) {
        const currentCount = parseInt(totalElement.textContent) || 0;
        totalElement.textContent = currentCount + 1;
      }

      // Refresh cache so delegated handlers can find the task
      const allTasks = this._taskRenderCache || [];
      this.setTaskRenderCache([newTask, ...allTasks]);
    },

    async attachTaskActionHandlers() {
      // Deprecated: events handled via delegated data-action
      return;
    },

    setTaskRenderCache(tasks) {
      this._taskRenderCache = tasks || [];
    },

    findTaskById(taskId) {
      if (!taskId) return null;
      const cache = this._taskRenderCache || [];
      return cache.find((t) => String(t.id) === String(taskId)) || null;
    },

    async handleTaskRerun(taskId, queueId) {
      if (!taskId) return;
      const tasksContainer = document.getElementById('dashboard-tasks');
      try {
        await api('POST', `/api/tasks/${encodeURIComponent(taskId)}/rerun`, null, { action: 'rerun task' });
        Utils.showToast(`Task ${taskId} requeued`, 'success', 3000);
        if (tasksContainer) {
          this.renderTasks(tasksContainer, queueId);
        }
      } catch (err) {
        console.error('Failed to rerun task:', err);
        Utils.showToast(err?.message || 'Failed to rerun task', 'error');
        if (tasksContainer) {
          this.renderTasks(tasksContainer, queueId);
        }
      }
    },

    async handleTaskEdit(taskId, queueId) {
      const task = this.findTaskById(taskId);
      const targetQueueId = queueId || task?.queue_id || this.currentQueueId;
      if (!task) return;
      await this.showEditTaskDialog(task, targetQueueId);
    },

    async handleTaskDelete(taskId, queueId) {
      if (!taskId) return;
      const task = this.findTaskById(taskId) || { id: taskId, queue_id: queueId };
      const friendly = task?.friendlyLabel || taskId;
      const confirmed = await safeConfirm('Delete Task', `Are you sure you want to delete task ${friendly}? This cannot be undone.`);
      if (!confirmed) return;

      const tasksContainer = document.getElementById('dashboard-tasks');

      try {
        await api('DELETE', `/api/tasks/${encodeURIComponent(taskId)}`, null, { action: 'delete task' });
        Utils.showToast(`Task ${taskId} deleted`, 'success', 3500);
        if (tasksContainer) {
          this.renderTasks(tasksContainer, queueId || task.queue_id);
        }
      } catch (err) {
        console.error('Failed to delete task:', err);
        Utils.showToast('Failed to delete task', 'error');
        if (tasksContainer) {
          this.renderTasks(tasksContainer, queueId || task.queue_id);
        }
      }
    },

    handleTaskRowOpen(taskId, queueId) {
      if (!taskId) return;
      const task = this.findTaskById(taskId);
      const resolvedQueueId = queueId || this.currentQueueId;
      if (task) {
        this.showEditTaskDialog(task, resolvedQueueId);
      }
    },

    handleTaskFilterToggle(queueId) {
      const menu = document.querySelector(`.task-filter-menu[data-queue-id="${queueId}"]`);
      if (!menu) return;
      const isOpen = menu.style.display === 'block';
      menu.style.display = isOpen ? 'none' : 'block';
    },

    handleTaskFilterClose(queueId) {
      const menu = document.querySelector(`.task-filter-menu[data-queue-id="${queueId}"]`);
      if (menu) {
        menu.style.display = 'none';
      }
    },

    handleTaskFilterReset(queueId) {
      const state = this.taskViewState[queueId];
      if (!state) return;
      state.statuses = new Set(['queued', 'running', 'succeeded', 'failed', 'timeout', 'cancelled', 'canceled']);
      state.page = 0;
      const container = document.getElementById('dashboard-tasks');
      if (container) {
        this.renderTasks(container, queueId);
      }
    },

    handleTaskFilterCheckbox(queueId, status, checked) {
      const state = this.taskViewState[queueId];
      if (!state) return;
      const selected = new Set(state.statuses);
      if (checked) {
        selected.add(status);
      } else {
        selected.delete(status);
      }
      if (!selected.size) {
        selected.add('queued');
        selected.add('running');
        selected.add('succeeded');
        selected.add('failed');
        selected.add('timeout');
        selected.add('cancelled');
        selected.add('canceled');
      }
      state.statuses = selected;
      state.page = 0;
      const container = document.getElementById('dashboard-tasks');
      if (container) {
        this.renderTasks(container, queueId);
      }
    },

    handleTaskPagePrev(queueId) {
      const state = this.taskViewState[queueId];
      if (!state) return;
      if (state.page > 0) {
        state.page -= 1;
        const container = document.getElementById('dashboard-tasks');
        if (container) {
          this.renderTasks(container, queueId);
        }
      }
    },

    handleTaskPageNext(queueId) {
      const state = this.taskViewState[queueId];
      if (!state) return;
      const container = document.getElementById('dashboard-tasks');
      if (container) {
        this.renderTasks(container, queueId);
      }
    },

    async showEditTaskDialog(task, queueId) {
      const overlay = document.createElement('div');
      overlay.className = 'modal modal-overlay';
      overlay.style.opacity = '0';

      const modal = document.createElement('div');
      modal.className = 'modal-content';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.style.transform = 'scale(0.95)';
      modal.tabIndex = -1;

      let payloadText = '';
      let originalPayload = task.payload;
      if (typeof task.payload === 'string') {
        const trimmed = task.payload.trim();
        if (trimmed.startsWith('{')) {
          try {
            const parsed = JSON.parse(trimmed);
            originalPayload = parsed;
            if (parsed && typeof parsed.prompt === 'string') {
              payloadText = parsed.prompt;
            } else {
              payloadText = '';
            }
          } catch (_) {
            payloadText = '';
          }
        } else {
          payloadText = task.payload;
        }
      } else if (task.payload && typeof task.payload.prompt === 'string') {
        payloadText = task.payload.prompt;
      } else if (task.payload && typeof task.payload === 'object') {
        payloadText = '';
      }
      const statusLabel = (task.status || 'queued').toString();
      const friendlyLabel = task.friendly_id || task.friendlyLabel || `Task #${task.id}`;
      const toolLabel = task.friendlyTool || getFriendlyToolName(task.tool_name) || task.tool_name || '';
      const header = document.createElement('div');
      header.className = 'modal-header';
      const title = document.createElement('h3');
      title.className = 'modal-title';
      title.textContent = `Edit ${friendlyLabel}`;
      const closeBtn = document.createElement('button');
      closeBtn.id = 'edit-task-close';
      closeBtn.type = 'button';
      closeBtn.className = 'modal-close-button';
      closeBtn.setAttribute('aria-label', 'Close edit task dialog');
      closeBtn.innerHTML = '&times;';
      header.append(title, closeBtn);

      const body = document.createElement('div');
      body.className = 'modal-body';

      const badgeRow = document.createElement('div');
      badgeRow.innerHTML = renderStatusPill(statusLabel);
      body.appendChild(badgeRow);

      const toolGroup = document.createElement('div');
      toolGroup.className = 'form-group';
      const toolLabelEl = document.createElement('label');
      toolLabelEl.textContent = 'Tool';
      const toolInput = document.createElement('input');
      toolInput.id = 'edit-task-tool';
      toolInput.type = 'text';
      toolInput.className = 'form-control';
      toolInput.value = toolLabel;
      toolInput.disabled = true;
      toolGroup.append(toolLabelEl, toolInput);
      body.appendChild(toolGroup);

      const agentRoleGroup = document.createElement('div');
      agentRoleGroup.className = 'form-group';
      const agentRoleLabel = document.createElement('label');
      agentRoleLabel.textContent = 'Agent Role';
      const agentRoleInput = document.createElement('input');
      agentRoleInput.id = 'edit-task-agent-role';
      agentRoleInput.type = 'text';
      agentRoleInput.className = 'form-control';
      agentRoleInput.value = task.agent_role_key || '';
      agentRoleGroup.append(agentRoleLabel, agentRoleInput);
      body.appendChild(agentRoleGroup);

      const timeoutGroup = document.createElement('div');
      timeoutGroup.className = 'form-group';
      const timeoutLabel = document.createElement('label');
      timeoutLabel.textContent = 'Timeout (seconds)';
      const timeoutInput = document.createElement('input');
      timeoutInput.id = 'edit-task-timeout';
      timeoutInput.type = 'number';
      timeoutInput.min = '1';
      timeoutInput.step = '1';
      timeoutInput.className = 'form-control';
      timeoutInput.value = Number(task.timeout) || '';
      timeoutGroup.append(timeoutLabel, timeoutInput);
      body.appendChild(timeoutGroup);

      const payloadGroup = document.createElement('div');
      payloadGroup.className = 'form-group';
      const payloadLabelEl = document.createElement('label');
      payloadLabelEl.textContent = 'Prompt / Payload';
      const payloadInput = document.createElement('textarea');
      payloadInput.id = 'edit-task-payload';
      payloadInput.className = 'form-control';
      payloadInput.style.minHeight = '140px';
      payloadInput.value = payloadText;
      payloadGroup.append(payloadLabelEl, payloadInput);
      body.appendChild(payloadGroup);

      const detailGroup = document.createElement('div');
      detailGroup.className = 'card';
      detailGroup.style.marginTop = '8px';
      const finishedAt = formatTimestamp(task.finished_at || task.completed_at);
      const updatedAt = formatTimestamp(task.updated_at);
      const resultText = task.result ? JSON.stringify(task.result, null, 2) : '';
      const errorText = task.error || '';
      detailGroup.innerHTML = `
        <h4 style="margin-top:0;">Details</h4>
        <p class="muted" style="margin:0 0 8px 0;">Updated: ${updatedAt || '—'}${finishedAt ? ` · Finished: ${finishedAt}` : ''}</p>
        ${resultText ? `<div class="form-group"><label>Result (read-only)</label><pre style="max-height:160px; overflow:auto;">${resultText}</pre></div>` : ''}
        ${errorText ? `<div class="form-group"><label>Error</label><pre style="max-height:160px; overflow:auto;">${errorText}</pre></div>` : ''}
      `;
      body.appendChild(detailGroup);

      const footer = document.createElement('div');
      footer.className = 'modal-footer';
      const deleteBtn = document.createElement('button');
      deleteBtn.id = 'edit-task-delete';
      deleteBtn.className = 'button danger';
      deleteBtn.textContent = '🗑️ Delete';
      const actions = document.createElement('div');
      actions.className = 'modal-actions';
      const cancelBtn = document.createElement('button');
      cancelBtn.id = 'edit-task-cancel';
      cancelBtn.className = 'button secondary';
      cancelBtn.textContent = 'Cancel';
      const saveBtn = document.createElement('button');
      saveBtn.id = 'edit-task-save';
      saveBtn.className = 'button primary';
      saveBtn.textContent = 'Save';
      actions.append(cancelBtn, saveBtn);
      footer.append(deleteBtn, actions);

      modal.append(header, body, footer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      requestAnimationFrame(() => {
        overlay.classList.add('visible');
        modal.style.transform = 'scale(1)';
        toolInput.focus();
        toolInput.select();
      });

      const getPayload = () => {
        const promptText = payloadInput?.value ?? '';
        let payload = promptText;
        if (originalPayload && typeof originalPayload === 'object') {
          payload = { ...originalPayload, prompt: promptText };
        }
        if (payload && typeof payload === 'object') {
          try {
            payload = JSON.stringify(payload);
          } catch (err) {
            console.error('Failed to serialize payload, falling back to prompt text:', err);
            payload = promptText;
          }
        }
        const updates = { payload };

        const timeoutRaw = (timeoutInput?.value || '').trim();
        if (timeoutRaw) {
          const timeoutVal = parseInt(timeoutRaw, 10);
          if (!Number.isInteger(timeoutVal) || timeoutVal <= 0) {
            showError('Timeout must be a positive integer.');
            return null;
          }
          updates.timeout = timeoutVal;
        }

        const agentRoleVal = (agentRoleInput?.value || '').trim();
        updates.agent_role_key = agentRoleVal || null;

        return updates;
      };

      const result = await new Promise((resolve) => {
        let onKeyDown;
        const finish = (value) => {
          overlay.classList.remove('visible');
          modal.style.transform = 'scale(0.95)';
          setTimeout(() => overlay.remove(), 200);
          if (onKeyDown) {
            document.removeEventListener('keydown', onKeyDown);
          }
          resolve(value);
        };

        onKeyDown = (e) => {
          if (e.key === 'Escape') {
            finish(null);
          }
          if (e.key === 'Enter' && document.activeElement?.tagName !== 'TEXTAREA') {
            e.preventDefault();
            saveBtn.click();
          }
        };
        document.addEventListener('keydown', onKeyDown);

        overlay.addEventListener('click', (event) => {
          if (event.target === overlay) {
            finish(null);
          }
        });

        const handleSave = () => {
          const payload = getPayload();
          if (!payload) return;
          finish(payload);
        };
        const handleCancel = () => finish(null);
        const handleDelete = () => finish({ delete: true });
        cancelBtn.addEventListener('click', handleCancel);
        closeBtn.addEventListener('click', handleCancel);
        saveBtn.addEventListener('click', handleSave);
        deleteBtn.addEventListener('click', handleDelete);
      });

      if (!result) return;

      const payload = result;

      if (payload.delete) {
        const friendly = task?.friendlyLabel;
        const label = (task?.friendly_id || task.id) + (friendly ? ` (${friendly})` : '');
        const confirmed = await safeConfirm('Delete Task', `Are you sure you want to delete task ${label}? This cannot be undone.`);
        if (!confirmed) return;
        try {
          await api('DELETE', `/api/tasks/${encodeURIComponent(task.id)}`, null, { action: 'delete task' });
          Utils.showToast(`Task ${label} deleted`, 'success', 3500);
          const tasksContainer = document.getElementById('dashboard-tasks');
          if (tasksContainer) {
            this.renderTasks(tasksContainer, queueId);
          }
        } catch (err) {
          console.error('Failed to delete task:', err);
          Utils.showToast('Failed to delete task', 'error');
        }
        return;
      }

      try {
        await api('PUT', `/api/tasks/${encodeURIComponent(task.id)}`, payload, { action: 'update task' });
        Utils.showToast('Task updated successfully', 'success');
        const tasksContainer = document.getElementById('dashboard-tasks');
        if (tasksContainer) {
          this.renderTasks(tasksContainer, queueId);
        }
      } catch (err) {
        console.error('Failed to update task:', err);
        const msg = err?.detail || err?.message || 'Failed to update task';
        Utils.showToast(msg, 'error', 4000);
      }
    },

    renderSessionSelector(activeSession, sessions) {
      if (!activeSession || !sessions.length) {
        return '';
      }

      const sessionOptions = sessions
        .map((s) => `<option value="${s.id}" ${s.id === activeSession.id ? 'selected' : ''}>${s.name || s.id}</option>`)
        .join('');

      return `
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
          <select id="session-selector" data-action="dashboard-session-select" class="form-control form-select" style="min-width: 200px; font-size: 13px;" title="Select session">
            ${sessionOptions}
          </select>
          <button id="session-rename-btn" data-action="dashboard-session-rename" class="button secondary" style="padding: 4px 8px; font-size: 12px;" title="Rename session">✏️</button>
          <button id="session-delete-btn" data-action="dashboard-session-delete" class="button secondary" style="padding: 4px 8px; font-size: 12px;" title="Delete session">🗑️</button>
        </div>
      `;
    },

    attachQueueActionHandlers(container, queueId, queue) {
      const editBtn = container?.querySelector('#dashboard-edit-btn');
      const archiveBtn = container?.querySelector('#dashboard-archive-btn');
      const deleteBtn = container?.querySelector('#dashboard-delete-btn');

      if (editBtn) {
        editBtn.addEventListener('click', async () => {
          const queueName = queue.name || queue.id || 'Queue';
          const newName = await Utils.showPrompt('Edit Queue', 'Queue name:', queueName);
          if (!newName || !newName.trim()) {
            return;
          }

          const instructions = await Utils.showPrompt('Queue Instructions', 'Enter queue instructions (optional):', '', { textarea: true });

          try {
            const payload = {};
            if (newName.trim() !== queueName) {
              payload.name = newName.trim();
            }
            if (instructions && instructions.trim()) {
              payload.instructions = instructions;
            }

            if (Object.keys(payload).length > 0) {
              await api('PUT', `/api/queues/${queueId}`, payload, { action: 'update queue' });
              Utils.showToast('Queue updated', 'success');
              await this.refreshQueues(queueId);
            }
          } catch (err) {
            console.error('Failed to update queue:', err);
            Utils.showToast('Failed to update queue', 'error');
          }
        });
      }

      if (archiveBtn) {
        archiveBtn.addEventListener('click', async () => {
          const queueName = queue.name || queue.id || 'Queue';
          const confirmed = await Utils.showConfirm('Archive Queue', `Archive "${queueName}"?`);
          if (!confirmed) return;

          try {
            await api('PUT', `/api/queues/${queueId}/archive`, null, { action: 'archive queue' });
            Utils.showToast(`Queue "${queueName}" archived`, 'success');
            await this.refreshQueues();
          } catch (err) {
            console.error('Failed to archive queue:', err);
            Utils.showToast('Failed to archive queue', 'error');
          }
        });
      }

      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
          const queueName = queue.name || queue.id || 'Queue';
          const confirmed = await Utils.showConfirm('Delete Queue', `Are you sure you want to delete "${queueName}"? This cannot be undone.`);
          if (!confirmed) return;

          try {
            await api('DELETE', `/api/queues/${queueId}`, null, { action: 'delete queue' });
            Utils.showToast(`Queue "${queueName}" deleted`, 'success');
            this.currentQueueId = null;
            await this.refreshQueues();
          } catch (err) {
            console.error('Failed to delete queue:', err);
            Utils.showToast('Failed to delete queue', 'error');
          }
        });
      }
    },

    attachSessionSelectorHandlers(container, sessions) {
      const sessionSelector = container?.querySelector('#session-selector');
      const renameBtn = container?.querySelector('#session-rename-btn');
      const deleteBtn = container?.querySelector('#session-delete-btn');

      // Handle session selection change
      if (sessionSelector) {
        sessionSelector.addEventListener('change', async (e) => {
          const sessionId = e.target.value;
          const selectedSession = sessions.find((s) => s.id === sessionId);
          if (selectedSession) {
            // Store current session and re-render
            this.currentSessionId = sessionId;
            this.render(container);
          }
        });
      }

      if (renameBtn) {
        renameBtn.addEventListener('click', async () => {
          const sessionId = this.currentSessionId;
          if (!sessionId) return;

          const currentSession = sessions.find((s) => s.id === sessionId);
          if (!currentSession) return;

          const newName = await Utils.showPrompt('Rename Session', 'Enter new session name:', currentSession.name || '');
          if (!newName || !newName.trim()) return;

          try {
            await api('PUT', `/api/sessions/${sessionId}`, { name: newName.trim() }, { action: 'rename session' });
            Utils.showToast('Session renamed', 'success');
            this.render(container);
          } catch (err) {
            console.error('Failed to rename session:', err);
            Utils.showToast('Failed to rename session', 'error');
          }
        });
      }

      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
          const sessionId = this.currentSessionId;
          if (!sessionId) return;

          const currentSession = sessions.find((s) => s.id === sessionId);
          if (!currentSession) return;

          const confirmed = await Utils.showConfirm('Delete Session', `Are you sure you want to delete "${currentSession.name || currentSession.id}"? This cannot be undone.`);
          if (!confirmed) return;

          try {
            await api('DELETE', `/api/sessions/${sessionId}`, null, { action: 'delete session' });
            Utils.showToast('Session deleted', 'success');
            this.render(container);
          } catch (err) {
            console.error('Failed to delete session:', err);
            Utils.showToast('Failed to delete session', 'error');
          }
        });
      }
    }
  };

  function registerDashboardActions() {
    const register = (window.Actions && window.Actions.registerAction) || Utils.registerAction || window.registerAction;
    if (typeof register !== 'function') {
      console.warn('[Dashboard] Action registry not available; dashboard actions not registered.');
      return;
    }

    const dash = Pages.Dashboard;

    register('dashboard-new-queue', () => dash.handleCreateQueue.call(dash));
    register('dashboard-select-queue', (el) => {
      const queueId = el?.dataset?.queueId;
      dash.handleQueueTabSelect.call(dash, queueId);
    });
    register('dashboard-filter-active', () => Pages.Dashboard.handleFilterChange('active'));
    register('dashboard-filter-archived', () => Pages.Dashboard.handleFilterChange('archived'));
    register('dashboard-select-archived', (el, event) => {
      const val = (event?.target && event.target.value) || el?.value || el?.dataset?.queueId || '';
      dash.handleArchivedSelect.call(dash, val);
    });
    register('dashboard-edit-queue', (el) => {
      const queueId = el?.dataset?.queueId;
      dash.handleEditQueue.call(dash, queueId);
    });
    register('dashboard-archive-queue', (el) => {
      const queueId = el?.dataset?.queueId;
      dash.handleArchiveQueue.call(dash, queueId);
    });
    register('dashboard-delete-queue', (el) => {
      const queueId = el?.dataset?.queueId;
      dash.handleDeleteQueue.call(dash, queueId);
    });
    register('dashboard-unarchive-queue', (el) => {
      const queueId = el?.dataset?.queueId;
      dash.handleUnarchiveQueue.call(dash, queueId);
    });
    register('dashboard-session-select', (_el, event) => {
      dash.handleSessionSelect.call(dash, event);
    });
    register('dashboard-session-rename', () => {
      dash.handleSessionRename.call(dash);
    });
    register('dashboard-session-delete', () => {
      dash.handleSessionDelete.call(dash);
    });

    register('dashboard-task-rerun', (el) => {
      const taskId = el?.dataset?.taskId;
      const queueId = el?.dataset?.queueId;
      dash.handleTaskRerun.call(dash, taskId, queueId);
    });
    register('dashboard-task-edit', (el) => {
      const taskId = el?.dataset?.taskId;
      const queueId = el?.dataset?.queueId;
      dash.handleTaskEdit.call(dash, taskId, queueId);
    });
    register('dashboard-task-delete', (el) => {
      const taskId = el?.dataset?.taskId;
      const queueId = el?.dataset?.queueId;
      dash.handleTaskDelete.call(dash, taskId, queueId);
    });
    register('dashboard-task-row-open', (el) => {
      const taskId = el?.dataset?.taskId;
      const queueId = el?.dataset?.queueId;
      dash.handleTaskRowOpen.call(dash, taskId, queueId);
    });
    register('dashboard-task-filter-toggle', (el) => {
      const queueId = el?.dataset?.queueId;
      dash.handleTaskFilterToggle.call(dash, queueId);
    });
    register('dashboard-task-filter-close', (el) => {
      const queueId = el?.dataset?.queueId;
      dash.handleTaskFilterClose.call(dash, queueId);
    });
    register('dashboard-task-filter-reset', (el) => {
      const queueId = el?.dataset?.queueId;
      dash.handleTaskFilterReset.call(dash, queueId);
    });
    register('dashboard-task-filter-checkbox', (el) => {
      const queueId = el?.dataset?.queueId;
      const status = el?.dataset?.status;
      const checked = !!el?.checked;
      dash.handleTaskFilterCheckbox.call(dash, queueId, status, checked);
    });
    register('dashboard-task-page-prev', (el) => {
      const queueId = el?.dataset?.queueId;
      dash.handleTaskPagePrev.call(dash, queueId);
    });
    register('dashboard-task-page-next', (el) => {
      const queueId = el?.dataset?.queueId;
      dash.handleTaskPageNext.call(dash, queueId);
    });
  }

  registerDashboardActions();

})(window.Pages, window.API, window.Utils, window.Components || { QuickAdd: window.QuickAdd });
