````markdown
# 🧠 CODEX PLAYBOOK — Stable UI Architecture & Button Reliability
### (For Python Backends + Vanilla JS UIs + Dynamic DOM Rendering)

This playbook instructs **Codex** to consistently generate **reliable, stable, repeatable UI code** that does **not break after re-render**, **does not lose event handlers**, and **never produces dead buttons** again.

Codex MUST follow this architecture *exactly* unless explicitly told otherwise.

---

# 1. Core Goals

Codex must:

1. Build UI code that **never loses event handlers after DOM updates**
2. Generate UI that **works after navigation, refresh, or dynamic content replacement**
3. Ensure all buttons/actions use **data-action**, not `id`, `onclick`, or fragile selectors
4. Use **event delegation** (a single global listener)
5. Use **stable container nodes** and replace only innerHTML
6. Always use the **canonical API wrapper** for all API calls
7. Produce **idempotent render functions**
8. Generate UI code that is resilient to LLM refactors and incremental changes

This architecture makes Codex-generated UI durable and predictable in real-world apps.

---

# 2. Global Rules Codex Must Follow

Codex must obey:

### 2.1 Never attach events directly to elements
❌ `document.getElementById("saveBtn").onclick = ...`
❌ `btn.addEventListener("click", ...)`

These break on DOM replacement.

---

### 2.2 Always use event delegation
✔ Attach exactly ONE click listener on `document.body`:

```js
document.body.addEventListener("click", (e) => {
    const action = e.target.dataset.action;
    if (action && actionHandlers[action]) {
        e.preventDefault();
        e.stopPropagation();
        actionHandlers[action](e.target, e);
    }
});
````

This MUST be generated whenever building UI logic.

---

### 2.3 All behavior must be triggered via `data-action`

HTML must follow:

```html
<button data-action="save">Save</button>
<button data-action="delete-user" data-id="123">Delete</button>
<button data-action="open-modal" data-modal="settings">Settings</button>
```

Codex must NEVER rely on:

* `id=""`
* class names for event binding
* inline `onclick="..."`

---

### 2.4 Create a centralized action handler registry

Codex must implement:

```js
const actionHandlers = {
    save: handleSave,
    "delete-user": handleDeleteUser,
    "open-modal": handleOpenModal,
};
```

When adding new UI features, Codex must populate this registry.

---

### 2.5 Always use the canonical API wrapper

Codex must NOT use raw `fetch()` unless explicitly allowed.

Use:

```js
async function callAPI(method, path, body = null) {
    return await window.API.api(method, path, body, { action: path });
}
```

All UI API calls MUST follow:

```js
await callAPI("POST", "/api/roles", payload);
```

This prevents Codex from inventing inconsistent API patterns.

---

### 2.6 Render functions must be idempotent and side-effect–free

Codex must ONLY generate UI HTML here:

```js
function renderUsers(users) {
    return `
       <div class="user-list">
           ${users.map(u => `
              <div class="user-card">
                 <span>${u.name}</span>
                 <button data-action="delete-user" data-id="${u.id}">
                     Delete
                 </button>
              </div>
           `).join("")}
       </div>
    `;
}
```

NO event handlers inside renderers.

NO direct DOM manipulation.

---

# 3. What Codex Must Do When Creating New UI Features

Whenever Codex makes ANY UI change, it MUST:

### 3.1 Add appropriate `data-action="..."` attributes

Example:

```
New feature: Archive Queue
```

Codex must create:

```html
<button data-action="archive-queue" data-queue-id="${queue.id}">
   Archive
</button>
```

---

### 3.2 Add a handler entry to the registry

```js
actionHandlers["archive-queue"] = archiveQueue;
```

---

### 3.3 Generate the handler function

```js
async function archiveQueue(el) {
    const id = el.dataset.queueId;
    await callAPI("POST", `/api/queues/${id}/archive`);
    refreshQueuesUI();
}
```

---

### 3.4 Ensure backend endpoint exists (Python)

If missing, Codex must generate:

```python
@app.post("/api/queues/{queue_id}/archive")
def archive_queue(queue_id: str):
    # storage logic
```

---

# 4. Rendering Rules (Codex Must Follow)

Codex must:

### ✔ Only replace content inside stable containers

```js
pageRoot.innerHTML = renderQueues(queues);
```

### ❌ Never replace container nodes themselves

### ❌ Never use:

* `.outerHTML = …`
* full `<body>` replacements
* removing a parent element and re-inserting it

### ✔ Only mutate innerHTML of nodes intended for page rendering

---

# 5. Interaction Testing Pattern (Codex Must Produce When Asked)

Codex must generate Playwright tests:

```js
test("every button triggers API call", async ({ page }) => {
    const requests = [];
    page.on("request", req => requests.push(req.url()));

    await page.click("[data-action='archive-queue']");
    expect(requests.some(url => url.includes("/api/queues"))).toBe(true);
});
```

This ensures new buttons actually work.

---

# 6. When Codex Must Repair UI

If a button breaks, Codex must:

### 6.1 Check for missing data-action

### 6.2 Check handler registry for missing keys

### 6.3 Check backend API path mismatch

### 6.4 Check if DOM node is replaced dynamically

### 6.5 Check if render function replaced the element

### 6.6 Re-add proper data attributes

### 6.7 Normalize the render function

Codex must never "patch the symptoms" (like re-adding `onclick` logic).

Codex must restore architectural consistency.

---

# 7. Complete Example Codex Should Follow

## HTML Output

```html
<button data-action="approve-task" data-task-id="${task.id}">
   Approve
</button>
```

## Handler Registry

```js
actionHandlers["approve-task"] = approveTask;
```

## Handler Function

```js
async function approveTask(el) {
    const id = el.dataset.taskId;
    await callAPI("POST", `/api/tasks/${id}/approve`);
    reloadTasks();
}
```

## Backend Route

```python
@app.post("/api/tasks/{task_id}/approve")
def approve_task(task_id: str):
    return storage.approve_task(task_id)
```

## Integration Test

```python
def test_approve_task(client):
    r = client.post("/api/tasks/t1/approve")
    assert r.status_code == 200
```

---

# 8. Invocation Prompt

To use this playbook, run:

```
Use the CODEX UI STABILITY PLAYBOOK.

Ensure all UI buttons use data-action attributes, event delegation, centralized handlers, canonical API wrapper, and idempotent renderer functions. Review the architecture and output updated UI/JS/Python/test code using this pattern.
```

---

# 9. Completion Criteria

Codex may declare success only when:

* All buttons have `data-action` attributes
* All actions exist in the handler registry
* All handlers use `callAPI()`
* Backend routes exist and match UI usage
* All render functions contain no event-binding logic
* UI remains functional after re-render/refresh/navigation
* All tests pass

---

```
