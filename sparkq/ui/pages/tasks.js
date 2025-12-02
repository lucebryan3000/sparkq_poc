(function(Pages, API, Utils) {
  'use strict';

  const api = API.api;
  const formatValue = Utils.formatValue;
  const formatTimestamp = Utils.formatTimestamp;
  const getTaskTimeStatus = Utils.getTaskTimeStatus;
  const getTaskTimeout = Utils.getTaskTimeout;
  const buildTimeoutStatus = Utils.buildTimeoutStatus;
  const handleApiError = Utils.handleApiError;
  const showError = Utils.showError;
  const showSuccess = Utils.showSuccess;
  const withButtonLoading = Utils.withButtonLoading;
  const loadFriendlyToolNames = Utils.loadFriendlyToolNames;
  const prettifyToolName = Utils.prettifyToolName || ((name) => (name ? String(name) : '—'));
  const getFriendlyToolName = Utils.getFriendlyToolName || ((name) => prettifyToolName(name));

  const taskFilters = {
    queueId: '',
    status: '',
  };

  const taskPaginationState = {
    offset: 0,
    limit: 50,
    total: 0,
  };

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

  async function showEditTaskDialog(task, onUpdate) {
    if (!task) return;

    const overlay = document.createElement('div');
    overlay.className = 'modal modal-overlay';
    overlay.style.opacity = '0';

    const modal = document.createElement('div');
    modal.className = 'modal-content';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.style.transform = 'scale(0.95)';
    modal.tabIndex = -1;

    // Parse payload prompt text for editing convenience
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
          }
        } catch (_) {
          payloadText = trimmed;
        }
      } else {
        payloadText = trimmed;
      }
    } else if (task.payload && typeof task.payload.prompt === 'string') {
      payloadText = task.payload.prompt;
    }

    const friendlyLabel = task.friendly_id || task.id;
    const toolLabel = getFriendlyToolName(task.tool_name) || task.tool_name || '';

    const header = document.createElement('div');
    header.className = 'modal-header';
    const title = document.createElement('h3');
    title.className = 'modal-title';
    title.textContent = `Edit ${friendlyLabel}`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close-button';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close dialog');
    closeBtn.innerHTML = '&times;';
    header.append(title, closeBtn);

    const body = document.createElement('div');
    body.className = 'modal-body';
    body.innerHTML = `
      <div style="margin-bottom:8px;">${renderStatusPill(task.status)}</div>
    `;

    const toolGroup = document.createElement('div');
    toolGroup.className = 'form-group';
    toolGroup.innerHTML = `
      <label>Tool</label>
      <input type="text" class="form-control" value="${toolLabel}" disabled />
    `;
    body.appendChild(toolGroup);

    const agentRoleGroup = document.createElement('div');
    agentRoleGroup.className = 'form-group';
    const agentRoleInput = document.createElement('input');
    agentRoleInput.type = 'text';
    agentRoleInput.className = 'form-control';
    agentRoleInput.value = task.agent_role_key || '';
    agentRoleGroup.innerHTML = `<label>Agent Role</label>`;
    agentRoleGroup.appendChild(agentRoleInput);
    body.appendChild(agentRoleGroup);

    const timeoutGroup = document.createElement('div');
    timeoutGroup.className = 'form-group';
    const timeoutInput = document.createElement('input');
    timeoutInput.type = 'number';
    timeoutInput.min = '1';
    timeoutInput.step = '1';
    timeoutInput.className = 'form-control';
    timeoutInput.value = Number(task.timeout) || '';
    timeoutGroup.innerHTML = `<label>Timeout (seconds)</label>`;
    timeoutGroup.appendChild(timeoutInput);
    body.appendChild(timeoutGroup);

    const payloadGroup = document.createElement('div');
    payloadGroup.className = 'form-group';
    const payloadLabelEl = document.createElement('label');
    payloadLabelEl.textContent = 'Prompt / Payload';
    const payloadInput = document.createElement('textarea');
    payloadInput.className = 'form-control';
    payloadInput.style.minHeight = '140px';
    payloadInput.value = payloadText;
    payloadGroup.append(payloadLabelEl, payloadInput);
    body.appendChild(payloadGroup);

    const finishedAt = formatTimestamp(task.finished_at || task.completed_at);
    const updatedAt = formatTimestamp(task.updated_at);
    const resultText = task.result ? JSON.stringify(task.result, null, 2) : '';
    const errorText = task.error || '';
    const detailGroup = document.createElement('div');
    detailGroup.className = 'card';
    detailGroup.style.marginTop = '8px';
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
    deleteBtn.className = 'button danger';
    deleteBtn.textContent = '🗑️ Delete';
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'button secondary';
    cancelBtn.textContent = 'Cancel';
    const saveBtn = document.createElement('button');
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
    });

    const getUpdatePayload = () => {
      const updates = {};
      const promptText = payloadInput?.value ?? '';
      let payload = promptText;
      if (originalPayload && typeof originalPayload === 'object') {
        payload = { ...originalPayload, prompt: promptText };
      }
      if (payload && typeof payload === 'object') {
        try {
          updates.payload = JSON.stringify(payload);
        } catch (err) {
          showError('Invalid payload JSON');
          return null;
        }
      } else {
        updates.payload = payload;
      }

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

    const close = () => {
      overlay.classList.remove('visible');
      modal.style.transform = 'scale(0.95)';
      setTimeout(() => overlay.remove(), 200);
    };

    const handleDelete = async () => {
      let confirmed = false;
      try {
        confirmed = await Utils.showConfirm('Delete Task', `Delete task ${friendlyLabel}? This cannot be undone.`);
      } catch (_) {
        confirmed = window.confirm(`Delete task ${friendlyLabel}? This cannot be undone.`);
      }
      if (!confirmed) return;
      try {
        await api('DELETE', `/api/tasks/${encodeURIComponent(task.id)}`, null, { action: 'delete task' });
        showSuccess(`Task ${friendlyLabel} deleted`);
        close();
        if (onUpdate) onUpdate();
      } catch (err) {
        handleApiError('delete task', err);
      }
    };

    const handleSave = async () => {
      const updates = getUpdatePayload();
      if (!updates) return;
      try {
        await api('PUT', `/api/tasks/${encodeURIComponent(task.id)}`, updates, { action: 'update task' });
        showSuccess('Task updated');
        close();
        if (onUpdate) onUpdate();
      } catch (err) {
        handleApiError('update task', err);
      }
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        close();
      }
    });
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDelete();
    });
    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleSave();
    });

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
      if (e.key === 'Enter' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        handleSave();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    overlay.addEventListener('transitionend', () => {
      document.removeEventListener('keydown', onKeyDown);
    });
  }

  async function renderTasksPage(container) {
    if (!container) {
      return;
    }

    container.innerHTML = `
      <div class="card">
        <div class="muted"><span class="loading"></span> Loading tasks…</div>
      </div>
    `;

    let queues = [];
    try {
      const response = await api('GET', '/api/queues', null, { action: 'load queues' });
      queues = response?.queues || [];
    } catch (err) {
      handleApiError('load queues for filters', err);
    }

    let tasks = [];
    try {
      const query = [];
      if (taskFilters.queueId) {
        query.push(`queue_id=${encodeURIComponent(taskFilters.queueId)}`);
      }
      if (taskFilters.status) {
        query.push(`status=${encodeURIComponent(taskFilters.status)}`);
      }
      query.push(`offset=${taskPaginationState.offset}`);
      query.push(`limit=${taskPaginationState.limit}`);
      const path = `/api/tasks${query.length ? `?${query.join('&')}` : ''}`;
      const response = await api('GET', path, null, { action: 'load tasks' });
      tasks = response?.tasks || [];
      taskPaginationState.total = response?.total || tasks.length;
    } catch (err) {
      container.innerHTML = `
        <div class="card">
          <div class="muted">Unable to load tasks.</div>
        </div>
      `;
      handleApiError('load tasks', err);
      return;
    }

    if (loadFriendlyToolNames) {
      try {
        await loadFriendlyToolNames();
      } catch (err) {
        console.error('Failed to load tools for friendly names:', err);
      }
    }

    const queuesById = {};
    const archivedQueues = new Set();
    queues.forEach((queue) => {
      queuesById[queue.id] = queue.name || queue.id;
      if (String(queue.status || '').toLowerCase() === 'archived') {
        archivedQueues.add(queue.id);
      }
    });

    const queueOptions = queues
      .map(
        (queue) =>
          `<option value="${queue.id}" ${queue.id === taskFilters.queueId ? 'selected' : ''}>${queue.name || queue.id}</option>`,
      )
      .join('');

    const statusOptions = [
      { value: '', label: 'All statuses' },
      { value: 'queued', label: 'Queued' },
      { value: 'running', label: 'Running' },
      { value: 'succeeded', label: 'Succeeded' },
      { value: 'failed', label: 'Failed' },
    ]
      .map(
        (option) =>
          `<option value="${option.value}" ${option.value === taskFilters.status ? 'selected' : ''}>${option.label}</option>`,
      )
      .join('');

    const rows = tasks
      .map((task) => {
        const timeStatus = getTaskTimeStatus(task);
        const queueName = queuesById[task.queue_id] || task.queue_id;
        const isArchivedQueue = archivedQueues.has(task.queue_id);
        const queueLabel = isArchivedQueue ? `${queueName} (Archived)` : queueName;
        const rowClass = timeStatus.isStale ? 'task-stale-error' : timeStatus.isWarned ? 'task-stale-warning' : '';
        const agentRole = task.agent_role_label || task.agent_role_key || '—';
        const statusLabel = task.status || 'queued';
        const statusPill = renderStatusPill(statusLabel);

        // Enhanced badge with tooltips and auto-failed detection
        const staleBadge = (() => {
          // Check for auto-failed tasks
          const isAutoFailed = task.status === 'failed' &&
                               task.error_message &&
                               task.error_message.includes('Auto-failed');

          if (isAutoFailed) {
            const timeout = getTaskTimeout(task);
            return `<span class="timeout-badge timeout-badge-auto-failed"
                          title="Task was automatically failed after exceeding 2× timeout (${timeout * 2}s). Original timeout: ${timeout}s.">
                      💀 AUTO-FAILED
                    </span>`;
          }

          if (timeStatus.isStale) {
            const elapsed = Math.round(timeStatus.elapsed);
            const timeout = getTaskTimeout(task);
            const overBy = elapsed - timeout;
            return `<span class="timeout-badge timeout-badge-error"
                          title="Task exceeded timeout by ${overBy}s (${elapsed}s elapsed, ${timeout}s timeout). Will be auto-failed at 2× timeout.">
                      🔴 TIMEOUT
                    </span>`;
          }

          if (timeStatus.isWarned) {
            const remaining = Math.round(timeStatus.remaining);
            const elapsed = Math.round(timeStatus.elapsed);
            return `<span class="timeout-badge timeout-badge-warning"
                          title="Task approaching timeout. ${remaining}s remaining (${elapsed}s elapsed).">
                      ⚠️ WARNING
                    </span>`;
          }

          return '';
        })();

        const statusNormalized = (task.status || '').toLowerCase();
        const disableModify = statusNormalized === 'queued' || statusNormalized === 'running';
        const disabledAttr = disableModify ? 'disabled title="Unavailable while running/queued"' : '';
        const deleteDisabledAttr = isArchivedQueue ? 'disabled title="Actions disabled for archived queue"' : '';
        const actionsCell = isArchivedQueue
          ? '<span class="muted" style="font-size:12px;">Read only</span>'
          : `<div class="task-actions">
              <button class="task-action-btn task-action-btn--rerun" data-task-id="${task.id}" title="Rerun task" aria-label="Rerun task" ${disabledAttr}>⟳</button>
              <button class="task-action-btn task-action-btn--edit" data-task-id="${task.id}" title="Edit task" aria-label="Edit task" ${disabledAttr}>✏️</button>
              <button class="task-action-btn task-action-btn--delete" data-task-id="${task.id}" title="Delete task" aria-label="Delete task" ${deleteDisabledAttr}>✖️</button>
            </div>`;

        return `
          <tr class="task-row ${rowClass}" data-task-id="${task.id}" data-archived="${isArchivedQueue ? '1' : '0'}">
            <td style="width: 30px;"><input type="checkbox" class="task-checkbox" data-task-id="${task.id}" ${isArchivedQueue ? 'disabled' : ''} /></td>
            <td>${task.id}</td>
            <td>${queueLabel}</td>
            <td>${getFriendlyToolName(task.tool_name)}</td>
            <td>${agentRole}</td>
            <td>${statusPill}${staleBadge ? ` ${staleBadge}` : ''}</td>
            <td>${formatTimestamp(task.created_at)}</td>
            <td>${actionsCell}</td>
          </tr>
        `;
      })
      .join('');

    const table = tasks.length
      ? `
          <table class="table">
            <thead>
              <tr>
                <th style="width: 30px;"><input type="checkbox" id="select-all-tasks" title="Select all tasks" /></th>
                <th>ID</th>
                <th>Queue</th>
                <th>Tool</th>
                <th>Agent Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        `
      : `<p class="muted">No tasks found.</p>`;

    const showingEnd = taskPaginationState.offset + tasks.length;
    const paginationInfo = tasks.length > 0 ? `<p class="muted" style="margin-top: 12px; font-size: 13px;">Found ${taskPaginationState.total} tasks (showing ${taskPaginationState.offset + 1}-${showingEnd})</p>` : '';
    const hasMore = showingEnd < taskPaginationState.total;
    const loadMoreBtnHtml = hasMore ? `<button class="button" id="load-more-tasks-btn" style="margin-top: 12px;">Load More</button>` : '';

    container.innerHTML = `
      <div class="card">
        <div class="grid grid-2">
          <div class="input-group">
            <label for="task-queue-filter">Queue</label>
            <select id="task-queue-filter" class="form-control form-select">
              <option value="">All queues</option>
              ${queueOptions}
            </select>
          </div>
          <div class="input-group">
            <label for="task-status-filter">Status</label>
            <select id="task-status-filter" class="form-control form-select">
              ${statusOptions}
            </select>
          </div>
        </div>
        ${table}
        ${paginationInfo}
        ${loadMoreBtnHtml}
      </div>
    `;

    const queueSelect = container.querySelector('#task-queue-filter');
    const statusSelect = container.querySelector('#task-status-filter');

    if (queueSelect) {
      queueSelect.value = taskFilters.queueId;
      queueSelect.addEventListener('change', () => {
        taskFilters.queueId = queueSelect.value;
        renderTasksPage(container);
      });
    }

    if (statusSelect) {
      statusSelect.value = taskFilters.status;
      statusSelect.addEventListener('change', () => {
        taskFilters.status = statusSelect.value;
        taskPaginationState.offset = 0;
        renderTasksPage(container);
      });
    }

    const loadMoreBtn = container.querySelector('#load-more-tasks-btn');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', () => {
        taskPaginationState.offset += taskPaginationState.limit;
        renderTasksPage(container);
      });
    }

    const selectedTasks = new Set();

    const selectAllCheckbox = container.querySelector('#select-all-tasks');
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', (e) => {
        document.querySelectorAll('.task-checkbox').forEach((cb) => {
          cb.checked = e.target.checked;
          if (e.target.checked) {
            selectedTasks.add(cb.dataset.taskId);
          } else {
            selectedTasks.delete(cb.dataset.taskId);
          }
        });
        updateBulkActionsUI();
      });
    }

    document.querySelectorAll('.task-checkbox').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) {
          selectedTasks.add(cb.dataset.taskId);
        } else {
          selectedTasks.delete(cb.dataset.taskId);
        }
        updateBulkActionsUI();
      });

      cb.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });

    const taskRows = container.querySelectorAll('.task-row');
    taskRows.forEach((row) => {
      const isArchived = row.dataset.archived === '1';
      const taskId = row.dataset.taskId;
      const task = tasks.find((t) => String(t.id) === String(taskId));
      if (isArchived) {
        row.classList.add('muted');
      }
      row.addEventListener('click', async (e) => {
        if (e.target.closest('button') || e.target.closest('input')) return;
        if (!task || isArchived) return;
        await showEditTaskDialog(task, () => renderTasksPage(container));
      });
    });

    container.querySelectorAll('.task-action-btn--edit').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (btn.disabled) return;
        const taskId = btn.dataset.taskId;
        const task = tasks.find((t) => String(t.id) === String(taskId));
        if (!task) return;
        await showEditTaskDialog(task, () => renderTasksPage(container));
      });
    });

    container.querySelectorAll('.task-action-btn--delete').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (btn.disabled) return;
        const taskId = btn.dataset.taskId;
        const task = tasks.find((t) => String(t.id) === String(taskId));
        const label = task?.friendly_id || task?.id || taskId;
        let confirmed = false;
        try {
          confirmed = await Utils.showConfirm('Delete Task', `Delete task ${label}? This cannot be undone.`);
        } catch (_) {
          confirmed = window.confirm(`Delete task ${label}? This cannot be undone.`);
        }
        if (!confirmed) return;
        const row = btn.closest('.task-row');
        if (row) {
          row.remove();
        }
        try {
          await api('DELETE', `/api/tasks/${encodeURIComponent(taskId)}`, null, { action: 'delete task' });
          showSuccess(`Task ${label} deleted`);
          renderTasksPage(container);
        } catch (err) {
          handleApiError('delete task', err);
          renderTasksPage(container);
        }
      });
    });

    container.querySelectorAll('.task-action-btn--rerun').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (btn.disabled) return;
        const taskId = btn.dataset.taskId;
        const row = btn.closest('.task-row');
        if (row) {
          const statusCell = row.querySelector('.status-pill');
          if (statusCell) {
            statusCell.textContent = 'queued';
            statusCell.className = 'status-pill status-pill--queued';
          }
        }
        try {
          await api('POST', `/api/tasks/${encodeURIComponent(taskId)}/rerun`, null, { action: 'rerun task' });
          showSuccess(`Task ${taskId} requeued`);
          renderTasksPage(container);
        } catch (err) {
          handleApiError('rerun task', err);
        }
      });
    });

    function updateBulkActionsUI() {
      let bulkActionsDiv = container.querySelector('.bulk-actions');
      if (selectedTasks.size > 0) {
        if (!bulkActionsDiv) {
          bulkActionsDiv = document.createElement('div');
          bulkActionsDiv.className = 'bulk-actions';
          bulkActionsDiv.style.cssText = 'display: flex; gap: 10px; margin-bottom: 12px; align-items: center;';
          container.querySelector('.card').insertBefore(bulkActionsDiv, container.querySelector('.card').firstChild.nextSibling?.nextSibling);
        }
        bulkActionsDiv.innerHTML = `
          <span class="muted">${selectedTasks.size} selected</span>
          <button class="button" id="bulk-fail-btn" type="button">Fail Selected</button>
          <button class="button" id="bulk-requeue-btn" type="button">Requeue Selected</button>
          <button class="button" id="bulk-rerun-btn" type="button">Rerun Selected</button>
          <button class="button danger" id="bulk-delete-btn" type="button">Delete Selected</button>
        `;
        bulkActionsDiv.style.display = 'flex';

        document.getElementById('bulk-fail-btn')?.addEventListener('click', () => bulkFail());
        document.getElementById('bulk-requeue-btn')?.addEventListener('click', () => bulkRequeue());
        document.getElementById('bulk-rerun-btn')?.addEventListener('click', () => bulkRerun());
        document.getElementById('bulk-delete-btn')?.addEventListener('click', () => bulkDelete());
      } else if (bulkActionsDiv) {
        bulkActionsDiv.style.display = 'none';
      }
    }

    async function bulkFail() {
      const confirmed = confirm(`Fail ${selectedTasks.size} selected task(s)?`);
      if (!confirmed) return;

      try {
        let failed = 0;
        for (const taskId of selectedTasks) {
          try {
            await api('POST', `/api/tasks/${taskId}/fail`, { reason: 'Bulk fail via UI' }, { action: 'fail task' });
            failed++;
          } catch (err) {
            console.error(`Failed to fail task ${taskId}:`, err);
          }
        }
        showSuccess(`Failed ${failed}/${selectedTasks.size} task(s)`);
        selectedTasks.clear();
        renderTasksPage(container);
      } catch (err) {
        handleApiError('bulk fail tasks', err);
      }
    }

    async function bulkRequeue() {
      const confirmed = confirm(`Requeue ${selectedTasks.size} selected task(s)?`);
      if (!confirmed) return;

      try {
        let requeued = 0;
        for (const taskId of selectedTasks) {
          try {
            await api('POST', `/api/tasks/${taskId}/requeue`, {}, { action: 'requeue task' });
            requeued++;
          } catch (err) {
            console.error(`Failed to requeue task ${taskId}:`, err);
          }
        }
        showSuccess(`Requeued ${requeued}/${selectedTasks.size} task(s)`);
        selectedTasks.clear();
        renderTasksPage(container);
      } catch (err) {
        handleApiError('bulk requeue tasks', err);
      }
    }

    async function bulkRerun() {
      const confirmed = confirm(`Rerun ${selectedTasks.size} selected task(s)?`);
      if (!confirmed) return;

      try {
        let rerunCount = 0;
        for (const taskId of selectedTasks) {
          try {
            await api('POST', `/api/tasks/${taskId}/rerun`, {}, { action: 'rerun task' });
            rerunCount++;
          } catch (err) {
            console.error(`Failed to rerun task ${taskId}:`, err);
          }
        }
        showSuccess(`Reran ${rerunCount}/${selectedTasks.size} task(s)`);
        selectedTasks.clear();
        renderTasksPage(container);
      } catch (err) {
        handleApiError('bulk rerun tasks', err);
      }
    }

    async function bulkDelete() {
      const confirmed = confirm(`Delete ${selectedTasks.size} selected task(s)? This cannot be undone.`);
      if (!confirmed) return;

      try {
        let deleted = 0;
        for (const taskId of selectedTasks) {
          try {
            await api('DELETE', `/api/tasks/${taskId}`, null, { action: 'delete task' });
            deleted++;
          } catch (err) {
            console.error(`Failed to delete task ${taskId}:`, err);
          }
        }
        showSuccess(`Deleted ${deleted}/${selectedTasks.size} task(s)`);
        selectedTasks.clear();
        renderTasksPage(container);
      } catch (err) {
        handleApiError('bulk delete tasks', err);
      }
    }

    updateBulkActionsUI();
  }

  async function renderTaskDetailModal(taskId) {
    const existing = document.getElementById('task-detail-modal');
    if (existing) {
      existing.remove();
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'task-detail-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="muted"><span class="loading"></span> Loading task…</div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeModal(modal);
      }
    });

    let task;
    try {
      const response = await api('GET', `/api/tasks/${taskId}`, null, { action: 'load task details' });
      task = response?.task;
    } catch (err) {
      handleApiError('load task details', err);
      closeModal(modal);
      return;
    }

    const timeStatus = getTaskTimeStatus(task);
    const timeoutSeconds = getTaskTimeout(task);
    const elapsedSeconds = Math.round(timeStatus.elapsed);
    const remainingSeconds = Math.round(timeStatus.remaining);
    const timeoutStatus = buildTimeoutStatus(timeStatus);
    const claimedLabel = task.claimed_at ? `${task.claimed_at} (ISO8601)` : '—';
    if (loadFriendlyToolNames) {
      try {
        await loadFriendlyToolNames();
      } catch (err) {
        console.error('Failed to load tools for friendly names:', err);
      }
    }
    const friendlyTool = getFriendlyToolName(task.tool_name);

    const content = `
      <div class="modal-content">
        <div class="modal-header" style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
          <h3 style="margin: 0;">Task ${task.id}</h3>
          <button class="button secondary" data-action="close">Close</button>
        </div>
        <p class="muted">Status: ${task.status}</p>
        <div class="grid grid-2">
          <div><strong>Queue</strong><div>${formatValue(task.queue_id, '—')}</div></div>
          <div><strong>Tool</strong><div>${formatValue(friendlyTool, '—')}</div></div>
          <div><strong>Created</strong><div>${formatTimestamp(task.created_at)}</div></div>
          <div><strong>Claimed</strong><div>${formatTimestamp(task.claimed_at)}</div></div>
          <div><strong>Completed</strong><div>${formatTimestamp(task.completed_at)}</div></div>
          <div><strong>Failed</strong><div>${formatTimestamp(task.failed_at)}</div></div>
          <div><strong>Timeout</strong><div>${timeoutSeconds} seconds</div></div>
          <div><strong>Stale Warned</strong><div>${formatTimestamp(task.stale_warned_at)}</div></div>
        </div>

        <div class="timeout-info-section">
          <h4>Timeout Information</h4>
          <p><strong>Claimed At:</strong> ${claimedLabel}</p>
          <p><strong>Timeout:</strong> ${timeoutSeconds} seconds</p>
          <p><strong>Elapsed:</strong> ${elapsedSeconds} seconds</p>
          <p><strong>Remaining:</strong> ${remainingSeconds} seconds</p>
          <p><strong>Status:</strong> ${timeoutStatus.badge}</p>
          ${timeoutStatus.warning ? `<p class="muted">${timeoutStatus.warning}</p>` : ''}
        </div>

        ${task.result_summary ? `<div class="form-group"><label>Result</label><div>${task.result_summary}</div></div>` : ''}
        ${task.error_message ? `<div class="form-group"><label>Error</label><div>${task.error_message}</div></div>` : ''}

        <div class="modal-actions" style="display: flex; gap: 10px; justify-content: flex-end;">
          ${task.status === 'queued' ? '<button class="button primary" data-action="claim">Claim</button>' : ''}
          ${task.status === 'running' ? '<button class="button primary" data-action="complete">Complete</button><button class="button" data-action="fail">Fail</button>' : ''}
          ${task.status === 'failed' ? '<button class="button" data-action="retry">Retry</button>' : ''}
          ${task.status === 'failed' || task.status === 'succeeded' ? '<button class="button" data-action="requeue">Requeue</button>' : ''}
        </div>
      </div>
    `;

    modal.innerHTML = content;
    modal.querySelector('[data-action="close"]')?.addEventListener('click', () => closeModal(modal));

    attachTaskActionHandlers(modal, task);

    // Add prompt preview / outcome info into modal footer
    const payloadPreview = (() => {
      const payload = task.payload;
      if (!payload) return '';
      if (typeof payload === 'string') {
        try {
          const parsed = JSON.parse(payload);
          return parsed.prompt || parsed.prompt_text || parsed.prompt_path || payload;
        } catch (_) {
          return payload;
        }
      }
      if (payload && typeof payload === 'object') {
        return payload.prompt || payload.prompt_text || payload.prompt_path || JSON.stringify(payload);
      }
      return '';
    })();

    if (payloadPreview) {
      const footer = document.createElement('div');
      footer.style.cssText = 'margin-top:12px;padding:10px;border:1px solid #333;border-radius:8px;background:rgba(255,255,255,0.03);';
      footer.innerHTML = `
        <div style="font-size:12px;color:#888;margin-bottom:6px;">Prompt / Payload</div>
        <textarea style="width:100%;min-height:80px;border:1px solid #333;border-radius:6px;background:rgba(255,255,255,0.04);color:#ddd;resize:vertical;" disabled>${payloadPreview}</textarea>
        ${task.result_summary ? `<div style="margin-top:10px;font-size:12px;color:#888;">Outcome</div><textarea style="width:100%;min-height:60px;border:1px solid #333;border-radius:6px;background:rgba(255,255,255,0.04);color:#ddd;resize:vertical;" disabled>${task.result_summary}</textarea>` : ''}
        ${task.error_message ? `<div style="margin-top:10px;font-size:12px;color:#c26;">Failure Reason</div><textarea style="width:100%;min-height:60px;border:1px solid #433;border-radius:6px;background:rgba(255,0,0,0.05);color:#fbb;resize:vertical;" disabled>${task.error_message}</textarea>` : ''}
      `;
      modal.querySelector('.modal-content')?.appendChild(footer);
    }
  }

  function closeModal(modal) {
    if (modal && modal.parentNode) {
      modal.remove();
    }
  }

  function attachTaskActionHandlers(modal, task) {
    const claimBtn = modal.querySelector('[data-action="claim"]');
    if (claimBtn) {
      claimBtn.addEventListener('click', () => handleClaimTask(task.id, modal, claimBtn));
    }

    const retryBtn = modal.querySelector('[data-action="retry"]');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => handleRetryTask(task.id, modal, retryBtn));
    }

    const completeBtn = modal.querySelector('[data-action="complete"]');
    if (completeBtn) {
      completeBtn.addEventListener('click', () => handleCompleteTask(task.id, modal, completeBtn));
    }

    const failBtn = modal.querySelector('[data-action="fail"]');
    if (failBtn) {
      failBtn.addEventListener('click', () => handleFailTask(task.id, modal, failBtn));
    }

    const requeueBtn = modal.querySelector('[data-action="requeue"]');
    if (requeueBtn) {
      requeueBtn.addEventListener('click', () => handleRequeueTask(task.id, modal, requeueBtn));
    }
  }

  async function handleClaimTask(taskId, modal, button) {
    try {
      await withButtonLoading(button, async () => api('POST', `/api/tasks/${taskId}/claim`, {}, { action: 'claim task' }));
      showSuccess(`Task ${taskId} claimed`);
      closeModal(modal);
      renderTaskDetailModal(taskId);
    } catch (err) {
      handleApiError('claim task', err);
    }
  }

  async function handleCompleteTask(taskId, modal, button) {
    const resultSummary = prompt('Enter result summary for this task:');
    if (!resultSummary) {
      showError('Result summary is required to complete the task.');
      return;
    }
    const resultData = prompt('Result data (optional):', resultSummary) || resultSummary;

    try {
      await withButtonLoading(button, async () =>
        api(
          'POST',
          `/api/tasks/${taskId}/complete`,
          {
            result_summary: resultSummary,
            result_data: resultData,
          },
          { action: 'complete task' },
        ),
      );
      showSuccess(`Task ${taskId} completed`);
      closeModal(modal);
      renderTaskDetailModal(taskId);
    } catch (err) {
      handleApiError('complete task', err);
    }
  }

  async function handleFailTask(taskId, modal, button) {
    const errorMessage = prompt('Enter error message for this task:');
    if (!errorMessage) {
      showError('Error message is required to fail the task.');
      return;
    }
    const errorType = prompt('Error type (optional):') || undefined;

    try {
      await withButtonLoading(button, async () =>
        api(
          'POST',
          `/api/tasks/${taskId}/fail`,
          {
            error_message: errorMessage,
            error_type: errorType,
          },
          { action: 'fail task' },
        ),
      );
      showSuccess(`Task ${taskId} failed`);
      closeModal(modal);
      renderTaskDetailModal(taskId);
    } catch (err) {
      handleApiError('fail task', err);
    }
  }

  async function handleRequeueTask(taskId, modal, button) {
    const shouldRequeue = confirm('Requeue this task?');
    if (!shouldRequeue) {
      return;
    }

    try {
      const response = await withButtonLoading(button, async () =>
        api('POST', `/api/tasks/${taskId}/requeue`, {}, { action: 'requeue task' }),
      );
      const newTaskId = response?.task?.id;
      const suffix = newTaskId ? ` as ${newTaskId}` : '';
      showSuccess(`Task ${taskId} requeued${suffix}`);
      closeModal(modal);
      if (newTaskId) {
        renderTaskDetailModal(newTaskId);
      }
    } catch (err) {
      handleApiError('requeue task', err);
    }
  }

  async function handleRetryTask(taskId, modal, button) {
    try {
      const response = await withButtonLoading(button, async () =>
        api('POST', `/api/tasks/${taskId}/retry`, {}, { action: 'retry task' }),
      );
      const newTaskId = response?.task?.id;
      const suffix = newTaskId ? ` as ${newTaskId}` : '';
      showSuccess(`Task ${taskId} retried${suffix}`);
      closeModal(modal);
      renderTasksPage(document.getElementById('tasks-page'));
    } catch (err) {
      handleApiError('retry task', err);
    }
  }

  Pages.Tasks = {
    async render(container) {
      await renderTasksPage(container);
    },
    renderDetail: renderTaskDetailModal
  };

})(window.Pages, window.API, window.Utils);
