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

  const taskFilters = {
    streamId: '',
    status: '',
  };

  const taskPaginationState = {
    offset: 0,
    limit: 50,
    total: 0,
  };

  async function renderTasksPage(container) {
    if (!container) {
      return;
    }

    container.innerHTML = `
      <div class="card">
        <div class="muted"><span class="loading"></span> Loading tasks…</div>
      </div>
    `;

    let streams = [];
    try {
      const response = await api('GET', '/api/streams', null, { action: 'load streams' });
      streams = response?.streams || [];
    } catch (err) {
      handleApiError('load streams for filters', err);
    }

    let tasks = [];
    try {
      const query = [];
      if (taskFilters.streamId) {
        query.push(`stream_id=${encodeURIComponent(taskFilters.streamId)}`);
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

    const streamsById = {};
    streams.forEach((stream) => {
      streamsById[stream.id] = stream.name || stream.id;
    });

    const streamOptions = streams
      .map(
        (stream) =>
          `<option value="${stream.id}" ${stream.id === taskFilters.streamId ? 'selected' : ''}>${stream.name || stream.id}</option>`,
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
        const streamName = streamsById[task.stream_id] || task.stream_id;
        const rowClass = timeStatus.isStale ? 'task-stale-error' : timeStatus.isWarned ? 'task-stale-warning' : '';
        const staleBadge = timeStatus.isStale
          ? `<span class="timeout-badge timeout-badge-error">⚠️ TIMEOUT</span>`
          : timeStatus.isWarned
            ? `<span class="timeout-badge timeout-badge-warning">⚠️ WARNING</span>`
            : '';

        return `
          <tr class="task-row ${rowClass}" data-task-id="${task.id}">
            <td style="width: 30px;"><input type="checkbox" class="task-checkbox" data-task-id="${task.id}" /></td>
            <td>${task.id}</td>
            <td>${streamName}</td>
            <td>${task.tool_name}</td>
            <td>${task.status} ${staleBadge}</td>
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
            <label for="task-stream-filter">Queue</label>
            <select id="task-stream-filter">
              <option value="">All queues</option>
              ${streamOptions}
            </select>
          </div>
          <div class="input-group">
            <label for="task-status-filter">Status</label>
            <select id="task-status-filter">
              ${statusOptions}
            </select>
          </div>
        </div>
        ${table}
        ${paginationInfo}
        ${loadMoreBtnHtml}
      </div>
    `;

    const streamSelect = container.querySelector('#task-stream-filter');
    const statusSelect = container.querySelector('#task-status-filter');

    if (streamSelect) {
      streamSelect.value = taskFilters.streamId;
      streamSelect.addEventListener('change', () => {
        taskFilters.streamId = streamSelect.value;
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
      row.addEventListener('click', () => {
        const checkbox = row.querySelector('.task-checkbox');
        if (checkbox && !checkbox.disabled) {
          checkbox.checked = !checkbox.checked;
          if (checkbox.checked) {
            selectedTasks.add(checkbox.dataset.taskId);
          } else {
            selectedTasks.delete(checkbox.dataset.taskId);
          }
          updateBulkActionsUI();
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

    const content = `
      <div class="modal-content">
        <div class="modal-header" style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
          <h3 style="margin: 0;">Task ${task.id}</h3>
          <button class="button secondary" data-action="close">Close</button>
        </div>
        <p class="muted">Status: ${task.status}</p>
        <div class="grid grid-2">
          <div><strong>Queue</strong><div>${formatValue(task.stream_id, '—')}</div></div>
          <div><strong>Tool</strong><div>${formatValue(task.tool_name, '—')}</div></div>
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
          ${task.status === 'failed' || task.status === 'succeeded' ? '<button class="button" data-action="requeue">Requeue</button>' : ''}
        </div>
      </div>
    `;

    modal.innerHTML = content;
    modal.querySelector('[data-action="close"]')?.addEventListener('click', () => closeModal(modal));

    attachTaskActionHandlers(modal, task);
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

  Pages.Tasks = {
    async render(container) {
      await renderTasksPage(container);
    },
    renderDetail: renderTaskDetailModal
  };

})(window.Pages, window.API, window.Utils);
