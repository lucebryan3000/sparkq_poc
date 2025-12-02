"""Prompt Engine for SparkQ AI Models

This module provides the core prompt building and management functionality for
AI Models workflows. It integrates with:
- Persona registry (personas.py) for role-based prompt generation
- Prompt templates (prompt_templates.py) for pattern-based prompts
- FRD v9.0 context injection for guardrail enforcement

Workflow:
1. Load pattern template (ai-model-routing, codex-session-management)
2. Inject FRD v9.0 context and guardrails
3. Build prompt using template function
4. Save prompt to _build/prompts/ai-models/{timestamp}-{pattern}.md
5. Return prompt path for manual review and execution
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .prompt_templates import (
    PROMPT_PATTERNS,
    ai_model_routing_template,
    codex_session_management_template,
    inject_frd_guardrails,
    load_frd_context,
)
from .personas import get_persona, Persona


class PromptEngine:
    """Core prompt building and management engine for AI Models."""

    def __init__(self, prompts_dir: Optional[Path] = None):
        """Initialize prompt engine.

        Args:
            prompts_dir: Directory to save generated prompts (default: _build/prompts/ai-models/)
        """
        if prompts_dir is None:
            prompts_dir = Path("_build/prompts/ai-models")

        self.prompts_dir = prompts_dir
        self.prompts_dir.mkdir(parents=True, exist_ok=True)

    def build_ai_model_routing_prompt(
        self,
        queue_name: str,
        goal: str,
        task_description: str,
        constraints: Optional[List[str]] = None,
        include_frd_context: bool = True,
    ) -> str:
        """Build a prompt for AI model routing design.

        Args:
            queue_name: Name of the queue
            goal: Routing optimization goal
            task_description: Description of task type being analyzed
            constraints: Optional additional constraints
            include_frd_context: Whether to inject FRD v9.0 context (default: True)

        Returns:
            Complete prompt ready for Sonnet execution
        """
        frd_context = None
        if include_frd_context:
            frd_context = load_frd_context("9.5")  # Model Selection section

        return ai_model_routing_template(
            queue_name=queue_name,
            goal=goal,
            task_description=task_description,
            constraints=constraints,
            frd_context=frd_context,
        )

    def build_codex_session_prompt(
        self,
        queue_name: str,
        queue_description: str,
        task_sequence: List[str],
        expected_task_count: Optional[int] = None,
        constraints: Optional[List[str]] = None,
    ) -> str:
        """Build a prompt for Codex session management design.

        Args:
            queue_name: Name of the queue
            queue_description: Queue purpose and context
            task_sequence: List of expected tasks
            expected_task_count: Estimated task count
            constraints: Optional additional constraints

        Returns:
            Complete prompt ready for Sonnet execution
        """
        return codex_session_management_template(
            queue_name=queue_name,
            queue_description=queue_description,
            task_sequence=task_sequence,
            expected_task_count=expected_task_count,
            constraints=constraints,
        )

    def save_prompt(
        self,
        pattern_id: str,
        prompt_content: str,
        metadata: Optional[Dict] = None,
    ) -> Path:
        """Save a generated prompt to the prompts directory.

        Args:
            pattern_id: Pattern identifier (e.g., "ai-model-routing")
            prompt_content: The full prompt text
            metadata: Optional metadata to include in frontmatter

        Returns:
            Path to the saved prompt file
        """
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        filename = f"{timestamp}-{pattern_id}.md"
        filepath = self.prompts_dir / filename

        # Build frontmatter if metadata provided
        frontmatter = ""
        if metadata:
            frontmatter = "---\n"
            frontmatter += f"pattern: {pattern_id}\n"
            frontmatter += f"generated_at: {datetime.now().isoformat()}\n"
            for key, value in metadata.items():
                if isinstance(value, (list, dict)):
                    frontmatter += f"{key}: {json.dumps(value)}\n"
                else:
                    frontmatter += f"{key}: {value}\n"
            frontmatter += "---\n\n"

        # Write prompt file
        filepath.write_text(frontmatter + prompt_content, encoding="utf-8")

        return filepath

    def build_and_save(
        self,
        pattern_id: str,
        **kwargs,
    ) -> Tuple[str, Path]:
        """Build a prompt from a pattern and save it.

        Args:
            pattern_id: Pattern identifier ("ai-model-routing" or "codex-session-management")
            **kwargs: Pattern-specific arguments

        Returns:
            Tuple of (prompt_content, saved_path)

        Raises:
            ValueError: If pattern_id is unknown
        """
        # Validate pattern
        if pattern_id not in PROMPT_PATTERNS:
            raise ValueError(
                f"Unknown pattern: {pattern_id}. "
                f"Available patterns: {list(PROMPT_PATTERNS.keys())}"
            )

        # Build prompt based on pattern
        if pattern_id == "ai-model-routing":
            prompt = self.build_ai_model_routing_prompt(
                queue_name=kwargs.get("queue_name", "unknown"),
                goal=kwargs.get("goal", ""),
                task_description=kwargs.get("task_description", ""),
                constraints=kwargs.get("constraints"),
                include_frd_context=kwargs.get("include_frd_context", True),
            )
        elif pattern_id == "codex-session-management":
            prompt = self.build_codex_session_prompt(
                queue_name=kwargs.get("queue_name", "unknown"),
                queue_description=kwargs.get("queue_description", ""),
                task_sequence=kwargs.get("task_sequence", []),
                expected_task_count=kwargs.get("expected_task_count"),
                constraints=kwargs.get("constraints"),
            )
        else:
            raise ValueError(f"Pattern {pattern_id} not yet implemented")

        # Prepare metadata
        metadata = {
            "queue_name": kwargs.get("queue_name", "unknown"),
            "pattern_info": PROMPT_PATTERNS[pattern_id],
        }

        # Save prompt
        saved_path = self.save_prompt(pattern_id, prompt, metadata)

        return prompt, saved_path

    def get_persona_for_pattern(self, pattern_id: str) -> Optional[Persona]:
        """Get the recommended persona for a pattern.

        Args:
            pattern_id: Pattern identifier

        Returns:
            Persona object or None if pattern not found
        """
        pattern_info = PROMPT_PATTERNS.get(pattern_id)
        if not pattern_info:
            return None

        persona_id = pattern_info.get("persona")
        if not persona_id:
            return None

        try:
            return get_persona(persona_id)
        except ValueError:
            return None

    def list_saved_prompts(self, pattern_id: Optional[str] = None) -> List[Path]:
        """List all saved prompts, optionally filtered by pattern.

        Args:
            pattern_id: Optional pattern to filter by

        Returns:
            List of prompt file paths, sorted by timestamp (newest first)
        """
        if pattern_id:
            pattern = f"*-{pattern_id}.md"
        else:
            pattern = "*.md"

        prompts = sorted(
            self.prompts_dir.glob(pattern),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )

        return prompts


def create_prompt_builder_payload(
    pattern_id: str,
    queue_name: str,
    goal: str,
    **kwargs,
) -> Dict:
    """Create a payload for the prompt-builder queue.

    This is a helper function to create standardized payloads for submitting
    prompt generation tasks to the prompt-builder queue.

    Args:
        pattern_id: Pattern to use ("ai-model-routing", "codex-session-management")
        queue_name: Name of the queue this prompt is for
        goal: Goal of the prompt generation
        **kwargs: Pattern-specific additional parameters

    Returns:
        Payload dict ready for queue submission
    """
    payload = {
        "pattern_id": pattern_id,
        "queue_name": queue_name,
        "goal": goal,
        "feature": "ai-models",
        "constraints": inject_frd_guardrails(),
    }

    # Add pattern-specific fields
    if pattern_id == "ai-model-routing":
        payload["task_description"] = kwargs.get("task_description", "")
    elif pattern_id == "codex-session-management":
        payload["queue_description"] = kwargs.get("queue_description", "")
        payload["task_sequence"] = kwargs.get("task_sequence", [])
        payload["expected_task_count"] = kwargs.get("expected_task_count")

    return payload
