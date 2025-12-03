# CODEX PLAYBOOK — Full SparkQ UI Infrastructure Remediation

### Fix button breakage, event loss, and UI inconsistencies across all pages

This playbook is customized for **SparkQ’s actual architecture** (vanilla JS, no bundler, FastAPI backend, dynamic `innerHTML` rendering). Codex must follow it to perform a **repo‑wide remediation** that eliminates handler loss after re-renders, navigation, or LLM-generated changes.

---

## 1) Ground Truth: How SparkQ UI works today

- **Asset loading**: `sparkq/ui/index.html` loads raw scripts sequentially from `/ui/dist/*.js` (no bundler/HMR). Dist is synced via `sparkq/ui/scripts/sync-dist.sh`.
- **Routing**: `app-core.js` is the single entry; History API router toggles two stable containers (`#dashboard-page`, `#settings-page`) and calls `Pages.<Page>.render(container)`.
- **Rendering**: Pages and components write `container.innerHTML = ...` on every render/refresh. DOM nodes are replaced frequently.
- **Event wiring (current fragility)**:
  - Nav buttons are bound once via `addEventListener`.
  - Page actions are bound after each render via `querySelectorAll().addEventListener`.
  - QuickAdd uses inline `onclick/onchange` calling `window.quickAdd.*`.
  - No event delegation; any DOM replacement drops listeners.
- **API client**: Stable wrapper `window.API.api(method, path, body, { action })` is used everywhere; API routes are not the usual failure point.
- **Auto-refresh**: `Utils.AutoRefresh` exists but is not instantiated; refreshes are manual or render-triggered.
- **Caching**:
  - Dev/test: `/ui` and `/ui-cache-buster.js` are served with `Cache-Control: no-cache` and add `?v=<cache-buster>` automatically.
  - Prod: no `?v`, StaticFiles caching applies. Stale dist files can appear if sources are edited without running `sync-dist.sh`.
- **Observed failure modes**:
  - New buttons rendered by LLM/Sonnet lack attach code and are dead on first render.
  - Any re-render (queue refresh, task refresh, tab change) replaces DOM and erases listeners.
  - Inline QuickAdd calls fail if `window.quickAdd` is not yet initialized.
  - Modals/dynamic lists lose events after `innerHTML` swap.

---

## 2) Remediation Goals

- **Single delegated event system** that survives all renders.
- **All interactive elements use `data-action` + `data-*`** (no inline handlers).
- **Central ActionRegistry**: one place where every action is declared and mapped.
- **Pure render functions**: generate HTML only; no event binding inside renderers.
- **Canonical API access**: always via `callAPI` -> `window.API.api`.
- **Idempotent pages/components**: safe after navigation, refresh, and repeated renders.
- **QuickAdd without inline hooks**; actions routed through the registry.

---

## 3) Target Architecture

1. **Global delegated listeners** in `app-core.js`:
   ```js
   window.ActionRegistry = window.ActionRegistry || {};
   function dispatchAction(action, el, event) { /* lookup in ActionRegistry, guard, log */ }
   document.body.addEventListener("click", (e) => {
     const target = e.target.closest("[data-action]");
     if (!target) return;
     e.preventDefault();
     e.stopPropagation();
     dispatchAction(target.dataset.action, target, e);
   });
   document.body.addEventListener("change", (e) => {
     const target = e.target.closest("[data-action]");
     if (!target) return;
     dispatchAction(target.dataset.action, target, e);
   });
   ```

2. **ActionRegistry**: `window.ActionRegistry["queue-archive"] = (el, event) => { ... }`.

3. **`callAPI` helper** (wraps `window.API.api`) exported for UI code.

4. **Render-only functions**: no `addEventListener` or inline JS inside templates.

5. **Buttons/links** carry `data-action` + `data-*` (ids optional, not required for handlers).

6. **Nav buttons** use `data-action="nav-dashboard"` / `"nav-settings"`; handlers call `navigateTo`.

7. **QuickAdd**:
   - Remove inline `onclick/onchange`.
   - Use `data-action` for mode toggle, tool select, prompt select, agent-role select, tools popup, add script task, instructions, and copy-session.
   - Register handlers that safely reference the QuickAdd instance (guard if `window.quickAdd` is unset).

---

## 4) Execution Steps (Codex must perform in SparkQ)

1. **app-core.js**: add delegated listeners, `ActionRegistry`, `callAPI` export, and nav handlers via data-action.
2. **index.html**: add `data-action` to nav buttons.
3. **Pages/components**:
   - Rewrite templates to emit `data-action` + `data-*` for every interactive element.
   - Move all logic into ActionRegistry handlers (no inline or per-render attach blocks).
   - Keep stable containers (`#dashboard-page`, `#settings-page`); `innerHTML` updates are fine.
4. **QuickAdd**: remove inline handlers; wire all actions through the registry.
5. **Remove legacy per-render binds** (`addEventListener` attach blocks, inline `onclick/onchange`).
6. **Align API routes**: ensure every UI path exists in FastAPI (create/fix endpoints if missing).
7. **Sync dist**: run `sparkq/ui/scripts/sync-dist.sh` so `/ui/dist/*.js` matches sources.

---

## 5) Completion Checklist

Codex may declare success only when:
- Every interactive element uses `data-action`; no inline handlers remain.
- ActionRegistry has a handler for every `data-action`; missing handlers log clearly.
- Global delegation handles click/change; no per-element binding needed.
- Renderers are HTML-only; no event wiring inside.
- QuickAdd works entirely via registry + delegation.
- API calls go through `callAPI`/`window.API.api`.
- UI remains functional after repeated: render → refresh → re-render → navigate cycles.
- Dist files are synced; cache-busting works in dev.

---

## 6) Invocation Prompt (for Codex)

```
Run the SparkQ UI Infrastructure Remediation.
Refactor sparkq/ui/** to the delegated-event architecture.
Replace inline/per-node handlers with data-action + ActionRegistry.
Rewrite renderers to be HTML-only.
Wire QuickAdd through the registry.
Add/fix backend endpoints if UI calls them.
Sync dist assets after changes.
Validate that actions still work after repeated renders/navigation.
```

---

If you want automated guardrails, add UI tests that click each `[data-action]` and assert the expected API call fires. This catches missing registry entries immediately.
