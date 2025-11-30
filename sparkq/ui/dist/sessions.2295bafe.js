(function(Pages, API, Utils) {
  'use strict';

  const api = API.api;
  const formatValue = Utils.formatValue;
  const formatTimestamp = Utils.formatTimestamp;
  const handleApiError = Utils.handleApiError;
  const showError = Utils.showError;
  const showSuccess = Utils.showSuccess;

  async function renderSessionsPage(container) {
    if (!container) {
      return;
    }

    container.innerHTML = `
      <div class="card">
        <div class="muted"><span class="loading"></span> Loading sessions…</div>
      </div>
    `;

    let sessions = [];
    try {
      const response = await api('GET', '/api/sessions', null, { action: 'load sessions' });
      sessions = response?.sessions || [];
    } catch (err) {
      handleApiError('load sessions', err);
    }

    const rows = sessions
      .map((session) => `
        <tr class="session-row" data-session-id="${session.id}" style="cursor: pointer;">
          <td><code style="font-size: 12px;">${session.id.substring(0, 12)}…</code></td>
          <td>${session.name || '—'}</td>
          <td><span class="badge badge-${session.status}">${session.status}</span></td>
          <td>${formatTimestamp(session.created_at)}</td>
          <td>
            <button class="button secondary copy-btn" data-copy="${session.id}" style="padding: 4px 8px; font-size: 12px;" title="Copy session ID">Copy ID</button>
          </td>
        </tr>
      `)
      .join('');

    const table = sessions.length
      ? `
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
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
      : '<p class="muted">No sessions found. Create one to get started.</p>';

    container.innerHTML = `
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2 style="margin: 0;">Sessions</h2>
          <button class="button primary" id="create-session-btn">Create Session</button>
        </div>
        ${table}
      </div>
    `;

    container.querySelector('#create-session-btn')?.addEventListener('click', () => showCreateSessionModal(container));

    container.querySelectorAll('.copy-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = btn.dataset.copy;
        navigator.clipboard.writeText(text).then(() => {
          showSuccess('Copied to clipboard');
          const originalText = btn.textContent;
          btn.textContent = '✓';
          setTimeout(() => { btn.textContent = originalText; }, 2000);
        });
      });
    });

    container.querySelectorAll('.session-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (!e.target.classList.contains('copy-btn') && !e.target.closest('.copy-btn')) {
          const sessionId = row.dataset.sessionId;
          showSessionDetailModal(sessionId, container);
        }
      });
    });
  }

  async function showCreateSessionModal(container) {
    const existing = document.getElementById('create-session-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'create-session-modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 500px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2 style="margin: 0;">Create Session</h2>
          <button class="button secondary" style="padding: 4px 8px;" data-action="close">✕</button>
        </div>
        <form id="create-session-form">
          <div class="input-group">
            <label for="session-name">Session Name *</label>
            <input type="text" id="session-name" placeholder="e.g., development-session" required autofocus />
          </div>
          <div class="input-group">
            <label for="session-desc">Description (optional)</label>
            <textarea id="session-desc" placeholder="e.g., Working on new features" style="resize: vertical; min-height: 60px;"></textarea>
          </div>
          <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px;">
            <button type="button" class="button secondary" data-action="cancel">Cancel</button>
            <button type="submit" class="button primary">Create Session</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const form = modal.querySelector('#create-session-form');
    modal.querySelector('[data-action="close"]')?.addEventListener('click', () => modal.remove());
    modal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = modal.querySelector('#session-name').value.trim();
      const description = modal.querySelector('#session-desc').value.trim() || null;
      if (!name) {
        showError('Session name is required');
        return;
      }

      try {
        await api('POST', '/api/sessions', { name, description }, { action: 'create session' });
        showSuccess(`Session "${name}" created`);
        modal.remove();
        renderSessionsPage(container);
      } catch (err) {
        handleApiError('create session', err);
      }
    });
  }

  async function showSessionDetailModal(sessionId, container) {
    const existing = document.getElementById('session-detail-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'session-detail-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="muted"><span class="loading"></span> Loading…</div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    let session, streams = [];
    try {
      const sessResp = await api('GET', `/api/sessions/${sessionId}`, null, { action: 'load session' });
      session = sessResp?.session;
      const streamsResp = await api('GET', '/api/queues', null, { action: 'load queues' });
      streams = (streamsResp?.streams || []).filter((s) => s.session_id === sessionId);
    } catch (err) {
      handleApiError('load session', err);
      modal.remove();
      return;
    }

    const streamsList = streams.map((s) => `<li>${s.name || s.id}</li>`).join('');

    modal.innerHTML = `
      <div class="modal-content" style="max-width: 600px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2 style="margin: 0;">Session Details</h2>
          <button class="button secondary" style="padding: 4px 8px;" data-action="close">✕</button>
        </div>

        <div style="background: rgba(0, 0, 0, 0.1); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <div class="muted" style="font-size: 12px;">ID</div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <code style="font-size: 12px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${session.id}</code>
                <button class="button secondary copy-btn" data-copy="${session.id}" style="padding: 4px 8px; font-size: 12px;">Copy</button>
              </div>
            </div>
            <div>
              <div class="muted" style="font-size: 12px;">Name</div>
              <div>${session.name || '—'}</div>
            </div>
            <div>
              <div class="muted" style="font-size: 12px;">Status</div>
              <div><span class="badge badge-${session.status}">${session.status}</span></div>
            </div>
            <div>
              <div class="muted" style="font-size: 12px;">Created</div>
              <div>${formatTimestamp(session.created_at)}</div>
            </div>
          </div>
          ${session.description ? `<div style="margin-top: 12px;"><strong>Description:</strong> ${session.description}</div>` : ''}
        </div>

        ${streams.length > 0 ? `
          <div style="margin-bottom: 16px;">
            <h4 style="margin: 0 0 8px 0;">Queues (${streams.length})</h4>
            <ul style="margin: 0; padding-left: 20px;">${streamsList}</ul>
          </div>
        ` : ''}

        <div style="display: flex; gap: 10px;">
          <button class="button secondary" data-action="close">Close</button>
        </div>
      </div>
    `;

    modal.querySelector('[data-action="close"]')?.addEventListener('click', () => modal.remove());

    modal.querySelectorAll('.copy-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = btn.dataset.copy;
        navigator.clipboard.writeText(text).then(() => {
          showSuccess('Copied to clipboard');
          const originalText = btn.textContent;
          btn.textContent = '✓';
          setTimeout(() => { btn.textContent = originalText; }, 2000);
        });
      });
    });
  }

  Pages.Sessions = {
    async render(container) {
      await renderSessionsPage(container);
    }
  };

})(window.Pages, window.API, window.Utils);
