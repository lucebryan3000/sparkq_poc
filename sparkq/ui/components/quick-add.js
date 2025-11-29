(function(window) {
  'use strict';

  const API = window.API;
  const Utils = window.Utils;

  class QuickAdd {
    constructor(containerId, streamId, streamName) {
      this.containerId = containerId;
      this.streamId = streamId;
      this.streamName = streamName;
      this.mode = 'llm';  // Default mode
      this.refreshCallback = null;
    }

    setStream(streamId, streamName) {
      this.streamId = streamId;
      this.streamName = streamName;
      this.render();
    }

    setMode(mode) {
      this.mode = mode;
      this.render();
    }

    setRefreshCallback(callback) {
      this.refreshCallback = callback;
    }

    render() {
      const container = document.getElementById(this.containerId);
      if (!container) return;

      container.innerHTML = `
        <div class="quick-add-bar" style="background: rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <div class="stream-indicator" style="font-size: 12px; color: #888; margin-bottom: 12px;">
            Add to stream: <strong style="color: #3b82f6;">${this.streamName || 'Select a stream'}</strong>
          </div>

          <div class="mode-toggle" style="display: flex; gap: 8px; margin-bottom: 12px;">
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

          <div id="llm-input" class="input-area" style="display: ${this.mode === 'llm' ? 'block' : 'none'}">
            <textarea
              id="prompt-field"
              placeholder="Describe what you want Claude to do... (Press Enter to add)"
              rows="3"
              style="width: 100%; background: rgba(0, 0, 0, 0.3); border: 1px solid #444; border-radius: 6px; padding: 12px; color: #fff; font-size: 14px; font-family: inherit; resize: vertical; min-height: 60px;"
            ></textarea>
            <div class="hint" style="font-size: 11px; color: #666; margin-top: 4px;">Press Enter to add | Shift+Enter for new line</div>
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

      // Attach event listeners
      const promptField = document.getElementById('prompt-field');
      if (promptField) {
        promptField.addEventListener('keydown', (e) => this.handlePromptKeydown(e));
      }

      // Load scripts if in script mode
      if (this.mode === 'script') {
        this.loadScripts();
      }
    }

    handlePromptKeydown(event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.addLLMTask();
      }
    }

    async addLLMTask() {
      const promptField = document.getElementById('prompt-field');
      const prompt = promptField.value.trim();

      if (!prompt) {
        Utils.showToast('Please enter a prompt', 'error');
        return;
      }

      if (!this.streamId) {
        Utils.showToast('No stream selected', 'error');
        return;
      }

      try {
        const response = await API.api('POST', '/api/tasks/quick-add', {
          stream_id: this.streamId,
          mode: 'llm',
          prompt: prompt
        }, { action: 'add task' });

        if (!response || !response.task_id) {
          throw new Error('Invalid response from server');
        }

        // Clear field
        promptField.value = '';

        // Show success
        const tool = response.tool || 'llm';
        Utils.showToast(`Task #${response.task_id} added (${tool})`);

        // Refresh if callback is set
        if (this.refreshCallback && typeof this.refreshCallback === 'function') {
          this.refreshCallback();
        }

      } catch (error) {
        console.error('Failed to add task:', error);
        Utils.showToast(error.message || 'Failed to add task', 'error');
      }
    }

    async addScriptTask() {
      const scriptPath = document.getElementById('script-picker').value;
      const args = document.getElementById('script-args').value.trim();

      if (!scriptPath) {
        Utils.showToast('Please select a script', 'error');
        return;
      }

      if (!this.streamId) {
        Utils.showToast('No stream selected', 'error');
        return;
      }

      try {
        const response = await API.api('POST', '/api/tasks/quick-add', {
          stream_id: this.streamId,
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
        Utils.showToast(`Task #${response.task_id} added (${tool})`);

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
        const response = await API.api('GET', '/api/scripts', null, { action: 'load scripts' });
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
  }

  // Export to window
  window.QuickAdd = QuickAdd;

})(window);
