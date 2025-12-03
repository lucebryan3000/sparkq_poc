# UI Stability Check — No Inline Handlers

Run this before committing UI changes to catch regressions away from the delegated data-action pattern.

## Command
```
cd sparkq && rg "(onclick\\=|onchange\\=|addEventListener\\()|data-action=\\\"?quickAdd" ui
```

## What to look for
- Inline handlers (`onclick=`, `onchange=`) in `sparkq/ui/**`
- New `addEventListener(` calls in page/component files that should be delegated
- Any QuickAdd inline handlers reintroduced

## Action
- Replace inline/per-node bindings with `data-action` + ActionRegistry handlers
- If a direct listener is truly needed (rare), document why and scope it narrowly
