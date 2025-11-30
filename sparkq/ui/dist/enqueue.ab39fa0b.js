(function(Pages, API, Utils) {
  'use strict';

  const api = API.api;
  const handleApiError = Utils.handleApiError;
  const showError = Utils.showError;
  const showSuccess = Utils.showSuccess;
  const withButtonLoading = Utils.withButtonLoading;
  const attachValidationHandlers = Utils.attachValidationHandlers;
  const clearFormErrors = Utils.clearFormErrors;
  const validateRequiredFields = Utils.validateRequiredFields;
  const markFieldError = Utils.markFieldError;
  const normalizeScriptIndex = Utils.normalizeScriptIndex;

  let scriptIndexCache = [];
  let scriptIndexLoaded = false;
  let scriptIndexPromise = null;
  let pendingScriptSelection = null;

  function injectEnqueueStyles() {
    if (document.getElementById('enqueue-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'enqueue-styles';
    style.textContent = `
      .autocomplete-wrapper { position: relative; }
      .autocomplete-list { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow); max-height: 240px; overflow-y: auto; z-index: 8; display: none; }
      .autocomplete-item { padding: 10px 12px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.12s ease; }
      .autocomplete-item:last-child { border-bottom: none; }
      .autocomplete-item:hover { background: var(--muted); }
      .autocomplete-item-title { display: block; font-weight: 700; }
      .autocomplete-item-desc { display: block; color: var(--subtle); font-size: 13px; margin-top: 4px; }
      .script-meta { margin-top: 12px; padding: 12px; border-radius: 10px; border: 1px solid var(--border); background: rgba(255, 255, 255, 0.02); }
      .script-meta h4 { margin: 0 0 6px 0; }
      .script-meta .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-top: 8px; }
      .script-helper { color: var(--subtle); font-size: 13px; margin-top: 4px; }
    `;

    document.head.appendChild(style);
  }

  async function loadScriptIndex(force = false) {
    if (scriptIndexLoaded && !force) {
      return scriptIndexCache;
    }

    if (scriptIndexPromise && !force) {
      return scriptIndexPromise;
    }

    scriptIndexPromise = (async () => {
      try {
        const response = await api('GET', '/api/scripts/index', null, { action: 'load script index' });
        const scripts = normalizeScriptIndex(response);
        scriptIndexCache = scripts;
        scriptIndexLoaded = true;
        return scriptIndexCache;
      } catch (err) {
        scriptIndexCache = [];
        scriptIndexLoaded = false;
        handleApiError('load script index', err);
        return [];
      } finally {
        scriptIndexPromise = null;
      }
    })();

    return scriptIndexPromise;
  }

  async function renderEnqueuePage(container) {
    if (!container) {
      return;
    }

    injectEnqueueStyles();

    container.innerHTML = `
      <div class="card">
        <div class="muted"><span class="loading"></span> Loading enqueue form…</div>
      </div>
    `;

    let streams = [];
    try {
      const response = await api('GET', '/api/streams', null, { action: 'load streams' });
      streams = response?.streams || [];
    } catch (err) {
      handleApiError('load streams for enqueue', err);
    }

    let scripts = [];
    try {
      scripts = await loadScriptIndex();
    } catch (err) {
      handleApiError('load script index', err);
    }

    const streamOptions = streams
      .map((stream) => {
        const label = stream.name && stream.name !== stream.id ? `${stream.name} (${stream.id})` : stream.name || stream.id;
        return `<option value="${stream.id}">${label}</option>`;
      })
      .join('');

    const taskClasses = ['FAST_SCRIPT', 'MEDIUM_SCRIPT', 'LLM_LITE', 'LLM_HEAVY'];

    container.innerHTML = `
      <div class="card">
        <h2>Enqueue Task</h2>

        <form id="enqueue-form" novalidate>
          <div class="grid grid-2">
            <div class="input-group">
              <label for="enqueue-stream">Stream</label>
              <input id="enqueue-stream" list="enqueue-stream-options" placeholder="Enter or choose a stream ID" required />
              <datalist id="enqueue-stream-options">
                ${streamOptions}
              </datalist>
            </div>
            <div class="input-group">
              <label for="enqueue-tool">Script</label>
              <div class="autocomplete-wrapper">
                <input id="enqueue-tool" type="text" autocomplete="off" placeholder="Start typing a script name" required />
                <div id="script-suggestions" class="autocomplete-list"></div>
              </div>
              <div id="script-helper" class="script-helper"></div>
            </div>
          </div>

          <div class="grid grid-2">
            <div class="input-group">
              <label for="enqueue-task-class">Task Class</label>
              <select id="enqueue-task-class" required>
                ${taskClasses.map((entry) => `<option value="${entry}">${entry}</option>`).join('')}
              </select>
            </div>
            <div class="input-group">
              <label for="enqueue-timeout">Timeout (seconds)</label>
              <input id="enqueue-timeout" type="number" min="1" step="1" placeholder="Optional" />
            </div>
          </div>

          <div class="grid grid-2">
            <div class="input-group">
              <label for="enqueue-prompt-path">Prompt Path (optional)</label>
              <input id="enqueue-prompt-path" type="text" placeholder="/path/to/prompt" />
            </div>
            <div class="input-group">
              <label for="enqueue-metadata">Metadata (JSON, optional)</label>
              <textarea id="enqueue-metadata" rows="3" placeholder='{"key":"value"}'></textarea>
            </div>
          </div>

          <div id="script-meta" class="script-meta muted">Select a script to view inputs, outputs, timeout, and task class.</div>

          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px;">
            <button class="button primary" id="enqueue-submit" type="submit">Enqueue Task</button>
          </div>
        </form>
      </div>
    `;

    const form = container.querySelector('#enqueue-form');
    const toolInput = form.querySelector('#enqueue-tool');
    const suggestionsEl = form.querySelector('#script-suggestions');
    const helperEl = form.querySelector('#script-helper');
    const metaEl = form.querySelector('#script-meta');
    const timeoutInput = form.querySelector('#enqueue-timeout');
    const taskClassSelect = form.querySelector('#enqueue-task-class');
    const enqueueBtn = form.querySelector('#enqueue-submit');
    const streamInput = form.querySelector('#enqueue-stream');
    const promptInput = form.querySelector('#enqueue-prompt-path');
    const metadataInput = form.querySelector('#enqueue-metadata');

    let selectedScript = null;

    helperEl.textContent = scripts.length ? `${scripts.length} scripts available.` : 'No scripts loaded.';

    function buildTooltip(script) {
      if (!script) {
        return '';
      }
      const inputs = formatScriptField(script.inputs);
      const outputs = formatScriptField(script.outputs);
      return `Inputs: ${inputs || '—'} | Outputs: ${outputs || '—'}`;
    }

    function formatScriptField(value) {
      if (!value && value !== 0) {
        return '';
      }
      if (Array.isArray(value)) {
        return value.join(', ');
      }
      return String(value);
    }

    function renderScriptMeta(script) {
      if (!script) {
        metaEl.textContent = 'Select a script to view inputs, outputs, timeout, and task class.';
        metaEl.classList.add('muted');
        metaEl.removeAttribute('title');
        return;
      }

      const inputs = formatScriptField(script.inputs) || '—';
      const outputs = formatScriptField(script.outputs) || '—';
      const timeout = script.timeout ? `${script.timeout}s` : '—';
      const taskClass = script.task_class || '—';
      const description = script.description || 'No description provided.';

      metaEl.classList.remove('muted');
      metaEl.title = buildTooltip(script);
      metaEl.innerHTML = `
        <h4>${script.name || 'Selected script'}</h4>
        <div class="muted" style="margin-bottom: 8px;">${description}</div>
        <div class="meta-grid">
          <div><strong>Inputs</strong><div>${inputs}</div></div>
          <div><strong>Outputs</strong><div>${outputs}</div></div>
          <div><strong>Timeout</strong><div>${timeout}</div></div>
          <div><strong>Task Class</strong><div>${taskClass}</div></div>
        </div>
      `;
    }

    function selectScript(script) {
      selectedScript = script;
      toolInput.value = script?.name || '';
      helperEl.textContent = script?.description || 'Script has no description.';
      helperEl.title = buildTooltip(script);

      if (script?.timeout && Number.isFinite(Number(script.timeout))) {
        timeoutInput.value = Number(script.timeout);
      }

      if (script?.task_class) {
        const optionExists = Array.from(taskClassSelect.options).some((opt) => opt.value === script.task_class);
        if (!optionExists) {
          const opt = document.createElement('option');
          opt.value = script.task_class;
          opt.textContent = script.task_class;
          taskClassSelect.appendChild(opt);
        }
        taskClassSelect.value = script.task_class;
      }

      renderScriptMeta(script);
      hideSuggestions();
    }

    function hideSuggestions() {
      suggestionsEl.style.display = 'none';
      suggestionsEl.innerHTML = '';
    }

    function renderSuggestions(list) {
      if (!list.length) {
        hideSuggestions();
        return;
      }

      suggestionsEl.innerHTML = list
        .slice(0, 10)
        .map(
          (entry) => `
            <div class="autocomplete-item" data-script-name="${encodeURIComponent(entry.name || '')}">
              <span class="autocomplete-item-title">${entry.name || 'Unnamed script'}</span>
              <span class="autocomplete-item-desc">${entry.description || 'No description'}</span>
            </div>
          `,
        )
        .join('');

      suggestionsEl.style.display = 'block';

      suggestionsEl.querySelectorAll('.autocomplete-item').forEach((item, index) => {
        item.addEventListener('click', () => {
          const script = list[index];
          selectScript(script);
        });
      });
    }

    function filterScripts(query) {
      const q = query.trim().toLowerCase();
      if (!q) {
        return scripts.slice(0, 10);
      }

      return scripts
        .filter((script) => {
          const name = String(script.name || '').toLowerCase();
          const description = String(script.description || '').toLowerCase();
          return name.includes(q) || description.includes(q);
        })
        .slice(0, 10);
    }

    function syncSelectionFromInput() {
      const value = toolInput.value.trim().toLowerCase();
      if (!value) {
        selectedScript = null;
        helperEl.textContent = scripts.length ? `${scripts.length} scripts available.` : 'No scripts loaded.';
        helperEl.removeAttribute('title');
        renderScriptMeta(null);
        return;
      }

      const match = scripts.find((entry) => String(entry.name || '').toLowerCase() === value);
      if (match) {
        selectScript(match);
      } else {
        selectedScript = null;
        helperEl.textContent = 'Custom script name will be used.';
        helperEl.removeAttribute('title');
        renderScriptMeta(null);
      }
    }

    toolInput.addEventListener('input', () => {
      const matches = filterScripts(toolInput.value);
      renderSuggestions(matches);
      syncSelectionFromInput();
    });

    toolInput.addEventListener('focus', () => {
      const matches = filterScripts(toolInput.value);
      renderSuggestions(matches);
    });

    toolInput.addEventListener('blur', () => {
      setTimeout(() => hideSuggestions(), 120);
    });

    attachValidationHandlers(form);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFormErrors(form);
      const streamId = (streamInput?.value || '').trim();
      const toolName = (toolInput?.value || '').trim();
      const taskClass = (taskClassSelect?.value || '').trim();
      const timeoutVal = Number(timeoutInput?.value);
      const promptPath = (promptInput?.value || '').trim();
      const metadataRaw = (metadataInput?.value || '').trim();

      if (!validateRequiredFields(form)) {
        showError('Please fix the highlighted fields.');
        return;
      }

      let metadataParsed;
      if (metadataRaw) {
        try {
          metadataParsed = JSON.parse(metadataRaw);
        } catch (err) {
          markFieldError(metadataInput, 'Metadata must be valid JSON.');
          showError('Failed to enqueue task: Metadata must be valid JSON.', err);
          return;
        }
      }

      const payload = {
        stream_id: streamId,
        tool_name: toolName,
        task_class: taskClass,
      };

      if (Number.isFinite(timeoutVal) && timeoutVal > 0) {
        payload.timeout = timeoutVal;
      }
      if (promptPath) {
        payload.prompt_path = promptPath;
      }
      if (metadataParsed !== undefined) {
        payload.metadata = metadataParsed;
      }

      try {
        const response = await withButtonLoading(enqueueBtn, async () =>
          api('POST', '/api/tasks', payload, { action: 'enqueue task' }),
        );
        const taskId = response?.task?.id;
        const suffix = taskId ? ` as ${taskId}` : '';
        showSuccess(`Task enqueued${suffix}`);
        form.reset();
        selectedScript = null;
        renderScriptMeta(null);
        helperEl.textContent = scripts.length ? `${scripts.length} scripts available.` : 'No scripts loaded.';
      } catch (err) {
        handleApiError('enqueue task', err);
      }
    });

    if (pendingScriptSelection) {
      const match = scripts.find((entry) => String(entry.name || '') === String(pendingScriptSelection.name || ''));
      if (match) {
        selectScript(match);
      }
      pendingScriptSelection = null;
    }
  }

  Pages.Enqueue = {
    async render(container) {
      await renderEnqueuePage(container);
    }
  };

})(window.Pages, window.API, window.Utils);
