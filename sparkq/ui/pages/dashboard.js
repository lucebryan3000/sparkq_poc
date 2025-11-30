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

  function formatStreamStatus(status) {
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

  function streamBadgeClass(status) {
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
          <span class="badge ${badgeClass}">${status}</span>
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
    currentStreamId: null,
    streamsCache: [],
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
        const response = await api('GET', '/api/streams', null, { action: 'load queues' });
        streams = response?.streams || [];
      } catch (err) {
        showError(`Failed to load queues: ${err.message || err}`, err);
      }

      this.streamsCache = streams;

      if (!streams.length) {
        // Get the first session or use a placeholder
        activeSession = sessions.length > 0 ? sessions[0] : null;
        const sessionSelector = this.renderSessionSelector(activeSession, sessions);

        container.innerHTML = `
          <div class="queue-tabs-section">
            <div class="section-title">Queues</div>
            ${sessionSelector}
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

      if (!this.currentStreamId || !streams.some((stream) => stream.id === this.currentStreamId)) {
        this.currentStreamId = streams[0].id;
      }

      // Get the session for the first stream
      if (streams.length > 0) {
        activeSession = sessions.find((s) => s.id === streams[0].session_id) || sessions[0];
      }

      const sessionSelector = this.renderSessionSelector(activeSession, sessions);

      container.innerHTML = `
        <div class="queue-tabs-section">
          <div class="section-title">Queues</div>
          ${sessionSelector}
          <div id="queue-tabs" class="queue-tabs"></div>
        </div>

        <div id="queue-content"></div>
      `;

      this.attachSessionSelectorHandlers(container, sessions);
      const tabsContainer = container.querySelector('#queue-tabs');
      this.renderQueueTabs(tabsContainer, streams);

      const contentContainer = container.querySelector('#queue-content');
      await this.renderQueueContent(contentContainer, this.currentStreamId);
    },

    renderQueueTabs(container, streams) {
      if (!container) {
        return;
      }

      const tabsHtml = streams
        .map((stream) => {
          const isActive = stream.id === this.currentStreamId;
          const progress = formatProgress(stream.stats);
          const statusLabel = formatStreamStatus(stream.status);
          const dotClass = statusDotClass(stream.status);

          return `
            <div class="queue-tab ${isActive ? 'active' : ''}" data-stream-id="${stream.id}">
              <div class="tab-header">
                <span class="status-dot ${dotClass}"></span>
                <span>${stream.name || stream.id}</span>
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
          const selectedId = tab.getAttribute('data-stream-id');
          if (!selectedId || selectedId === this.currentStreamId) {
            return;
          }

          this.currentStreamId = selectedId;
          this.renderQueueTabs(container, this.streamsCache);

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

        const sessionOptions = sessions.map((s) => `${s.id}: ${s.name || 'Unnamed'}`).join('\n');
        const sessionId = await Utils.showPrompt('Select Session', `${sessionOptions}`, sessions[0].id);
        if (!sessionId || !sessionId.trim()) {
          return;
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
          await api('POST', '/api/streams', payload, { action: 'create queue' });
          Utils.showToast(`Queue "${queueName}" created`, 'success');
          // Re-render the dashboard to show the new queue
          this.render(root);
        } catch (err) {
          console.error('Failed to create queue:', err);
          Utils.showToast('Failed to create queue', 'error');
        }
      });
    },

    async renderQueueContent(container, streamId) {
      if (!container) {
        return;
      }

      const stream = this.streamsCache.find((s) => s.id === streamId) || {};
      const streamName = stream.name || stream.id || 'Queue';
      const progress = formatProgress(stream.stats);
      const statusLabel = formatStreamStatus(stream.status);
      const badgeClass = streamBadgeClass(stream.status);

      container.innerHTML = `
        <div class="card">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px;">
            <div>
              <h2 style="margin: 0;">${streamName}</h2>
              <div class="muted" style="font-size: 13px;">${progress} • ${statusLabel}</div>
            </div>
            <span class="badge ${badgeClass}">${statusLabel}</span>
          </div>
          <div id="dashboard-quick-add"></div>
        </div>

        <div id="dashboard-tasks" style="margin-top: 16px;"></div>
      `;

      this.renderQuickAdd(streamId, streamName);

      const tasksContainer = container.querySelector('#dashboard-tasks');
      if (tasksContainer) {
        await this.renderTasks(tasksContainer, streamId);
      }
    },

    renderQuickAdd(streamId, streamName) {
      const quickAddContainer = document.getElementById('dashboard-quick-add');

      if (!quickAddContainer) {
        return;
      }

      if (!QuickAdd) {
        quickAddContainer.innerHTML = `<div class="muted">QuickAdd component not available.</div>`;
        return;
      }

      if (!this.quickAddInstance) {
        this.quickAddInstance = new QuickAdd('dashboard-quick-add', streamId, streamName);
        window.quickAdd = this.quickAddInstance;
      } else {
        this.quickAddInstance.setStream(streamId, streamName);
      }

      this.quickAddInstance.setRefreshCallback(() => {
        const tasksContainer = document.getElementById('dashboard-tasks');
        if (tasksContainer) {
          this.renderTasks(tasksContainer, streamId);
        }
      });

      this.quickAddInstance.render();
    },

    async renderTasks(container, streamId) {
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
        const response = await api('GET', `/api/tasks?stream_id=${encodeURIComponent(streamId)}`, null, { action: 'load tasks' });
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
