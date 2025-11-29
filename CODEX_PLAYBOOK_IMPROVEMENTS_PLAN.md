# Codex Optimization Playbook - Implementation Plan

**Status:** PLAN ONLY - NOT EXECUTED
**Date Created:** 2025-11-28
**Target File:** `/home/luce/apps/sparkqueue/.claude/playbooks/codex-optimization.md`

---

## Overview

This plan adds 4 improvements to the codex-optimization.md playbook based on actual SparkQ Phase 1-5 execution history:

1. **Improvement 1: Historical Dependency Mapping** (NEW Section 2.6)
2. **Improvement 2: Batch Dependency Analysis Template** (NEW Section 3.3.1)
3. **Improvement 4: Prompt Patterns Library** (NEW Section 5.1)
4. **Improvement 5: Failure Recovery Playbook** (NEW Section 7.1)

---

## Implementation Details

### Improvement 1: Historical Dependency Mapping (Section 2.6)

**Location:** After Section 2.5 (The Complete Orchestration Pattern)
**Size:** ~400-500 words
**Insertion Point:** Line 60 (after "## 2.5 The Complete Orchestration Pattern" section ends around line 186)

**Content Structure:**
- New header: `### 2.6 Contextual Task Classification Using Project History`
- Introductory paragraph explaining concept (use cached patterns from previous phases)
- **SparkQ Proven Patterns Table** showing:
  - Pattern category (Storage CRUD, API endpoints, CLI commands, UI components, Error handling)
  - Phase introduced
  - Key characteristics
  - Success metrics from actual phase
  - Token cost baseline
- **How to Apply** subsection (3 steps: match task to pattern, reference phase, adjust for specifics)
- **Example** showing how Phase 5 could have referenced Phase 3 for API error patterns
- **Benefit calculation** showing 30-40% token savings vs regenerating specs

**Why This Location:**
- Comes after orchestration pattern (readers understand the 3-step model)
- Before optimization workflow (provides context for faster workflow)
- Natural progression: understand pattern → apply project history → optimize workflow

---

### Improvement 2: Batch Dependency Analysis Template (Section 3.3.1)

**Location:** Within Section 3 (Optimization Workflow), after Section 3.3 (Design Parallel Execution Batches)
**Size:** ~600-700 words
**Insertion Point:** Line 230 (right after "## Step 3: Design Parallel Execution Batches" and before "## Step 4: Write Codex Prompts")

**Content Structure:**
- New header: `### 3.3.1 Pre-Batching Dependency Checklist`
- Problem statement: "Manual dependency analysis is error-prone; systematize it"
- **Dependency Classification Checklist** (copy-paste ready):
  - Hard dependencies (must run after: code generation, imports)
  - Soft dependencies (can run after: test execution, documentation)
  - Zero dependencies (fully independent)
  - Follow-up questions for each task (5-7 specific yes/no questions)
- **Reordering Principles** (how to minimize sequential chains)
- **Sonnet Prompt Template** for automated analysis:
  - Shows exact question format to ask Sonnet
  - Example task list format
  - Expected output format (dependency matrix)
- **Visual Example** showing Phase 3 dependency analysis:
  - Before: task list
  - After: batches with clear parallel groups
  - Parallelization % achieved
- **When to Use** (all phases, before batch design)

**Why This Location:**
- Directly follows batch design concept (logical progression)
- Provides systematic approach to the "ensure dependencies are resolved" rule
- Can be used by anyone (not just Sonnet-assisted planning)

---

### Improvement 4: Prompt Patterns Library (Section 5.1)

**Location:** Within Section 5 (Common Patterns), as NEW Section 5.1
**Size:** ~1500-2000 words
**Insertion Point:** Line 589 (right after "## 5. Common Patterns" header, before "### Pattern: Storage Layer")

**Content Structure:**
- New header: `### 5.1 SparkQ Prompt Patterns Library`
- Intro: "These patterns are proven from Phase 1-5 successful executions. Copy-paste for Phase 6+ tasks of same type."
- For EACH of 5 patterns:
  - Pattern name (e.g., "Storage Layer CRUD")
  - Which phases use it
  - Baseline token cost (Sonnet + Codex + Haiku from actual phase)
  - Success metrics (first-try success rate from actual execution)
  - Variable placeholders to replace: [ENTITY], [PHASE], [SECTION], [FIELDS], etc.
  - **Full Codex prompt template** (copy-paste ready, with placeholders)
  - **Haiku validation template** (specific commands for this pattern type)
  - **Example** showing actual Phase X usage
  - **Notes** on when to deviate from pattern

