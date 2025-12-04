(function(window) {
  'use strict';

  /**
   * UI UTILITIES MODULE
   * ===================
   * Shared utilities for the SparkQ UI. All functions are exported to window.Utils.
   *
   * MODULE ALIASING PATTERN:
   * Page modules may alias frequently-used functions at the top:
   *   const showToast = Utils.showToast;
   *   const formatTimestamp = Utils.formatTimestamp;
   *
   * For new code, prefer direct calls (Utils.functionName()) for clarity,
   * unless the function is used many times in the file.
   *
   * TOAST NOTIFICATIONS (showToast):
   * - Bottom-right corner, auto-dismiss (2-4 seconds)
   * - Use for transient action feedback: "Saved!", "Copied!", "Failed to update"
   * - Types: 'success' (default), 'error', 'info', 'warning'
   * - See app-core.js for ALERT notifications (showError/showAlert) which are
   *   top-right and require dismissal for critical errors.
   */

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

      // Absolute for older times - uses browser's local timezone
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

  const MAX_TOASTS = 4;
  let activeToasts = [];
  let toastContainer = null;

  function getToastContainer() {
    if (toastContainer && document.body.contains(toastContainer)) {
      return toastContainer;
    }
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    toastContainer.setAttribute('aria-live', 'polite');
    toastContainer.setAttribute('aria-label', 'Notifications');
    document.body.appendChild(toastContainer);
    return toastContainer;
  }

  function showToast(message, type = 'success', durationMs = 2000) {
    const duration = Number(durationMs);
    const timeoutMs = Number.isFinite(duration) && duration > 0 ? duration : 2000;
    const container = getToastContainer();

    // If we already have max toasts, remove the oldest one
    if (activeToasts.length >= MAX_TOASTS) {
      const oldestToast = activeToasts.shift();
      oldestToast.style.opacity = '0';
      oldestToast.style.transform = 'translateY(20px)';
      setTimeout(() => oldestToast.remove(), 300);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'status');

    const removeToast = (el) => {
      if (!el) return;
      el.classList.remove('toast-show');
      setTimeout(() => {
        el.remove();
        activeToasts = activeToasts.filter((t) => t !== el);
      }, 300);
    };

    container.appendChild(toast);
    activeToasts.push(toast);

    requestAnimationFrame(() => {
      toast.classList.add('toast-show');
    });

    setTimeout(() => removeToast(toast), timeoutMs);
  }

  // === Modal Dialog System ===

  /**
   * Creates a focus trap within a container element.
   * Tab/Shift+Tab will cycle through focusable elements without leaving the container.
   * @param {HTMLElement} container - The element to trap focus within
   * @returns {Function} Cleanup function to remove the trap
   */
  function createFocusTrap(container) {
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    function handleKeydown(e) {
      if (e.key !== 'Tab') return;

      const focusableElements = Array.from(container.querySelectorAll(focusableSelector))
        .filter(el => !el.disabled && el.offsetParent !== null);

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: if on first element, wrap to last
        if (document.activeElement === firstElement || document.activeElement === container) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: if on last element, wrap to first
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }

    container.addEventListener('keydown', handleKeydown);
    return () => container.removeEventListener('keydown', handleKeydown);
  }

  function createModalOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'modal modal-overlay';
    overlay.setAttribute('role', 'presentation');
    overlay.style.opacity = '0';
    return overlay;
  }

  function showModal(title, content, buttons = []) {
    return new Promise((resolve) => {
      const overlay = createModalOverlay();
      const modal = document.createElement('div');
      modal.className = 'modal-content';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.style.transform = 'scale(0.95)';
      modal.tabIndex = -1;

      // Generate unique ID for aria-labelledby
      const titleId = `modal-title-${Date.now()}`;

      let resolved = false;
      let primaryButton = null;
      let handleKeydown = null;
      let allowOverlayClose = false;
      let removeFocusTrap = null;
      const previouslyFocused = document.activeElement;

      const finish = (value = null) => {
        if (resolved) return;
        resolved = true;
        overlay.classList.remove('visible');
        modal.style.transform = 'scale(0.95)';

        // Clean up focus trap
        if (removeFocusTrap) {
          removeFocusTrap();
        }

        setTimeout(() => overlay.remove(), 250);
        if (handleKeydown) {
          document.removeEventListener('keydown', handleKeydown);
        }

        // Return focus to previously focused element
        if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
          previouslyFocused.focus();
        }

        resolve(value);
      };

      if (title) {
        const header = document.createElement('div');
        header.className = 'modal-header';

        const titleEl = document.createElement('h2');
        titleEl.className = 'modal-title';
        titleEl.id = titleId;
        titleEl.textContent = title;
        modal.setAttribute('aria-labelledby', titleId);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'modal-close-button';
        closeBtn.setAttribute('aria-label', 'Close dialog');
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', () => finish(null));

        header.appendChild(titleEl);
        header.appendChild(closeBtn);
        modal.appendChild(header);
      }

      const contentEl = document.createElement('div');
      contentEl.className = 'modal-body';
      if (typeof content === 'string') {
        const paragraph = document.createElement('p');
        paragraph.textContent = content;
        paragraph.classList.add('muted');
        paragraph.style.margin = '0 0 12px';
        contentEl.appendChild(paragraph);
      } else {
        contentEl.appendChild(content);
      }
      modal.appendChild(contentEl);

      if (buttons.length > 0) {
        const footerEl = document.createElement('div');
        footerEl.className = 'modal-footer';
        const buttonsEl = document.createElement('div');
        buttonsEl.className = 'modal-actions';
        buttons.forEach(btn => {
          const button = document.createElement('button');
          button.type = btn.type || 'button';
          button.className = `button ${btn.primary ? 'primary' : 'secondary'}`;
          button.textContent = btn.label;
          if (btn.primary) {
            primaryButton = button;
          }
          button.addEventListener('click', (e) => {
            e.preventDefault();
            const value = typeof btn.value === 'function' ? btn.value() : btn.value;
            if (typeof btn.onclick === 'function') {
              btn.onclick();
            }
            finish(value ?? null);
          });
          buttonsEl.appendChild(button);
        });
        footerEl.appendChild(buttonsEl);
        modal.appendChild(footerEl);
      }

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Set up focus trap for accessibility
      removeFocusTrap = createFocusTrap(modal);

      handleKeydown = (e) => {
        if (e.key === 'Escape') {
          finish(null);
        } else if (e.key === 'Enter' && primaryButton) {
          e.preventDefault();
          primaryButton.click();
        }
      };

      requestAnimationFrame(() => {
        overlay.classList.add('visible');
        modal.style.transform = 'scale(1)';

        // Focus the first focusable element, or the modal itself
        const firstFocusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) {
          firstFocusable.focus({ preventScroll: true });
        } else {
          modal.focus({ preventScroll: true });
        }

        // Enable overlay close shortly after open to avoid the initial click re-closing it
        setTimeout(() => {
          allowOverlayClose = true;
        }, 60);
      });

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay && allowOverlayClose) {
          finish(null);
        }
      });

      document.addEventListener("keydown", handleKeydown);
    });
  }

  function showPrompt(title, message, defaultValue = '', options = {}) {
    return new Promise((resolve) => {
      const contentEl = document.createElement('div');

      const messageEl = document.createElement('p');
      messageEl.textContent = message;
      messageEl.classList.add('muted');
      messageEl.style.margin = '0 0 12px';
      contentEl.appendChild(messageEl);

      const input = document.createElement('input');
      input.type = options.type || 'text';
      input.value = defaultValue;
      input.placeholder = options.placeholder || '';
      input.classList.add('form-control');
      input.style.width = '100%';
      input.style.boxSizing = 'border-box';
      if (options.textarea) {
        const textarea = document.createElement('textarea');
        textarea.value = defaultValue;
        textarea.placeholder = options.placeholder || '';
        textarea.rows = options.rows || 4;
        textarea.classList.add('form-control');
        textarea.style.width = '100%';
        textarea.style.boxSizing = 'border-box';
        textarea.style.minHeight = '100px';
        textarea.style.fontFamily = 'ui-monospace, monospace';
        textarea.style.lineHeight = '1.5';
        contentEl.appendChild(textarea);
      } else {
        contentEl.appendChild(input);
      }

      const getValue = () => {
        if (options.textarea) {
          const textareaEl = contentEl.querySelector('textarea');
          return textareaEl ? textareaEl.value : '';
        }
        return input.value;
      };

      const buttons = [
        {
          label: 'Cancel',
          value: null,
        },
        {
          label: 'OK',
          primary: true,
          value: getValue,
        }
      ];

      showModal(title, contentEl, buttons).then((result) => {
        resolve(result ?? null);
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
          value: false,
        },
        {
          label: options.confirmLabel || 'OK',
          primary: true,
          value: true,
        }
      ];

      showModal(title, message, buttons).then((result) => {
        resolve(Boolean(result));
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
