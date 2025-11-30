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

  function renderTaskCard(task) {
    const status = String(task?.status || 'queued').toLowerCase();
    const badgeClass = taskBadgeClass(status);
    const timestamp = formatTimestamp(task?.created_at);
    const duration = task?.duration ? formatDuration(task.duration) : '';

    return `
      <div class="task-card" style="background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 12px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
          <div style="font-weight: 600;">Task #${task?.id || '—'}</div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <span class="badge ${badgeClass}">${status}</span>
            <button class="task-edit-btn" data-task-id="${task?.id}" title="Edit task" style="padding: 4px 8px; font-size: 12px;">✏️</button>
            <button class="task-delete-btn" data-task-id="${task?.id}" title="Delete task" style="padding: 4px 8px; font-size: 12px;">🗑️</button>
          </div>
        </div>
        <div class="muted" style="margin-top: 6px;">${task?.tool_name || '—'}</div>
        <div style="display: flex; gap: 12px; color: var(--subtle); font-size: 12px; margin-top: 8px; flex-wrap: wrap;">
          <span>Created ${timestamp}</span>
          ${duration ? `<span>Duration: ${duration}</span>` : ''}
        </div>
      </div>
    `;
  }

  Pages.Dashboard = {
    currentQueueId: null,
    queuesCache: [],
    quickAddInstance: null,

    async render(container) {
      if (!container) {
        return;
      }

      container.innerHTML = `
        <div class="card">
          <div class="muted"><span class="loading"></span> Loading queues…</div>
        </div>
      `;

      let sessions = [];
      let streams = [];
      let activeSession = null;

      try {
        const sessionsResponse = await api('GET', '/api/sessions', null, { action: 'load sessions' });
        sessions = sessionsResponse?.sessions || [];
      } catch (err) {
        console.error('Failed to load sessions:', err);
      }

      try {
        const response = await api('GET', '/api/queues', null, { action: 'load queues' });
        streams = response?.streams || [];
      } catch (err) {
        showError(`Failed to load queues: ${err.message || err}`, err);
      }

      this.queuesCache = streams;

      if (!streams.length) {
        // Get the first session or use a placeholder
        activeSession = sessions.length > 0 ? sessions[0] : null;
        const sessionSelector = this.renderSessionSelector(activeSession, sessions);

        container.innerHTML = `
          <div class="session-tabs-section">
            <div class="section-title">Sessions</div>
            ${sessionSelector}
          </div>

          <div class="queue-tabs-section">
            <div class="section-title">Queues</div>
            <div class="queue-tabs">
              <button class="new-queue-btn" id="dashboard-new-queue-btn">+ New Queue</button>
            </div>
          </div>
          <div class="card">
            <p class="muted">No queues yet. Create one to get started.</p>
          </div>
        `;
        this.attachSessionSelectorHandlers(container, sessions);
        this.attachNewQueueHandler(container);
        return;
      }

      if (!this.currentQueueId || !streams.some((queue) => queue.id === this.currentQueueId)) {
        this.currentQueueId = streams[0].id;
      }

      // Get the session for the first queue
      if (streams.length > 0) {
        activeSession = sessions.find((s) => s.id === streams[0].session_id) || sessions[0];
      }

      const sessionSelector = this.renderSessionSelector(activeSession, sessions);

      container.innerHTML = `
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

      this.attachSessionSelectorHandlers(container, sessions);
      const tabsContainer = container.querySelector('#queue-tabs');
      this.renderQueueTabs(tabsContainer, streams);

      const contentContainer = container.querySelector('#queue-content');
      await this.renderQueueContent(contentContainer, this.currentQueueId);
    },

    renderQueueTabs(container, streams) {
      if (!container) {
        return;
      }

      const tabsHtml = streams
        .map((queue) => {
          const isActive = queue.id === this.currentQueueId;
          const progress = formatProgress(queue.stats);
          const statusLabel = formatQueueStatus(queue.status);
          const dotClass = statusDotClass(queue.status);

          return `
            <div class="queue-tab ${isActive ? 'active' : ''}" data-queue-id="${queue.id}">
              <div class="tab-header">
                <span class="status-dot ${dotClass}"></span>
                <span>${queue.name || queue.id}</span>
              </div>
              <div class="tab-progress">${progress}</div>
              <div class="tab-status">${statusLabel}</div>
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

      this.attachNewQueueHandler(container);
    },

    attachNewQueueHandler(root) {
      const newQueueBtn = root?.querySelector('#dashboard-new-queue-btn');
      if (!newQueueBtn) {
        return;
      }

      newQueueBtn.addEventListener('click', async () => {
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

        const queueName = await Utils.showPrompt('Create Queue', 'Enter queue name:');
        if (!queueName || !queueName.trim()) {
          return;
        }

        // Auto-select if only one session, otherwise prompt
        let sessionId;
        if (sessions.length === 1) {
          sessionId = sessions[0].id;
        } else {
          const sessionOptions = sessions.map((s) => `${s.name || 'Unnamed'}`).join('\n');
          const selectedName = await Utils.showPrompt('Select Session', `${sessionOptions}`, sessions[0].name || 'Unnamed');
          if (!selectedName || !selectedName.trim()) {
            return;
          }
          const selected = sessions.find((s) => (s.name || 'Unnamed') === selectedName.trim());
          sessionId = selected?.id;
        }

        const instructions = await Utils.showPrompt('Queue Instructions', 'Enter queue instructions (optional):', '', { textarea: true });

        try {
          const payload = {
            session_id: sessionId.trim(),
            name: queueName.trim(),
          };
          if (instructions && instructions.trim()) {
            payload.instructions = instructions;
          }
          await api('POST', '/api/queues', payload, { action: 'create queue' });
          Utils.showToast(`Queue "${queueName}" created`, 'success');
          // Re-render the dashboard to show the new queue
          this.render(root);
        } catch (err) {
          console.error('Failed to create queue:', err);
          Utils.showToast('Failed to create queue', 'error');
        }
      });
    },

    async renderQueueContent(container, queueId) {
      if (!container) {
        return;
      }

      const queue = this.queuesCache.find((s) => s.id === queueId) || {};
      const queueName = queue.name || queue.id || 'Queue';
      const progress = formatProgress(queue.stats);
      const statusLabel = formatQueueStatus(queue.status);
      const badgeClass = queueBadgeClass(queue.status);

      container.innerHTML = `
        <div class="card">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px;">
            <div>
              <h2 style="margin: 0;">${queueName}</h2>
              <div class="muted" style="font-size: 13px;">${progress} • ${statusLabel}</div>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <span class="badge ${badgeClass}">${statusLabel}</span>
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

      const taskCards = tasks.length
        ? tasks.map((task) => renderTaskCard(task)).join('')
        : '<p class="muted">No tasks found for this queue.</p>';

      container.innerHTML = `
        <div class="card">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <h3 style="margin: 0;">Tasks</h3>
            <span class="muted" style="font-size: 13px;">${tasks.length} total</span>
          </div>
          <div class="grid" style="gap: 12px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));">
            ${taskCards}
          </div>
        </div>
      `;

      this.attachTaskActionHandlers(container, tasks, queueId);
    },

    async attachTaskActionHandlers(container, tasks, queueId) {
      // Attach edit button handlers
      container.querySelectorAll('.task-edit-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const taskId = btn.dataset.taskId;
          const task = tasks.find(t => t.id === taskId);
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
          const confirmed = await Utils.showConfirm('Delete Task', `Are you sure you want to delete task ${taskId}? This cannot be undone.`);
          if (!confirmed) return;

          try {
            await api('DELETE', `/api/tasks/${encodeURIComponent(taskId)}`, null, { action: 'delete task' });
            Utils.showToast(`Task ${taskId} deleted`, 'success');
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
      const html = `
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Tool Name</label>
            <input type="text" id="edit-tool-name" value="${task.tool_name || ''}" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text);">
          </div>
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Timeout (seconds)</label>
            <input type="number" id="edit-timeout" value="${task.timeout || 3600}" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text);">
          </div>
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Status</label>
            <select id="edit-status" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text);">
              <option value="queued" ${task.status === 'queued' ? 'selected' : ''}>Queued</option>
              <option value="claimed" ${task.status === 'claimed' ? 'selected' : ''}>Claimed</option>
              <option value="completed" ${task.status === 'completed' ? 'selected' : ''}>Completed</option>
              <option value="failed" ${task.status === 'failed' ? 'selected' : ''}>Failed</option>
            </select>
          </div>
        </div>
      `;

      const result = await Utils.showDialog('Edit Task', html, ['Cancel', 'Save']);
      if (result !== 'Save') return;

      const toolName = document.getElementById('edit-tool-name').value;
      const timeout = parseInt(document.getElementById('edit-timeout').value) || 3600;
      const status = document.getElementById('edit-status').value;

      try {
        await api('PUT', `/api/tasks/${encodeURIComponent(task.id)}`, {
          tool_name: toolName,
          timeout: timeout,
          status: status
        }, { action: 'update task' });
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

      const sessionOptions = sessions
        .map((s) => `<option value="${s.id}" ${s.id === activeSession.id ? 'selected' : ''}>${s.name || s.id}</option>`)
        .join('');

      return `
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
          <select id="session-selector" style="padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface); color: var(--text); font-size: 13px;">
            ${sessionOptions}
          </select>
          <button id="session-rename-btn" class="button secondary" style="padding: 4px 8px; font-size: 12px;" title="Rename session">✏️</button>
          <button id="session-delete-btn" class="button secondary" style="padding: 4px 8px; font-size: 12px;" title="Delete session">🗑️</button>
        </div>
      `;
    },

    attachQueueActionHandlers(container, queueId, queue) {
      const archiveBtn = container?.querySelector('#dashboard-archive-btn');
      const deleteBtn = container?.querySelector('#dashboard-delete-btn');

      if (archiveBtn) {
        archiveBtn.addEventListener('click', async () => {
          const queueName = queue.name || queue.id || 'Queue';
          const confirmed = await Utils.showConfirm('Archive Queue', `Archive "${queueName}"?`);
          if (!confirmed) return;

          try {
            await api('PUT', `/api/queues/${queueId}`, { archived: true }, { action: 'archive queue' });
            Utils.showToast(`Queue "${queueName}" archived`, 'success');
            this.render(container);
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
            this.render(container);
          } catch (err) {
            console.error('Failed to delete queue:', err);
            Utils.showToast('Failed to delete queue', 'error');
          }
        });
      }
    },

    attachSessionSelectorHandlers(container, sessions) {
      const selector = container?.querySelector('#session-selector');
      const renameBtn = container?.querySelector('#session-rename-btn');
      const deleteBtn = container?.querySelector('#session-delete-btn');

      if (selector) {
        selector.addEventListener('change', async () => {
          // Re-render dashboard with the selected session's queues
          this.render(container);
        });
      }

      if (renameBtn) {
        renameBtn.addEventListener('click', async () => {
          const selector = container.querySelector('#session-selector');
          if (!selector) return;

          const sessionId = selector.value;
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
          const selector = container.querySelector('#session-selector');
          if (!selector) return;

          const sessionId = selector.value;
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