**Patterns to Include:**
1. **Pattern: Storage Layer CRUD** (From Phase 1, Phase 2)
   - Variables: [Entity], [fields], [filters]
   - Baseline: 1K Sonnet + 0 Codex + 1K Haiku
   - Include actual Phase 2 task_crud prompt as base

2. **Pattern: FastAPI REST Endpoints** (From Phase 3)
   - Variables: [Resource], [endpoints], [status_codes], [error_responses]
   - Baseline: 1K Sonnet + 0 Codex + 1.5K Haiku
   - Include actual Phase 3 sessions/streams endpoint prompts as base

3. **Pattern: CLI Command Implementation** (From Phase 2, Phase 3)
   - Variables: [Command], [subcommands], [arguments], [output_format]
   - Baseline: 1.5K Sonnet + 0 Codex + 2K Haiku
   - Include actual Phase 3 run/stop/status commands as base

4. **Pattern: HTML/CSS/JavaScript UI** (From Phase 3, Phase 5)
   - Variables: [Feature], [Page], [Components], [API_endpoints]
   - Baseline: 1.5K Sonnet + 0 Codex + 1.5K Haiku
   - Include actual Phase 5 UI components as base

5. **Pattern: Error Handling & Recovery** (From Phase 6 planning)
   - Variables: [ErrorType], [ExceptionClass], [Recovery], [UserMessage]
   - Baseline: 1K Sonnet + 0 Codex + 1K Haiku
   - Include Phase 6 error handling patterns

**Why This Location:**
- Comes after Section 5 intro (readers understand common patterns exist)
- Before existing pattern explanations (provides library before detailed descriptions)
- High discoverability for Phase 6+ implementers

**Implementation Notes:**
- Extract actual prompts from `/home/luce/apps/sparkqueue/_build/prompts-build/phase*-codex-batch*.sh` files
- Anonymize company/project names if using external examples
- Mark which patterns are "proven" (1+ successful phase) vs "projected" (planned phases)
- Add QR code or link to example scripts if creating HTML version

---

### Improvement 5: Failure Recovery Playbook (Section 7.1)

**Location:** Within Section 7 (Troubleshooting), as NEW Section 7.1
**Size:** ~800-1000 words
**Insertion Point:** Line 666 (right after "## 7. Troubleshooting" header, before "### Codex command fails")

**Content Structure:**
- New header: `### 7.1 Partial Batch Recovery Without Full Restart`
- Problem statement: "Large phases (6+) can't afford full restart; need targeted recovery"
- **Decision Tree:**
  - Is batch N the last completed batch? → YES: recover N+1
  - Are batches N+1+ dependent on N? → YES: restart from N+1 only
  - Are batches N+1+ independent? → YES: restart only the failed batch
- **Step-by-Step Recovery Process:**
  1. Identify exact files/commands that failed in batch N
  2. Extract original Codex prompt for failed file
  3. Generate recovery prompt (Sonnet, 1-2K tokens) with error details
  4. Execute only recovery Codex commands (parallel, $0)
  5. Validate only recovered files (Haiku, 0.5-1K tokens)
  6. Skip validation for batches 1 to N-1 (already passed)
- **Cost Comparison Table:**
  - Full restart scenario: tokens + wall-clock time
  - Targeted recovery scenario: tokens + wall-clock time
  - Savings calculation
- **Example Scenarios:**
  - Scenario A: Phase 6, Batch 3 fails after batches 1-2 complete
  - Scenario B: Phase 6, Batch 5 fails after batches 1-4 complete
  - Scenario C: Phase 6, Multiple files in batch fail
- **Sonnet Recovery Prompt Template:**
  - Format: "Original prompt was [paste], Codex error was [paste], fix this..."
  - Expected Sonnet output: revised prompt with specific corrections
  - Key: reuse file path, requirements; improve spec based on error
- **When to Use vs Full Restart:**
  - Use recovery: batch is N-1 or earlier (lower risk)
  - Use recovery: failure is syntax/logic (not architectural)
  - Full restart: batch is late in sequence (dependencies cascading)
  - Full restart: architectural issue affecting multiple batches
