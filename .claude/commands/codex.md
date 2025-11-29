---
description: Generate and execute Codex prompts for $0 code generation from specifications
tags: [utility, model-selection, cost-optimization, code-generation]
---

Generate a detailed Codex prompt and execute it using `codex exec --full-auto` for $0 cost code generation.

## Codex is Ideal For (15 Use Cases)

1. **API endpoint implementation** - Complete REST/HTTP handlers from spec
2. **Database model creation** - SQLAlchemy/Pydantic model generation
3. **CLI command scaffolding** - Click/argparse command implementations
4. **CRUD operation boilerplate** - Create/read/update/delete functions
5. **UI component generation** - HTML templates, Bootstrap components
6. **Schema definitions** - SQL DDL, JSON Schema, type definitions
7. **Test file generation** - pytest test cases from specifications
8. **Configuration file templates** - YAML/JSON/TOML config generation
9. **Utility function libraries** - Helper functions from requirements
10. **Form validation logic** - Input validation and error handling
11. **Data transformation pipelines** - ETL-style data processing
12. **API client wrappers** - HTTP client code for external APIs
13. **Migration scripts** - Database schema migrations
14. **Documentation generation** - README, API docs, usage examples
15. **Bash utility scripts** - Setup, teardown, deployment scripts

## Prerequisites for Codex

Before using this command, ensure:
- ✅ Clear specification exists or can be derived from context
- ✅ No architectural decisions needed (pattern-based generation only)
- ✅ File path and requirements are clear
- ✅ Validation criteria are defined

## Your Task (Sonnet)

You are operating in Sonnet mode. Your job is to:

1. **Analyze the user's request** and extract:
   - Context (what phase/feature is this part of?)
   - Specific task (what code needs to be generated?)
   - File path (where does this code go?)
   - Requirements (what must the code do?)
   - Specification (detailed implementation details)
   - Validation (how to verify it works?)

2. **Generate a detailed Codex prompt** and **execute immediately in background**:

```bash
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: [Brief phase/feature description]

Task: [Specific code generation task - be precise]

File to create/modify: [exact relative path from project root]

Requirements:
- [Requirement 1 - specific and testable]
- [Requirement 2 - specific and testable]
- [Requirement 3 - specific and testable]
[Add more as needed]

Specification:
[Provide COMPLETE detailed specification including:
 - Function signatures
 - Class structure
 - Import statements needed
 - Error handling approach
 - Return types
 - Example usage
 - Edge cases to handle]

Validation:
- [How to verify the code works - provide exact commands]
- [Expected output or behavior]
- [Test cases to run]
"
```

**EXECUTION: Use Bash tool with `run_in_background: true` parameter**

3. **Execute in background** with output capture to `_build/codex-chat`:

```bash
# Create the _build/codex-chat directory if needed
mkdir -p _build/codex-chat

# Run Codex in background, capturing output with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
codex exec --full-auto -C /home/luce/apps/sparkqueue "..." 2>&1 | tee "_build/codex-chat/codex-result_${TIMESTAMP}.txt"
```

**Use Bash tool with `run_in_background: true` parameter**

4. **Report immediately to the user:**
   - Brief description of what's being generated
   - Background task ID for reference
   - What files will be created/modified
   - Location of prompt result file: `_build/codex-chat/codex-result_TIMESTAMP.txt`
   - Note that Codex will complete asynchronously

**DO NOT WAIT** for Codex to complete - execute in background and report status

## When NOT to Use Codex

- Architectural decisions required (stay in Sonnet)
- Business logic with complex conditionals (stay in Sonnet)
- Integration code combining multiple components (stay in Sonnet)
- Unclear requirements or missing context (ask user first)

## Example Execution

**User Request:**
```
/codex Create an API endpoint for listing all tasks
```

**Your Response (Sonnet):**
```
Analyzing requirements and generating Codex prompt...

[Execute Bash command with detailed Codex prompt]

✅ Generated: sparkq/src/api/endpoints/tasks.py
   - GET /api/tasks endpoint
   - Returns JSON list of all tasks
   - Includes error handling

Validation:
Run: curl http://localhost:5005/api/tasks
Expected: JSON array of task objects
```

## User's Request

Generate and execute Codex prompt for:

---

{{prompt}}
