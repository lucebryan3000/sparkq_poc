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

        return `
          <tr class="task-row ${rowClass}" data-task-id="${task.id}" data-archived="${isArchivedQueue ? '1' : '0'}">
            <td style="width: 30px;"><input type="checkbox" class="task-checkbox" data-task-id="${task.id}" ${isArchivedQueue ? 'disabled' : ''} /></td>
            <td>${task.id}</td>
            <td>${queueLabel}</td>
            <td>${getFriendlyToolName(task.tool_name)}</td>
            <td>${agentRole}</td>
            <td>${statusPill}${staleBadge ? ` ${staleBadge}` : ''}</td>
            <td>${formatTimestamp(task.created_at)}</td>
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
      row.addEventListener('click', () => {
        const checkbox = row.querySelector('.task-checkbox');
        if (!checkbox || checkbox.disabled || isArchived) {
          return;
        }
        checkbox.checked = !checkbox.checked;
        if (checkbox.checked) {
          selectedTasks.add(checkbox.dataset.taskId);
        } else {
          selectedTasks.delete(checkbox.dataset.taskId);
        }
        updateBulkActionsUI();
      });
      if (isArchived) {
        row.classList.add('muted');
      }
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
        `;
        bulkActionsDiv.style.display = 'flex';

        document.getElementById('bulk-fail-btn')?.addEventListener('click', () => bulkFail());
        document.getElementById('bulk-requeue-btn')?.addEventListener('click', () => bulkRequeue());
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
