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
  let sessionsCache = [];
  let queuesCache = [];
  const tasksCache = {};
  const queueDetailsCache = {};
  let pageContainerRef = null;

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function renderQueuesPage(container) {
    if (!container) {
      return;
    }

    pageContainerRef = container;
    container.classList.add('queues-page');

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

    sessionsCache = sessions;
    queuesCache = queues;

    const sessionsById = {};
    sessions.forEach((session) => {
      sessionsById[session.id] = session.name || session.id;
    });

    const rows = queues
      .map((queue) => `
        <tr>
          <td><a href="#" class="queue-link" data-action="queues-open" data-queue-id="${queue.id}" data-queue-name="${queue.name || queue.id}" data-queue-status="${queue.status || ''}">${queue.id}</a></td>
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
            <button class="button secondary" id="refresh-btn" data-action="queues-refresh" title="Refresh now" style="padding: 6px 12px; font-size: 16px;">⟳</button>
            <button class="button primary" id="create-queue-btn" data-action="queues-create">Create Queue</button>
          </div>
        </div>
        ${table}
      </div>

      <div id="queue-details-container" style="margin-top: 24px;"></div>
    `;

    // If a queue was previously selected, reload it
    if (currentQueueId) {
      loadQueueDetails(container, currentQueueId, currentQueueName);
    }
  }

  async function handleCreateQueue(container, sessions) {
    container = container || pageContainerRef;
    sessions = sessions || sessionsCache;
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
    container = container || pageContainerRef;
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
    container = container || pageContainerRef;
    const confirmed = await Utils.showConfirm('Archive Queue', `Are you sure you want to archive "${queueName}"? This keeps the history but marks it as archived.`);
    if (!confirmed) {
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
    container = container || pageContainerRef;
    const confirmed = await Utils.showConfirm('Delete Queue', `Are you sure you want to permanently delete "${queueName}"? This will remove all history and cannot be undone.`);
    if (!confirmed) {
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
        const confirmed = await Utils.showConfirm('Delete Task', `Are you sure you want to delete task ${label}? This cannot be undone.`);
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
      const safeInstructions = escapeHtml(instructions).replace(/\n/g, '<br>');
      return `
        <div class="instructions-section">
          <div class="instructions-header">
            <h4 class="instructions-title">📋 Queue Instructions</h4>
            ${!isArchived ? `<button class="button-link" type="button" data-action="queues-edit-instructions">Edit</button>` : ''}
          </div>
          <div class="instructions-content">
${safeInstructions}</div>
        </div>
      `;
    } else if (!isArchived) {
      return `
        <div class="instructions-section instructions-empty">
          <button class="button secondary" type="button" data-action="queues-edit-instructions">
            + Add Queue Instructions
          </button>
          <span class="muted instructions-helper">Provide context and guardrails for this queue</span>
        </div>
      `;
    }
    return '';
  }

  function buildModelProfileSection(queueDetails, isArchived) {
    const modelProfile = queueDetails?.model_profile || 'auto';
    const profileLabels = {
      'auto': '🤖 Auto (Automatic model selection)',
      'haiku-only': '⚡ Haiku-Only (Fast, cheap operations)',
      'codex-heavy': '💻 Codex-Heavy (Code generation focus)',
      'sonnet-orchestrated': '🎯 Sonnet-Orchestrated (Reasoning & orchestration)'
    };
    const profileLabel = profileLabels[modelProfile] || modelProfile;

    return `
      <div class="instructions-section" style="margin-top: 16px;">
        <div class="instructions-header">
          <h4 class="instructions-title">AI Model Profile</h4>
          ${!isArchived ? `<button class="button-link" data-action="queues-edit-model-profile">Edit</button>` : ''}
        </div>
        <div class="instructions-content" style="padding: 12px; background: #f8f9fa; border-radius: 4px;">
          ${profileLabel}
        </div>
      </div>
    `;
  }

  async function handleEditModelProfile(container, queueId, queueName, currentProfile) {
    container = container || pageContainerRef;
    const profiles = [
      { value: 'auto', label: '🤖 Auto - Automatic model selection (default)' },
      { value: 'haiku-only', label: '⚡ Haiku-Only - Fast, cheap operations' },
      { value: 'codex-heavy', label: '💻 Codex-Heavy - Code generation focus' },
      { value: 'sonnet-orchestrated', label: '🎯 Sonnet-Orchestrated - Reasoning & orchestration' }
    ];

    const promptMessage = profiles.map(p => `${p.value === currentProfile ? '→ ' : '  '}${p.label}`).join('\n');
    const newProfile = await Utils.showPrompt('Change Model Profile', `Current: ${currentProfile}\n\nEnter new profile:\n${promptMessage}\n\nProfile:`, currentProfile);

    if (!newProfile || !newProfile.trim()) {
      return;
    }

    const validProfiles = ['auto', 'haiku-only', 'codex-heavy', 'sonnet-orchestrated'];
    if (!validProfiles.includes(newProfile.trim())) {
      showToast('Invalid model profile. Must be one of: ' + validProfiles.join(', '), 'error');
      return;
    }

    try {
      await api('PUT', `/api/queues/${queueId}`, { model_profile: newProfile.trim() }, { action: 'update queue model profile' });
      showToast('Model profile updated', 'success');
      loadQueueDetails(container, queueId, queueName);
    } catch (err) {
      console.error('Failed to update model profile:', err);
      showToast('Failed to update model profile', 'error');
    }
  }

  async function handleInstructions(container, queueId, queueName) {
    container = container || pageContainerRef;
    // Prefer QuickAdd if present; fallback to a direct prompt otherwise.
    if (window.quickAdd && typeof window.quickAdd.showInstructions === 'function') {
      try {
        await window.quickAdd.showInstructions();
        return;
      } catch (err) {
        console.error('[Queues] quickAdd.showInstructions failed, falling back:', err);
      }
    }

    try {
      const queueResponse = await api('GET', `/api/queues/${queueId}`, null, { action: 'load queue' });
      const currentInstructions = queueResponse?.queue?.instructions || '';
      const newInstructions = await Utils.showInstructionsDialog(queueName, currentInstructions, { rows: 10 });

      if (newInstructions !== null && newInstructions !== currentInstructions) {
        const trimmed = newInstructions.trim();
        await api(
          'PUT',
          `/api/queues/${queueId}`,
          { instructions: trimmed ? trimmed : '' },
          { action: 'update queue instructions' }
        );
        showToast(trimmed ? 'Queue instructions updated' : 'Queue instructions cleared', 'success');
        loadQueueDetails(container, queueId, queueName);
      }
    } catch (err) {
      console.error('[Queues] Failed to edit instructions:', err);
      showToast('Failed to update instructions', 'error');
    }
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
      if (queueDetails) {
        queueDetailsCache[queueId] = queueDetails;
      }
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
    tasksCache[queueId] = tasks;

    const taskRows = tasks
      .map((task) => {
        const duration = task.duration ? formatDuration(task.duration) : '—';
        const statusLabel = task.status || 'pending';
        const statusPill = renderStatusPill(statusLabel);
        const friendlyTool = getFriendlyToolName(task.tool_name);
        const disabledAttr = isArchived ? 'disabled title="Unavailable on archived queue"' : '';

        return `
          <tr class="task-row-clickable" data-task-id="${task.id}" data-action="queues-task-open" data-queue-id="${queueId}" style="cursor: pointer;">
            <td data-action="queues-task-open" data-task-id="${task.id}" data-queue-id="${queueId}">${task.id}</td>
            <td data-action="queues-task-open" data-task-id="${task.id}" data-queue-id="${queueId}">${friendlyTool || '—'}</td>
            <td data-action="queues-task-open" data-task-id="${task.id}" data-queue-id="${queueId}">${statusPill}</td>
            <td data-action="queues-task-open" data-task-id="${task.id}" data-queue-id="${queueId}">${formatTimestamp(task.created_at)}</td>
            <td data-action="queues-task-open" data-task-id="${task.id}" data-queue-id="${queueId}">${duration}</td>
            <td>
              <div class="task-actions">
                <button class="task-action-btn task-action-btn--rerun" data-action="queues-task-rerun" data-task-id="${task.id}" data-queue-id="${queueId}" title="Rerun task" aria-label="Rerun task" ${disabledAttr}>⟳</button>
                <button class="task-action-btn task-action-btn--edit" data-action="queues-task-edit" data-task-id="${task.id}" data-queue-id="${queueId}" title="Edit task" aria-label="Edit task" ${disabledAttr}>✏️</button>
                <button class="task-action-btn task-action-btn--delete" data-action="queues-task-delete" data-task-id="${task.id}" data-queue-id="${queueId}" title="Delete task" aria-label="Delete task" ${disabledAttr}>✖️</button>
              </div>
            </td>
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
                <th>Actions</th>
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
              <button class="button secondary" data-action="queues-edit-queue" data-queue-id="${queueId}" data-queue-name="${queueName}" title="Edit queue properties">✏️ Edit</button>
              <button class="button secondary" data-action="queues-archive-queue" data-queue-id="${queueId}" data-queue-name="${queueName}" title="Archive this queue">📦 Archive</button>
              <button class="button error" data-action="queues-delete-queue" data-queue-id="${queueId}" data-queue-name="${queueName}" title="Permanently delete this queue">🗑️ Delete</button>
            </div>
          `}
          ${isArchived ? `
            <div style="display:flex; gap:8px;">
              <button class="button secondary" data-action="queues-unarchive-queue" data-queue-id="${queueId}" data-queue-name="${queueName}" title="Unarchive this queue">⬆️ Unarchive</button>
            </div>
          ` : ''}
        </div>
        ${isArchived ? '<div class="muted" style="margin-bottom:16px;">Archived queues are read-only. Task actions and Quick Add are disabled.</div>' : ''}
        ${buildInstructionsSection(queueDetails, isArchived)}
        ${buildModelProfileSection(queueDetails, isArchived)}
        ${isArchived ? '' : '<div id="quick-add-container" style="margin-bottom: 24px;"></div>'}
        ${taskTable}
      </div>
    `;

    // Initialize QuickAdd component
    if (window.QuickAdd && !isArchived) {
      quickAdd = new window.QuickAdd('quick-add-container', queueId, queueName, queueDetails);
      window.quickAdd = quickAdd;
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

  function registerQueuesActions() {
    const register = (window.Actions && window.Actions.registerAction) || Utils.registerAction || window.registerAction;
    if (typeof register !== 'function') {
      console.warn('[Queues] Action registry not available; queues actions not registered.');
      return;
    }

    register('queues-open', (el) => {
      const queueId = el?.dataset?.queueId;
      const queueName = el?.dataset?.queueName;
      const queueStatus = el?.dataset?.queueStatus;
      const container = pageContainerRef;
      if (queueId && container) {
        loadQueueDetails(container, queueId, queueName, queueStatus);
      }
    });

    register('queues-create', () => {
      if (pageContainerRef) {
        handleCreateQueue(pageContainerRef, sessionsCache);
      }
    });

    register('queues-refresh', () => {
      if (pageContainerRef) {
        renderQueuesPage(pageContainerRef);
      }
    });

    register('queues-edit-queue', (el) => {
      const queueId = el?.dataset?.queueId;
      const queueName = el?.dataset?.queueName;
      if (queueId) {
        handleEditQueue(pageContainerRef, queueId, queueName);
      }
    });

    register('queues-archive-queue', (el) => {
      const queueId = el?.dataset?.queueId;
      const queueName = el?.dataset?.queueName;
      if (queueId) {
        handleArchiveQueue(pageContainerRef, queueId, queueName);
      }
    });

    register('queues-delete-queue', (el) => {
      const queueId = el?.dataset?.queueId;
      const queueName = el?.dataset?.queueName;
      if (queueId) {
        handleDeleteQueue(pageContainerRef, queueId, queueName);
      }
    });

    register('queues-unarchive-queue', (el) => {
      const queueId = el?.dataset?.queueId;
      const queueName = el?.dataset?.queueName;
      if (!queueId || !pageContainerRef) return;
      api('PUT', `/api/queues/${queueId}/unarchive`, null, { action: 'unarchive queue' })
        .then(() => {
          showToast(`Queue "${queueName || queueId}" unarchived`, 'success');
          renderQueuesPage(pageContainerRef);
        })
        .catch((err) => {
          console.error('Failed to unarchive queue:', err);
          showToast('Failed to unarchive queue', 'error');
        });
    });

    register('queues-edit-model-profile', () => {
      if (!pageContainerRef || !currentQueueId) return;
      const modelProfile = (queueDetailsCache[currentQueueId]?.model_profile)
        || (queuesCache.find((q) => q.id === currentQueueId) || {}).model_profile
        || 'auto';
      handleEditModelProfile(pageContainerRef, currentQueueId, currentQueueName, modelProfile);
    });

    register('queues-edit-instructions', () => {
      if (!pageContainerRef || !currentQueueId) return;
      handleInstructions(pageContainerRef, currentQueueId, currentQueueName);
    });

    register('queues-task-open', (el) => {
      const queueId = el?.dataset?.queueId || currentQueueId;
      const taskId = el?.dataset?.taskId;
      if (!queueId || !taskId) return;
      const tasks = tasksCache[queueId] || [];
      const task = tasks.find((t) => String(t.id) === String(taskId));
      if (task) {
        showEditTaskDialog(task, queueId, currentQueueName, pageContainerRef);
      }
    });

    register('queues-task-edit', (el) => {
      const queueId = el?.dataset?.queueId || currentQueueId;
      const taskId = el?.dataset?.taskId;
      if (!queueId || !taskId) return;
      const tasks = tasksCache[queueId] || [];
      const task = tasks.find((t) => String(t.id) === String(taskId));
      if (task) {
        showEditTaskDialog(task, queueId, currentQueueName, pageContainerRef);
      }
    });

    register('queues-task-delete', async (el) => {
      const queueId = el?.dataset?.queueId || currentQueueId;
      const taskId = el?.dataset?.taskId;
      if (!queueId || !taskId || !pageContainerRef) return;
      const tasks = tasksCache[queueId] || [];
      const task = tasks.find((t) => String(t.id) === String(taskId));
      const label = task?.friendly_id || task?.id || taskId;
      const confirmed = await Utils.showConfirm('Delete Task', `Delete task ${label}? This cannot be undone.`);
      if (!confirmed) return;
      try {
        await api('DELETE', `/api/tasks/${encodeURIComponent(taskId)}`, null, { action: 'delete task' });
        showToast(`Task ${label} deleted`, 'success');
        loadQueueDetails(pageContainerRef, queueId, currentQueueName);
      } catch (err) {
        console.error('Failed to delete task:', err);
        showToast('Failed to delete task', 'error');
        loadQueueDetails(pageContainerRef, queueId, currentQueueName);
      }
    });

    register('queues-task-rerun', async (el) => {
      const queueId = el?.dataset?.queueId || currentQueueId;
      const taskId = el?.dataset?.taskId;
      if (!queueId || !taskId || !pageContainerRef) return;
      try {
        await api('POST', `/api/tasks/${encodeURIComponent(taskId)}/rerun`, null, { action: 'rerun task' });
        showToast(`Task ${taskId} requeued`, 'success');
        loadQueueDetails(pageContainerRef, queueId, currentQueueName);
      } catch (err) {
        console.error('Failed to rerun task:', err);
        showToast('Failed to rerun task', 'error');
      }
    });
  }

  registerQueuesActions();

})(window.Pages, window.API, window.Utils);
