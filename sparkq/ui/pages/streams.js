(function(Pages, API, Utils) {
  'use strict';

  const api = API.api;
  const formatTimestamp = Utils.formatTimestamp;
  const formatDuration = Utils.formatDuration;
  const showToast = Utils.showToast;
  const AutoRefresh = Utils.AutoRefresh;

  let currentStreamId = null;
  let currentStreamName = null;
  let autoRefresh = null;
  let quickAdd = null;

  async function renderStreamsPage(container) {
    if (!container) {
      return;
    }

    container.innerHTML = `
      <div class="card">
        <div class="muted"><span class="loading"></span> Loading streams…</div>
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
      const streamsResponse = await api('GET', '/api/streams', null, { action: 'load streams' });
      streams = streamsResponse?.streams || [];
    } catch (err) {
      console.error('Failed to load streams:', err);
      showToast('Failed to load streams', 'error');
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
      : `<p class="muted">No streams found.</p>`;

    container.innerHTML = `
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2>Streams</h2>
          <div style="display: flex; gap: 8px; align-items: center;">
            <span id="refresh-counter" class="muted" style="font-size: 12px;">—</span>
            <button class="button secondary" id="refresh-btn" title="Refresh now" style="padding: 6px 12px; font-size: 16px;">⟳</button>
            <button class="button primary" id="create-stream-btn">Create Stream</button>
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

    // Initialize auto-refresh
    initAutoRefresh(container);

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

    const streamName = prompt('Enter stream name:');
    if (!streamName || !streamName.trim()) {
      return;
    }

    const sessionOptions = sessions.map((s) => `${s.id}: ${s.name || 'Unnamed'}`).join('\n');
    const sessionId = prompt(`Select session ID:\n\n${sessionOptions}`);
    if (!sessionId || !sessionId.trim()) {
      return;
    }

    const instructions = prompt('Enter stream instructions (optional):') || null;

    try {
      const payload = {
        session_id: sessionId.trim(),
        name: streamName.trim(),
      };
      if (instructions) {
        payload.instructions = instructions;
      }
      await api('POST', '/api/streams', payload, { action: 'create stream' });
      showToast(`Stream "${streamName}" created`, 'success');
      renderStreamsPage(container);
    } catch (err) {
      console.error('Failed to create stream:', err);
      showToast('Failed to create stream', 'error');
    }
  }

  async function loadStreamDetails(container, streamId, streamName) {
    currentStreamId = streamId;
    currentStreamName = streamName;

    const detailsContainer = container.querySelector('#stream-details-container');
    if (!detailsContainer) return;

    detailsContainer.innerHTML = `
      <div class="card">
        <div class="muted"><span class="loading"></span> Loading tasks for ${streamName}…</div>
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
      : `<p class="muted">No tasks found for this stream.</p>`;

    detailsContainer.innerHTML = `
      <div class="card">
        <h3>Stream: ${streamName}</h3>
        <div id="quick-add-container" style="margin-bottom: 24px;"></div>
        ${taskTable}
      </div>
    `;

    // Initialize QuickAdd component
    if (window.QuickAdd) {
      quickAdd = new window.QuickAdd('quick-add-container', streamId, streamName);
      quickAdd.setRefreshCallback(() => loadStreamDetails(container, streamId, streamName));
      quickAdd.render();
    }
  }

  function initAutoRefresh(container) {
    // Stop previous auto-refresh if exists
    if (autoRefresh) {
      autoRefresh.stop();
    }

    // Create new auto-refresh instance (60 second interval)
    autoRefresh = new AutoRefresh(60000);

    // Add callback to reload streams list
    autoRefresh.addCallback(() => {
      renderStreamsPage(container);
    });

    // Start auto-refresh
    autoRefresh.start();
  }

  Pages.Streams = {
    async render(container) {
      await renderStreamsPage(container);
    }
  };

})(window.Pages, window.API, window.Utils);
