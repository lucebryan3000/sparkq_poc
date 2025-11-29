# Phase 12: Project & Session Management UI/UX Redesign

## Problem Statement
Current implementation uses browser `prompt()` for session creation and basic modal UX that doesn't support:
- Copy/paste functionality (users can't paste session IDs)
- Numeric input validation (no way to input pagination numbers)
- Clickable session rows (can't select/interact with list items)
- Professional data management workflows
- Proper data table interactions

## Goals
- Replace all browser `prompt()` dialogs with proper modal forms
- Implement professional data table UI with row interactions
- Support copy-to-clipboard on all identifiable fields (IDs, names, paths)
- Add proper form validation and error handling
- Improve Sessions page to show live data with edit/delete capabilities
- Add Project management dashboard within Sessions page
- NO browser popups on any page

## Scope - Phase 12: Unified Project/Session/Streams Management Page

### Overview: User Journey Architecture
This redesign consolidates Projects, Sessions, and Streams into ONE unified page that guides users through the natural workflow:

**User Journey:**
1. **Initialize Project** (if needed) → Project setup modal
2. **View Project Details** → Editable project card with metadata
3. **Create/Manage Sessions** → Sessions table with actions
4. **Create/Manage Streams** → Streams table within session context
5. **Execute Tasks** → Links to Tasks page for task management

**Page Structure:**
```
┌─────────────────────────────────────────────────────────┐
│ PROJECT & EXECUTION MANAGEMENT                          │
├─────────────────────────────────────────────────────────┤
│ [Project Card] [Sessions] [Streams]  ← Tab Navigation   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ TAB 1: PROJECT OVERVIEW                                 │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Project: my-project                    [Edit] [+New]│ │
│ │ ID: prj_abc123  [Copy]                             │ │
│ │ Repo: /path/to/repo                                │ │
│ │ PRD: /path/to/prd.md                               │ │
│ │ Created: 2024-11-29                                │ │
│ │                                                     │ │
│ │ → 3 Active Sessions  → 12 Streams  → 245 Tasks    │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ TAB 2: SESSIONS                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ [Create Session]                                   │ │
│ │                                                     │ │
│ │ ID            │ Name             │ Status │ Streams│ │
│ │ ses_abc123... │ inference-run-1  │ active │ 3     │ │
│ │ ses_def456... │ benchmark-2024   │ active │ 5     │ │
│ │ ses_ghi789... │ test-run         │ ended  │ 4     │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ TAB 3: STREAMS                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Filter: [Session Dropdown] [Status Dropdown]       │ │
│ │                                                     │ │
│ │ ID            │ Session          │ Instructions    │ │
│ │ stm_abc123... │ inference-run-1  │ Process images  │ │
│ │ stm_def456... │ inference-run-1  │ Analyze results │ │
│ │ stm_ghi789... │ benchmark-2024   │ Compare models  │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 1. Unified Page: Projects/Sessions/Streams Tab System
**Current State:**
- Sessions page shows only sessions
- Streams page shows only streams
- No project context or navigation
- Three separate pages with redundant navigation

**New Design:**
- Single consolidated page with THREE tabs: Project | Sessions | Streams
- Seamless navigation between related data
- All data loaded from single API call (more efficient)
- Context flows from Project → Session → Streams → Tasks
- Breadcrumb shows: Project > Session > Stream > Task

**Implementation Details:**
- Create `renderProjectsPage()` as main orchestrator
- Add tab navigation system (Project | Sessions | Streams)
- Tabs use same container, different content rendering
- Only requested tab content is fetched from API
- Lazy load tab data on click (performance optimization)

### 2. Project Overview Tab
**Design:**
- Large project card with key metadata
- Quick stats showing 3-session count, stream count, task count
- Edit button for project details
- "Create Session" button (primary CTA)
- "Create New Project" button (for project switching in future)

**Content:**
```
PROJECT: my-project
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Project ID:    prj_abc123def456    [Copy]
Repository:    /home/user/project
PRD File:      /home/user/prd.md
Created:       2024-11-29 at 06:30 UTC

ACTIVITY SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3 Active Sessions  →
12 Total Streams   →
245 Queued Tasks   →
89 Completed Tasks

ACTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Edit Project] [Create Session] [View All Tasks]
```

**Features:**
- Large, scannable layout
- Copy buttons on ID and paths
- Quick links to key data (session count is link to Sessions tab)
- Edit button opens edit modal
- Stats update automatically

### 3. Sessions Tab (Redesigned)
**Design:**
- Lean Sessions table with essential columns
- "Create Session" button (primary action)
- Sessions table: ID | Name | Status | Streams | Created | Actions
- Each row clickable for session detail modal
- Copy-to-clipboard on session ID

**Features:**
- Search/filter sessions by name
- Status badges (active/ended)
- Stream count per session (quick overview)
- Click row for detail modal with edit/manage options
- Delete session option (with confirmation)
- Pagination if > 20 sessions

### 4. Streams Tab (Redesigned)
**Design:**
- Filter dropdown to select session
- Streams table: ID | Session | Instructions | Created | Actions
- "Create Stream" button (only shows if session selected)
- Empty state guides user to select/create session first

**Features:**
- Session filter dropdown (auto-populated from sessions)
- Click row for stream detail modal
- Copy stream ID button
- Link to related session (tab jump)
- Instructions preview (truncated with tooltip)

### 5. Session Detail Modal
**Triggered by:** Clicking session row in Sessions tab

**Design:**
```
SESSION DETAIL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ID: ses_abc123def456        [Copy]
Name: inference-run-1
Status: active
Description: (optional description)
Created: 2024-11-29 06:30 UTC
Ended: (active)

STREAMS (3 total)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
stm_1: "Process images"
stm_2: "Analyze results"
stm_3: "Compile report"

[Edit] [Create Stream] [Close Session] [Delete]
```

**Features:**
- All session details with copy buttons
- List of related streams with links
- Edit session modal
- Create stream within session
- Close session action (with confirmation)
- Delete session option

### 6. Project Edit Modal
**Triggered by:** Edit button on Project tab

**Design:**
```
EDIT PROJECT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Project Name *
[my-project]

Repository Path (optional)
[/home/user/project]

PRD File Path (optional)
[/home/user/prd.md]

[Cancel] [Save]
```

**Features:**
- Pre-fill with current project data
- Name required, paths optional
- Save validates and updates
- Success notification
- Error display on validation failure

### 3. Session Creation Modal
**Design:**
```
┌─────────────────────────────────────┐
│ Create Session                  [x] │
├─────────────────────────────────────┤
│                                     │
│ Session Name *                      │
│ [________________]                  │
│ e.g., "inference-run-2024-11-29"   │
│                                     │
│ Description (optional)              │
│ [____________________________]       │
│ e.g., "GPT-4 benchmark test"       │
│                                     │
│              [Cancel] [Create]     │
│                                     │
└─────────────────────────────────────┘
```

**Features:**
- Text input for session name (required, validated)
- Textarea for description (optional)
- Cancel button (closes modal)
- Create button (validates, submits, closes, refreshes)
- Auto-focus on session name input
- Keyboard: Enter submits, Escape closes
- Form-level error display
- Field-level validation indicators

### 4. Session Detail Row Interactions
**Design:**
- Click row → Opens session detail modal
- Hover effects for visual feedback
- Copy buttons for session ID

**Modal Content:**
```
┌─────────────────────────────────────┐
│ Session: ses_abc123def456      [x] │
├─────────────────────────────────────┤
│ Name: inference-run-2024           │
│ Status: active                      │
│ Started: 2024-11-29T06:30:00Z      │
│ Description: GPT-4 benchmark test  │
│                                     │
│ [Copy ID] [Edit] [Close Streams]   │
│                                     │
└─────────────────────────────────────┘
```

**Features:**
- Shows all session details
- Copy ID to clipboard button
- Edit button (for name/description)
- Close/End session action
- Related streams count/list

### 5. Sessions Table Structure
**Columns:**
1. ID (copyable, monospace font, truncated with tooltip)
2. Name (full text)
3. Status (badge: active/ended)
4. Started (formatted date)
5. Actions (copy ID button, detail button)

**Row Styling:**
- Hover highlight
- Click to detail modal
- Status badges with colors

### 6. Edit Project Modal
**Design:**
```
┌─────────────────────────────────────┐
│ Edit Project                    [x] │
├─────────────────────────────────────┤
│                                     │
│ Project Name *                      │
│ [________________]                  │
│                                     │
│ Repository Path (optional)          │
│ [________________________________]  │
│                                     │
│ PRD File Path (optional)            │
│ [________________________________]  │
│                                     │
│            [Cancel] [Save]         │
│                                     │
└─────────────────────────────────────┘
```

**Features:**
- Pre-fill with current project data
- Project name required, validated
- Optional paths with clear placeholder text
- Cancel discards changes
- Save validates and updates
- Success notification on save
- Error handling for API failures

### 7. Modal Behavior Standards
**All modals follow pattern:**
- Created programmatically (no HTML in file)
- Centered on screen, 520px max width
- Close via X button, Cancel button, or ESC key
- Click outside closes modal
- Auto-focus relevant input on open
- Form submission on Enter key
- Proper error/validation feedback
- Loading state with spinner during API calls
- Success/error toasts after actions

### 8. Accessibility & UX Improvements
- Label associations (for/id attributes)
- Required field indicators (*)
- Placeholder text for guidance
- Error messages next to fields
- Keyboard navigation (Tab, Enter, Escape)
- Color contrast for readability
- Mobile responsive (90vh max for modals)
- Touch-friendly button sizes

## Implementation Strategy

### Phase 12.1: Sessions Table & Detail Modal
1. Create `renderSessionDetailModal(sessionId)` function
2. Modify sessions table to be clickable rows
3. Add click handlers to table rows
4. Implement detail modal with edit/delete options
5. Add copy-to-clipboard buttons

### Phase 12.2: Create Session Modal
1. Replace `handleCreateSession()` prompt with modal
2. Create `showCreateSessionModal()` function
3. Add form validation
4. Test form submission flow

### Phase 12.3: Project Card & Edit Modal
1. Create project info card component
2. Add edit button and modal
3. Implement `showEditProjectModal()` function
4. Add PUT request handling for project updates

### Phase 12.4: Styling & Polish
1. Add hover states for interactive rows
2. Improve spacing and visual hierarchy
3. Add loading states during API calls
4. Implement error states with clear messages
5. Mobile responsive testing

### Phase 12.5: Testing & Refinement
1. E2E tests for create session flow
2. E2E tests for edit project flow
3. Verify all modals close properly
4. Test keyboard navigation
5. Test copy-to-clipboard functionality

## File Changes

### sparkq/ui/app.js
- Replace `handleCreateSession()` with `showCreateSessionModal()`
- Update `renderSessionsPage()` to make rows clickable
- Add `renderSessionDetailModal(sessionId)`
- Add `showEditProjectModal()`
- Modify project card rendering
- Add copy button handlers
- Add row click handlers

### sparkq/ui/style.css
- Add row hover styles (background color, cursor pointer)
- Add transition effects for interactive elements
- Improve button spacing in modals
- Add status badge styling
- Mobile responsive adjustments

## Estimated Size Impact
- app.js: +150-200 lines (modal functions, form handlers)
- style.css: +30-50 lines (interactive styles)
- Total: 2,204 → ~2,380 lines (within growth budget)

## Success Criteria
✓ No browser `prompt()` or `alert()` used anywhere
✓ Sessions table rows are interactive/clickable
✓ Copy-to-clipboard works on all ID fields
✓ All modals are proper form-based dialogs
✓ Project details visible and editable
✓ Form validation prevents invalid submissions
✓ All API errors display properly in UI
✓ Mobile-responsive and accessible
✓ Keyboard navigation works throughout
✓ All existing functionality preserved

## Future Enhancements (Post-Phase 12)
- Batch session operations (select multiple, close all)
- Session search/filter by name
- Sorting by columns (date, name, status)
- Advanced project management page
- Session activity timeline
- Export sessions to CSV
