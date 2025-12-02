"""Prompt Pattern Templates for SparkQ AI Models

This module provides template functions and pattern definitions for generating
optimized prompts for AI model routing, Codex session management, and other
AI Models feature work.

Templates follow the Complete Orchestration Pattern from .claude/playbooks/codex-optimization.md:
  Sonnet (generate prompt) → Codex (execute code) → Haiku (validate output)
"""

from typing import Dict, List, Optional
from pathlib import Path


# Pattern Registry
PROMPT_PATTERNS: Dict[str, Dict] = {
    "ai-model-routing": {
        "name": "AI Model Routing Pattern",
        "purpose": "Design or adjust how SparkQ chooses between Sonnet, Haiku, and Codex for a given task",
        "context_sources": [
            "_build/FRD/sparkq_FRD-v9.0.md (Section 9.5)",
            ".claude/playbooks/codex-optimization.md",
            ".claude/CLAUDE.md (model delegation rules)"
        ],
        "output_type": "model_selection_logic",
        "persona": "sonnet-prompt-architect-ai-models"
    },
    "codex-session-management": {
        "name": "Codex Session Management Pattern",
        "purpose": "Design Codex session management for a specific queue or workflow",
        "context_sources": [
            "_build/FRD/sparkq_FRD-v9.0.md (Section 9.6)",
            "sparkq/queue_runner.py (lines 423-447)"
        ],
        "output_type": "session_strategy",
        "persona": "sonnet-prompt-architect-ai-models"
    }
}


def ai_model_routing_template(
    queue_name: str,
    goal: str,
    task_description: str,
    constraints: Optional[List[str]] = None,
    frd_context: Optional[str] = None
) -> str:
    """Generate a prompt for AI model routing design.

    Args:
        queue_name: Name of the queue this routing applies to
        goal: What the routing optimization aims to achieve
        task_description: Description of the task type being analyzed
        constraints: Optional list of specific constraints (FRD guardrails auto-injected)
        frd_context: Optional FRD v9.0 context (auto-fetched if None)

    Returns:
        Complete prompt ready for Sonnet execution
    """
    if constraints is None:
        constraints = []

    # Auto-inject FRD v9.0 guardrails
    frd_guardrails = [
        "Single-user, local-first context (no multi-tenant logic)",
        "Manual execution model (function returns recommendation, does NOT auto-execute)",
        "Cost optimization (prefer Haiku or Codex over Sonnet)",
        "No platform bloat or SaaS drift"
    ]
    all_constraints = constraints + frd_guardrails

    if frd_context is None:
        frd_context = """Current Model Selection (FRD v9.0 Section 9.5):
- Sonnet 4.5: Orchestration, reasoning, complex decisions, planning, prompt generation
- Haiku: Fast searches, validation, log analysis, simple checks (15 task types defined)
- Codex: Code generation from specs ($0 cost via separate subscription)

Model Routing Decision Tree:
1. Simple validation/search? → Haiku (automatic)
2. Pure code generation from spec? → Codex (automatic)
3. Reasoning/orchestration? → Sonnet"""

    prompt = f"""# AI Model Routing Design: {queue_name}

## Goal
{goal}

## Context

### Model Capabilities (FRD v9.0)
{frd_context}

### Task Analysis
{task_description}

## Requirements

### Constraints
{chr(10).join(f"- {c}" for c in all_constraints)}

## Design Task

Propose model routing logic for this task type that:
1. Aligns with FRD v9.0 guardrails
2. Maximizes cost optimization
3. Preserves manual review gates
4. Respects single-user/local-first context

## Output Format

Provide:
1. **Recommended Model**: Which model (Sonnet/Haiku/Codex) should handle this task type
2. **Rationale**: Why this model is optimal (cost, capabilities, constraints)
3. **Implementation Sketch**: Pseudocode or logic for model selection
4. **Validation Steps**: How to verify the routing works correctly
5. **FRD Compliance Check**: Confirm alignment with guardrails

## Validation Criteria
- Does this preserve manual execution model?
- Is cost optimization maximized?
- Are FRD v9.0 guardrails respected?
- Is the solution single-user/local-first?
"""

    return prompt


