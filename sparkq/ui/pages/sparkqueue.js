(function(Pages, API, Utils, Components) {
  'use strict';

  const api = API.api;
  const showError = Utils.showError;
  const formatTimestamp = Utils.formatTimestamp || ((value) => value || '—');
  const formatDuration = Utils.formatDuration || ((value) => value || '—');
  const QuickAdd = Components?.QuickAdd || window.QuickAdd;

  const STYLE_ID = 'sparkqueue-page-styles';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #sparkqueue-page .sparkqueue-session-selector,
      #sparkqueue-page .sparkqueue-queue-header,
      #sparkqueue-page .sparkqueue-action-buttons,
      #sparkqueue-page .sparkqueue-queue-summary,
      #sparkqueue-page .sparkqueue-section-body,
      #sparkqueue-page .sparkqueue-tabs-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      #sparkqueue-page .sparkqueue-queue-header {
        justify-content: space-between;
        margin-bottom: 12px;
      }

      #sparkqueue-page .sparkqueue-action-buttons {
        justify-content: flex-end;
      }

      #sparkqueue-page .sparkqueue-task-card {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      #sparkqueue-page .sparkqueue-task-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      #sparkqueue-page .sparkqueue-card-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      }

      #sparkqueue-page .sparkqueue-empty {
        text-align: center;
      }

      #sparkqueue-page .sparkqueue-queue-meta {
        gap: 12px;
      }
    `;

    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    if (value === undefined || value === null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  // === Data layer ===
  async function fetchSessions() {
    const response = await api('GET', '/api/sessions', null, { action: 'load sessions' });
    return response?.sessions || [];
  }

  async function fetchQueues() {
    const response = await api('GET', '/api/queues', null, { action: 'load queues' });
    return response?.queues || [];
  }

  async function fetchTasks(queueId) {
    const response = await api('GET', `/api/tasks?queue_id=${encodeURIComponent(queueId)}`, null, { action: 'load tasks' });
    return response?.tasks || [];
  }

  async function createSession(name) {
    const response = await api('POST', '/api/sessions', { name }, { action: 'create session' });
    return response;
  }

  async function createQueue(sessionId, name) {
    const response = await api('POST', '/api/queues', { session_id: sessionId, name }, { action: 'create queue' });
    return response;
  }

  async function updateQueue(queueId, payload) {
    const response = await api('PUT', `/api/queues/${queueId}`, payload, { action: 'update queue' });
    return response;
  }

  async function archiveQueue(queueId) {
    const response = await api('PUT', `/api/queues/${queueId}/archive`, null, { action: 'archive queue' });
    return response;
  }

  async function deleteQueue(queueId) {
    const response = await api('DELETE', `/api/queues/${queueId}`, null, { action: 'delete queue' });
    return response;
  }

  async function renameSession(sessionId, name) {
    const response = await api('PUT', `/api/sessions/${sessionId}`, { name }, { action: 'rename session' });
    return response;
  }

  async function deleteSession(sessionId) {
    const response = await api('DELETE', `/api/sessions/${sessionId}`, null, { action: 'delete session' });
    return response;
  }

  async function updateTask(taskId, payload) {
    const response = await api('PUT', `/api/tasks/${encodeURIComponent(taskId)}`, payload, { action: 'update task' });
    return response;
  }

  async function deleteTask(taskId) {
    const response = await api('DELETE', `/api/tasks/${encodeURIComponent(taskId)}`, null, { action: 'delete task' });
    return response;
  }

  // === Helpers ===
  function formatProgress(stats) {
    if (!stats) return '0/0';
    if (typeof stats === 'string') return stats;
    const done = toNumber(stats.done ?? stats.completed ?? stats.finished);
    const total = toNumber(stats.total ?? stats.count);
    if (total > 0) {
      return `${done}/${total}`;
    }
    const running = toNumber(stats.running);
    const queued = toNumber(stats.queued ?? stats.pending);
    const denominator = done + running + queued;
    return `${done}/${denominator || 0}`;
  }

  function formatQueueStatus(status) {
    const lower = String(status || '').trim().toLowerCase();
    if (!lower) return 'Unknown';
    const mapping = {
      active: 'Active',
      running: 'Running',
      queued: 'Queued',
      pending: 'Queued',
      planned: 'Planned',
      idle: 'Planned',
      ended: 'Ended',
      failed: 'Failed',
      completed: 'Completed',
      done: 'Completed',
      claimed: 'Active'
    };
    return mapping[lower] || lower.charAt(0).toUpperCase() + lower.slice(1);
  }

  function statusDotClass(status) {
    const lower = String(status || '').toLowerCase();
    return ['active', 'running', 'claimed'].includes(lower) ? 'active' : 'planned';
  }

  function queueBadgeClass(status) {
    const lower = String(status || '').toLowerCase();
    if (['active', 'running', 'claimed'].includes(lower)) {
      return 'badge-active';
    }
    if (['queued', 'pending', 'planned', 'idle'].includes(lower)) {
      return 'badge-queued';
    }
    if (['ended', 'failed', 'completed', 'done', 'error'].includes(lower)) {
      return 'badge-ended';
    }
    return 'badge';
  }

  function taskBadgeClass(status) {
    const lower = String(status || '').toLowerCase();
    if (['running', 'claimed', 'active'].includes(lower)) {
      return 'badge-running';
    }
    if (['queued', 'pending', 'idle'].includes(lower)) {
      return 'badge-queued';
    }
    if (['completed', 'succeeded', 'done'].includes(lower)) {
      return 'badge-active';
    }
    if (['failed', 'error', 'ended'].includes(lower)) {
      return 'badge-ended';
    }
    return 'badge';
  }

  function buildSessionSelectorHtml(activeSession, sessions) {
    if (!sessions || !sessions.length) {
      return `
        <div class="sparkqueue-session-selector">
          <span class="muted">No sessions found.</span>
          <button class="button primary" id="sparkqueue-create-session">Create Session</button>
        </div>
      `;
    }

    const options = sessions
      .map((session) => {
        const selected = session.id === activeSession?.id ? 'selected' : '';
        return `<option value="${escapeHtml(session.id)}" ${selected}>${escapeHtml(session.name || session.id)}</option>`;
      })
      .join('');

    return `
      <div class="sparkqueue-session-selector">
        <select id="sparkqueue-session-select" class="button secondary">
          ${options}
        </select>
        <div class="sparkqueue-action-buttons">
          <button class="button secondary" id="sparkqueue-session-rename">Rename</button>
          <button class="button secondary" id="sparkqueue-session-delete">Delete</button>
        </div>
      </div>
    `;
  }

  function buildQueueTabsHtml(queues, currentId) {
    if (!queues || !queues.length) {
      return `
        <div class="sparkqueue-tabs-row">
          <span class="muted">No queues in this session.</span>
          <button class="new-queue-btn" id="sparkqueue-new-queue">+ New Queue</button>
        </div>
      `;
    }

    const tabs = queues
      .map((queue) => {
        const isActive = queue.id === currentId;
        return `
          <button class="queue-tab ${isActive ? 'active' : ''}" data-queue-id="${escapeHtml(queue.id)}">
            <div class="tab-header">
              <span class="status-dot ${statusDotClass(queue.status)}"></span>
              <span>${escapeHtml(queue.name || queue.id)}</span>
            </div>
            <div class="tab-progress">${formatProgress(queue.stats)}</div>
            <div class="tab-status">${formatQueueStatus(queue.status)}</div>
          </button>
        `;
      })
      .join('');

    return `${tabs}<button class="new-queue-btn" id="sparkqueue-new-queue">+ New Queue</button>`;
  }

  function buildQueueContentHtml(queue) {
    if (!queue) {
      return `
        <div class="card sparkqueue-empty">
          <div class="muted">Select a queue to get started.</div>
        </div>
      `;
    }

    const instructions = queue.instructions ? `<div class="muted">${escapeHtml(queue.instructions)}</div>` : '';

    return `
      <div class="card">
        <div class="sparkqueue-queue-header">
          <div class="sparkqueue-queue-summary">
            <div class="tab-header">
              <span class="status-dot ${statusDotClass(queue.status)}"></span>
              <span>${escapeHtml(queue.name || queue.id)}</span>
            </div>
            <div class="sparkqueue-queue-meta sparkqueue-section-body">
              <span class="badge ${queueBadgeClass(queue.status)}">${formatQueueStatus(queue.status)}</span>
              <span class="tab-progress">${formatProgress(queue.stats)}</span>
            </div>
          </div>
          <div class="sparkqueue-action-buttons">
            <button class="button secondary" id="sparkqueue-edit-queue">Edit</button>
            <button class="button secondary" id="sparkqueue-archive-queue">Archive</button>
            <button class="button secondary" id="sparkqueue-delete-queue">Delete</button>
          </div>
        </div>
        ${instructions}
        <div id="sparkqueue-quick-add"></div>
      </div>
      <div id="sparkqueue-task-section"></div>
    `;
  }

  function buildTaskCardHtml(task) {
    const statusText = formatQueueStatus(task?.status || 'queued');
    const badge = taskBadgeClass(task?.status);
    const created = formatTimestamp(task?.created_at);
    const duration = task?.duration ? formatDuration(task.duration) : '';

    return `
      <div class="card sparkqueue-task-card" data-task-id="${escapeHtml(task?.id)}">
        <div class="sparkqueue-task-card-header">
          <div>Task #${escapeHtml(task?.id)}</div>
          <div class="sparkqueue-action-buttons">
            <span class="badge ${badge}">${escapeHtml(statusText)}</span>
            <button class="button secondary task-edit-btn" data-task-id="${escapeHtml(task?.id)}">Edit</button>
            <button class="button secondary task-delete-btn" data-task-id="${escapeHtml(task?.id)}">Delete</button>
          </div>
        </div>
        <div class="muted">${escapeHtml(task?.tool_name || '—')}</div>
        <div class="muted sparkqueue-section-body">
          <span>Created ${escapeHtml(created)}</span>
          ${duration ? `<span>Duration ${escapeHtml(duration)}</span>` : ''}
        </div>
      </div>
    `;
  }

  function buildTaskGridHtml(tasks) {
    if (!tasks || !tasks.length) {
      return `<div class="muted">No tasks found for this queue.</div>`;
    }

    const cards = tasks.map((task) => buildTaskCardHtml(task)).join('');
    return `<div class="grid sparkqueue-card-grid">${cards}</div>`;
  }

  function buildTaskEditDialogHtml(task) {
    const statuses = ['queued', 'claimed', 'running', 'completed', 'failed'];
    const options = statuses
      .map((status) => {
        const selected = status === task.status ? 'selected' : '';
        return `<option value="${status}" ${selected}>${formatQueueStatus(status)}</option>`;
      })
      .join('');

    return `
      <div class="input-group">
        <label for="sparkqueue-edit-tool">Tool Name</label>
        <input id="sparkqueue-edit-tool" type="text" value="${escapeHtml(task.tool_name || '')}">
      </div>
      <div class="input-group">
        <label for="sparkqueue-edit-timeout">Timeout (seconds)</label>
        <input id="sparkqueue-edit-timeout" type="number" value="${escapeHtml(task.timeout || 3600)}">
      </div>
      <div class="input-group">
        <label for="sparkqueue-edit-status">Status</label>
        <select id="sparkqueue-edit-status">
          ${options}
        </select>
      </div>
    `;
  }

  function resolvePageContainer(container) {
    if (container && container.id === 'sparkqueue-page') {
      return container;
    }
    return document.getElementById('sparkqueue-page');
  }

  function pickActiveSession(sessions, queues, requestedSessionId, requestedQueueId) {
    if (!sessions || !sessions.length) return null;
    const fromRequested = sessions.find((session) => session.id === requestedSessionId);
    if (fromRequested) return fromRequested;

    const queueMatch = queues.find((queue) => queue.id === requestedQueueId);
    if (queueMatch) {
      const sessionMatch = sessions.find((session) => session.id === queueMatch.session_id);
      if (sessionMatch) return sessionMatch;
    }

    return sessions[0];
  }

  function pickActiveQueue(queues, requestedQueueId) {
    if (!queues || !queues.length) return null;
    return queues.find((queue) => queue.id === requestedQueueId) || queues[0];
  }

  const SparkQueue = {
    currentQueueId: null,
    currentSessionId: null,
    queuesCache: [],
    quickAddInstance: null,

    fetchSessions,
    fetchQueues,
    fetchTasks,
    createSession,
    createQueue,
    updateQueue,
    archiveQueue,
    deleteQueue,
    renameSession,
    deleteSession,
    updateTask,
    deleteTask,

    formatProgress,
    formatQueueStatus,
    statusDotClass,
    queueBadgeClass,
    taskBadgeClass,
    buildSessionSelectorHtml,
    buildQueueTabsHtml,
    buildQueueContentHtml,
    buildTaskCardHtml,
    buildTaskGridHtml,

    async render(container) {
      try {
        console.log('[SparkQueue] render() called with container:', container);
        ensureStyles();
        const host = resolvePageContainer(container);
        if (!host) {
          console.warn('[SparkQueue] Page container not found');
          return;
        }
        console.log('[SparkQueue] Container found, showing loading state');

        host.innerHTML = `
          <div class="card">
            <div class="muted"><span class="loading"></span> Loading SparkQueue…</div>
          </div>
        `;

        let sessions = [];
        let queues = [];

        console.log('[SparkQueue] Fetching sessions and queues...');
        const [sessionsResult, queuesResult] = await Promise.allSettled([fetchSessions(), fetchQueues()]);
        console.log('[SparkQueue] API calls completed. Sessions status:', sessionsResult.status, 'Queues status:', queuesResult.status);

        if (sessionsResult.status === 'fulfilled') {
          sessions = sessionsResult.value;
          console.log('[SparkQueue] Sessions loaded:', sessions.length);
        } else {
          console.error('[SparkQueue] Failed to load sessions:', sessionsResult.reason);
          showError(`Failed to load sessions: ${sessionsResult.reason?.message || sessionsResult.reason}`, sessionsResult.reason);
        }

        if (queuesResult.status === 'fulfilled') {
          queues = queuesResult.value;
          console.log('[SparkQueue] Queues loaded:', queues.length);
        } else {
          console.error('[SparkQueue] Failed to load queues:', queuesResult.reason);
          showError(`Failed to load queues: ${queuesResult.reason?.message || queuesResult.reason}`, queuesResult.reason);
        }

        this.queuesCache = queues || [];

        const activeSession = pickActiveSession(sessions, queues, this.currentSessionId, this.currentQueueId);
        this.currentSessionId = activeSession?.id || null;
        console.log('[SparkQueue] Active session:', activeSession?.id);

        const queuesForSession = activeSession ? queues.filter((queue) => queue.session_id === activeSession.id) : queues;
        const activeQueue = pickActiveQueue(queuesForSession, this.currentQueueId);
        this.currentQueueId = activeQueue?.id || null;
        console.log('[SparkQueue] Active queue:', activeQueue?.id);

        console.log('[SparkQueue] Building HTML...');
        const sessionHtml = buildSessionSelectorHtml(activeSession, sessions);
        const queueHtml = buildQueueTabsHtml(queuesForSession, activeQueue?.id);
        console.log('[SparkQueue] Session HTML:', sessionHtml);
        console.log('[SparkQueue] Queue HTML:', queueHtml);

        host.innerHTML = `
          ${sessionHtml}
          ${queueHtml}
          <div id="queue-content"></div>
        `;
        console.log('[SparkQueue] HTML rendered to container');

        this.attachSessionHandlers(host, sessions);
        this.attachQueueTabHandlers(host, queuesForSession);
        console.log('[SparkQueue] Event handlers attached');

        if (activeQueue) {
          await this.renderQueueContent(activeQueue);
        } else {
          this.renderEmptyQueueState();
        }
        console.log('[SparkQueue] render() completed successfully');
      } catch (error) {
        console.error('[SparkQueue] render() error:', error);
        showError('Failed to render SparkQueue', error);
      }
    },

    async reloadAfterQueueOperation() {
      const host = document.getElementById('sparkqueue-page');
      if (!host) return;
      host.innerHTML = '';
      await this.render(host);
    },

    async renderQueueContent(queue) {
      const content = document.getElementById('queue-content');
      if (!content) return;

      content.innerHTML = buildQueueContentHtml(queue);
      this.attachQueueActionHandlers(queue);
      this.renderQuickAdd(queue);
      await this.renderTasks(queue.id);
    },

    renderEmptyQueueState() {
      const content = document.getElementById('queue-content');
      if (!content) return;

      content.innerHTML = `
        <div class="card sparkqueue-empty">
          <div class="muted">No queues available yet.</div>
          <div class="sparkqueue-action-buttons">
            <button class="button primary" id="sparkqueue-create-from-empty">Create Queue</button>
          </div>
        </div>
      `;

      const createBtn = document.getElementById('sparkqueue-create-from-empty');
      if (createBtn) {
        createBtn.addEventListener('click', () => this.onNewQueue());
      }
    },

    attachSessionHandlers(host, sessions) {
      const select = host.querySelector('#sparkqueue-session-select');
      if (select) {
        select.addEventListener('change', (event) => {
          this.onSelectSession(event.target.value);
        });
      }

      const renameBtn = host.querySelector('#sparkqueue-session-rename');
      if (renameBtn) {
        renameBtn.addEventListener('click', () => this.onRenameSession());
      }

      const deleteBtn = host.querySelector('#sparkqueue-session-delete');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => this.onDeleteSession());
      }

      const createBtn = host.querySelector('#sparkqueue-create-session');
      if (createBtn) {
        createBtn.addEventListener('click', () => this.onNewQueue());
      }
    },

    attachQueueTabHandlers(host, queues) {
      const tabs = host.querySelectorAll('.queue-tab');
      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          const queueId = tab.getAttribute('data-queue-id');
          this.onSelectQueue(queueId);
        });
      });

      const newQueueBtn = host.querySelector('#sparkqueue-new-queue');
      if (newQueueBtn) {
        newQueueBtn.addEventListener('click', () => this.onNewQueue());
      }
    },

    attachQueueActionHandlers(queue) {
      const editBtn = document.getElementById('sparkqueue-edit-queue');
      if (editBtn) {
        editBtn.addEventListener('click', () => this.onEditQueue(queue.id));
      }

      const archiveBtn = document.getElementById('sparkqueue-archive-queue');
      if (archiveBtn) {
        archiveBtn.addEventListener('click', () => this.onArchiveQueue(queue.id));
      }

      const deleteBtn = document.getElementById('sparkqueue-delete-queue');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => this.onDeleteQueue(queue.id));
      }
    },

    attachTaskHandlers(tasks, queueId) {
      const taskMap = {};
      tasks.forEach((task) => {
        taskMap[String(task.id)] = task;
      });

      const editButtons = document.querySelectorAll('.task-edit-btn');
      editButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const taskId = btn.getAttribute('data-task-id');
          this.onEditTask(taskId, taskMap[taskId], queueId);
        });
      });

      const deleteButtons = document.querySelectorAll('.task-delete-btn');
      deleteButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const taskId = btn.getAttribute('data-task-id');
          this.onDeleteTask(taskId, queueId);
        });
      });
    },

    renderQuickAdd(queue) {
      const quickAddContainer = document.getElementById('sparkqueue-quick-add');
      if (!quickAddContainer) return;

      if (!queue) {
        quickAddContainer.innerHTML = '<div class="muted">Select a queue to add tasks.</div>';
        return;
      }

      if (!QuickAdd) {
        quickAddContainer.innerHTML = '<div class="muted">QuickAdd component not available.</div>';
        return;
      }

      if (!this.quickAddInstance) {
        this.quickAddInstance = new QuickAdd('sparkqueue-quick-add', queue.id, queue.name || queue.id);
        window.quickAdd = this.quickAddInstance;
      } else {
        this.quickAddInstance.setStream(queue.id, queue.name || queue.id);
      }

      this.quickAddInstance.setRefreshCallback(() => this.onQuickAddRefresh(queue.id));
      this.quickAddInstance.render();
    },

    async renderTasks(queueId) {
      const tasksSection = document.getElementById('sparkqueue-task-section');
      if (!tasksSection) return;

      tasksSection.innerHTML = `
        <div class="card">
          <div class="muted"><span class="loading"></span> Loading tasks…</div>
        </div>
      `;

      let tasks = [];
      try {
        tasks = await fetchTasks(queueId);
      } catch (err) {
        showError(`Failed to load tasks: ${err.message || err}`, err);
        tasksSection.innerHTML = `
          <div class="card">
            <div class="muted">Unable to load tasks for this queue.</div>
          </div>
        `;
        return;
      }

      tasksSection.innerHTML = `
        <div class="card">
          <div class="section-title">Tasks</div>
          ${buildTaskGridHtml(tasks)}
        </div>
      `;

      this.attachTaskHandlers(tasks, queueId);
    },

    async onSelectSession(sessionId) {
      this.currentSessionId = sessionId || null;
      this.currentQueueId = null;
      await this.render(resolvePageContainer());
    },

    async onRenameSession() {
      const host = resolvePageContainer();
      if (!host) return;
      const select = host.querySelector('#sparkqueue-session-select');
      const sessionId = select?.value || this.currentSessionId;
      if (!sessionId) {
        Utils.showToast('No session selected', 'error');
        return;
      }

      const currentName = select?.selectedOptions?.[0]?.textContent?.trim() || '';
      const newName = await Utils.showPrompt('Rename Session', 'Enter a new session name:', currentName);
      if (!newName || !newName.trim()) return;

      try {
        await renameSession(sessionId, newName.trim());
        Utils.showToast('Session renamed', 'success');
        await this.render(host);
      } catch (err) {
        showError(`Failed to rename session: ${err.message || err}`, err);
        Utils.showToast('Could not rename session', 'error');
      }
    },

    async onDeleteSession() {
      const host = resolvePageContainer();
      if (!host) return;
      const sessionId = this.currentSessionId;
      if (!sessionId) {
        Utils.showToast('No session selected', 'error');
        return;
      }

      const confirmed = await Utils.showConfirm('Delete Session', 'This will remove the session and all queues under it. Continue?');
      if (!confirmed) return;

      try {
        await deleteSession(sessionId);
        Utils.showToast('Session deleted', 'success');
        this.currentSessionId = null;
        this.currentQueueId = null;
        await this.render(host);
      } catch (err) {
        showError(`Failed to delete session: ${err.message || err}`, err);
        Utils.showToast('Could not delete session', 'error');
      }
    },

    async onSelectQueue(queueId) {
      this.currentQueueId = queueId;
      const queue = this.queuesCache.find((item) => item.id === queueId);
      if (queue) {
        await this.renderQueueContent(queue);
      } else {
        await this.render(resolvePageContainer());
      }
    },

    async onNewQueue() {
      const host = resolvePageContainer();
      if (!host) return;

      let sessionId = this.currentSessionId;

      try {
        const sessions = await fetchSessions();
        if (!sessions.length) {
          const sessionName = await Utils.showPrompt('Create Session', 'Provide a name for the new session:', 'New Session');
          if (!sessionName || !sessionName.trim()) return;
          const sessionResponse = await createSession(sessionName.trim());
          sessionId = sessionResponse?.id || sessionResponse?.session_id || sessionResponse?.session?.id;
          this.currentSessionId = sessionId;
        } else if (!sessionId) {
          sessionId = sessions[0].id;
          this.currentSessionId = sessionId;
        }
      } catch (err) {
        showError(`Failed to prepare session: ${err.message || err}`, err);
        Utils.showToast('Could not prepare session', 'error');
        return;
      }

      const queueName = await Utils.showPrompt('Create Queue', 'Queue name:', 'New Queue');
      if (!queueName || !queueName.trim()) return;

      try {
        const queueResponse = await createQueue(sessionId, queueName.trim());
        const newQueueId = queueResponse?.id || queueResponse?.queue_id || queueResponse?.queue?.id;
        this.currentQueueId = newQueueId || this.currentQueueId;
        Utils.showToast('Queue created', 'success');
        await this.render(host);
      } catch (err) {
        showError(`Failed to create queue: ${err.message || err}`, err);
        Utils.showToast('Could not create queue', 'error');
      }
    },

    async onEditQueue(queueId) {
      const queue = this.queuesCache.find((item) => item.id === queueId);
      const existingName = queue?.name || queueId;
      const newName = await Utils.showPrompt('Edit Queue', 'Update queue name:', existingName);
      if (!newName || !newName.trim()) return;

      const instructions = await Utils.showPrompt('Queue Instructions', 'Add or update queue instructions (optional):', queue?.instructions || '', { textarea: true });

      const payload = {};
      if (newName.trim() !== existingName) {
        payload.name = newName.trim();
      }
      if (instructions !== null && instructions !== undefined) {
        payload.instructions = instructions;
      }

      if (!Object.keys(payload).length) {
        return;
      }

      try {
        await updateQueue(queueId, payload);
        Utils.showToast('Queue updated', 'success');
        await this.reloadAfterQueueOperation();
      } catch (err) {
        showError(`Failed to update queue: ${err.message || err}`, err);
        Utils.showToast('Could not update queue', 'error');
      }
    },

    async onArchiveQueue(queueId) {
      const confirmed = await Utils.showConfirm('Archive Queue', 'Archive this queue? You can still view history later.');
      if (!confirmed) return;

      try {
        await archiveQueue(queueId);
        Utils.showToast('Queue archived', 'success');
        await this.reloadAfterQueueOperation();
      } catch (err) {
        showError(`Failed to archive queue: ${err.message || err}`, err);
        Utils.showToast('Could not archive queue', 'error');
      }
    },

    async onDeleteQueue(queueId) {
      const confirmed = await Utils.showConfirm('Delete Queue', 'Delete this queue and all tasks? This cannot be undone.');
      if (!confirmed) return;

      try {
        await deleteQueue(queueId);
        Utils.showToast('Queue deleted', 'success');
        this.currentQueueId = null;
        await this.reloadAfterQueueOperation();
      } catch (err) {
        showError(`Failed to delete queue: ${err.message || err}`, err);
        Utils.showToast('Could not delete queue', 'error');
      }
    },

    async onEditTask(taskId, taskData, queueId) {
      const queueToUse = queueId || this.currentQueueId;
      let task = taskData;

      if (!task) {
        try {
          const tasks = await fetchTasks(queueToUse);
          task = tasks.find((item) => String(item.id) === String(taskId));
        } catch (err) {
          showError(`Failed to load task: ${err.message || err}`, err);
        }
      }

      if (!task) {
        Utils.showToast('Task not found', 'error');
        return;
      }

      const dialogHtml = buildTaskEditDialogHtml(task);
      const choice = await Utils.showModal('Edit Task', dialogHtml, ['Cancel', 'Save']);
      if (choice !== 'Save') return;

      const toolNameInput = document.getElementById('sparkqueue-edit-tool');
      const timeoutInput = document.getElementById('sparkqueue-edit-timeout');
      const statusInput = document.getElementById('sparkqueue-edit-status');

      const payload = {
        tool_name: toolNameInput?.value || task.tool_name,
        timeout: parseInt(timeoutInput?.value, 10) || task.timeout || 3600,
        status: statusInput?.value || task.status
      };

      try {
        await updateTask(task.id, payload);
        Utils.showToast('Task updated', 'success');
        await this.renderTasks(queueToUse);
      } catch (err) {
        showError(`Failed to update task: ${err.message || err}`, err);
        Utils.showToast('Could not update task', 'error');
      }
    },

    async onDeleteTask(taskId, queueId) {
      const queueToUse = queueId || this.currentQueueId;
      const confirmed = await Utils.showConfirm('Delete Task', `Delete task ${taskId}? This cannot be undone.`);
      if (!confirmed) return;

      try {
        await deleteTask(taskId);
        Utils.showToast('Task deleted', 'success');
        await this.renderTasks(queueToUse);
      } catch (err) {
        showError(`Failed to delete task: ${err.message || err}`, err);
        Utils.showToast('Could not delete task', 'error');
      }
    },

    async onQuickAddRefresh(queueId) {
      const targetQueueId = queueId || this.currentQueueId;
      await this.renderTasks(targetQueueId);
    }
  };

  Pages.SparkQueue = SparkQueue;
  Pages.Sparkqueue = SparkQueue;
})(window.Pages, window.API, window.Utils, window.Components || {});
