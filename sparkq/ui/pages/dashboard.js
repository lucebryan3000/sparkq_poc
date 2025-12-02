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
    const timestamp = formatTimestamp(task?.created_at);
    const label = task?.friendly_id || displayId || `Task #${task?.id || '—'}`;
    const preview = taskPreview(task);
    const toolLabel = task?.friendlyTool || getFriendlyToolName(task?.tool_name);
    const actionsCell = readOnly
      ? '<div class="task-cell actions muted">View only</div>'
      : `<div class="task-cell actions">
          <button class="task-edit-btn" data-task-id="${task?.id}" title="Edit task">✏️</button>
          <button class="task-delete-btn" data-task-id="${task?.id}" title="Delete task">✖️</button>
        </div>`;

    return `
      <div class="task-row" data-task-id="${task?.id || ''}">
        <div class="task-cell status">${statusPill}</div>
        <div class="task-cell id">${label}</div>
        <div class="task-cell tool">${toolLabel || '—'}</div>
        <div class="task-cell preview" title="${preview}">${preview}</div>
        <div class="task-cell created">${timestamp}</div>
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
                <button class="new-queue-btn" id="dashboard-new-queue-btn">+ New Queue</button>
              </div>
            </div>
            <div id="queue-content">
              <div class="card">
                <p class="muted">No queues yet. Create one to get started.</p>
              </div>
            </div>
          `;
          this.attachSessionSelectorHandlers(actualContainer, sessions);
          this.attachNewQueueButton(actualContainer);
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
                <button id="queue-filter-active" class="button secondary queue-filter-toggle ${this.queueFilter === 'active' ? 'active' : ''}">Active</button>
                <button id="queue-filter-archived" class="button secondary queue-filter-toggle ${this.queueFilter === 'archived' ? 'active' : ''}">Archived</button>
              </div>
            </div>
            <div id="queue-tabs" class="queue-tabs"></div>
          </div>

          <div id="queue-content"></div>
        `;

        this.attachSessionSelectorHandlers(actualContainer, sessions);
        this.attachQueueFilterHandlers(actualContainer);

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
          <select id="archived-queue-select" class="form-control" style="min-width:200px;">
            ${options || '<option value=\"\">No archived queues</option>'}
          </select>
        </div>
      `;
      const selectEl = container.querySelector('#archived-queue-select');
      if (selectEl) {
        selectEl.addEventListener('change', () => {
          this.archivedQueueId = selectEl.value || null;
          localStorage.setItem('dashboard.archivedQueueId', this.archivedQueueId || '');
          const contentContainer = document.getElementById('queue-content');
          this.renderArchivedQueueContent(contentContainer, archivedQueues);
        });
      }
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
            <div class="queue-tab ${isActive ? 'active' : ''}" data-queue-id="${queue.id}">
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
        <button class="new-queue-btn" id="dashboard-new-queue-btn">+ New Queue</button>
      `;

      const tabs = container.querySelectorAll('.queue-tab');
      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          const selectedId = tab.getAttribute('data-queue-id');
          if (!selectedId || selectedId === this.currentQueueId) {
            return;
          }

          this.currentQueueId = selectedId;
          this.renderQueueTabs(container, this.queuesCache);

          // Hide queue filter buttons when viewing a specific queue
          const filterButtons = document.getElementById('queue-filter-buttons');
          if (filterButtons) {
            filterButtons.style.display = 'none';
          }

          const contentContainer = document.getElementById('queue-content');
          if (contentContainer) {
            this.renderQueueContent(contentContainer, selectedId);
          }
        });
      });

      // Attach handler to the new queue button created in this render
      this.attachNewQueueButton(container);
    },

    attachNewQueueButton(root) {
      const newQueueBtn = root?.querySelector('#dashboard-new-queue-btn');
      if (!newQueueBtn) {
        return;
      }

      // Clone to drop any old listeners before wiring the single handler
      const cleanButton = newQueueBtn.cloneNode(true);
      newQueueBtn.replaceWith(cleanButton);

      cleanButton.addEventListener('click', () => this.handleCreateQueue());
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
        return;
      }

      if (!sessions.length) {
        // Auto-create a session when none exist
        const sessionName = await Utils.showPrompt('Create Session', 'Enter session name:');
        if (!sessionName || !sessionName.trim()) {
          return;
        }

        try {
          const sessionResponse = await api('POST', '/api/sessions', { name: sessionName.trim() }, { action: 'create session' });
          const newSession = sessionResponse?.session || sessionResponse;
          sessions = [newSession];
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

      // Prompt user for a friendly queue name instead of auto-creating
      const defaultName = `Queue ${new Date().toISOString().substring(0, 10).replace(/-/g, '')}`;
      const queueName = await Utils.showPrompt('Create Queue', 'Enter a queue name:', defaultName);
      if (!queueName || !queueName.trim()) {
        Utils.showToast('Queue creation cancelled', 'info');
        return;
      }

      this.currentSessionId = sessionId;

      try {
        const payload = {
          session_id: sessionId,
          name: queueName.trim(),
        };
        console.log('[Dashboard] Creating queue with:', { sessionId, queueName, payload, sessionsCount: sessions.length });
        const response = await api('POST', '/api/queues', payload, { action: 'create queue' });
        const newQueueId = response?.id || response?.queue_id || response?.queue?.id;
        Utils.showToast(`Queue "${queueName.trim()}" created`, 'success');
        this.queueFilter = 'active';
        await this.refreshQueues(newQueueId);
      } catch (err) {
        console.error('Failed to create queue:', err);
        showError(`Failed to create queue: ${err.message || err}`, err);
        Utils.showToast('Failed to create queue', 'error');
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
                <button id="dashboard-edit-btn" class="button secondary" style="padding: 6px 12px; font-size: 13px; gap: 6px; display: flex; align-items: center;" title="Edit queue">✏️ Edit</button>
                <button id="dashboard-archive-btn" class="button secondary" style="padding: 6px 12px; font-size: 13px; gap: 6px; display: flex; align-items: center;" title="Archive queue">📦 Archive</button>
                <button id="dashboard-delete-btn" class="button secondary" style="padding: 6px 12px; font-size: 13px; gap: 6px; display: flex; align-items: center;" title="Delete queue">🗑️ Delete</button>
              </div>
            `}
            ${showUnarchive ? `
              <div style="display: flex; gap: 8px; align-items: center;">
                <button id="dashboard-unarchive-btn" class="button secondary" style="padding: 6px 12px; font-size: 13px; gap: 6px; display: flex; align-items: center;" title="Unarchive queue">⬆️ Unarchive</button>
              </div>
            ` : ''}
          </div>
          ${hideQuickAdd ? '<div class="muted" style="font-size:12px;">Archived queues are read-only. Actions are disabled.</div>' : '<div id="dashboard-quick-add"></div>'}
        </div>

        <div id="dashboard-tasks" style="margin-top: 16px;"></div>
      `;

      if (!hideQuickAdd) {
        this.attachQueueActionHandlers(container, queueId, queue);
        this.renderQuickAdd(queueId, queueName);
      }
      const unarchiveBtn = container.querySelector('#dashboard-unarchive-btn');
      if (unarchiveBtn && showUnarchive) {
        unarchiveBtn.addEventListener('click', async () => {
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
        });
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
        tabsContainer.innerHTML = `<button class="new-queue-btn" id="dashboard-new-queue-btn">+ New Queue</button>`;
        contentContainer.innerHTML = `
          <div class="card">
            <p class="muted">No queues yet. Create one to get started.</p>
          </div>
        `;
        this.attachNewQueueButton(pageContainer);
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
                    <button id="task-filter-toggle-${queueId}" class="button secondary" style="padding:6px 10px;font-size:13px;">${filterLabel}</button>
                    <div id="task-filter-menu-${queueId}" class="task-filter-menu">
                      ${defaultStatuses.map((status) => {
                        const checked = state.statuses.has(status) ? 'checked' : '';
                        const label = status.charAt(0).toUpperCase() + status.slice(1);
                        const inputId = `task-filter-${queueId}-${status}`;
                        return `<label for="${inputId}" style="display:flex;align-items:center;gap:8px;padding:4px 6px;cursor:pointer;">
                          <input id="${inputId}" type="checkbox" data-status="${status}" ${checked} />
                          <span>${label}</span>
                        </label>`;
                      }).join('')}
                      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:8px;">
                        <button id="task-filter-reset-${queueId}" class="button secondary" style="padding:4px 8px;font-size:12px;">Reset</button>
                        <button id="task-filter-close-${queueId}" class="button secondary" style="padding:4px 8px;font-size:12px;">Close</button>
                      </div>
                    </div>
                  </div>
                `}
                <div class="pager" style="display:flex;align-items:center;gap:6px;">
                  <button id="task-page-prev-${queueId}" class="button secondary" style="padding:6px 8px;font-size:12px;" ${state.page === 0 ? 'disabled' : ''}>Prev</button>
                  <span class="muted" style="font-size:12px;">${rangeLabel}</span>
                  <button id="task-page-next-${queueId}" class="button secondary" style="padding:6px 8px;font-size:12px;" ${startIdx + pageSize >= total ? 'disabled' : ''}>Next</button>
                </div>
                <span class="muted" style="font-size:12px;">${tasks.length} total</span>
              </div>
            </div>
            <div class="task-table">
              <div class="task-row head">
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

        if (!readOnly) {
          this.attachTaskActionHandlers(container, pageTasks, queueId);
        }

        if (!readOnly) {
          const toggleBtn = container.querySelector(`#task-filter-toggle-${queueId}`);
          const menu = container.querySelector(`#task-filter-menu-${queueId}`);
          const resetBtn = container.querySelector(`#task-filter-reset-${queueId}`);
          const closeBtn = container.querySelector(`#task-filter-close-${queueId}`);

          const setMenuVisible = (visible) => {
            if (menu) {
              menu.style.display = visible ? 'block' : 'none';
            }
          };

          toggleBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = menu && menu.style.display === 'block';
            setMenuVisible(!isOpen);
          });
          closeBtn?.addEventListener('click', () => setMenuVisible(false));
          resetBtn?.addEventListener('click', () => {
            state.statuses = new Set(defaultStatuses);
            state.page = 0;
            renderTaskTable();
          });
          menu?.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            cb.addEventListener('change', () => {
              const val = cb.dataset.status;
              const selected = new Set(state.statuses);
              if (cb.checked) {
                selected.add(val);
              } else {
                selected.delete(val);
              }
              if (!selected.size) {
                defaultStatuses.forEach((s) => selected.add(s));
              }
              state.statuses = selected;
              state.page = 0;
              renderTaskTable();
            });
          });
        }

        const prevBtn = container.querySelector(`#task-page-prev-${queueId}`);
        const nextBtn = container.querySelector(`#task-page-next-${queueId}`);
        prevBtn?.addEventListener('click', () => {
          if (state.page > 0) {
            state.page -= 1;
            renderTaskTable();
          }
        });
        nextBtn?.addEventListener('click', () => {
          if (startIdx + pageSize < total) {
            state.page += 1;
            renderTaskTable();
          }
        });
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

      // Attach event handlers to the new row
      this.attachTaskRowHandlers(newRow, newTask);

      // Update the total count if it exists
      const totalElement = container.querySelector('.queue-info-total');
      if (totalElement) {
        const currentCount = parseInt(totalElement.textContent) || 0;
        totalElement.textContent = currentCount + 1;
      }
    },

    /**
     * Attach event handlers to a single task row
     * @param {HTMLElement} row - The task row element
     * @param {Object} task - The task object
     */
    attachTaskRowHandlers(row, task) {
      // Edit button
      const editBtn = row.querySelector('.task-edit-btn');
      if (editBtn) {
        editBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.showEditTaskDialog(task, task.queue_id);
        });
      }

      // Delete button
      const deleteBtn = row.querySelector('.task-delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const friendly = task?.friendlyLabel || task.friendly_id || task.id;
          let confirmed = false;
          try {
            confirmed = await Utils.showConfirm('Delete Task', `Are you sure you want to delete task ${friendly}? This cannot be undone.`);
          } catch (err) {
            confirmed = window.confirm(`Are you sure you want to delete task ${friendly}? This cannot be undone.`);
          }
          if (!confirmed) return;

          try {
            await api('DELETE', `/api/tasks/${encodeURIComponent(task.id)}`, null, { action: 'delete task' });
            Utils.showToast(`Task ${task.id} deleted`, 'success', 3500);
            const tasksContainer = document.getElementById('dashboard-tasks');
            if (tasksContainer) {
              this.renderTasks(tasksContainer, task.queue_id);
            }
          } catch (err) {
            console.error('Failed to delete task:', err);
            Utils.showToast('Failed to delete task', 'error');
          }
        });
      }

      // Row click for details
      row.addEventListener('click', async (e) => {
        if (e.target.closest('button')) return;
        await this.showEditTaskDialog(task, task.queue_id);
      });
    },

    async attachTaskActionHandlers(container, tasks, queueId) {
      // Row click -> edit
      container.querySelectorAll('.task-row').forEach(row => {
        const taskId = row.dataset.taskId;
        if (!taskId) return;
        row.addEventListener('click', async (e) => {
          // Avoid double-trigger when clicking buttons
          if (e.target.closest('button')) return;
          const task = tasks.find(t => String(t.id) === String(taskId));
          if (task) {
            await this.showEditTaskDialog(task, queueId);
          }
        });
      });

      // Attach edit button handlers
      container.querySelectorAll('.task-edit-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const taskId = btn.dataset.taskId;
          const task = tasks.find(t => String(t.id) === String(taskId));
          if (task) {
            await this.showEditTaskDialog(task, queueId);
          }
        });
      });

      // Attach delete button handlers
      container.querySelectorAll('.task-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const taskId = btn.dataset.taskId;
          const task = tasks.find(t => String(t.id) === String(taskId));
          const friendly = task?.friendlyLabel || taskId;
          const label = friendly;
          let confirmed = false;
          try {
            confirmed = await Utils.showConfirm('Delete Task', `Are you sure you want to delete task ${label}? This cannot be undone.`);
          } catch (err) {
            // Fallback to native confirm if custom dialog fails
            confirmed = window.confirm(`Are you sure you want to delete task ${label}? This cannot be undone.`);
          }
          if (!confirmed) return;

          try {
            await api('DELETE', `/api/tasks/${encodeURIComponent(taskId)}`, null, { action: 'delete task' });
            Utils.showToast(`Task ${taskId} deleted`, 'success', 3500);
            const tasksContainer = document.getElementById('dashboard-tasks');
            if (tasksContainer) {
              this.renderTasks(tasksContainer, queueId);
            }
          } catch (err) {
            console.error('Failed to delete task:', err);
            Utils.showToast('Failed to delete task', 'error');
          }
        });
      });
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
            return { payload: JSON.stringify(payload) };
          } catch (err) {
            console.error('Failed to serialize payload, falling back to prompt text:', err);
            return { payload: promptText };
          }
        }
        return { payload };
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

        const handleSave = () => finish(getPayload());
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
        let confirmed = false;
        try {
          confirmed = await Utils.showConfirm('Delete Task', `Are you sure you want to delete task ${label}? This cannot be undone.`);
        } catch (err) {
          confirmed = window.confirm(`Are you sure you want to delete task ${label}? This cannot be undone.`);
        }
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
          <select id="session-selector" class="form-control form-select" style="min-width: 200px; font-size: 13px;" title="Select session">
            ${sessionOptions}
          </select>
          <button id="session-rename-btn" class="button secondary" style="padding: 4px 8px; font-size: 12px;" title="Rename session">✏️</button>
          <button id="session-delete-btn" class="button secondary" style="padding: 4px 8px; font-size: 12px;" title="Delete session">🗑️</button>
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

})(window.Pages, window.API, window.Utils, window.Components || { QuickAdd: window.QuickAdd });
