(function(Pages, API, Utils) {
  'use strict';

  const api = API.api;
  const formatTimestamp = Utils.formatTimestamp;
  const formatDuration = Utils.formatDuration;
  const showToast = Utils.showToast;

  let currentStreamId = null;
  let currentStreamName = null;
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
      const streamsResponse = await api('GET', '/api/streams', null, { action: 'load queues' });
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
      .map((stream) => `
        <tr>
          <td><a href="#" class="stream-link" data-stream-id="${stream.id}" data-stream-name="${stream.name || stream.id}">${stream.id}</a></td>
          <td>${stream.name || '—'}</td>
          <td>${sessionsById[stream.session_id] || stream.session_id || '—'}</td>
          <td>${stream.status || '—'}</td>
          <td>${formatTimestamp(stream.created_at)}</td>
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
            <button class="button primary" id="create-stream-btn">Create Queue</button>
          </div>
        </div>
        ${table}
      </div>

      <div id="stream-details-container" style="margin-top: 24px;"></div>
    `;

    // Attach stream link handlers
    const streamLinks = container.querySelectorAll('.stream-link');
    streamLinks.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const streamId = link.getAttribute('data-stream-id');
        const streamName = link.getAttribute('data-stream-name');
        loadStreamDetails(container, streamId, streamName);
      });
    });

    const createBtn = container.querySelector('#create-stream-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => handleCreateStream(container, sessions));
    }

    const refreshBtn = container.querySelector('#refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        if (autoRefresh) {
          autoRefresh.refresh();
        }
      });
    }

    // If a stream was previously selected, reload it
    if (currentStreamId) {
      loadStreamDetails(container, currentStreamId, currentStreamName);
    }
  }

  async function handleCreateStream(container, sessions) {
    if (!sessions.length) {
      showToast('No sessions available. Create a session first.', 'warning');
      return;
    }

    const streamName = await Utils.showPrompt('Create Queue', 'Enter queue name:');
    if (!streamName || !streamName.trim()) {
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
        name: streamName.trim(),
      };
      if (instructions && instructions.trim()) {
        payload.instructions = instructions;
      }
      await api('POST', '/api/streams', payload, { action: 'create queue' });
      showToast(`Queue "${streamName}" created`, 'success');
      renderStreamsPage(container);
    } catch (err) {
      console.error('Failed to create queue:', err);
      showToast('Failed to create queue', 'error');
    }
  }

  async function handleArchiveStream(container, streamId, streamName) {
    const confirmed = await Utils.showPrompt('Archive Queue', `Are you sure you want to archive "${streamName}"? This keeps the history but marks it as archived.`, 'no');
    if (confirmed !== 'yes') {
      return;
    }

    try {
      await api('PUT', `/api/streams/${streamId}/archive`, null, { action: 'archive queue' });
      showToast(`Queue "${streamName}" archived`, 'success');
      renderStreamsPage(container);
    } catch (err) {
      console.error('Failed to archive queue:', err);
      showToast('Failed to archive queue', 'error');
    }
  }

  async function handleDeleteStream(container, streamId, streamName) {
    const confirmed = await Utils.showPrompt('Delete Queue', `Are you sure you want to permanently delete "${streamName}"? This will remove all history and cannot be undone.`, 'no');
    if (confirmed !== 'yes') {
      return;
    }

    try {
      await api('DELETE', `/api/streams/${streamId}`, null, { action: 'delete queue' });
      showToast(`Queue "${streamName}" deleted`, 'success');
      renderStreamsPage(container);
    } catch (err) {
      console.error('Failed to delete queue:', err);
      showToast('Failed to delete queue', 'error');
    }
  }

  async function loadStreamDetails(container, streamId, streamName) {
    currentStreamId = streamId;
    currentStreamName = streamName;

    const detailsContainer = container.querySelector('#stream-details-container');
    if (!detailsContainer) return;

    detailsContainer.innerHTML = `
      <div class="card">
        <div class="muted"><span class="loading"></span> Loading tasks from queue…</div>
      </div>
    `;

    let tasks = [];

    try {
      const tasksResponse = await api('GET', `/api/streams/${streamId}/tasks`, null, { action: 'load tasks' });
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
          <h3 style="margin: 0;">Queue: ${streamName}</h3>
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
      archiveBtn.addEventListener('click', () => handleArchiveStream(container, streamId, streamName));
    }

    const deleteBtn = detailsContainer.querySelector('#delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => handleDeleteStream(container, streamId, streamName));
    }

    // Initialize QuickAdd component
    if (window.QuickAdd) {
      quickAdd = new window.QuickAdd('quick-add-container', streamId, streamName);
      quickAdd.setRefreshCallback(() => loadStreamDetails(container, streamId, streamName));
      quickAdd.render();
    }
  }

  Pages.Queues = {
    async render(container) {
      await renderStreamsPage(container);
    }
  };

})(window.Pages, window.API, window.Utils);
