(function(Pages, API, Utils) {
  'use strict';

  const api = API.api;
  const formatValue = Utils.formatValue;
  const handleApiError = Utils.handleApiError;
  const showSuccess = Utils.showSuccess;

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
      handleApiError('load sessions', err);
    }

    try {
      const streamsResponse = await api('GET', '/api/streams', null, { action: 'load streams' });
      streams = streamsResponse?.streams || [];
    } catch (err) {
      handleApiError('load streams', err);
    }

    const sessionsById = {};
    sessions.forEach((session) => {
      sessionsById[session.id] = session.name || session.id;
    });

    const rows = streams
      .map((stream) => `
        <tr>
          <td>${stream.id}</td>
          <td>${stream.name || '—'}</td>
          <td>${sessionsById[stream.session_id] || stream.session_id || '—'}</td>
          <td>${stream.status || '—'}</td>
          <td>${formatValue(stream.created_at, '—')}</td>
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
        <h2>Streams</h2>
        <div style="margin-bottom: 12px;">
          <button class="button primary" id="create-stream-btn">Create Stream</button>
        </div>
        ${table}
      </div>
    `;

    const createBtn = container.querySelector('#create-stream-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => handleCreateStream(container, sessions));
    }
  }

  async function handleCreateStream(container, sessions) {
    if (!sessions.length) {
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
      showSuccess(`Stream "${streamName}" created`);
      renderStreamsPage(container);
    } catch (err) {
      handleApiError('create stream', err);
    }
  }

  Pages.Streams = {
    async render(container) {
      await renderStreamsPage(container);
    }
  };

})(window.Pages, window.API, window.Utils);
