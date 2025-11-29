# Codex Prompt Generator (/-codex_prompt)

**PURPOSE**: Automatically refactor ANY implementation plan into a Codex-optimized execution spec using the **Complete Orchestration Pattern** from `.claude/playbooks/codex-optimization.md` (Section 2.5).

**CRITICAL**: This command is NOT optional guidance. When invoked, you MUST:
1. ✅ Read the playbook (Section 2.5: Complete Orchestration Pattern)
2. ✅ Analyze the phase/spec provided
3. ✅ Refactor into Complete Orchestration format
4. ✅ Replace/overwrite the planning document with execution spec
5. ✅ Output ready-to-execute Codex prompts

**CONSISTENCY REQUIREMENT**: No interpretation, no "wild west" variability. Execute this pattern identically every time.

---

## Mandatory Execution Steps

When user invokes: `/-codex_prompt refactor @<file_path>`

### Step 1: READ THE PLAYBOOK (Section 2.5)
- Read: `/home/luce/apps/sparkqueue/.claude/playbooks/codex-optimization.md`
- Focus: Section 2.5 "The Complete Orchestration Pattern (SparkQ Implementation)"
- Extract: The 3-step workflow (Sonnet → Codex → Haiku)
- Extract: Token cost structure and execution model

### Step 2: ANALYZE THE PHASE
- Read: The file provided (@file_path)
- Identify: ALL tasks that need to be done
- Classify each task:
  - **Codex**: Pure code generation from spec (no decisions needed)
  - **Sonnet**: Reasoning, orchestration, prompt generation
  - **Haiku**: Syntax validation, placeholder detection
  - **Manual**: Git operations, file review (not automated)

### Step 3: ANALYZE DEPENDENCIES (Playbook Section 3.3.1)
- For each task, determine:
  - **HARD dependency**: Task X MUST complete before task Y starts
  - **SOFT dependency**: Task X SHOULD complete before Y, but can work independently
  - **NONE**: Tasks are independent
- Create dependency matrix
- Group into batches:
  - Sequential batches (dependencies require ordering)
  - Parallel batches (independent tasks can run simultaneously)
- Target: >70% parallelization

### Step 4: DESIGN EXECUTION SPEC
Output must follow this exact structure:
```markdown
# [Phase Name] - Complete Orchestration Execution Spec

> **Status**: Ready for execution (not planning)
> **Total Token Budget**: XK tokens (YK Sonnet + ZK Haiku + $0 Codex)
> **Execution Model**: Sonnet → Codex (parallel) → Haiku (validation)
> **Wall-clock time**: X minutes
> **Parallelization ratio**: X%

## Task Analysis

[List all tasks identified]

## Dependency Analysis

[Dependency matrix showing which tasks block which]

## Execution Batches

Batch 1 (Sequential): [Description]
├─ [Task 1]
└─ [Task 2]

Batch 2 (Parallel after 1): [Description]
├─ [Task 3]
├─ [Task 4]
└─ [Task 5]

[etc]

## Step 1: Sonnet Prompt Generation

[Detailed prompts for Sonnet to generate Codex prompts]

## Step 2: Codex Execution

Batch 1:
\`\`\`bash
codex exec --full-auto -C /home/luce/apps/sparkqueue "[Prompt 1]"
\`\`\`

Batch 2 (Parallel):
\`\`\`bash
codex exec --full-auto -C /home/luce/apps/sparkqueue "[Prompt 2]" &
codex exec --full-auto -C /home/luce/apps/sparkqueue "[Prompt 3]" &
wait
\`\`\`

## Step 3: Haiku Validation

[Validation checkpoints and Haiku prompts]

## Step 4: Self-Test BEFORE User Testing

**CRITICAL**: Before asking the user to test, YOU must test programmatically first.

**Reference**: See `.claude/playbooks/self-testing-protocol.md` for detailed testing procedures.

### Automated Testing Checklist

For each feature implemented, complete this checklist:

**Backend/API Features:**
- [ ] Check server is running (curl health endpoint)
- [ ] Test API endpoint with curl/httpie
- [ ] Verify response format matches spec
- [ ] Test error cases (404, 400, etc.)
- [ ] Check database state if applicable
- [ ] Verify logs show expected behavior

**CLI Features:**
- [ ] Run command with --help
- [ ] Test happy path with valid inputs
- [ ] Test error cases with invalid inputs
- [ ] Verify output format
- [ ] Check file/database side effects

**UI Features:**
- [ ] Fetch HTML and verify structure
- [ ] Check JavaScript loads without errors
- [ ] Verify API calls in browser network tab (or curl)
- [ ] Test interactive features programmatically
- [ ] Check element visibility/state

**E2E Workflows:**
- [ ] Run pytest e2e tests if they exist
- [ ] Create manual test script if needed
- [ ] Verify entire workflow end-to-end
- [ ] Check all state transitions
- [ ] Validate final state

### Testing Commands to Run

```bash
# API endpoint testing
curl -X GET http://localhost:5005/api/endpoint
curl -X POST http://localhost:5005/api/endpoint -H "Content-Type: application/json" -d '{"key": "value"}'

