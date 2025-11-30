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

  function taskBadgeClass(status) {
    const lower = String(status || '').toLowerCase();
    if (lower === 'running') {
      return 'badge-running';
    }
    if (lower === 'queued' || lower === 'pending') {
      return 'badge-queued';
    }
    if (['succeeded', 'completed', 'done'].includes(lower)) {
      return 'badge-active';
    }
    if (['failed', 'error', 'ended'].includes(lower)) {
      return 'badge-ended';
    }
    return 'badge';
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

  function renderTaskRow(task, displayId) {
    const status = String(task?.status || 'queued').toLowerCase();
    const badgeClass = taskBadgeClass(status);
    const timestamp = formatTimestamp(task?.created_at);
    const label = displayId || `Task #${task?.id || '—'}`;
    const preview = taskPreview(task);

    return `
      <div class="task-row" data-task-id="${task?.id || ''}">
        <div class="task-cell status"><span class="badge ${badgeClass}">${status}</span></div>
        <div class="task-cell id">${label}</div>
        <div class="task-cell tool">${task?.tool_name || '—'}</div>
        <div class="task-cell preview" title="${preview}">${preview}</div>
        <div class="task-cell created">${timestamp}</div>
        <div class="task-cell actions">
          <button class="task-edit-btn" data-task-id="${task?.id}" title="Edit task">✏️</button>
          <button class="task-delete-btn" data-task-id="${task?.id}" title="Delete task">✖️</button>
        </div>
      </div>
    `;
  }

  Pages.Dashboard = {
    currentQueueId: null,
    currentSessionId: null,
    queuesCache: [],
    _rendering: false,
    quickAddInstance: null,

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

        if (!queues.length) {
          this.currentQueueId = null;
          // Get the first session or use a placeholder
          activeSession = sessions.length > 0 ? sessions[0] : null;
          if (activeSession) {
            this.currentSessionId = activeSession.id;
          }
          const sessionSelector = this.renderSessionSelector(activeSession, sessions);

          actualContainer.innerHTML = `
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

        if (!this.currentQueueId || !queues.some((queue) => queue.id === this.currentQueueId)) {
          this.currentQueueId = queues[0].id;
        }

        // Get the session for the first queue
        if (queues.length > 0) {
          activeSession = sessions.find((s) => s.id === queues[0].session_id) || sessions[0];
          if (activeSession) {
            this.currentSessionId = activeSession.id;
          }
        }

        const sessionSelector = this.renderSessionSelector(activeSession, sessions);

        actualContainer.innerHTML = `
          <div class="session-tabs-section">
            <div class="section-title">Sessions</div>
            ${sessionSelector}
          </div>

          <div class="queue-tabs-section">
            <div class="section-title">Queues</div>
            <div id="queue-tabs" class="queue-tabs"></div>
          </div>

          <div id="queue-content"></div>
        `;

        this.attachSessionSelectorHandlers(actualContainer, sessions);
        const tabsContainer = actualContainer.querySelector('#queue-tabs');
        this.renderQueueTabs(tabsContainer, queues);

        const contentContainer = actualContainer.querySelector('#queue-content');
        await this.renderQueueContent(contentContainer, this.currentQueueId);
      } finally {
        this._rendering = false;
      }
    },

    async reloadAfterQueueOperation(selectQueueId) {
      await this.refreshQueues(selectQueueId);
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

      this.currentSessionId = sessionId;

      // Generate a simple queue name with timestamp and a short suffix to avoid collisions
      const timestamp = new Date().toISOString().substring(0, 10).replace(/-/g, '');
      const suffix = Math.floor(Math.random() * 900 + 100);
      const queueName = `Queue ${timestamp}-${suffix}`;

      try {
        const payload = {
          session_id: sessionId,
          name: queueName,
        };
        console.log('[Dashboard] Creating queue with:', { sessionId, queueName, payload, sessionsCount: sessions.length });
        const response = await api('POST', '/api/queues', payload, { action: 'create queue' });
        const newQueueId = response?.id || response?.queue_id || response?.queue?.id;
        Utils.showToast(`Queue created`, 'success');
        await this.refreshQueues(newQueueId);
      } catch (err) {
        console.error('Failed to create queue:', err);
        showError(`Failed to create queue: ${err.message || err}`, err);
        Utils.showToast('Failed to create queue', 'error');
      }
    },

    async renderQueueContent(container, queueId) {
      if (!container) {
        return;
      }

      const queue = this.queuesCache.find((s) => s.id === queueId) || {};
      const queueName = queue.name || queue.id || 'Queue';
      const progress = formatProgress(queue.stats);

      container.innerHTML = `
        <div class="card">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px;">
            <div>
              <h2 style="margin: 0;">${queueName}</h2>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <button id="dashboard-edit-btn" class="button secondary" style="padding: 6px 12px; font-size: 13px; gap: 6px; display: flex; align-items: center;" title="Edit queue">✏️ Edit</button>
              <button id="dashboard-archive-btn" class="button secondary" style="padding: 6px 12px; font-size: 13px; gap: 6px; display: flex; align-items: center;" title="Archive queue">📦 Archive</button>
              <button id="dashboard-delete-btn" class="button secondary" style="padding: 6px 12px; font-size: 13px; gap: 6px; display: flex; align-items: center;" title="Delete queue">🗑️ Delete</button>
            </div>
          </div>
          <div id="dashboard-quick-add"></div>
        </div>

        <div id="dashboard-tasks" style="margin-top: 16px;"></div>
      `;

      this.attachQueueActionHandlers(container, queueId, queue);
      this.renderQuickAdd(queueId, queueName);

      const tasksContainer = container.querySelector('#dashboard-tasks');
      if (tasksContainer) {
        await this.renderTasks(tasksContainer, queueId);
      }
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

      this.quickAddInstance.setRefreshCallback(() => {
        const tasksContainer = document.getElementById('dashboard-tasks');
        if (tasksContainer) {
          this.renderTasks(tasksContainer, queueId);
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

      const queueExists = (id) => queues.some((q) => q.id === id);
      const activeQueueId = queueExists(selectQueueId)
        ? selectQueueId
        : queueExists(this.currentQueueId)
          ? this.currentQueueId
          : queues[0].id;

      this.currentQueueId = activeQueueId;
      this.renderQueueTabs(tabsContainer, queues);
      await this.renderQueueContent(contentContainer, activeQueueId);
    },

    async renderTasks(container, queueId) {
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
      } catch (err) {
        container.innerHTML = `
          <div class="card">
            <div class="muted">Unable to load tasks for this queue.</div>
          </div>
        `;
        showError(`Failed to load tasks: ${err.message || err}`, err);
        return;
      }

      const queue = this.queuesCache.find((q) => q.id === queueId) || {};
      const prefix = slugifyName(queue.name || queue.id || 'Task');
      const friendlyIds = new Map();
      [...tasks].reverse().forEach((task, idx) => {
        friendlyIds.set(String(task.id), `${prefix}-${String(idx + 1).padStart(2, '0')}`);
      });

      const taskRows = tasks.length
        ? tasks.map((task) => {
            task.friendlyLabel = friendlyIds.get(String(task.id));
            return renderTaskRow(task, task.friendlyLabel);
          }).join('')
        : '<p class="muted">No tasks found for this queue.</p>';

      container.innerHTML = `
        <div class="card">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <h3 style="margin: 0;">Tasks</h3>
            <span class="muted" style="font-size: 13px;">${tasks.length} total</span>
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

      this.attachTaskActionHandlers(container, tasks, queueId);
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
      overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.55);
        display: flex; align-items: center; justify-content: center; z-index: 9999;
        backdrop-filter: blur(2px);
      `;

      const modal = document.createElement('div');
      modal.style.cssText = `
        background: var(--surface, #111);
        color: var(--text, #fff);
        border: 1px solid var(--border, #333);
        border-radius: 12px;
        padding: 16px;
        width: min(420px, 92vw);
        box-shadow: var(--shadow, 0 10px 40px rgba(0,0,0,0.35));
      `;

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
      const friendlyLabel = task.friendlyLabel || `Task #${task.id}`;
      const toolLabel = task.friendlyTool || task.tool_name || '';
      modal.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;">
          <h3 style="margin:0;font-size:18px;">Edit ${friendlyLabel}</h3>
          <button id="edit-task-close" style="border:none;background:none;color:var(--text);font-size:18px;cursor:pointer;">✕</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div>
            <span class="badge ${taskBadgeClass(statusLabel)}">${statusLabel}</span>
          </div>
          <div>
            <label style="display:block;font-weight:600;margin-bottom:4px;">Tool</label>
            <input id="edit-task-tool" type="text" value="${toolLabel}" disabled style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2, #151515);color:var(--text);opacity:0.75;">
          </div>
          <div>
            <label style="display:block;font-weight:600;margin-bottom:4px;">Prompt / Payload</label>
            <textarea id="edit-task-payload" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2, #151515);color:var(--text);min-height:140px;font-family:inherit;">${payloadText}</textarea>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;gap:10px;margin-top:16px;">
          <button id="edit-task-delete" class="button secondary" style="padding:8px 14px;">🗑️ Delete</button>
          <div style="display:flex;gap:8px;">
            <button id="edit-task-cancel" class="button secondary" style="padding:8px 14px;">Cancel</button>
            <button id="edit-task-save" class="button primary" style="padding:8px 14px;">Save</button>
          </div>
        </div>
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const cleanup = (result) => {
        document.body.removeChild(overlay);
        document.removeEventListener('keydown', onKeyDown);
        return result;
      };

      const onKeyDown = (e) => {
        if (e.key === 'Escape') {
          cleanup(null);
        }
        if (e.key === 'Enter' && document.activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          saveBtn.click();
        }
      };
      document.addEventListener('keydown', onKeyDown);

      const toolInput = modal.querySelector('#edit-task-tool');
      const payloadInput = modal.querySelector('#edit-task-payload');
      const cancelBtn = modal.querySelector('#edit-task-cancel');
      const saveBtn = modal.querySelector('#edit-task-save');
      const closeBtn = modal.querySelector('#edit-task-close');
      const deleteBtn = modal.querySelector('#edit-task-delete');
      if (toolInput) {
        toolInput.focus();
        toolInput.select();
      }

      const getPayload = () => {
        const promptText = payloadInput?.value ?? '';
        let payload = promptText;
        if (originalPayload && typeof originalPayload === 'object') {
          payload = { ...originalPayload, prompt: promptText };
        }
        return { payload };
      };

      const result = await new Promise((resolve) => {
        const handleSave = () => resolve(getPayload());
        const handleCancel = () => resolve(null);
        const handleDelete = () => resolve({ delete: true });
        cancelBtn?.addEventListener('click', handleCancel);
        closeBtn?.addEventListener('click', handleCancel);
        saveBtn?.addEventListener('click', handleSave);
        deleteBtn?.addEventListener('click', handleDelete);
      });

      const payload = cleanup(result);
      if (!payload) return;

      if (payload.delete) {
        const friendly = task?.friendlyLabel;
        const label = friendly ? `${task.id} (${friendly})` : task.id;
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
        Utils.showToast('Failed to update task', 'error');
      }
    },

    renderSessionSelector(activeSession, sessions) {
      if (!activeSession || !sessions.length) {
        return '';
      }

      const activeName = activeSession.name || activeSession.id;
      const sessionOptions = sessions
        .map((s) => `<button class="session-option" data-session-id="${s.id}" style="padding: 10px 12px; display: block; width: 100%; text-align: left; background: var(--surface); color: var(--text); border: none; cursor: pointer; font-size: 13px; transition: all 0.15s ease; border-radius: 4px;">${s.name || s.id}</button>`)
        .join('');

      return `
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px; position: relative;">
          <div class="session-dropdown-wrapper" style="position: relative;">
            <button id="session-dropdown-btn" class="button secondary" style="padding: 6px 12px; font-size: 13px; border-radius: 4px; background: var(--surface); color: var(--text); border: 1px solid var(--border); cursor: pointer;" title="Select session">
              ${activeName}
            </button>
            <div id="session-dropdown-menu" class="session-dropdown-menu" style="display: none; position: absolute; top: 100%; left: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; box-shadow: var(--shadow); z-index: 100; min-width: 180px; margin-top: 4px;">
              ${sessionOptions}
            </div>
          </div>
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
      const dropdownBtn = container?.querySelector('#session-dropdown-btn');
      const dropdownMenu = container?.querySelector('#session-dropdown-menu');
      const sessionOptions = container?.querySelectorAll('.session-option');
      const renameBtn = container?.querySelector('#session-rename-btn');
      const deleteBtn = container?.querySelector('#session-delete-btn');

      // Toggle dropdown menu
      if (dropdownBtn && dropdownMenu) {
        dropdownBtn.addEventListener('click', () => {
          dropdownMenu.style.display = dropdownMenu.style.display === 'none' ? 'block' : 'none';
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
          if (!e.target.closest('.session-dropdown-wrapper')) {
            dropdownMenu.style.display = 'none';
          }
        });
      }

      // Handle session option selection
      if (sessionOptions) {
        sessionOptions.forEach((option) => {
          option.addEventListener('click', async (e) => {
            const sessionId = e.target.getAttribute('data-session-id');
            const selectedSession = sessions.find((s) => s.id === sessionId);
            if (selectedSession) {
              if (dropdownBtn) {
                dropdownBtn.textContent = selectedSession.name || selectedSession.id;
              }
              if (dropdownMenu) {
                dropdownMenu.style.display = 'none';
              }
              // Store current session and re-render
              this.currentSessionId = sessionId;
              this.render(container);
            }
          });
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
