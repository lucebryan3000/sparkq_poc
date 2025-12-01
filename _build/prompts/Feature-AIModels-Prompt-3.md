# SparkQ – Phase 3: Phase 20.4 Gap Completion (UI Indicators, Teardown Script, Setup Wizard)

### Sonnet Orchestrator + Codex Executor Prompt

**Status & reality snapshot (HEAD 4303bdc):** Phase 20.4 is in production polish; most planned work is complete (script metadata parsing ✅, worker playbook ✅, lockfile ✅). Three gaps remain: (1) UI stale/auto-failed visual indicators (~90% UI code done but not rendering), (2) formal teardown script (0% done), (3) interactive setup wizard completion (~70% done). This prompt completes Phase 20.4 to 100% before v1.1+ scope (deferred Phase 3 Codex wiring, Phase 4 approval workflow).

You are **Claude Sonnet** acting as the **Lead Orchestrator** for Phase 20.4 gap completion. You will:

1. **Orchestrate the work** with concrete tasks and file paths.
2. **Generate Codex prompts** for code generation (UI indicators, teardown script, setup wizard).
3. **Write documentation** updates to Charter reflecting 100% Phase 20.4 completion.
4. **Provide a final checklist** with git commit instructions.

You are NOT implementing Phase 3 features (Codex session wiring, persona registry, approval workflows). You are closing Phase 20.4.

---

## 1. Unknowns & Assumptions

Current state (validated against code HEAD 4303bdc):

- **UI Visual Indicators**: `sparkq/ui/pages/tasks.js` has data fields (`claimed_at`, `stale_warned`, `timeout`) but no visual rendering (no CSS classes for ⚠️ stale, no 🔴 for auto-failed). **ASSUMPTION**: Tasks UI renders both queued and running tasks; need to add indicators for stale-warned and auto-failed states.
- **Teardown Script**: No `sparkq/teardown.sh` exists. **ASSUMPTION**: Script should cleanly remove database, config, logs, and cache; should be idempotent (safe to run multiple times).
- **Interactive Setup Wizard**: IMPLEMENTATION_PRIORITY.md lists 70% complete. **ASSUMPTION**: Need to verify current state in code and complete missing pieces (likely confirmation prompts, config validation, or error recovery).

Treat unknowns as follows:

1. **For UI indicators**: Read `sparkq/ui/pages/tasks.js` and `sparkq/ui/style.css` to identify where to add rendering logic.
2. **For teardown**: Check `sparkq/src/constants.py` and `sparkq.yml` to understand standard paths (database, logs, cache).
3. **For setup wizard**: Read setup-related code in `sparkq/src/cli.py` and `sparkq/src/server.py` to identify what's done vs. remaining.

If any critical path differs from assumptions, flag it clearly as `ASSUMPTION CORRECTION` and move forward with the most reasonable interpretation.

---

## 2. Phase 3 Objectives (Concrete)

By the end of this phase, you should have produced:

1. **Codex Prompts** (ready to execute):
   - UI Visual Indicators prompt (for `sparkq/ui/pages/tasks.js` and `sparkq/ui/style.css`).
   - Teardown Script prompt (for `sparkq/teardown.sh`).
   - Setup Wizard Completion prompt (for `sparkq/src/cli.py` and related files).

2. **Documentation Updates**:
   - Charter section confirming Phase 20.4 completion (all gaps closed).
   - README.md updates if teardown/setup commands change.
   - Feature summary for release notes / CHANGELOG.

3. **Phase 3 Execution Checklist**:
   - Code generation tasks (UI, teardown, setup).
   - Git commit with message: "Phase 20.4 completion: UI indicators, teardown script, setup wizard"

You MUST stay within Phase 3 scope:

- It is OK to:
  - Generate Codex prompts for code changes.
  - Write documentation reflecting 100% completion.
  - Design teardown and setup interaction patterns.
- It is NOT OK to:
  - Implement Phase 3 features (Codex wiring, persona registry, approval workflows).
  - Expand scope beyond the three identified gaps.
  - Commit code changes yourself (Codex executes; you orchestrate).

---

## 3. Tasks – Do These in Order

### Task A – Validate Phase 20.4 Gaps (Code Inspection)

1. Read the following files to confirm current state:
   - `sparkq/ui/pages/tasks.js`: Search for task rendering logic. Identify where stale-warned and auto-failed states should be displayed.
   - `sparkq/ui/style.css`: Check if CSS classes exist for `stale-warned`, `auto-failed`, or similar states.
   - `sparkq/src/constants.py`: Confirm database path, log path, and cache path defaults.
   - `sparkq/src/cli.py`: Find setup command implementation. Identify what's interactive vs. what needs completion.

2. For each gap, confirm:
   - **UI Indicators**: Data exists but visual rendering absent? (Expected finding: ✅)
   - **Teardown Script**: Does `sparkq/teardown.sh` exist? (Expected finding: ❌)
   - **Setup Wizard**: What parts are done? What's missing? (Expected finding: Interactive prompts partially done)

3. Document findings as a **"Gap Validation Report"** with:
   - Current state of each gap (code locations, what's done, what's missing).
   - Any corrections to assumptions above.
   - Explicit file paths and line numbers where changes are needed.

---

### Task B – Generate Codex Prompts for Code Generation

**CRITICAL FINDING FROM TASK A**: UI Visual Indicators (⚠️, 🔴, 💀) are **already fully implemented and working**. Setup Wizard is also **fully complete**. Only the Teardown Script remains.