- **Safeguards:**
  - Always validate recovered files before merging
  - Keep backup of batch output before recovery attempt
  - If recovery fails twice, escalate to full restart
  - Document why recovery was chosen over restart

**Why This Location:**
- First troubleshooting section (readers encounter problems in order)
- Covers highest-impact failure scenario (batch failures in large phases)
- Provides systematic recovery path vs panicking and restarting

**Implementation Notes:**
- Include actual Phase 3 batch files as examples (real failing prompts)
- Create a "Recovery Decision Flowchart" visual
- Add checklist for "pre-recovery verification" (confirm batch state)

---

## Implementation Sequence

### Step 1: Add Improvement 1 (Historical Dependency Mapping)
- Insert after line 186 (end of Section 2.5)
- File: codex-optimization.md
- Size: ~500 words
- Dependencies: None (self-contained section)

### Step 2: Add Improvement 2 (Batch Dependency Analysis Template)
- Insert after line 230 (Section 3.3 "Design Parallel Execution Batches")
- File: codex-optimization.md
- Size: ~700 words
- Dependencies: Improvement 1 should be in place (references it as context)

### Step 3: Add Improvement 4 (Prompt Patterns Library)
- Insert after line 589 (Section 5 header)
- File: codex-optimization.md
- Size: ~2000 words
- Dependencies: None (extracting from existing project files)
- Requires reading:
  - `/home/luce/apps/sparkqueue/_build/prompts-build/phase*-codex-batch*.sh` (all phase scripts)
  - Extract actual Codex prompts, anonymize if needed
  - Map patterns to phases, extract token baselines from execution reports

### Step 4: Add Improvement 5 (Failure Recovery Playbook)
- Insert after line 666 (Section 7 header)
- File: codex-optimization.md
- Size: ~1000 words
- Dependencies: None (self-contained troubleshooting section)

---

## File Changes Summary

**File:** `/home/luce/apps/sparkqueue/.claude/playbooks/codex-optimization.md`

**Changes:**
1. Insert ~500 words after line 186 (new Section 2.6)
2. Insert ~700 words after line 230 (new Section 3.3.1)
3. Insert ~2000 words after line 589 (new Section 5.1)
4. Insert ~1000 words after line 666 (new Section 7.1)

**Total additions:** ~4200 words (~12-15 KB)
**Total file size impact:** ~1250 line additions (from ~1252 lines → ~2500 lines)

**No deletions:** All existing content preserved, only insertions between sections

---

## Verification Checklist

After implementation, verify:

- [ ] Section numbering is correct (2.6 after 2.5, 3.3.1 after 3.3, etc.)
- [ ] All internal links/references updated if any exist
- [ ] No line breaks or formatting issues from insertions
- [ ] Each new section has a clear header
- [ ] Prompt templates are copy-paste ready (no broken syntax)
- [ ] All examples reference actual phases (1-5)
- [ ] Token cost baselines match actual phase execution reports
- [ ] Decision trees and checklists are clear and actionable
- [ ] File renders correctly in markdown viewer

---

## Notes for Implementer

1. **Extraction Work:** Improvement 4 (Patterns Library) requires extracting from 20+ bash scripts in `_build/prompts-build/`. Plan accordingly.

2. **Anonymization:** Check if prompt templates contain sensitive paths or data that need anonymizing.

3. **Examples:** Use ACTUAL phase execution (Phase 1-5) not hypothetical examples. Users trust concrete evidence.

4. **Tone:** Keep consistency with existing playbook sections - practical, direct, no filler.

5. **Testing:** After adding sections, reference them from actual Phase 6 implementation to verify they work in practice.

---

## Success Criteria

Implementation is successful when:

1. ✅ All 4 improvements added to codex-optimization.md
2. ✅ No syntax errors in markdown file
3. ✅ All new sections are referenceable (e.g., "See Section 2.6")
4. ✅ Prompt templates work copy-paste ready in Codex
5. ✅ Examples match actual phase execution (Phase 1-5)
6. ✅ File size increase is ~4K-5K words (estimate: 4200 words planned)
7. ✅ Team can use new sections for Phase 6 (practical value)

---

**Status:** READY FOR REVIEW
**Approval Required:** Before proceeding with edits