def codex_session_management_template(
    queue_name: str,
    queue_description: str,
    task_sequence: List[str],
    expected_task_count: Optional[int] = None,
    constraints: Optional[List[str]] = None
) -> str:
    """Generate a prompt for Codex session management design.

    Args:
        queue_name: Name of the queue
        queue_description: Purpose and context of the queue
        task_sequence: List of expected tasks in order
        expected_task_count: Estimated number of tasks per session
        constraints: Optional list of specific constraints

    Returns:
        Complete prompt ready for Sonnet execution
    """
    if constraints is None:
        constraints = []

    # Auto-inject FRD v9.0 guardrails for session management
    frd_guardrails = [
        "Manual execution model (human copies session ID from Codex output)",
        "FRD v9.0 compliant (no auto-execution of Codex commands)",
        "Single-user, local-first (no distributed session management)",
        "Session isolation per queue (no cross-queue contamination)"
    ]
    all_constraints = constraints + frd_guardrails

    task_count_str = f"approximately {expected_task_count}" if expected_task_count else "unknown"
    task_list = "\n".join(f"{i+1}. {task}" for i, task in enumerate(task_sequence))

    prompt = f"""# Codex Session Management Design: {queue_name}

## Queue Context

### Purpose
{queue_description}

### Expected Task Sequence
{task_list}

### Estimated Task Count
{task_count_str} tasks per session

## Session Strategy Analysis

Answer these questions to determine session strategy:

1. **Contextual Relatedness**: Are tasks contextually related? (Do later tasks build on earlier ones?)
2. **Session Value**: Would session persistence add value? (Would Codex benefit from prior context?)
3. **Task Dependencies**: Do tasks share files, concepts, or architectural decisions?
4. **Session Lifecycle**: When should session start? When should it end?

## Current Implementation (queue_runner.py:423-447)

SparkQ already supports Codex session persistence:
- First task in queue: Creates new session, logs capture instructions
- Subsequent tasks: Uses `codex exec --resume <session_id>` for context continuity
- Session ID stored in `queues.codex_session_id` column
- Manual capture workflow (human copies session ID from Codex output)

## Design Task

Determine whether this queue should use persistent Codex sessions.

### Constraints
{chr(10).join(f"- {c}" for c in all_constraints)}

## Output Format

Provide:

1. **Recommendation**: Use persistent sessions? (Yes/No)
2. **Rationale**: Why or why not? (specific to this queue's task pattern)
3. **Session Lifecycle**:
   - When to create new session?
   - When to resume existing session?
   - When to end/retire session?
4. **Implementation Notes**: Any queue-specific considerations
5. **Manual Workflow**: Steps for human operator to manage session

## Example Implementation Snippet

If recommending persistent sessions, provide Python pseudocode for:
- Detecting first Codex task in queue
- Capturing session ID from Codex output
- Storing session ID via API
- Resuming session on subsequent tasks

## Validation
- Does this preserve manual execution model?
- Is session isolation maintained (no cross-queue leakage)?
- Are FRD v9.0 guardrails respected?
"""

    return prompt


def load_frd_context(section: str = "9.5") -> Optional[str]:
    """Load FRD v9.0 context for a specific section.

    Args:
        section: FRD section number (default: 9.5 for Model Selection)

    Returns:
        Extracted FRD context or None if not found
    """
    frd_path = Path("_build/FRD/sparkq_FRD-v9.0.md")

    if not frd_path.exists():
        return None

    try:
        content = frd_path.read_text(encoding="utf-8")

        # Simple section extraction (find heading with section number)
        section_marker = f"## {section}"
        if section_marker in content:
            start_idx = content.index(section_marker)
            # Find next section (## followed by number)
            next_section = content.find("\n## ", start_idx + len(section_marker))
            if next_section == -1:
                section_content = content[start_idx:]
            else:
                section_content = content[start_idx:next_section]

            return section_content.strip()

        return None
    except Exception:
        return None


def inject_frd_guardrails() -> List[str]:
    """Return standard FRD v9.0 guardrails for all AI Models prompts.

    Returns:
        List of guardrail constraints
    """
    return [
        "Single-user, local-first (no multi-tenant, no auth, no billing)",
        "Manual execution model (Claude-in-chat decides, no full automation)",
        "Respect existing queue/task architecture",
        "No platform bloat or SaaS drift",
        "Simplicity bias (SQLite, file-based, minimal infrastructure)",
        "Backward compatibility (preserve existing CLI/API)",
        "Cost optimization (prefer Haiku/Codex over Sonnet where possible)"
    ]


def get_pattern_info(pattern_id: str) -> Optional[Dict]:
    """Get metadata for a specific pattern.

    Args:
        pattern_id: Pattern identifier (e.g., "ai-model-routing")

    Returns:
        Pattern metadata dict or None if not found
    """
    return PROMPT_PATTERNS.get(pattern_id)


def list_patterns() -> List[str]:
    """List all available pattern IDs.

    Returns:
        List of pattern IDs
    """
    return list(PROMPT_PATTERNS.keys())
