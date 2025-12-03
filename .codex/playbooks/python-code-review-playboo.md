
# Codex Python Engineering Playbook — UI Drift, Dead Buttons, and Deterministic Patterns (Expanded)

## Overview
This is an expanded and hardened version of the Python Codex Playbook. It includes:
- Deep troubleshooting for **dead UI buttons**, “works once then breaks,” and inconsistent DOM → JS → API routing drift.
- Authoritative references for Python UI and web integration best practices.
- Expanded rules, double length, with explicit code samples.
- A focus on preventing architecture drift when Codex modifies multiple layers.

---

# 1. Why UI Buttons Become “Dead”
Dead buttons emerge from one or more systemic problems:

## 1.1 Event Listener Drift
### Symptoms:
- Buttons exist visually.
- Hover states work.
- Clicks do nothing.
- No console errors.
- Buttons previously worked but stopped.

### Root Cause:
Codex-generated JS drift often *rewrites the DOM structure* without updating:
- Button selectors
- Event binding calls
- Page-level `render()` wrappers
- `stopPropagation()` handling
- Routing logic in `app-core.js`

### Example Failure
```javascript
// Broken: Codex rewrote markup but did not update selector
document.getElementById("delete-btn").addEventListener("click", onDelete);
```

HTML was rewritten to:
```html
<button class="btn-delete">Delete</button>
```

But JS still refers to the old ID, creating a silent no-op.

### Fix Pattern
```javascript
const deleteBtn = container.querySelector(".btn-delete");
if (deleteBtn) {
    deleteBtn.addEventListener("click", (evt) => {
        evt.stopPropagation();
        onDelete(taskId);
    });
}
```

---

## 1.2 Drift inside IIFE Module Pattern
SparkQ uses immediately invoked function expressions (IIFEs):

```javascript
(function(Pages, API, Utils) {
    Pages.Tasks = { render: async () => {...} };
})(window.Pages, window.API, window.Utils);
```

If Codex rewrites structure incorrectly:
- `Pages.X.render()` stops being assigned
- Event listeners bind *before* DOM exists
- Buttons appear but do nothing

### Fix Pattern
Ensure rendering happens *after* DOM injection:
```javascript
container.innerHTML = `<button class="btn-delete">Delete</button>`;
await Promise.resolve(); // allow DOM paint
bindEvents(container);
```

---

## 1.3 Static Caching & Browser Cache Pollution
JS files load but browser continues using stale older versions.

### Fix:
Add cache-bust query strings in dev:
```html
<script src="pages/tasks.js?v={{timestamp}}"></script>
```

Or use:

```javascript
app.use("/ui/", express.static("ui", { etag: false }));
```

---

# 2. Diagnosing Dead Buttons Systematically

## 2.1 Enable Event Breakpoints in Chrome DevTools
Official: https://developer.chrome.com/docs/devtools/javascript/breakpoints/

Enable:
- “Event Listener Breakpoints → Mouse → click”
- Trigger the button

If nothing breaks → no listener attached.

---

## 2.2 Inspect Bound Event Listeners
Select the element → DevTools → “Event Listeners”

If empty → JS never executed binding function.

---

## 2.3 Confirm JS Module Loaded
In DevTools console:
```js
console.log(window.Pages.Tasks)
```
If undefined → Codex broke module registration.

---

## 2.4 Add “listener attached” debug markers
```javascript
console.debug("[Tasks UI] Binding delete button listener", deleteBtn);
```

If it never fires → verify render flow.

---

# 3. Puppeteer Regression Detection

## Sample Puppeteer Test for Dead Buttons
```js
await page.goto("http://localhost:5005/ui/tasks");

await page.waitForSelector(".btn-delete");

const hasListener = await page.evaluate(() => {
  const el = document.querySelector(".btn-delete");
  const listeners = getEventListeners(el);
  return listeners.click?.length > 0;
});

expect(hasListener).toBeTruthy();
```

---

# 4. Python + FastAPI + JS Integration Drift

## 4.1 Common Drift: API Signature Changes

### Example Bad Drift
Codex rewrites:

```python
@app.delete("/api/tasks/{id}")
def delete_task(id: str):
```

But UI still calls:
```javascript
api("DELETE", `/api/tasks/${task.id}`, null);
```

And Codex may change response shape:
```json
{"message": "ok"}
```

But JS expects:
```js
if (resp.task) ...
```

### Authoritative Best Practice (FastAPI):
https://fastapi.tiangolo.com/tutorial/path-params/

---

# 5. Architecture-Safe UI Button Pattern (Canonical)

Use this **exact** pattern everywhere:

```javascript
function bindTaskRowActions(container, task) {
    const del = container.querySelector(`[data-task-id="${task.id}"] .btn-delete`);
    if (!del) return;

    del.addEventListener("click", (evt) => {
        evt.stopPropagation();
        Utils.withButtonLoading(del, async () => {
            try {
                await api("DELETE", `/api/tasks/${task.id}`, null, { action: "delete task" });
                Utils.showToast("Task deleted", "success");
                await refreshTasks();
            } catch (err) {
                Utils.showError("Delete failed");
            }
        });
    });
}
```

