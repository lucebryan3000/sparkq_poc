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

  // === Toast Notifications ===

  function showToast(message, type = 'success') {
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

    // Trigger animation
    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    }, 10);

    // Auto-dismiss
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
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

      this.refresh();
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
  window.Utils.showToast = showToast;
  window.Utils.AutoRefresh = AutoRefresh;

})(window);
