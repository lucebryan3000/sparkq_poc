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

  async function showEditTaskDialog(task, queueId, queueName, container) {
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
    const friendlyLabel = task.friendly_id || `Task #${task.id}`;
    const toolLabel = getFriendlyToolName(task.tool_name) || task.tool_name || '';

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
      payloadInput.focus();
      payloadInput.select();
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
      const friendly = task?.friendly_id || task.id;
      const label = friendly;
      let confirmed = false;
      try {
        confirmed = await Utils.showConfirm('Delete Task', `Are you sure you want to delete task ${label}? This cannot be undone.`);
      } catch (err) {
        confirmed = window.confirm(`Are you sure you want to delete task ${label}? This cannot be undone.`);
      }
      if (!confirmed) return;
      try {
        await api('DELETE', `/api/tasks/${encodeURIComponent(task.id)}`, null, { action: 'delete task' });
        showToast(`Task ${label} deleted`, 'success');
        loadQueueDetails(container, queueId, queueName);
      } catch (err) {
        console.error('Failed to delete task:', err);
        showToast('Failed to delete task', 'error');
      }
      return;
    }

    try {
      await api('PUT', `/api/tasks/${encodeURIComponent(task.id)}`, payload, { action: 'update task' });
      showToast('Task updated successfully', 'success');
      loadQueueDetails(container, queueId, queueName);
    } catch (err) {
      console.error('Failed to update task:', err);
      const msg = err?.detail || err?.message || 'Failed to update task';
      showToast(msg, 'error');
    }
  }

  function buildInstructionsSection(queueDetails, isArchived) {
    const instructions = queueDetails?.instructions;

    if (instructions && instructions.trim()) {
      return `
        <div class="instructions-section">
          <div class="instructions-header">
            <h4 class="instructions-title">📋 Queue Instructions</h4>
            ${!isArchived ? `<button class="button-link" onclick="window.quickAdd?.showInstructions()">Edit</button>` : ''}
          </div>
          <div class="instructions-content">
${instructions}</div>
        </div>
      `;
    } else if (!isArchived) {
      return `
        <div class="instructions-section instructions-empty">
          <button class="button secondary" onclick="window.quickAdd?.showInstructions()">
            + Add Queue Instructions
          </button>
          <span class="muted instructions-helper">Provide context and guardrails for this queue</span>
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
        const statusLabel = task.status || 'pending';
        const statusPill = renderStatusPill(statusLabel);
        const friendlyTool = getFriendlyToolName(task.tool_name);

        return `
          <tr class="task-row-clickable" data-task-id="${task.id}" style="cursor: pointer;">
            <td>${task.id}</td>
            <td>${friendlyTool || '—'}</td>
            <td>${statusPill}</td>
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
      quickAdd = new window.QuickAdd('quick-add-container', queueId, queueName, queueDetails);
      window.quickAdd = quickAdd;
      quickAdd.setRefreshCallback(() => loadQueueDetails(container, queueId, queueName));
      quickAdd.render();
    }

    // Attach click handlers to task rows
    const taskRowElements = detailsContainer.querySelectorAll('.task-row-clickable');
    taskRowElements.forEach((row) => {
      row.addEventListener('click', async () => {
        const taskId = row.getAttribute('data-task-id');
        const task = tasks.find((t) => String(t.id) === String(taskId));
        if (task) {
          await showEditTaskDialog(task, queueId, queueName, container);
        }
      });
    });
  }

  Pages.Queues = {
    async render(container) {
      await renderQueuesPage(container);
    }
  };

  // Alias for sparkqueue tab
  Pages.Sparkqueue = Pages.Queues;

})(window.Pages, window.API, window.Utils);
