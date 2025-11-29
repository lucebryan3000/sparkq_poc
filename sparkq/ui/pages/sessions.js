(function(Pages, API, Utils) {
  'use strict';

  const api = API.api;
  const formatValue = Utils.formatValue;
  const handleApiError = Utils.handleApiError;
  const showError = Utils.showError;
  const showSuccess = Utils.showSuccess;

  async function renderProjectsPage(container) {
    if (!container) {
      return;
    }

    container.innerHTML = `
      <div class="card">
        <div class="muted"><span class="loading"></span> Loading…</div>
      </div>
    `;

    let projects = [];
    let project = null;

    try {
      const response = await api('GET', '/api/projects', null, { action: 'load projects' });
      projects = response?.projects || [];
      project = projects.length > 0 ? projects[0] : null;
    } catch (err) {
      handleApiError('load projects', err);
    }

    const html = `
      <div class="projects-page">
        <div class="tabs-navigation">
          <button class="tab-btn active" data-tab="project">Project</button>
          <button class="tab-btn" data-tab="sessions">Sessions</button>
          <button class="tab-btn" data-tab="streams">Streams</button>
        </div>
        <div id="project-tab" class="tab-content active"></div>
        <div id="sessions-tab" class="tab-content"></div>
        <div id="streams-tab" class="tab-content"></div>
      </div>
    `;

    container.innerHTML = html;

    const tabBtns = container.querySelectorAll('.tab-btn');
    const tabContents = container.querySelectorAll('.tab-content');

    tabBtns.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const tabName = e.target.dataset.tab;
        tabBtns.forEach((b) => b.classList.remove('active'));
        tabContents.forEach((c) => c.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');

        if (tabName === 'project') {
          await renderProjectOverviewTab(project, container);
        } else if (tabName === 'sessions') {
          await renderSessionsTab(project, container);
        } else if (tabName === 'streams') {
          await renderStreamsTab(project, container);
        }
      });
    });

    await renderProjectOverviewTab(project, container);
  }

  async function renderProjectOverviewTab(project, container) {
    const tabContent = container.querySelector('#project-tab');

    if (!project) {
      tabContent.innerHTML = `
        <div class="card">
          <div style="padding: 20px; text-align: center;">
            <p class="muted">No project initialized.</p>
            <button class="button primary" id="init-project-btn" style="margin-top: 12px;">Initialize Project</button>
          </div>
        </div>
      `;
      tabContent.querySelector('#init-project-btn')?.addEventListener('click', () => showInitProjectModal(container));
      return;
    }

    let stats = { sessions: 0, streams: 0, tasks: 0 };
    try {
      const sessionsResp = await api('GET', '/api/sessions', null, { action: 'load sessions for stats' });
      const streamsResp = await api('GET', '/api/streams', null, { action: 'load streams for stats' });
      stats.sessions = sessionsResp?.sessions?.length || 0;
      stats.streams = streamsResp?.streams?.length || 0;
      const tasksResp = await api('GET', '/api/tasks?limit=1', null, { action: 'load task count' });
      stats.tasks = tasksResp?.total || 0;
    } catch (err) {
      console.error('Error loading stats:', err);
    }

    tabContent.innerHTML = `
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="margin: 0;">Project: ${project.name}</h2>
          <button class="button secondary" id="edit-project-btn">Edit</button>
        </div>

        <div style="background: rgba(74, 158, 255, 0.05); padding: 16px; border-radius: 8px; margin-bottom: 20px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
            <div>
              <div class="muted" style="font-size: 12px; margin-bottom: 4px;">Project ID</div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <code style="font-size: 13px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${project.id}</code>
                <button class="button secondary copy-btn" data-copy="${project.id}" title="Copy ID" style="padding: 4px 8px; font-size: 12px;">Copy</button>
              </div>
            </div>
            <div>
              <div class="muted" style="font-size: 12px; margin-bottom: 4px;">Repository</div>
              <div style="font-size: 13px; word-break: break-all;">${project.repo_path || '—'}</div>
            </div>
            <div>
              <div class="muted" style="font-size: 12px; margin-bottom: 4px;">PRD File</div>
              <div style="font-size: 13px; word-break: break-all;">${project.prd_path || '—'}</div>
            </div>
            <div>
              <div class="muted" style="font-size: 12px; margin-bottom: 4px;">Created</div>
              <div style="font-size: 13px;">${formatValue(project.created_at, '—')}</div>
            </div>
          </div>
        </div>

        <div style="background: rgba(0, 0, 0, 0.1); padding: 16px; border-radius: 8px; margin-bottom: 20px;">
          <h4 style="margin: 0 0 12px 0;">Activity Summary</h4>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; text-align: center;">
            <div style="cursor: pointer; padding: 8px; border-radius: 4px; transition: background 0.15s;" class="stat-link" data-tab="sessions">
              <div style="font-size: 24px; font-weight: bold; color: var(--accent);">${stats.sessions}</div>
              <div class="muted" style="font-size: 12px;">Active Sessions</div>
            </div>
            <div style="cursor: pointer; padding: 8px; border-radius: 4px; transition: background 0.15s;" class="stat-link" data-tab="streams">
              <div style="font-size: 24px; font-weight: bold; color: var(--accent);">${stats.streams}</div>
              <div class="muted" style="font-size: 12px;">Total Streams</div>
            </div>
            <div style="cursor: pointer; padding: 8px; border-radius: 4px; transition: background 0.15s;" class="stat-link">
              <div style="font-size: 24px; font-weight: bold; color: var(--accent);">${stats.tasks}</div>
              <div class="muted" style="font-size: 12px;">Queued Tasks</div>
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 10px;">
          <button class="button primary" id="create-session-from-project-btn">Create Session</button>
          <button class="button secondary" id="new-project-btn">New Project</button>
        </div>
      </div>
    `;

    tabContent.querySelector('#edit-project-btn')?.addEventListener('click', () => showEditProjectModal(project, container));
    tabContent.querySelector('#create-session-from-project-btn')?.addEventListener('click', () => showCreateSessionModal(container));
    tabContent.querySelector('#new-project-btn')?.addEventListener('click', () => showInitProjectModal(container));

    tabContent.querySelectorAll('.copy-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const text = btn.dataset.copy;
        navigator.clipboard.writeText(text).then(() => {
          showSuccess('Copied to clipboard');
          const originalText = btn.textContent;
          btn.textContent = '✓';
          setTimeout(() => { btn.textContent = originalText; }, 2000);
        });
      });
    });

    tabContent.querySelectorAll('.stat-link').forEach((link) => {
      link.addEventListener('click', () => {
        const tabName = link.dataset.tab;
        if (tabName) {
          const tabBtn = container.querySelector(`.tab-btn[data-tab="${tabName}"]`);
          tabBtn?.click();
        }
      });
      link.addEventListener('mouseenter', (e) => {
        e.target.style.background = 'rgba(74, 158, 255, 0.1)';
      });
      link.addEventListener('mouseleave', (e) => {
        e.target.style.background = '';
      });
    });
  }

  async function renderSessionsTab(project, container) {
    const tabContent = container.querySelector('#sessions-tab');
    tabContent.innerHTML = '<div class="card"><div class="muted"><span class="loading"></span> Loading sessions…</div></div>';

    if (!project) {
      tabContent.innerHTML = `
        <div class="card">
          <p class="muted">Initialize a project first to create sessions.</p>
        </div>
      `;
      return;
    }

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
          <td>${formatValue(session.created_at, '—')}</td>
          <td><button class="button secondary copy-btn" data-copy="${session.id}" style="padding: 4px 8px; font-size: 12px;" title="Copy session ID">Copy ID</button></td>
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

    tabContent.innerHTML = `
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 style="margin: 0;">Sessions</h3>
          <button class="button primary" id="create-session-btn">Create Session</button>
        </div>
        ${table}
      </div>
    `;

    tabContent.querySelector('#create-session-btn')?.addEventListener('click', () => showCreateSessionModal(container));

    tabContent.querySelectorAll('.copy-btn').forEach((btn) => {
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

    tabContent.querySelectorAll('.session-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (!e.target.classList.contains('copy-btn') && !e.target.closest('.copy-btn')) {
          const sessionId = row.dataset.sessionId;
          showSessionDetailModal(sessionId, container);
        }
      });
    });
  }

  async function renderStreamsTab(project, container) {
    const tabContent = container.querySelector('#streams-tab');
    tabContent.innerHTML = '<div class="card"><div class="muted"><span class="loading"></span> Loading streams…</div></div>';

    if (!project) {
      tabContent.innerHTML = `
        <div class="card">
          <p class="muted">Initialize a project first.</p>
        </div>
      `;
      return;
    }

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
        <tr class="stream-row" data-stream-id="${stream.id}" style="cursor: pointer;">
          <td><code style="font-size: 12px;">${stream.id.substring(0, 12)}…</code></td>
          <td>${sessionsById[stream.session_id] || '—'}</td>
          <td>${stream.name || '—'}</td>
          <td>${formatValue(stream.created_at, '—')}</td>
          <td><button class="button secondary copy-btn" data-copy="${stream.id}" style="padding: 4px 8px; font-size: 12px;" title="Copy stream ID">Copy ID</button></td>
        </tr>
      `)
      .join('');

    const sessionOptions = sessions
      .map((s) => `<option value="${s.id}">${s.name || s.id}</option>`)
      .join('');

    const table = streams.length
      ? `
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Session</th>
              <th>Name</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      `
      : '<p class="muted">No streams found.</p>';

    tabContent.innerHTML = `
      <div class="card">
        <div style="margin-bottom: 16px;">
          <label for="stream-session-filter">Filter by Session:</label>
          <select id="stream-session-filter" style="margin-top: 4px; padding: 6px;">
            <option value="">All Sessions</option>
            ${sessionOptions}
          </select>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 style="margin: 0;">Streams</h3>
          <button class="button primary" id="create-stream-btn" ${sessions.length === 0 ? 'disabled' : ''}>Create Stream</button>
        </div>
        ${table}
      </div>
    `;

    tabContent.querySelector('#create-stream-btn')?.addEventListener('click', () => {
      const sessionId = tabContent.querySelector('#stream-session-filter')?.value;
      if (sessionId) {
        showCreateStreamModal(sessionId, container);
      } else {
        showError('Please select a session first');
      }
    });

    tabContent.querySelector('#stream-session-filter')?.addEventListener('change', () => {
      renderStreamsTab(project, container);
    });

    tabContent.querySelectorAll('.copy-btn').forEach((btn) => {
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

    tabContent.querySelectorAll('.stream-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (!e.target.classList.contains('copy-btn') && !e.target.closest('.copy-btn')) {
          const streamId = row.dataset.streamId;
          showStreamDetailModal(streamId, container);
        }
      });
    });
  }

  async function showInitProjectModal(container) {
    const existing = document.getElementById('init-project-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'init-project-modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 500px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2 style="margin: 0;">Initialize Project</h2>
          <button class="button secondary" style="padding: 4px 8px;" data-action="close">✕</button>
        </div>
        <form id="init-project-form">
          <div class="input-group">
            <label for="init-project-name">Project Name *</label>
            <input type="text" id="init-project-name" placeholder="e.g., my-project" required autofocus />
          </div>
          <div class="input-group">
            <label for="init-repo-path">Repository Path (optional)</label>
            <input type="text" id="init-repo-path" placeholder="e.g., /path/to/repo" />
          </div>
          <div class="input-group">
            <label for="init-prd-path">PRD File Path (optional)</label>
            <input type="text" id="init-prd-path" placeholder="e.g., /path/to/prd.md" />
          </div>
          <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px;">
            <button type="button" class="button secondary" data-action="cancel">Cancel</button>
            <button type="submit" class="button primary">Create Project</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const form = modal.querySelector('#init-project-form');
    modal.querySelector('[data-action="close"]')?.addEventListener('click', () => modal.remove());
    modal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = modal.querySelector('#init-project-name').value.trim();
      if (!name) {
        showError('Project name is required');
        return;
      }

      try {
        await api('POST', '/api/projects', {
          name,
          repo_path: modal.querySelector('#init-repo-path').value.trim() || null,
          prd_path: modal.querySelector('#init-prd-path').value.trim() || null,
        }, { action: 'create project' });
        showSuccess(`Project "${name}" created`);
        modal.remove();
        renderProjectsPage(container);
      } catch (err) {
        handleApiError('create project', err);
      }
    });
  }

  async function showEditProjectModal(project, container) {
    const existing = document.getElementById('edit-project-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'edit-project-modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 500px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2 style="margin: 0;">Edit Project</h2>
          <button class="button secondary" style="padding: 4px 8px;" data-action="close">✕</button>
        </div>
        <form id="edit-project-form">
          <div class="input-group">
            <label for="edit-project-name">Project Name *</label>
            <input type="text" id="edit-project-name" value="${project.name}" required autofocus />
          </div>
          <div class="input-group">
            <label for="edit-repo-path">Repository Path (optional)</label>
            <input type="text" id="edit-repo-path" value="${project.repo_path || ''}" />
          </div>
          <div class="input-group">
            <label for="edit-prd-path">PRD File Path (optional)</label>
            <input type="text" id="edit-prd-path" value="${project.prd_path || ''}" />
          </div>
          <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px;">
            <button type="button" class="button secondary" data-action="cancel">Cancel</button>
            <button type="submit" class="button primary">Save Changes</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const form = modal.querySelector('#edit-project-form');
    modal.querySelector('[data-action="close"]')?.addEventListener('click', () => modal.remove());
    modal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = modal.querySelector('#edit-project-name').value.trim();
      if (!name) {
        showError('Project name is required');
        return;
      }

      try {
        await api('PUT', `/api/projects/${project.id}`, {
          name,
          repo_path: modal.querySelector('#edit-repo-path').value.trim() || null,
          prd_path: modal.querySelector('#edit-prd-path').value.trim() || null,
        }, { action: 'update project' });
        showSuccess(`Project updated`);
        modal.remove();
        renderProjectsPage(container);
      } catch (err) {
        handleApiError('update project', err);
      }
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
            <input type="text" id="session-name" placeholder="e.g., inference-run-2024" required autofocus />
          </div>
          <div class="input-group">
            <label for="session-desc">Description (optional)</label>
            <textarea id="session-desc" placeholder="e.g., GPT-4 benchmark test" style="resize: vertical; min-height: 60px;"></textarea>
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
      if (!name) {
        showError('Session name is required');
        return;
      }

      try {
        await api('POST', '/api/sessions', { name }, { action: 'create session' });
        showSuccess(`Session "${name}" created`);
        modal.remove();
        renderProjectsPage(container);
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
      const streamsResp = await api('GET', '/api/streams', null, { action: 'load streams' });
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
              <div>${formatValue(session.created_at, '—')}</div>
            </div>
          </div>
        </div>

        ${streams.length > 0 ? `
          <div style="margin-bottom: 16px;">
            <h4 style="margin: 0 0 8px 0;">Streams (${streams.length})</h4>
            <ul style="margin: 0; padding-left: 20px;">${streamsList}</ul>
          </div>
        ` : ''}

        <div style="display: flex; gap: 10px;">
          <button class="button primary" id="create-stream-in-session-btn">Create Stream</button>
          <button class="button secondary" id="close-session-btn">Close Session</button>
          <button class="button secondary" id="delete-session-btn" style="margin-left: auto;">Delete</button>
          <button class="button secondary" data-action="close">Close</button>
        </div>
      </div>
    `;

    modal.querySelector('[data-action="close"]')?.addEventListener('click', () => modal.remove());
    modal.querySelector('#create-stream-in-session-btn')?.addEventListener('click', () => {
      modal.remove();
      showCreateStreamModal(sessionId, container);
    });

    modal.querySelector('#close-session-btn')?.addEventListener('click', async () => {
      if (confirm('Close this session?')) {
        try {
          await api('POST', `/api/sessions/${sessionId}/close`, {}, { action: 'close session' });
          showSuccess('Session closed');
          modal.remove();
          renderProjectsPage(container);
        } catch (err) {
          handleApiError('close session', err);
        }
      }
    });

    modal.querySelector('#delete-session-btn')?.addEventListener('click', async () => {
      if (confirm('Delete this session? This action cannot be undone.')) {
        try {
          await api('DELETE', `/api/sessions/${sessionId}`, null, { action: 'delete session' });
          showSuccess('Session deleted');
          modal.remove();
          renderProjectsPage(container);
        } catch (err) {
          handleApiError('delete session', err);
        }
      }
    });

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

  async function showCreateStreamModal(sessionId, container) {
    const existing = document.getElementById('create-stream-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'create-stream-modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 500px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2 style="margin: 0;">Create Stream</h2>
          <button class="button secondary" style="padding: 4px 8px;" data-action="close">✕</button>
        </div>
        <form id="create-stream-form">
          <div class="input-group">
            <label for="stream-name">Stream Name *</label>
            <input type="text" id="stream-name" placeholder="e.g., inference-batch-1" required autofocus />
          </div>
          <div class="input-group">
            <label for="stream-instructions">Instructions (optional)</label>
            <textarea id="stream-instructions" placeholder="e.g., Process images with GPT-4 vision" style="resize: vertical; min-height: 80px;"></textarea>
          </div>
          <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px;">
            <button type="button" class="button secondary" data-action="cancel">Cancel</button>
            <button type="submit" class="button primary">Create Stream</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const form = modal.querySelector('#create-stream-form');
    modal.querySelector('[data-action="close"]')?.addEventListener('click', () => modal.remove());
    modal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = modal.querySelector('#stream-name').value.trim();
      if (!name) {
        showError('Stream name is required');
        return;
      }

      try {
        await api('POST', '/api/streams', {
          session_id: sessionId,
          name,
          instructions: modal.querySelector('#stream-instructions').value.trim() || null,
        }, { action: 'create stream' });
        showSuccess(`Stream "${name}" created`);
        modal.remove();
        renderProjectsPage(container);
      } catch (err) {
        handleApiError('create stream', err);
      }
    });
  }

  async function showStreamDetailModal(streamId, container) {
    const existing = document.getElementById('stream-detail-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'stream-detail-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="muted"><span class="loading"></span> Loading…</div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    let stream, session;
    try {
      const streamResp = await api('GET', `/api/streams/${streamId}`, null, { action: 'load stream' });
      stream = streamResp?.stream;
      const sessResp = await api('GET', `/api/sessions/${stream.session_id}`, null, { action: 'load session' });
      session = sessResp?.session;
    } catch (err) {
      handleApiError('load stream', err);
      modal.remove();
      return;
    }

    modal.innerHTML = `
      <div class="modal-content" style="max-width: 600px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2 style="margin: 0;">Stream Details</h2>
          <button class="button secondary" style="padding: 4px 8px;" data-action="close">✕</button>
        </div>

        <div style="background: rgba(0, 0, 0, 0.1); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <div class="muted" style="font-size: 12px;">ID</div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <code style="font-size: 12px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${stream.id}</code>
                <button class="button secondary copy-btn" data-copy="${stream.id}" style="padding: 4px 8px; font-size: 12px;">Copy</button>
              </div>
            </div>
            <div>
              <div class="muted" style="font-size: 12px;">Name</div>
              <div>${stream.name || '—'}</div>
            </div>
            <div>
              <div class="muted" style="font-size: 12px;">Session</div>
              <div>${session?.name || '—'}</div>
            </div>
            <div>
              <div class="muted" style="font-size: 12px;">Status</div>
              <div><span class="badge badge-${stream.status}">${stream.status}</span></div>
            </div>
          </div>
          ${stream.instructions ? `<div><strong>Instructions:</strong> ${stream.instructions}</div>` : ''}
        </div>

        <div style="display: flex; gap: 10px;">
          <button class="button primary" id="view-stream-tasks-btn">View Tasks</button>
          <button class="button secondary" id="delete-stream-btn">Delete</button>
          <button class="button secondary" data-action="close">Close</button>
        </div>
      </div>
    `;

    modal.querySelector('[data-action="close"]')?.addEventListener('click', () => modal.remove());

    modal.querySelector('#view-stream-tasks-btn')?.addEventListener('click', () => {
      modal.remove();
      const navBtn = document.querySelector('.nav-tab[data-page="tasks"]');
      if (navBtn) {
        navBtn.click();
      }
    });

    modal.querySelector('#delete-stream-btn')?.addEventListener('click', async () => {
      if (confirm('Delete this stream? This action cannot be undone.')) {
        try {
          await api('DELETE', `/api/streams/${streamId}`, null, { action: 'delete stream' });
          showSuccess('Stream deleted');
          modal.remove();
          renderProjectsPage(container);
        } catch (err) {
          handleApiError('delete stream', err);
        }
      }
    });

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
      await renderProjectsPage(container);
    }
  };

})(window.Pages, window.API, window.Utils);