You will generate ONE **Codex-executable prompt** for the remaining gap:

**B.1: Teardown Script Prompt (ONLY REMAINING GAP)**

Generate a prompt for Codex that:

- **Scope**: Create `sparkq/teardown.sh` executable script for clean removal of SparkQ data/config/logs.
- **Specification**:
  - Removes database files: `sparkq/data/sparkq.db*` (including WAL/SHM files as noted in README.md line 205-209).
  - Removes config: `sparkq.yml`, `sparkq.lock`.
  - Removes logs: `sparkq/logs/*.log*` or entire `sparkq/logs/` directory.
  - Optional: Removes cache `.venv/` with explicit confirmation.
  - **User Interaction**:
    - Show summary of what will be deleted with path details.
    - Confirmation prompt: "Remove SparkQ data, config, logs? This cannot be undone. [y/N]"
    - Second confirmation if `.venv/` removal is requested.
  - **Idempotent**: Safe to run multiple times (no errors if files/directories already gone).
  - **Help Text**: `./sparkq teardown --help` shows what will be deleted and paths.
  - **Usage**: `./sparkq teardown` or `./sparkq.sh teardown` (should be wrapped in sparkq.sh).
- **Validation**:
  - Run script in dev environment with confirmation.
  - Verify all specified paths are removed.
  - Run script again to confirm idempotence (no errors if already removed).
  - Test help text displays correctly.

---

### Task C – Write Documentation Updates

1. **Charter Update** (add to `_build/FRD/sparkq-build-charter-roadmap-v8.md`):
   - Add subsection under Phase 20.4 completion noting:
     - ✅ UI Visual Indicators for stale and auto-failed tasks (fully implemented).
     - ✅ Interactive Setup Wizard (fully complete).
     - ✅ Formal Teardown Script (`sparkq/teardown.sh`) - NEW.
   - Statement: "Phase 20.4 is 100% complete as of this release. All identified gaps are closed. Ready for v1.1+ scope (deferred Phase 3 Codex wiring / Phase 4 approval workflow)."

2. **README.md Updates**:
   - Add teardown command to "Common Commands" section (around line 127):
     ```
     ./sparkq.sh teardown               # Clean remove all data, config, logs
     ```
   - (Optional) Add brief troubleshooting note under "Troubleshooting" section (after line 196) if desired.

3. **sparkq.sh Wrapper Update**:
   - Add wrapper for teardown script so it can be called via `./sparkq.sh teardown`.

---

### Task D – Phase 3 Execution Checklist

Summarize everything as a checklist for execution (Sonnet orchestration + Codex code generation):

**Note**: UI Visual Indicators and Setup Wizard are already 100% implemented. Only Teardown Script is needed.

1. **Codex Prompt Execution**
   - [ ] Execute Teardown Script Codex prompt → generates `sparkq/teardown.sh`.
   - [ ] Verify script is executable and idempotent.

2. **Documentation & Charter Updates**
   - [ ] Update `_build/FRD/sparkq-build-charter-roadmap-v8.md` with Phase 20.4 completion statement.
   - [ ] Update `README.md` to add teardown command (Common Commands section, around line 127).
   - [ ] Update `sparkq.sh` wrapper to support `./sparkq.sh teardown` call.

3. **Testing & Validation**
   - [ ] Manual test: Run `./sparkq.sh teardown` in dev environment with confirmation.
   - [ ] Verify all specified paths are removed (database, config, logs).
   - [ ] Run teardown again to confirm idempotence (no errors if already removed).
   - [ ] Test `./sparkq.sh teardown --help` displays correctly.

4. **Git Commit**
   - [ ] Commit all code, docs, and Charter changes with message:
     ```
     Phase 20.4 completion: Add formal teardown script

     - Create sparkq/teardown.sh for clean removal of data/config/logs
     - Add teardown command wrapper to sparkq.sh
     - Update README.md with teardown usage
     - Update Charter reflecting 100% Phase 20.4 completion

     Note: UI visual indicators (⚠️/🔴) and setup wizard were already complete.
     ```

---

## 4. Output Format

When you (Sonnet) respond to this Phase 3 prompt, structure your answer like this:

1. **Gap Validation Report (FINDINGS)**
   - 1.1 UI Visual Indicators: Current state & findings (✅ ALREADY IMPLEMENTED)
   - 1.2 Teardown Script: Current state & findings (❌ NEEDS CREATION)
   - 1.3 Setup Wizard: Current state & findings (✅ ALREADY IMPLEMENTED)
   - 1.4 Summary & assumption corrections

2. **Codex Prompt (Ready-to-Execute)**
   - 2.1 Teardown Script Codex Prompt (complete, copy-paste-ready for Codex execution)

3. **Documentation & Charter Ready-to-Paste**
   - 3.1 Charter section for Phase 20.4 100% completion
   - 3.2 README.md changes (teardown command addition)
   - 3.3 sparkq.sh wrapper update (for `./sparkq.sh teardown` command)

4. **Phase 3 Execution Checklist**
   - 4.1 Codex execution steps
   - 4.2 Documentation updates
   - 4.3 Testing & validation
   - 4.4 Git commit message

5. **Key Discoveries**
   - Summary of findings (UI/setup already done, only teardown needed)
   - Why IMPLEMENTATION_PRIORITY.md status was outdated

Be concrete, repo-aware, and opinionated. Keep scope strictly within **Phase 20.4 gap completion** (not Phase 3 features for v1.1+).

