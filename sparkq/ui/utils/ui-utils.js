(function(window) {
  'use strict';

  // === Timestamp Formatting ===

  function formatTimestamp(isoString) {
    if (!isoString) return '—';

    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return '—';

      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      // Relative for recent times
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      // Absolute for older times
      const options = {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      };
      return date.toLocaleString('en-US', options);
    } catch (e) {
      return '—';
    }
  }

  function formatDuration(seconds) {
    if (!seconds || seconds < 0) return '—';

    if (seconds < 60) return `${seconds}s`;

    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    if (mins < 60) {
      return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }

    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;

    if (remainMins > 0) {
      return `${hours}h ${remainMins}m`;
    }
    return `${hours}h`;
  }

  // === Tool friendly names ===

  function prettifyToolName(name) {
    if (!name) return '—';
    return String(name)
      .replace(/[-_]+/g, ' ')
      .split(' ')
      .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ''))
      .join(' ')
      .trim();
  }

  let toolNameCache = null;
  let toolNamePromise = null;

  async function loadFriendlyToolNames(force = false) {
    if (!force && toolNameCache) {
      return toolNameCache;
    }
    if (!force && toolNamePromise) {
      return toolNamePromise;
    }

    const api = window.API?.api;
    if (!api) {
      toolNameCache = toolNameCache || {};
      return toolNameCache;
    }

    toolNamePromise = api('GET', '/api/tools', null, { action: 'load tools' })
      .then((res) => {
        const cache = {};
        (res?.tools || []).forEach((tool) => {
          const name = tool?.name;
          if (!name) return;
          cache[name] = tool?.description || prettifyToolName(name);
        });
        toolNameCache = cache;
        return toolNameCache;
      })
      .catch((err) => {
        console.error('Failed to load tools for friendly names:', err);
        toolNameCache = toolNameCache || {};
        return toolNameCache;
      })
      .finally(() => {
        toolNamePromise = null;
      });

    return toolNamePromise;
  }

  function getFriendlyToolName(toolName) {
    if (!toolName) return '—';
    const friendly = toolNameCache?.[toolName];
    if (friendly) return friendly;
    return prettifyToolName(toolName);
  }

  // === Toast Notifications ===

  const MAX_TOASTS = 2;
  let activeToasts = [];

  function showToast(message, type = 'success', durationMs = 2000) {
    const duration = Number(durationMs);
    const timeoutMs = Number.isFinite(duration) && duration > 0 ? duration : 2000;
    // If we already have 2 toasts, remove the oldest one
    if (activeToasts.length >= MAX_TOASTS) {
      const oldestToast = activeToasts.shift();
      oldestToast.style.opacity = '0';
      oldestToast.style.transform = 'translateY(20px)';
      setTimeout(() => oldestToast.remove(), 300);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      opacity: 0;
      transform: translateY(20px);
      transition: all 0.3s ease;
      z-index: 10000;
      font-size: 14px;
      color: white;
      max-width: 300px;
    `;

    // Set background based on type
    const colors = {
      'success': '#10b981',
      'error': '#ef4444',
      'warning': '#f59e0b',
      'info': '#3b82f6'
    };
    toast.style.background = colors[type] || colors.success;

    document.body.appendChild(toast);
    activeToasts.push(toast);

    // Trigger animation
    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    }, 10);

    // Auto-dismiss
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      setTimeout(() => {
        toast.remove();
        activeToasts = activeToasts.filter(t => t !== toast);
      }, 300);
    }, timeoutMs);
  }

  // === Modal Dialog System ===

  function createModalOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    return overlay;
  }

  function showModal(title, content, buttons = []) {
    return new Promise((resolve) => {
      const overlay = createModalOverlay();
      const modal = document.createElement('div');
      modal.className = 'modal-content';
      modal.style.cssText = `
        background: var(--surface, #1a1a1a);
        border: 1px solid var(--border, #333);
        border-radius: 12px;
        padding: 24px;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
        transform: scale(0.95);
        transition: transform 0.3s ease;
        color: var(--text, #fff);
      `;

      // Close function
      const closeModal = () => {
        overlay.style.opacity = '0';
        modal.style.transform = 'scale(0.95)';
        setTimeout(() => overlay.remove(), 300);
      };

      // Title
      if (title) {
        const titleEl = document.createElement('h2');
        titleEl.style.cssText = `
          margin: 0 0 16px 0;
          font-size: 20px;
          font-weight: 600;
          color: var(--text, #fff);
        `;
        titleEl.textContent = title;
        modal.appendChild(titleEl);
      }

      // Content
      const contentEl = document.createElement('div');
      contentEl.style.cssText = `
        margin-bottom: 24px;
        color: var(--text-secondary, #ccc);
        line-height: 1.5;
      `;
      if (typeof content === 'string') {
        contentEl.textContent = content;
      } else {
        contentEl.appendChild(content);
      }
      modal.appendChild(contentEl);

      // Buttons
      let primaryButton = null;
      if (buttons.length > 0) {
        const buttonsEl = document.createElement('div');
        buttonsEl.style.cssText = `
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        `;
        buttons.forEach(btn => {
          const button = document.createElement('button');
          button.textContent = btn.label;
          button.style.cssText = `
            padding: 10px 20px;
            border-radius: 6px;
            border: 1px solid var(--border, #333);
            background: ${btn.primary ? 'var(--primary, #3b82f6)' : 'var(--surface-2, #252525)'};
            color: ${btn.primary ? '#fff' : 'var(--text, #fff)'};
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s ease;
          `;
          button.onmouseover = () => {
            button.style.opacity = '0.8';
          };
          button.onmouseout = () => {
            button.style.opacity = '1';
          };
          button.onclick = (e) => {
            e.preventDefault();
            closeModal();
            if (btn.onclick) btn.onclick();
            resolve(null);
          };
          if (btn.primary) {
            primaryButton = button;
          }
          buttonsEl.appendChild(button);
        });
        modal.appendChild(buttonsEl);
      }

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Animate in
      setTimeout(() => {
        overlay.style.opacity = '1';
        modal.style.transform = 'scale(1)';
      }, 10);

      // Click overlay to close
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          closeModal();
          resolve(null);
        }
      });

      // ESC to close, Enter to submit primary button
      const handleKeydown = (e) => {
        if (e.key === 'Escape') {
          closeModal();
          resolve(null);
        } else if (e.key === 'Enter' && primaryButton) {
          e.preventDefault();
          primaryButton.click();
        }
      };
      document.addEventListener('keydown', handleKeydown);
    });
  }

  function showPrompt(title, message, defaultValue = '', options = {}) {
    return new Promise((resolve) => {
      const contentEl = document.createElement('div');

      const messageEl = document.createElement('p');
      messageEl.textContent = message;
      messageEl.style.cssText = `
        margin: 0 0 12px 0;
        color: var(--text-secondary, #ccc);
      `;
      contentEl.appendChild(messageEl);

      const input = document.createElement('input');
      input.type = options.type || 'text';
      input.value = defaultValue;
      input.placeholder = options.placeholder || '';
      input.style.cssText = `
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--border, #333);
        border-radius: 6px;
        background: var(--surface-2, #252525);
        color: var(--text, #fff);
        font-size: 14px;
        box-sizing: border-box;
      `;
      if (options.textarea) {
        const textarea = document.createElement('textarea');
        textarea.value = defaultValue;
        textarea.placeholder = options.placeholder || '';
        textarea.style.cssText = `
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--border, #333);
          border-radius: 6px;
          background: var(--surface-2, #252525);
          color: var(--text, #fff);
          font-size: 14px;
          box-sizing: border-box;
          min-height: 100px;
          font-family: inherit;
        `;
        contentEl.appendChild(textarea);
      } else {
        contentEl.appendChild(input);
      }

      // Don't try to call closeModal from buttons - just resolve the promise
      const buttons = [
        {
          label: 'Cancel',
          onclick: () => {
            resolve(null);
          }
        },
        {
          label: 'OK',
          primary: true,
          onclick: () => {
            const value = options.textarea ? contentEl.querySelector('textarea').value : input.value;
            resolve(value);
          }
        }
      ];

      showModal(title, contentEl, buttons).then((result) => {
        if (result === undefined) {
          resolve(null);
        }
      });

      // Focus input
      setTimeout(() => {
        const inputEl = options.textarea ? contentEl.querySelector('textarea') : input;
        inputEl.focus();
        if (!options.textarea) {
          inputEl.select();
        }
      }, 100);
    });
  }

  function showConfirm(title, message, options = {}) {
    return new Promise((resolve) => {
      const buttons = [
        {
          label: options.cancelLabel || 'Cancel',
          onclick: () => {
            resolve(false);
          }
        },
        {
          label: options.confirmLabel || 'OK',
          primary: true,
          onclick: () => {
            resolve(true);
          }
        }
      ];

      showModal(title, message, buttons).then(() => {
        resolve(false);
      });
    });
  }

  // === Auto-Refresh Manager ===

  class AutoRefresh {
    constructor(interval = 60000) {
      this.interval = interval;
      this.intervalId = null;
      this.counterIntervalId = null;
      this.lastRefreshTime = Date.now();
      this.callbacks = [];
    }

    start() {
      // Don't start if already running
      if (this.intervalId) {
        return;
      }

      // Set initial timestamp without calling refresh callbacks
      this.lastRefreshTime = Date.now();

      // Start intervals (don't call refresh() immediately to avoid infinite loop)
      this.intervalId = setInterval(() => this.refresh(), this.interval);

      // Update counter every second
      this.counterIntervalId = setInterval(() => this.updateCounter(), 1000);
    }

    stop() {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      if (this.counterIntervalId) {
        clearInterval(this.counterIntervalId);
        this.counterIntervalId = null;
      }
    }

    refresh() {
      this.lastRefreshTime = Date.now();
      this.callbacks.forEach(cb => {
        try {
          cb();
        } catch (e) {
          console.error('AutoRefresh callback error:', e);
        }
      });

      // Spin refresh button if it exists
      const refreshBtn = document.getElementById('refresh-btn');
      if (refreshBtn) {
        refreshBtn.classList.add('spinning');
        setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
      }

      // Update counter immediately
      this.updateCounter();
    }

    updateCounter() {
      const secondsAgo = Math.floor((Date.now() - this.lastRefreshTime) / 1000);
      const counter = document.getElementById('refresh-counter');
      if (counter) {
        counter.textContent = secondsAgo === 0 ? 'Just now' : `${secondsAgo}s ago`;
      }
    }

    addCallback(callback) {
      if (typeof callback === 'function') {
        this.callbacks.push(callback);
      }
    }
  }

  // === Export to window ===
  // Extend existing Utils object instead of replacing it

  if (!window.Utils) {
    window.Utils = {};
  }

  // Add new utility functions to existing Utils
  window.Utils.formatTimestamp = formatTimestamp;
  window.Utils.formatDuration = formatDuration;
  window.Utils.prettifyToolName = prettifyToolName;
  window.Utils.loadFriendlyToolNames = loadFriendlyToolNames;
  window.Utils.getFriendlyToolName = getFriendlyToolName;
  window.Utils.showToast = showToast;
  window.Utils.showModal = showModal;
  window.Utils.showPrompt = showPrompt;
  window.Utils.showConfirm = showConfirm;
  window.Utils.AutoRefresh = AutoRefresh;

})(window);