---

# 6. Strict Deterministic Rendering

## Pattern:
```javascript
function renderTasks(container, tasks) {
    container.innerHTML = tasks.map(t => `
        <div class="task-row" data-task-id="${t.id}">
            <button class="btn-delete">Delete</button>
            <button class="btn-edit">Edit</button>
        </div>
    `).join("");

    tasks.forEach(task => bindTaskRowActions(container, task));
}
```

---

# 7. Python Server Drift Safeguards

## 7.1 Confirm endpoint matches UI expectations
```python
@app.delete("/api/tasks/{task_id}", status_code=200)
def delete_task(task_id: str):
    deleted = storage.delete_task(task_id)
    if not deleted:
        raise HTTPException(404, "Task not found")
    return {"message": "deleted", "task_id": task_id}
```

---

# 8. Authoritative UI and Architecture Sources

### UI Architecture:
- MDN Event Model
  https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener

### DOM Querying
- https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelector

### JS Module Patterns
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules

### FastAPI High-Quality Patterns
- https://fastapi.tiangolo.com/tutorial/

### TypeScript/JS UI Anti-Patterns (applies to vanilla JS also)
- https://developer.mozilla.org/en-US/docs/Learn/Tools_and_testing/Cross_browser_testing/JavaScript

---

# 9. Full-Step Troubleshooting for “Buttons Not Working”

## Step 1 — Confirm Render Flow
Insert:
```javascript
console.debug("Rendering Tasks page...");
```

If not printed → routing is broken.

---

## Step 2 — Confirm Element Exists Before Binding
```javascript
const btn = container.querySelector(".btn-delete");
console.debug("btn-delete exist?", btn);
```

If null → wrong selector or DOM drift.

---

## Step 3 — Confirm Listener Attached
```javascript
btn.addEventListener("click", () => console.log("clicked"));
```

If no log → binding not executing.

---

## Step 4 — Check Event Bubbling / stopPropagation()
Codex often mistakenly removes `evt.stopPropagation()` which causes row-click handlers to override button-click handlers.

---

## Step 5 — Confirm API Call is Correct
Use:
```bash
curl -X DELETE http://localhost:5005/api/tasks/<id>
```

If server returns 405 or 404 → API drift.

---

## Step 6 — Check Browser Console for Network Errors
Open Network tab → click button → inspect the failed request.

---

## Step 7 — Force Refresh UI Assets
```bash
rm -rf sparkq/ui/.cache
```

Add:
```html
<script src="tasks.js?v=12345"></script>
```

---

# 10. Ultimate Anti-Drift Enforcement Patterns

## 10.1 Freeze selectors
Document selectors in a central file:
```javascript
export const SELECTORS = {
    TASK_DELETE_BUTTON: ".btn-delete",
};
```

## 10.2 Freeze API signatures
Types in TypeScript-compatible `.d.ts` files or Python Pydantic models.

## 10.3 Freeze rendering patterns
Codex must re-use templates explicitly provided.

---

# 11. Example Reference Implementation (End-to-End Working Sample)

## tasks.js (full safe example)
```javascript
(function(Pages, API, Utils) {
    "use strict";

    async function loadTasks() {
        try {
            const resp = await API.api("GET", "/api/tasks", null, { action: "list tasks" });
            return resp.tasks || [];
        } catch (err) {
            Utils.showError("Failed to load tasks");
            return [];
        }
    }

    function bind(container, tasks) {
        tasks.forEach((task) => {
            const row = container.querySelector(`[data-task-id="${task.id}"]`);
            const delBtn = row.querySelector(".btn-delete");

            delBtn.addEventListener("click", (evt) => {
                evt.stopPropagation();
                Utils.withButtonLoading(delBtn, async () => {
                    await API.api("DELETE", `/api/tasks/${task.id}`, null, { action: "delete task" });
                    Utils.showToast("Deleted", "success");
                    Pages.Tasks.render(container);
                });
            });
        });
    }

    async function render(container) {
        if (!container) return;

        container.innerHTML = `<div class="card">Loading...</div>`;
        const tasks = await loadTasks();

        container.innerHTML = tasks.map(t => `
            <div class="task-row" data-task-id="${t.id}">
                <span>${t.id}</span>
                <button class="btn-delete">Delete</button>
            </div>
        `).join("");

        bind(container, tasks);
    }

    Pages.Tasks = { render };

})(window.Pages, window.API, window.Utils);
```

---

# 12. Closing: Why This Solves the Drift Problem

This expanded playbook:
- Enforces deterministic UI patterns
- Prevents Codex from making silent architectural changes
- Provides step-by-step dead-button debugging
- Adds authoritative references
- Provides high-fidelity JS patterns that avoid drift
- Gives you reproducible Puppeteer tests that *actually detect missing listeners*
- Provides end-to-end working code samples

SparkQ’s UI will stop decaying into “looks fine, does nothing.”

