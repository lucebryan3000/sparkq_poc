# Phase 9: UI/UX Enhancement - Web Dashboard Functionality Review

**Objective**: Review and enhance the SparkQ web UI to ensure it provides comprehensive access to all CLI functions and delivers a seamless, intuitive user experience.

**Status**: Ready for implementation with Claude Sonnet

---

## Executive Summary

SparkQ currently has a working web dashboard (`/ui/`) with basic functionality, but there's a significant feature gap between what the CLI can do and what the UI exposes. The goal of Phase 9 is to audit the current UI/UX, identify missing core functions, and implement a comprehensive dashboard that mirrors and enhances the CLI experience.

---

## Current State Analysis

### CLI Capabilities (Complete)
The SparkQ CLI provides these command groups:
- **Setup & Config**: `setup`, `reload`
- **Server Management**: `run`, `stop`, `status`
- **Sessions**: `create`, `list`, `end`
- **Streams**: `create`, `list`, `end`
- **Tasks**: `enqueue`, `peek`, `claim`, `complete`, `fail`, `tasks`, `task`, `requeue`, `purge`
- **Scripts**: `list`, `search`

### Current UI Implementation
- **Status**: Basic framework exists
- **Pages**: Dashboard, Sessions, Streams, Tasks, Enqueue
- **Features**:
  - ✅ Dashboard (health, stats overview)
  - ✅ Sessions management (view, create)
  - ✅ Streams listing
  - ✅ Tasks listing with filters
  - ✅ Task enqueue form
- **Gaps**:
  - ❌ Task details/inspection view
  - ❌ Stream management (create, end)
  - ❌ Task lifecycle operations (claim, complete, fail, requeue)
  - ❌ Script discovery/search interface
  - ❌ Configuration viewer
  - ❌ Error states and edge cases
  - ❌ Real-time updates for task status
  - ❌ Batch operations
  - ❌ Actionable task operations

---

## Phase 9 Scope

### 1. Feature Parity Review

Map every CLI function to a corresponding UI component:

#### Sessions Management
- [ ] List sessions with status (active/ended)
- [ ] Create new session with name
- [ ] End active session
- [ ] Session detail view (streams, task count)
- [ ] Session filtering by status

#### Streams Management
- [ ] List streams with filters (session, status)
- [ ] Create new stream in selected session
- [ ] Stream detail view (tasks, instructions)
- [ ] End active stream
- [ ] Search/filter streams

#### Tasks Management
- [ ] List tasks with comprehensive filters
  - By stream
  - By status (queued, running, succeeded, failed)
  - By date range
- [ ] Task detail modal/panel showing:
  - Full task info (ID, status, timestamps)
  - Payload/prompt content
  - Execution history
  - Timeout info
  - Attempt count
- [ ] Task lifecycle actions from UI:
  - **Peek**: View next task without claiming
  - **Claim**: Take ownership of task (mark running)
  - **Complete**: Mark as succeeded with result
  - **Fail**: Mark as failed with error reason
  - **Requeue**: Move back to queued
- [ ] Bulk operations:
  - Fail multiple tasks
  - Requeue multiple tasks
  - Purge old tasks
- [ ] Real-time task status updates
- [ ] Task result/output viewing

#### Enqueue Workflow
- [ ] Stream selector (filtered by session)
- [ ] Tool selector from registry
- [ ] Task class selector with timeout display
- [ ] Prompt file upload or paste
- [ ] Metadata JSON editor
- [ ] Enqueue confirmation
- [ ] Success feedback with task ID

#### Configuration
- [ ] View current `sparkq.yml` settings
- [ ] Display tool registry (tools, timeouts, classes)
- [ ] Display task classes (names, timeouts)
- [ ] Display server settings (port, database)
- [ ] (Optional) Live configuration updates

#### Scripts Discovery
- [ ] List all available scripts
- [ ] Search scripts (name, description, tags)
- [ ] Script detail view
- [ ] Link scripts to tasks for documentation

### 2. UX/DX Improvements

#### Navigation & Information Architecture
- [ ] Clear logical page flow (Sessions → Streams → Tasks)
- [ ] Breadcrumb navigation for context
- [ ] Quick-access shortcuts
- [ ] Sidebar or collapsible menu
- [ ] Search/filter available on every list

#### Status & Feedback
- [ ] Real-time server status indicator
- [ ] Task status badges with clear visual hierarchy
- [ ] Operation success/error notifications
- [ ] Loading states for async operations
- [ ] Empty state messaging (no tasks, no sessions, etc.)
- [ ] Confirmation dialogs for destructive actions

#### Task Management UX
- [ ] Sortable columns (by date, status, tool)
- [ ] Paginated task lists (for performance)
- [ ] Quick task preview on hover
- [ ] Inline task actions (peek, claim, fail, complete)
- [ ] Modal for detailed task inspection
- [ ] Copy-to-clipboard for task IDs
- [ ] Task execution timeline/history

#### Forms & Input
- [ ] Form validation with clear error messages
- [ ] Helpful hints for each field
- [ ] Dropdown/select for finite options (sessions, streams, tools)
- [ ] Rich text editor for prompt/result input
- [ ] JSON validator for metadata
- [ ] Character counters for long inputs

#### Responsiveness & Accessibility
- [ ] Mobile-friendly layout (works on tablets/phones)
- [ ] Keyboard navigation support
- [ ] ARIA labels and semantic HTML
- [ ] High contrast mode friendly
- [ ] Touch-friendly button sizing

### 3. Performance & Reliability

