---
description: Execute prompt with Haiku for fast, cheap searches/checks/validations
tags: [utility, model-selection, cost-optimization]
---

Execute the following prompt using the Haiku model (claude-haiku-4-5-20250929) for fast, cost-effective execution.

## Haiku is Ideal For (15 Use Cases)

1. **Syntax validation** - Running `python -m py_compile` on generated code
2. **Import resolution checks** - Verifying all imports are valid
3. **Placeholder detection** - Finding TODO, FIXME, NotImplementedError
4. **Quick file searches** - Simple grep/glob operations for specific files/keywords
5. **File structure verification** - Checking if files exist at expected paths
6. **Output summarization** - Condensing long command outputs
7. **Simple code lookups** - Finding where a function/class is defined (needle queries)
8. **Quick sanity tests** - Running basic test commands
9. **Log file scanning** - Searching for errors in logs
10. **Configuration file validation** - Checking YAML/JSON syntax
11. **Dependency list generation** - Extracting imports from files
12. **Line count checks** - Simple file statistics
13. **Recent file activity** - Finding recently modified files
14. **Git status checks** - Quick branch/status queries
15. **Simple text transformations** - Basic find/replace operations

## When NOT to Use Haiku

- Exploratory codebase analysis (use Task tool with Explore agent instead)
- Code generation (use /codex instead)
- Complex reasoning or architectural decisions (stay in Sonnet)
- Multi-step orchestration (stay in Sonnet)

## User's Prompt

Execute this with Haiku:

---

{{prompt}}
