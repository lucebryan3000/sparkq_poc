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
  let currentQueueStatus = null;
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
          <td><a href="#" class="queue-link" data-queue-id="${queue.id}" data-queue-name="${queue.name || queue.id}" data-queue-status="${queue.status || ''}">${queue.id}</a></td>
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
        const queueStatus = link.getAttribute('data-queue-status');
        loadQueueDetails(container, queueId, queueName, queueStatus);
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

    // Prompt user for queue name
    const timestamp = new Date().toISOString().substring(0, 10).replace(/-/g, '');
    const defaultName = `Queue ${timestamp}`;
    const queueName = await Utils.showPrompt('Create New Queue', 'Queue name:', defaultName);

    if (!queueName || !queueName.trim()) {
      return;
    }

    // Auto-select session or use first available
    const sessionId = sessions[0].id;

    try {
      const payload = {
        session_id: sessionId,
        name: queueName.trim(),
      };
      await api('POST', '/api/queues', payload, { action: 'create queue' });
      showToast(`Queue "${queueName.trim()}" created`, 'success');
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

    try {
      const payload = {};
      if (newName.trim() !== queueName) {
        payload.name = newName.trim();
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

  function buildInstructionsSection(queueDetails, isArchived) {
    const instructions = queueDetails?.instructions;

    if (instructions && instructions.trim()) {
      return `
        <div class="instructions-section" style="margin-bottom: 20px; padding: 16px; background: rgba(59, 130, 246, 0.1); border-left: 3px solid #3b82f6; border-radius: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h4 style="margin: 0; font-size: 14px; font-weight: 600;">📋 Queue Instructions</h4>
            ${!isArchived ? `<button class="button-link" onclick="window.quickAdd?.showInstructions()" style="font-size: 12px; color: #3b82f6; background: none; border: none; cursor: pointer; text-decoration: underline;">Edit</button>` : ''}
          </div>
          <div class="instructions-content" style="white-space: pre-wrap; font-size: 13px; color: rgba(255,255,255,0.9); line-height: 1.5; font-family: ui-monospace, monospace;">
${instructions}</div>
        </div>
      `;
    } else if (!isArchived) {
      return `
        <div class="instructions-section" style="margin-bottom: 20px; padding: 12px; background: rgba(255, 255, 255, 0.05); border-radius: 6px; text-align: center;">
          <button class="button secondary" onclick="window.quickAdd?.showInstructions()" style="font-size: 13px; padding: 8px 12px;">
            + Add Queue Instructions
          </button>
          <span class="muted" style="margin-left: 8px; font-size: 12px;">Provide context and guardrails for this queue</span>
        </div>
      `;
    }
    return '';
  }

  async function loadQueueDetails(container, queueId, queueName, queueStatus) {
    currentQueueId = queueId;
    currentQueueName = queueName;
    currentQueueStatus = queueStatus || currentQueueStatus;
    const isArchived = String(currentQueueStatus || '').toLowerCase() === 'archived';

    const detailsContainer = container.querySelector('#queue-details-container');
    if (!detailsContainer) return;

    detailsContainer.innerHTML = `
      <div class="card">
        <div class="muted"><span class="loading"></span> Loading queue details…</div>
      </div>
    `;

    let tasks = [];
    let queueDetails = null;

    try {
      const queueResponse = await api('GET', `/api/queues/${queueId}`, null, { action: 'load queue' });
      queueDetails = queueResponse?.queue;
    } catch (err) {
      console.error('Failed to load queue details:', err);
    }

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
          <h3 style="margin: 0;">Queue: ${queueName}${isArchived ? ' (Archived)' : ''}</h3>
          ${isArchived ? '<div class="muted" style="font-size:12px;">Read-only (archived)</div>' : `
            <div style="display: flex; gap: 8px;">
              <button class="button secondary" id="edit-btn" title="Edit queue properties">✏️ Edit</button>
              <button class="button secondary" id="archive-btn" title="Archive this queue">📦 Archive</button>
              <button class="button error" id="delete-btn" title="Permanently delete this queue">🗑️ Delete</button>
            </div>
          `}
          ${isArchived ? `
            <div style="display:flex; gap:8px;">
              <button class="button secondary" id="unarchive-btn" title="Unarchive this queue">⬆️ Unarchive</button>
            </div>
          ` : ''}
        </div>
        ${isArchived ? '<div class="muted" style="margin-bottom:16px;">Archived queues are read-only. Task actions and Quick Add are disabled.</div>' : ''}
        ${buildInstructionsSection(queueDetails, isArchived)}
        ${isArchived ? '' : '<div id="quick-add-container" style="margin-bottom: 24px;"></div>'}
        ${taskTable}
      </div>
    `;

    // Attach action buttons
    const editBtn = detailsContainer.querySelector('#edit-btn');
    if (editBtn && !isArchived) {
      editBtn.addEventListener('click', () => handleEditQueue(container, queueId, queueName));
    }

    const archiveBtn = detailsContainer.querySelector('#archive-btn');
    if (archiveBtn && !isArchived) {
      archiveBtn.addEventListener('click', () => handleArchiveQueue(container, queueId, queueName));
    }

    const unarchiveBtn = detailsContainer.querySelector('#unarchive-btn');
    if (unarchiveBtn && isArchived) {
      unarchiveBtn.addEventListener('click', async () => {
        try {
          await api('PUT', `/api/queues/${queueId}/unarchive`, null, { action: 'unarchive queue' });
          showToast(`Queue "${queueName}" unarchived`, 'success');
          renderQueuesPage(container);
        } catch (err) {
          console.error('Failed to unarchive queue:', err);
          showToast('Failed to unarchive queue', 'error');
        }
      });
    }

    const deleteBtn = detailsContainer.querySelector('#delete-btn');
    if (deleteBtn && !isArchived) {
      deleteBtn.addEventListener('click', () => handleDeleteQueue(container, queueId, queueName));
    }

    // Initialize QuickAdd component
    if (window.QuickAdd && !isArchived) {
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

  // Alias for sparkqueue tab
  Pages.Sparkqueue = Pages.Queues;

})(window.Pages, window.API, window.Utils);
