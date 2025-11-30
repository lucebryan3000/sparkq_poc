(function(Pages, API, Utils) {
  'use strict';

  const api = API.api;
  const formatTimestamp = Utils.formatTimestamp;
  const formatDuration = Utils.formatDuration;
  const showToast = Utils.showToast;

  let currentQueueId = null;
  let currentQueueName = null;
  let quickAdd = null;

  async function renderStreamsPage(container) {
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

    try {
      const sessionsResponse = await api('GET', '/api/sessions', null, { action: 'load sessions' });
      sessions = sessionsResponse?.sessions || [];
    } catch (err) {
      console.error('Failed to load sessions:', err);
      showToast('Failed to load sessions', 'error');
    }

    try {
      const streamsResponse = await api('GET', '/api/queues', null, { action: 'load queues' });
      streams = streamsResponse?.streams || [];
    } catch (err) {
      console.error('Failed to load queues:', err);
      showToast('Failed to load queues', 'error');
    }

    const sessionsById = {};
    sessions.forEach((session) => {
      sessionsById[session.id] = session.name || session.id;
    });

    const rows = streams
      .map((queue) => `
        <tr>
          <td><a href="#" class="queue-link" data-queue-id="${queue.id}" data-queue-name="${queue.name || queue.id}">${queue.id}</a></td>
          <td>${queue.name || '—'}</td>
          <td>${sessionsById[queue.session_id] || queue.session_id || '—'}</td>
          <td>${queue.status || '—'}</td>
          <td>${formatTimestamp(queue.created_at)}</td>
        </tr>
      `)
      .join('');

    const table = streams.length
      ? `
          <table class="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Session</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        `
      : `<p class="muted">No queues found.</p>`;

    container.innerHTML = `
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2>Queues</h2>
          <div style="display: flex; gap: 8px; align-items: center;">
            <span id="refresh-counter" class="muted" style="font-size: 12px;">—</span>
            <button class="button secondary" id="refresh-btn" title="Refresh now" style="padding: 6px 12px; font-size: 16px;">⟳</button>
            <button class="button primary" id="create-queue-btn">Create Queue</button>
          </div>
        </div>
        ${table}
      </div>

      <div id="queue-details-container" style="margin-top: 24px;"></div>
    `;

    // Attach queue link handlers
    const streamLinks = container.querySelectorAll('.queue-link');
    streamLinks.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const queueId = link.getAttribute('data-queue-id');
        const queueName = link.getAttribute('data-queue-name');
        loadQueueDetails(container, queueId, queueName);
      });
    });

    const createBtn = container.querySelector('#create-queue-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => handleCreateQueue(container, sessions));
    }

    const refreshBtn = container.querySelector('#refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        if (autoRefresh) {
          autoRefresh.refresh();
        }
      });
    }

    // If a queue was previously selected, reload it
    if (currentQueueId) {
      loadQueueDetails(container, currentQueueId, currentQueueName);
    }
  }

  async function handleCreateQueue(container, sessions) {
    if (!sessions.length) {
      showToast('No sessions available. Create a session first.', 'warning');
      return;
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
      showToast(`Queue "${queueName}" created`, 'success');
      renderStreamsPage(container);
    } catch (err) {
      console.error('Failed to create queue:', err);
      showToast('Failed to create queue', 'error');
    }
  }

  async function handleArchiveQueue(container, queueId, queueName) {
    const confirmed = await Utils.showPrompt('Archive Queue', `Are you sure you want to archive "${queueName}"? This keeps the history but marks it as archived.`, 'no');
    if (confirmed !== 'yes') {
      return;
    }

    try {
      await api('PUT', `/api/queues/${queueId}/archive`, null, { action: 'archive queue' });
      showToast(`Queue "${queueName}" archived`, 'success');
      renderStreamsPage(container);
    } catch (err) {
      console.error('Failed to archive queue:', err);
      showToast('Failed to archive queue', 'error');
    }
  }

  async function handleDeleteQueue(container, queueId, queueName) {
    const confirmed = await Utils.showPrompt('Delete Queue', `Are you sure you want to permanently delete "${queueName}"? This will remove all history and cannot be undone.`, 'no');
    if (confirmed !== 'yes') {
      return;
    }

    try {
      await api('DELETE', `/api/queues/${queueId}`, null, { action: 'delete queue' });
      showToast(`Queue "${queueName}" deleted`, 'success');
      renderStreamsPage(container);
    } catch (err) {
      console.error('Failed to delete queue:', err);
      showToast('Failed to delete queue', 'error');
    }
  }

  async function loadQueueDetails(container, queueId, queueName) {
    currentQueueId = queueId;
    currentQueueName = queueName;

    const detailsContainer = container.querySelector('#queue-details-container');
    if (!detailsContainer) return;

    detailsContainer.innerHTML = `
      <div class="card">
        <div class="muted"><span class="loading"></span> Loading tasks from queue…</div>
      </div>
    `;

    let tasks = [];

    try {
      const tasksResponse = await api('GET', `/api/queues/${queueId}/tasks`, null, { action: 'load tasks' });
      tasks = tasksResponse?.tasks || [];
    } catch (err) {
      console.error('Failed to load tasks:', err);
      showToast('Failed to load tasks', 'error');
    }

    const taskRows = tasks
      .map((task) => {
        const duration = task.duration ? formatDuration(task.duration) : '—';
        const status = task.status || 'pending';
        const statusClass = status === 'completed' ? 'success' : status === 'failed' ? 'error' : 'muted';

        return `
          <tr>
            <td>${task.id}</td>
            <td>${task.tool_name || '—'}</td>
            <td><span class="${statusClass}">${status}</span></td>
            <td>${formatTimestamp(task.created_at)}</td>
            <td>${duration}</td>
          </tr>
        `;
      })
      .join('');

    const taskTable = tasks.length
      ? `
          <table class="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Tool</th>
                <th>Status</th>
                <th>Created</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              ${taskRows}
            </tbody>
          </table>
        `
      : `<p class="muted">No tasks found for this queue.</p>`;

    detailsContainer.innerHTML = `
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 style="margin: 0;">Queue: ${queueName}</h3>
          <div style="display: flex; gap: 8px;">
            <button class="button secondary" id="archive-btn" title="Archive this queue">📦 Archive</button>
            <button class="button error" id="delete-btn" title="Permanently delete this queue">🗑️ Delete</button>
          </div>
        </div>
        <div id="quick-add-container" style="margin-bottom: 24px;"></div>
        ${taskTable}
      </div>
    `;

    // Attach action buttons
    const archiveBtn = detailsContainer.querySelector('#archive-btn');
    if (archiveBtn) {
      archiveBtn.addEventListener('click', () => handleArchiveQueue(container, queueId, queueName));
    }

    const deleteBtn = detailsContainer.querySelector('#delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => handleDeleteQueue(container, queueId, queueName));
    }

    // Initialize QuickAdd component
    if (window.QuickAdd) {
      quickAdd = new window.QuickAdd('quick-add-container', queueId, queueName);
      quickAdd.setRefreshCallback(() => loadQueueDetails(container, queueId, queueName));
      quickAdd.render();
    }
  }

  Pages.Queues = {
    async render(container) {
      await renderStreamsPage(container);
    }
  };

})(window.Pages, window.API, window.Utils);
