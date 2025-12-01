(function(window) {
  'use strict';

  const API = window.API;
  const Utils = window.Utils;

  class QuickAdd {
    constructor(containerId, queueId, queueName) {
      this.containerId = containerId;
      this.queueId = queueId;
      this.queueName = queueName;
      this.mode = 'llm';  // Default mode
      this.refreshCallback = null;
      this.llmTools = [];
      this.selectedTool = null;
      this.buildPrompts = [];
      this.selectedPrompt = '';

      // Text expander state (Phase 14B)
      this.prompts = [];
      this.popupVisible = false;
      this.selectedIndex = 0;
      this.triggerPosition = -1;
      this.filteredPrompts = [];
      this.documentClickHandler = null;
    }

    setStream(queueId, queueName) {
      this.queueId = queueId;
      this.queueName = queueName;
      this.render();
    }

    setMode(mode) {
      this.mode = mode;
      this.render();
    }

    setRefreshCallback(callback) {
      this.refreshCallback = callback;
    }

    async loadTools() {
      const prevSelected = this.selectedTool;
      try {
        const cfg = await API.api('GET', '/api/config', null, { action: 'load config' });
        const tools = cfg?.tools || {};
        this.llmTools = Object.entries(tools)
          .filter(([_, val]) => {
            const tc = (val?.task_class || '').toString().toUpperCase();
            return tc.startsWith('LLM_');
          })
          .map(([name, val]) => ({
            name,
            description: val?.description || name,
            task_class: val?.task_class || '',
          }));
        if (this.llmTools.length) {
          const hasPrev = prevSelected && this.llmTools.some(t => t.name === prevSelected);
          const haiku = this.llmTools.find(t => t.name === 'llm-haiku');
          if (hasPrev) {
            this.selectedTool = prevSelected;
          } else {
            this.selectedTool = haiku ? haiku.name : this.llmTools[0].name;
          }
        }
      } catch (err) {
        console.error('[QuickAdd] Failed to load tools:', err);
        this.llmTools = [];
        this.selectedTool = this.selectedTool || 'llm-haiku';
      }
    }

    async loadBuildPrompts() {
      try {
        const resp = await API.api('GET', '/api/build-prompts', null, { action: 'load build prompts' });
        this.buildPrompts = resp?.prompts || [];
        if (!this.selectedPrompt) {
          this.selectedPrompt = '';
        }
      } catch (err) {
        console.error('[QuickAdd] Failed to load build prompts:', err);
        this.buildPrompts = [];
      }
    }

    async resolveToolLabel(toolName) {
      const name = toolName || '';
      const match = this.llmTools.find(t => t.name === name);
      if (match?.description) {
        return match.description;
      }
      try {
        if (Utils.loadFriendlyToolNames) {
          await Utils.loadFriendlyToolNames();
        }
        if (Utils.getFriendlyToolName) {
          return Utils.getFriendlyToolName(name);
        }
      } catch (err) {
        console.warn('[QuickAdd] Failed to resolve friendly tool name:', err);
      }
      return name || '—';
    }

    async render() {
      const container = document.getElementById(this.containerId);
      if (!container) return;

      await this.loadTools();
      await this.loadBuildPrompts();

      const llmOptions = this.llmTools.length
        ? this.llmTools
        : [{ name: 'llm-haiku', description: 'Claude Haiku', task_class: 'LLM_LITE' }];

      if (!this.selectedTool) {
        this.selectedTool = llmOptions[0].name;
      }

      const llmSelect = `
        <label for="llm-tool-select" style="font-size: 13px; color: #bbb; display: block; margin-bottom: 6px;">Model</label>
        <select
          id="llm-tool-select"
          onchange="window.quickAdd.handleToolChange(event)"
          style="display: inline-block; min-width: 220px; max-width: 320px; background: rgba(0, 0, 0, 0.3); border: 1px solid #444; border-radius: 6px; padding: 10px; color: #fff; margin-bottom: 10px;">
          ${llmOptions.map(opt => `<option value="${opt.name}" ${opt.name === this.selectedTool ? 'selected' : ''}>${opt.description}</option>`).join('')}
        </select>
      `;

      const promptSelect = this.buildPrompts.length
        ? `
          <label for="prompt-file-select" style="font-size: 13px; color: #bbb; display: block; margin-bottom: 6px;">Prompt File</label>
          <select
            id="prompt-file-select"
            onchange="window.quickAdd.handlePromptFileChange(event)"
            style="display: inline-block; min-width: 220px; max-width: 360px; background: rgba(0, 0, 0, 0.3); border: 1px solid #444; border-radius: 6px; padding: 10px; color: #fff; margin-bottom: 10px;">
            <option value="">-- Select Prompt --</option>
            ${this.buildPrompts.map(p => `<option value="${p.path}" ${p.path === this.selectedPrompt ? 'selected' : ''}>${p.name || p.path}</option>`).join('')}
          </select>
        `
        : '';

      container.innerHTML = `
        <div class="quick-add-bar" style="background: rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 16px; margin-bottom: 20px;">

          <div class="mode-toggle" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="display: flex; gap: 8px;">
              <button
                class="mode-btn ${this.mode === 'llm' ? 'active' : ''}"
                onclick="window.quickAdd.setMode('llm')"
                style="padding: 8px 16px; background: ${this.mode === 'llm' ? '#3b82f6' : 'rgba(255, 255, 255, 0.05)'}; border: 1px solid ${this.mode === 'llm' ? '#3b82f6' : '#444'}; border-radius: 6px; color: #fff; cursor: pointer; transition: all 0.2s;">
                💬 Prompt
              </button>
              <button
                class="mode-btn ${this.mode === 'script' ? 'active' : ''}"
                onclick="window.quickAdd.setMode('script')"
                style="padding: 8px 16px; background: ${this.mode === 'script' ? '#3b82f6' : 'rgba(255, 255, 255, 0.05)'}; border: 1px solid ${this.mode === 'script' ? '#3b82f6' : '#444'}; border-radius: 6px; color: #fff; cursor: pointer; transition: all 0.2s;">
                📄 Script
              </button>
            </div>
            <button
              class="button secondary"
              onclick="window.quickAdd.showInstructions()"
              title="Edit queue instructions"
              style="padding: 8px 16px; font-size: 14px; white-space: nowrap;">
              📋 Queue Instructions
            </button>
          </div>

          <div id="llm-input" class="input-area" style="display: ${this.mode === 'llm' ? 'block' : 'none'}; position: relative;">
            <div style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap; margin-bottom:8px;">
              <div style="flex:0 0 auto;">${llmSelect}</div>
              ${promptSelect ? `<div style="flex:0 0 auto;">${promptSelect}</div>` : ''}
            </div>
            <div class="prompt-input-wrapper" style="position: relative;">
              <textarea
                id="prompt-field"
                placeholder="Describe what you want Claude to do... (Press Enter to add)"
                rows="3"
                style="width: 100%; background: rgba(0, 0, 0, 0.3); border: 1px solid #444; border-radius: 6px; padding: 12px; padding-right: 50px; color: #fff; font-size: 14px; font-family: inherit; resize: vertical; min-height: 60px;"
              ></textarea>
              <button
                id="tools-btn"
                class="tools-btn"
                title="Add integrations"
                style="position: absolute; right: 12px; top: 12px; background: rgba(255, 255, 255, 0.05); border: 1px solid #444; border-radius: 4px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #a1a1aa; font-size: 18px; transition: all 0.2s;">
                +
              </button>
            </div>
            <div class="hint" style="font-size: 11px; color: #666; margin-top: 4px;">Press Enter to add | Shift+Enter for new line</div>

            <!-- Tools Popup -->
            <div id="tools-popup" class="tools-popup" style="display: none; position: absolute; right: 0; top: 100%; background: #1a1f2e; border: 1px solid #3f3f46; border-radius: 6px; min-width: 280px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4); z-index: 100; margin-top: 4px; padding: 8px 0;">
              <div class="popup-section">
                <div class="popup-section-title" style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #71717a; padding: 4px 12px; margin-bottom: 4px;">
                  Integrations
                </div>
                <div class="popup-item disabled" style="padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; opacity: 0.4; cursor: not-allowed;">
                  <span>🔍 Web Search</span>
                  <span class="coming-soon" style="font-size: 10px; color: #71717a; background: rgba(255, 255, 255, 0.05); padding: 2px 6px; border-radius: 3px;">
                    Coming Soon
                  </span>
                </div>
              </div>
            </div>

            <!-- Text Expander Autocomplete Popup (Phase 14B) -->
            <div id="text-expander-popup" class="text-expander-popup" style="display: none; position: absolute; top: 100%; left: 0; background: #1a1f2e; border: 1px solid #3f3f46; border-radius: 6px; min-width: 320px; max-height: 400px; overflow-y: auto; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4); z-index: 100; margin-top: 4px;">
              <div class="popup-section" style="padding: 8px 0;">
                <div class="popup-section-title" style="font-size: 11px; text-transform: uppercase; color: #71717a; padding: 8px 12px 4px; font-weight: 600;">TEXT EXPANDERS</div>
                <div id="prompt-list-container">
                  <!-- Populated dynamically -->
                </div>
              </div>
            </div>
          </div>

          <div id="script-input" class="input-area" style="display: ${this.mode === 'script' ? 'block' : 'none'}">
            <select
              id="script-picker"
              style="width: 100%; background: rgba(0, 0, 0, 0.3); border: 1px solid #444; border-radius: 6px; padding: 10px; color: #fff; margin-bottom: 8px;">
              <option value="">Select a script...</option>
            </select>
            <input
              type="text"
              id="script-args"
              placeholder="Arguments (optional): --verbose --env=dev"
              style="width: 100%; background: rgba(0, 0, 0, 0.3); border: 1px solid #444; border-radius: 6px; padding: 10px; color: #fff; margin-bottom: 8px;"
            />
            <button
              onclick="window.quickAdd.addScriptTask()"
              class="button primary"
              style="padding: 10px 16px; background: #3b82f6; border: none; border-radius: 6px; color: #fff; cursor: pointer;">
              Add Task
            </button>
          </div>
        </div>
      `;

      this.attachEventListeners();

      // Load prompts for text expander
      this.loadPrompts();

      // Load scripts if in script mode
      if (this.mode === 'script') {
        this.loadScripts();
      }
    }

    attachEventListeners() {
      const promptField = document.getElementById('prompt-field');
      if (promptField) {
        promptField.addEventListener('keydown', (e) => this.handlePromptKeydown(e));
        promptField.addEventListener('input', (e) => this.handlePromptInput(e));
      }

      // Attach mode button listeners
      const llmBtn = document.querySelector('button[onclick*="setMode(\'llm\')"]');
      const scriptBtn = document.querySelector('button[onclick*="setMode(\'script\')"]');

      if (llmBtn) {
        llmBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.setMode('llm');
        });
      }

      if (scriptBtn) {
        scriptBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.setMode('script');
        });
      }

      const toolsBtn = document.getElementById('tools-btn');
      if (toolsBtn) {
        toolsBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleToolsPopup();
        });
      }

      const scriptAddBtn = document.querySelector('button[onclick*="addScriptTask()"]');
      if (scriptAddBtn) {
        scriptAddBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.addScriptTask();
        });
      }

      if (!this.documentClickHandler) {
        this.documentClickHandler = (e) => {
          if (!e.target.closest('.prompt-input-wrapper') && !e.target.closest('#tools-popup') && !e.target.closest('#text-expander-popup')) {
            this.closeToolsPopup();
            this.hidePopup();
          }
        };
        document.addEventListener('click', this.documentClickHandler);
      }
    }

    toggleToolsPopup() {
      const popup = document.getElementById('tools-popup');
      if (!popup) return;

      this.hidePopup();
      const isHidden = popup.style.display === 'none' || popup.style.display === '';
      popup.style.display = isHidden ? 'block' : 'none';
    }

    closeToolsPopup() {
      const popup = document.getElementById('tools-popup');
      if (popup) {
        popup.style.display = 'none';
      }
    }

    handlePromptKeydown(event) {
      // Handle autocomplete popup navigation
      if (this.popupVisible) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredPrompts.length - 1);
          this.renderPopup();
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
          this.renderPopup();
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          if (this.filteredPrompts[this.selectedIndex]) {
            this.selectPrompt(this.filteredPrompts[this.selectedIndex]);
          }
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          this.hidePopup();
          return;
        }
      }

      // Normal Enter to submit (only if popup not visible)
      if (event.key === 'Enter' && !event.shiftKey && !this.popupVisible) {
        event.preventDefault();
        this.addLLMTask();
      }
    }

    async showInstructions() {
      try {
        // Fetch current queue data to get instructions
        const queueResponse = await API.api('GET', `/api/queues/${this.queueId}`, null, { action: 'load queue' });
        const currentInstructions = queueResponse?.queue?.instructions || '';

        // Show modal with textarea
        const newInstructions = await Utils.showPrompt(
          `Queue Instructions for ${this.queueName}`,
          'Enter instructions for this queue (context, guardrails, scope):',
          currentInstructions,
          { textarea: true, rows: 10, placeholder: 'e.g., Project context, coding standards, scope boundaries, guardrails...' }
        );

        // Only update if user didn't cancel and value changed
        if (newInstructions !== null && newInstructions !== currentInstructions) {
          await this.saveInstructions(newInstructions);
        }
      } catch (err) {
        console.error('[QuickAdd] Failed to show instructions:', err);
        Utils.showToast('Failed to load queue instructions', 'error');
      }
    }

    async saveInstructions(instructions) {
      try {
        const trimmed = instructions.trim();
        await API.api(
          'PUT',
          `/api/queues/${this.queueId}`,
          { instructions: trimmed ? trimmed : '' },
          { action: 'update queue instructions' }
        );
        Utils.showToast(trimmed ? 'Queue instructions updated' : 'Queue instructions cleared', 'success');

        // Trigger refresh callback if set (will reload queue details including instructions display)
        if (this.refreshCallback) {
          this.refreshCallback();
        }
      } catch (err) {
        console.error('[QuickAdd] Failed to save instructions:', err);
        Utils.showToast('Failed to update instructions', 'error');
      }
    }

    async addLLMTask() {
      const promptField = document.getElementById('prompt-field');
      const prompt = promptField.value.trim();

      if (!prompt) {
        Utils.showToast('Please enter a prompt', 'error');
        return;
      }

      if (!this.queueId) {
        Utils.showToast('No queue selected', 'error');
        return;
      }

      const selectedTool = this.selectedTool || 'llm-haiku';

      try {
        const response = await API.api('POST', '/api/tasks/quick-add', {
          queue_id: this.queueId,
          mode: 'llm',
          prompt: prompt,
          tool_name: selectedTool
        }, { action: 'add task' });

        if (!response || !response.task_id) {
          throw new Error('Invalid response from server');
        }

        // Clear field
        promptField.value = '';

        // Show success (use friendly label if returned; keep short, extend duration)
        const usedTool = response.tool || selectedTool;
        const friendly = response.friendly_id || response.task_id;
        const toolLabel = await this.resolveToolLabel(usedTool);
        Utils.showToast(`Task ${friendly} added (${toolLabel})`, 'success', 4000);

        // Refresh if callback is set
        if (this.refreshCallback && typeof this.refreshCallback === 'function') {
          this.refreshCallback();
        }

      } catch (error) {
        console.error('Failed to add task:', error);
        Utils.showToast(error.message || 'Failed to add task', 'error');
      }
    }

    handleToolChange(event) {
      this.selectedTool = event?.target?.value || this.selectedTool || 'llm-haiku';
    }

    handlePromptFileChange(event) {
      const val = event?.target?.value || '';
      this.selectedPrompt = val;
      const promptField = document.getElementById('prompt-field');
      if (promptField && val) {
        promptField.value = `Run prompt ${val}`;
      }
    }

    async addScriptTask() {
      const scriptPath = document.getElementById('script-picker').value;
      const args = document.getElementById('script-args').value.trim();

      if (!scriptPath) {
        Utils.showToast('Please select a script', 'error');
        return;
      }

      if (!this.queueId) {
        Utils.showToast('No queue selected', 'error');
        return;
      }

      try {
        const response = await API.api('POST', '/api/tasks/quick-add', {
          queue_id: this.queueId,
          mode: 'script',
          script_path: scriptPath,
          script_args: args
        }, { action: 'add task' });

        if (!response || !response.task_id) {
          throw new Error('Invalid response from server');
        }

        // Clear fields
        document.getElementById('script-picker').value = '';
        document.getElementById('script-args').value = '';

        // Show success
        const tool = response.tool || 'script';
        const friendly = response.friendly_id || response.task_id;
        const toolLabel = await this.resolveToolLabel(tool);
        Utils.showToast(`Task ${friendly} added (${toolLabel})`, 'success', 4000);

        // Refresh if callback is set
        if (this.refreshCallback && typeof this.refreshCallback === 'function') {
          this.refreshCallback();
        }

      } catch (error) {
        console.error('Failed to add task:', error);
        Utils.showToast(error.message || 'Failed to add task', 'error');
      }
    }

    async loadScripts() {
      try {
        const response = await API.api('GET', '/api/scripts/index', null, { action: 'load scripts' });
        const scripts = response?.scripts || [];

        const picker = document.getElementById('script-picker');
        if (picker) {
          picker.innerHTML = '<option value="">Select a script...</option>' +
            scripts.map(s => `<option value="${s.path}">${s.name || s.path}</option>`).join('');
        }
      } catch (error) {
        console.error('Failed to load scripts:', error);
      }
    }

    async loadPrompts() {
      try {
        const response = await API.api('GET', '/api/prompts', null, { action: 'load prompts' });
        this.prompts = response?.prompts || [];
      } catch (error) {
        console.error('Failed to load prompts:', error);
        this.prompts = [];
      }
    }

    handlePromptInput(event) {
      const promptField = event.target;
      const text = promptField.value;
      const cursorPosition = promptField.selectionStart;

      const justTypedTrigger = text[cursorPosition - 1] === '>' &&
        (cursorPosition - 1 === 0 || text[cursorPosition - 2] === ' ' || text[cursorPosition - 2] === '\n');

      if (justTypedTrigger) {
        this.triggerPosition = cursorPosition - 1;
        this.showPopup();
        return;
      }

      const hasTrigger = this.triggerPosition !== -1 && text[this.triggerPosition] === '>';
      const triggerContextValid = hasTrigger && (this.triggerPosition === 0 || text[this.triggerPosition - 1] === ' ' || text[this.triggerPosition - 1] === '\n');

      if (!hasTrigger) {
        this.triggerPosition = -1;
      }

      if (!this.popupVisible && triggerContextValid) {
        const searchArea = text.slice(this.triggerPosition + 1, cursorPosition);
        if (cursorPosition <= this.triggerPosition || /\s/.test(searchArea)) {
          this.triggerPosition = -1;
          return;
        }

        this.popupVisible = true;
        this.filterPrompts(searchArea.trim());
        return;
      }

      if (this.popupVisible) {
        if (!triggerContextValid || cursorPosition <= this.triggerPosition) {
          this.triggerPosition = -1;
          this.hidePopup();
          return;
        }

        const searchArea = text.slice(this.triggerPosition + 1, cursorPosition);
        if (/\s/.test(searchArea)) {
          this.triggerPosition = -1;
          this.hidePopup();
          return;
        }

        this.filterPrompts(searchArea.trim());
      }
    }

    showPopup() {
      this.closeToolsPopup();
      this.popupVisible = true;
      this.selectedIndex = 0;
      this.filterPrompts('');
    }

    hidePopup() {
      this.popupVisible = false;
      const popup = document.getElementById('text-expander-popup');
      if (popup) {
        popup.style.display = 'none';
      }
    }

    filterPrompts(searchText) {
      const query = (searchText || '').toLowerCase();
      this.filteredPrompts = this.prompts.filter((p) => (p.command || '').toLowerCase().includes(query));
      this.selectedIndex = Math.min(this.selectedIndex, Math.max(this.filteredPrompts.length - 1, 0));
      this.renderPopup();
    }

    renderPopup() {
      const popup = document.getElementById('text-expander-popup');
      const listContainer = document.getElementById('prompt-list-container');

      if (!popup || !listContainer) return;

      if (!this.filteredPrompts || this.filteredPrompts.length === 0) {
        this.hidePopup();
        return;
      }

      listContainer.innerHTML = this.filteredPrompts.map((prompt, index) => {
        const isSelected = index === this.selectedIndex;
        const itemStyle = `padding: 10px 12px; cursor: pointer; display: flex; gap: 10px; align-items: flex-start; ${isSelected ? 'background: rgba(59, 130, 246, 0.1);' : ''}`;
        return `
          <div class="prompt-item" data-index="${index}" style="${itemStyle}" onclick="window.quickAdd.selectPromptByIndex(${index})">
            <div class="prompt-icon" style="font-size: 16px; margin-top: 2px;">📝</div>
            <div class="prompt-details" style="flex: 1;">
              <div class="prompt-command" style="font-family: SFMono-Regular, Menlo, monospace; font-size: 13px; color: #e5e7eb;">>${prompt.command || ''}</div>
              ${prompt.description ? `<div class="prompt-description" style="font-size: 12px; color: #a1a1aa; margin-top: 2px;">${prompt.description}</div>` : ''}
            </div>
          </div>
        `;
      }).join('');

      const items = listContainer.querySelectorAll('.prompt-item');
      items.forEach((item) => {
        const index = Number(item.getAttribute('data-index'));
        item.addEventListener('mouseenter', () => {
          this.selectedIndex = index;
          this.renderPopup();
        });
      });

      popup.style.display = 'block';
    }

    selectPromptByIndex(index) {
      this.selectedIndex = index;
      this.selectPrompt(this.filteredPrompts[index]);
    }

    async selectPrompt(prompt) {
      if (!prompt) return;

      const promptField = document.getElementById('prompt-field');
      if (!promptField) return;

      const text = promptField.value;
      const triggerPos = this.triggerPosition;
      if (triggerPos === -1 || text[triggerPos] !== '>') {
        this.hidePopup();
        return;
      }

      let endPos = text.length;
      for (let i = triggerPos + 1; i < text.length; i++) {
        if (text[i] === ' ' || text[i] === '\n') {
          endPos = i;
          break;
        }
      }

      try {
        const response = await API.api('GET', `/api/prompts/${prompt.id}`, null, { action: 'load prompt' });
        const templateText = response?.prompt?.template_text || '';
        const before = text.slice(0, triggerPos);
        const after = text.slice(endPos);
        promptField.value = `${before}${templateText}${after}`;
        const newCursor = before.length + templateText.length;
        promptField.selectionStart = newCursor;
        promptField.selectionEnd = newCursor;
        promptField.focus();
      } catch (error) {
        console.error('Failed to select prompt:', error);
      } finally {
        this.hidePopup();
      }
    }
  }

  // Export to window
  window.QuickAdd = QuickAdd;

})(window);
