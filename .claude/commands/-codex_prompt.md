# Codex Prompt Generator

Generate optimized Codex execution prompts from implementation specs using the **Complete Orchestration Pattern** from `.claude/playbooks/codex-optimization.md`.

## Quick Reference

**See the playbook for:**
- Full workflow and decision tree (Section 3)
- Model assignment matrix (Section 2)
- Batch design patterns (Section 13)
- Complete prompt template (Section 12)
- Real-world examples (Section 8.5)

## Your Task

Given either a file path or direct specification:

1. **Analyze** the requirements
2. **Classify** each task: Codex (code gen) | Sonnet (logic) | Haiku (validation)
3. **Design batches** following playbook patterns
4. **Generate prompts** ready to copy-paste
5. **Estimate tokens** and parallel execution gains

## Model Assignment (From Playbook Section 2)

| Task Type | Model | Reason |
|-----------|-------|--------|
| Code generation from spec | Codex | $0 cost, pattern-based |
| Prompt generation, orchestration | Sonnet | Reasoning, architecture |
| Syntax validation, placeholders | Haiku | Simple checks |

## Batch Design (From Playbook Section 3.3)

- **Sequential batches:** Tasks with dependencies
- **Parallel batches:** Independent tasks in same group
- **Validation:** After each batch completes (Haiku)
- **Target:** >70% parallelization

## Codex Prompt Format (From Playbook Section 3.4)

```bash
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: [Phase] - [Description]
Reference: [FRD section if applicable]

Task: [Specific code generation task]

File to create/modify: [exact relative path]

Requirements:
- [Specific requirements]

Specification:
[Complete spec or code template]

Validation:
- [How to verify correctness]
"
```

## Output Structure

1. **Task Analysis**
   - Total tasks identified
   - Model assignments (X Codex, Y Sonnet, Z Haiku)
   - Batch structure with dependencies

2. **Batch Execution**
   - One prompt per task
   - Sequential/parallel grouping
   - Wall-clock time estimates

3. **Validation Plan**
   - Haiku validation commands
   - Success criteria

4. **Token Estimate**
   - Sonnet (prompt gen): X tokens
   - Codex execution: $0
   - Actual vs playbook benchmarks

## Examples from Playbook

See Section 8.5 (Phase 1 Real Results):
- Phase 1: 5-8K tokens actual vs 23K estimate (78% savings)
- 30-45 min wall-clock with 6-8 parallel processes
- 100% first-try success rate with detailed Sonnet prompts

## Key Principles

✅ Maximize Codex (code generation = $0)
✅ Reserve Sonnet for reasoning/architecture
✅ Batch independent tasks for parallelization
✅ Include exact specs in prompts
✅ Validate after each batch

Now analyze the user's input and generate optimized Codex execution structure.
