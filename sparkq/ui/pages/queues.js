(function(Pages, API, Utils) {
  'use strict';

  const api = API.api;
  const formatTimestamp = Utils.formatTimestamp;
  const formatDuration = Utils.formatDuration;
  const showToast = Utils.showToast;
  const loadFriendlyToolNames = Utils.loadFriendlyToolNames;
  const prettifyToolName = Utils.prettifyToolName || ((name) => (name ? String(name) : '—'));
  const getFriendlyToolName = Utils.getFriendlyToolName || ((name) => prettifyToolName(name));

  let currentQueueId = null;
  let currentQueueName = null;
  let quickAdd = null;

  async function renderQueuesPage(container) {
    if (!container) {
      return;
    }

    container.innerHTML = `
      <div class="card">
        <div class="muted"><span class="loading"></span> Loading queues…</div>
      </div>
    `;

    let sessions = [];
    let queues = [];

    try {
      const sessionsResponse = await api('GET', '/api/sessions', null, { action: 'load sessions' });
      sessions = sessionsResponse?.sessions || [];
    } catch (err) {
      console.error('Failed to load sessions:', err);
      showToast('Failed to load sessions', 'error');
    }

    try {
      const queuesResponse = await api('GET', '/api/queues', null, { action: 'load queues' });
      queues = queuesResponse?.queues || [];
    } catch (err) {
      console.error('Failed to load queues:', err);
      showToast('Failed to load queues', 'error');
    }

    const sessionsById = {};
    sessions.forEach((session) => {
      sessionsById[session.id] = session.name || session.id;
    });

    const rows = queues
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

    const table = queues.length
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
    const queueLinks = container.querySelectorAll('.queue-link');
    queueLinks.forEach((link) => {
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

    // Auto-select session or use first available
    const sessionId = sessions[0].id;

    // Generate a simple queue name with timestamp
    const timestamp = new Date().toISOString().substring(0, 10).replace(/-/g, '');
    const queueName = `Queue ${timestamp}`;

    try {
      const payload = {
        session_id: sessionId,
        name: queueName,
      };
      await api('POST', '/api/queues', payload, { action: 'create queue' });
      showToast(`Queue created`, 'success');
      renderQueuesPage(container);
    } catch (err) {
      console.error('Failed to create queue:', err);
      showToast('Failed to create queue', 'error');
    }
  }

  async function handleEditQueue(container, queueId, queueName) {
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
        showToast('Queue updated', 'success');
        loadQueueDetails(container, queueId, newName.trim());
      }
    } catch (err) {
      console.error('Failed to update queue:', err);
      showToast('Failed to update queue', 'error');
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
      renderQueuesPage(container);
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
      renderQueuesPage(container);
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
    if (loadFriendlyToolNames) {
      try {
        await loadFriendlyToolNames();
      } catch (err) {
        console.error('Failed to load tools for friendly names:', err);
      }
    }

    const taskRows = tasks
      .map((task) => {
        const duration = task.duration ? formatDuration(task.duration) : '—';
        const status = task.status || 'pending';
        const statusClass = status === 'completed' ? 'success' : status === 'failed' ? 'error' : 'muted';
        const friendlyTool = getFriendlyToolName(task.tool_name);

        return `
          <tr>
            <td>${task.id}</td>
            <td>${friendlyTool || '—'}</td>
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
            <button class="button secondary" id="edit-btn" title="Edit queue properties">✏️ Edit</button>
            <button class="button secondary" id="archive-btn" title="Archive this queue">📦 Archive</button>
            <button class="button error" id="delete-btn" title="Permanently delete this queue">🗑️ Delete</button>
          </div>
        </div>
        <div id="quick-add-container" style="margin-bottom: 24px;"></div>
        ${taskTable}
      </div>
    `;

    // Attach action buttons
    const editBtn = detailsContainer.querySelector('#edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => handleEditQueue(container, queueId, queueName));
    }

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
      await renderQueuesPage(container);
    }
  };

})(window.Pages, window.API, window.Utils);