# CLI testing
./sparkq.sh command --help
./sparkq.sh command arg1 arg2

# Database verification
sqlite3 sparkq/sparkq.db "SELECT * FROM table LIMIT 5;"

# UI testing
curl http://localhost:5005/ | grep "expected-element"
curl http://localhost:5005/page.html | grep -o "<div id=\"component\""

# E2E testing
cd sparkq && pytest tests/e2e/test_feature.py -v
```

### What to Report to User

After self-testing, report:

✅ **Confirmed Working:**
- Feature X works (tested with: command/curl)
- Feature Y verified (output: result)

❓ **User Verification Needed:**
- Visual appearance (screenshot needed)
- User experience feedback
- Performance perception
- Edge cases requiring domain knowledge

❌ **Found Issues:**
- Bug description
- Error message
- Fix applied
- Re-tested and confirmed

**NEVER** report "Not fully implemented yet" after you claim it's done. Test it yourself first.

## Token Breakdown

[Table showing token costs per step]

## Execution Timeline

[Timing breakdown showing wall-clock time]
```

### Step 5: REPLACE THE PLANNING DOCUMENT
- Delete or archive the original planning document
- Create new execution spec file with suffix `-EXECUTION-SPEC.md`
- Output the spec in full
- State clearly: "Ready for execution" (not planning)

### Step 6: DELIVER READY-TO-EXECUTE PROMPTS
- All Codex prompts must be copy-paste ready
- Include exact file paths
- Include exact specifications
- Include validation commands
- No vague instructions

---

## Non-Negotiable Requirements

When you invoke `/-codex_prompt`:

❌ DO NOT:
- Ask for clarification or more details
- Suggest alternatives or variations
- Question the approach
- Treat it as "optional guidance"
- Generate planning documents
- Return vague recommendations
- **Ask user to test features you haven't tested yourself**
- **Report "not fully implemented" after claiming completion**

✅ DO:
- Read the playbook immediately
- Apply it systematically
- Generate detailed execution spec
- Include ready-to-copy Codex prompts
- State token costs and timeline
- Deliver in <10 minutes
- **Test all features programmatically BEFORE user testing**
- **Report bugs found during self-testing and fix them**
- **Only ask user to verify UX/visual aspects after functional testing**

---

Given `/-codex_prompt refactor @<file_path>`:

1. Read the playbook (Section 2.5)
2. Analyze the file provided
3. Refactor into Complete Orchestration format
4. Output execution spec ready to execute
5. Deliver in <10 minutes (no planning, no questions)

---

## Reference: Model Assignment (Playbook Section 2)

| Task Type | Model | Reason |
|-----------|-------|--------|
| Code generation from spec | Codex | $0 cost, pattern-based |
| Prompt generation, orchestration | Sonnet | Reasoning, architecture |
| Syntax validation, placeholders | Haiku | Simple checks |

## Reference: Codex Prompt Format (Playbook Section 3.4)

```bash
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: [Phase] - [Description]

Task: [Specific code generation task]

File to create/modify: [exact relative path]

Requirements:
- [Requirement 1]
- [Requirement 2]

Specification:
[Complete spec from original]

Validation:
- [How to verify correctness]
"
```

---

## Checklist for You (Before Invoking)

- [ ] You have a planning document or phase spec to refactor
- [ ] You want an EXECUTION spec (not more planning)
- [ ] You want ready-to-copy Codex prompts
- [ ] You're ready for the playbook's Complete Orchestration Pattern to be applied
- [ ] You understand: This will replace vague planning with concrete execution

---

## After Running /-codex_prompt

You will receive:
- ✅ Execution spec (not planning document)
- ✅ Task analysis with dependencies
- ✅ Batch design (sequential + parallel)
- ✅ Ready-to-copy Codex prompts (copy-paste to terminal)
- ✅ Token costs and wall-clock timeline
- ✅ Haiku validation checkpoints
- ✅ **Self-testing results (what was tested, what works, what bugs were found/fixed)**
- ✅ **Clear distinction: what's tested vs what needs user verification**

---

## The Testing Workflow (MANDATORY)

```
Implementation → Haiku Validation → SELF-TESTING → Bug Fixes → User Verification
                                       ↑
                                 YOU ARE HERE
                              (before user sees it)
```

**Rule:** Never hand off to user until you've completed self-testing.

**Exception:** UI visual design, UX feedback, domain-specific edge cases that require user knowledge.

---

**This is how /-codex_prompt MUST work: Consistently, completely, following the playbook every time. No exceptions, no "wild west" variability.**