- [ ] Lazy load task lists (pagination or infinite scroll)
- [ ] Debounced filtering/searching
- [ ] Caching of session/stream lists
- [ ] Graceful error handling for API failures
- [ ] Offline detection and messaging
- [ ] Auto-retry for failed API calls
- [ ] Request timeout handling

### 4. Data Display & Visualization

- [ ] Dashboard stats:
  - Sessions (total, active)
  - Streams (total, active)
  - Tasks (queued, running, succeeded, failed)
  - Uptime, version
- [ ] Task timeline/status visualization
- [ ] Stream overview (tasks per stream)
- [ ] Session activity indicators
- [ ] Error rate/failure trends (if data available)

---

## Implementation Guidelines

### Code Organization
```
sparkq/ui/
├── index.html          # Main template
├── app.js              # Core app logic, router, state management
├── style.css           # Styling
├── components/         # (NEW) Reusable UI components
│   ├── session-list.js
│   ├── stream-list.js
│   ├── task-table.js
│   ├── task-detail.js
│   └── task-actions.js
├── pages/              # (NEW) Page-specific code
│   ├── dashboard.js
│   ├── sessions-page.js
│   ├── streams-page.js
│   ├── tasks-page.js
│   ├── enqueue-page.js
│   └── config-page.js
├── api/                # (NEW) API client functions
│   └── client.js       # Fetch wrapper, error handling
└── utils/              # (NEW) Utilities
    ├── formatting.js   # Date, status formatting
    ├── validation.js   # Form validation
    └── state.js        # State management helpers
```

### Design System
- Color scheme: Dark/light mode support
- Consistent spacing and typography
- Reusable component library (buttons, cards, tables, modals)
- Status color coding:
  - Queued: Gray
  - Running: Blue
  - Succeeded: Green
  - Failed: Red

### API Integration
- Use REST API endpoints (already implemented in `api.py`)
- Handle errors gracefully with user-friendly messages
- Implement request caching where appropriate
- Support real-time updates (polling or WebSocket optional)

### Testing Recommendations
- Visual regression testing (compare before/after)
- E2E testing with Playwright/Selenium for key flows
- Accessibility audit with aXe or similar
- Performance testing (load times, network requests)
- Mobile testing across devices

---

## Success Criteria

### Functionality
- ✅ All CLI commands have equivalent UI operations
- ✅ Tasks can be managed entirely from UI (claim, complete, fail, requeue)
- ✅ Sessions and streams can be created and managed
- ✅ Users can enqueue tasks with full payload support
- ✅ Task details are fully visible and inspectable

### UX
- ✅ First-time users understand the workflow
- ✅ Common tasks (claim, complete task) take < 3 clicks
- ✅ Status is always clear (task state, server health, operation results)
- ✅ Error messages are helpful and actionable
- ✅ No network errors cause crashes (graceful handling)

### Performance
- ✅ Pages load in < 2 seconds
- ✅ Task lists show < 100ms latency when filtering
- ✅ Supports at least 10,000 tasks without lag
- ✅ No memory leaks on long sessions

### Accessibility
- ✅ WCAG 2.1 AA compliant
- ✅ Keyboard navigable
- ✅ Screen reader friendly
- ✅ Color-blind friendly (not relying on color alone)

---

## Implementation Roadmap

### Priority 1 (Critical Path)
1. Refactor UI architecture (modular components)
2. Implement task detail view with inline actions
3. Add task lifecycle operations (claim, complete, fail)
4. Improve error handling and status messaging
5. Add real-time task updates

### Priority 2 (Core Functionality)
6. Implement stream management (create, end, detail)
7. Add configuration viewer
8. Improve enqueue workflow (validation, feedback)
9. Add scripts discovery/search
10. Implement pagination for large datasets

### Priority 3 (Polish & UX)
11. Dark/light mode toggle
12. Keyboard shortcuts
13. Advanced filtering/sorting
14. Batch operations
15. Task history timeline

---

## Questions for Sonnet

1. **Architecture**: Should we use vanilla JS with component pattern, or would a lightweight framework (Preact, Alpine) improve maintainability?

2. **State Management**: Currently using DOM manipulation; should we implement a more robust state management system?

3. **Real-Time Updates**: Should we implement WebSocket for real-time task status, or is polling sufficient?

4. **Mobile UX**: Should mobile be a first-class experience, or secondary consideration?

5. **Complexity**: Are there any components that are overengineered or underthought?

6. **Testing Strategy**: How should we test the frontend given that it's currently untested?

---

## Acceptance Checklist

- [ ] All CLI commands mapped to UI operations
- [ ] Task lifecycle fully operational from UI
- [ ] Error handling tested and graceful
- [ ] Performance benchmarks met
- [ ] Accessibility audit passed
- [ ] Mobile responsiveness verified
- [ ] Documentation updated
- [ ] Code reviewed and merged

---

## References

- **CLI Commands**: See `sparkq/src/cli.py` (1000+ lines of commands)
- **API Endpoints**: See `sparkq/src/api.py` (REST API)
- **Current UI**: `sparkq/ui/` (app.js ~1000 lines, index.html, style.css)
- **Database Schema**: Sessions → Streams → Tasks hierarchy
- **Task Model**: ID, status, tool_name, timeout, payload, metadata

---

## Notes

- The UI should feel like an extension of the CLI, not replace it
- Power users should be able to do everything faster with CLI
- Casual users should find UI more approachable
- The dashboard should give operational visibility at a glance
- Error messages should guide users to solutions (not just "Error occurred")
