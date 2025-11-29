# SparkQueue Project Guidelines

## Project Overview
SparkQueue is a Python-based distributed task/job queue management system with a bootstrap-based deployment model.

**Technology Stack:**
- Python 3.11+ (as specified in config)
- YAML configuration files
- Virtual environment management via `python-bootstrap`
- Background process model for task execution

## Key Principles
- **Simplicity First**: Keep code straightforward and maintainable
- **No Over-engineering**: Only implement what's explicitly needed
- **Defensive Coding**: Verify dependencies before any destructive operations
- **Defensive Deletion**: Always investigate before deleting anything (use `/investigate` for help)
- **Cost-Optimized Model Selection**: Automatically route tasks to the most cost-effective model

## Development Workflow

### Before Making Changes
1. Read the relevant code files first
2. Understand existing patterns and conventions
3. Check for dependencies and side effects
4. Create a todo list for complex tasks
5. Never assume something is unused without investigation

### Code Changes
- Make focused, minimal changes
- Don't refactor surrounding code unless necessary
- Avoid adding comments unless logic is non-obvious
- Don't add features that aren't explicitly requested

### Testing & Validation
- **ALWAYS test features yourself before asking user to test**
- Test changes in the venv before deploying
- Verify changes don't break existing functionality
- Check for security vulnerabilities
- See `.claude/playbooks/self-testing-protocol.md` for detailed testing procedures
- Only ask user to verify UX/visual aspects after functional testing

## File Structure
```
sparkqueue/
├── .claude/                    # Claude Code configuration
├── python-bootstrap/           # Bootstrap venv setup scripts
│   ├── bootstrap.sh           # Main bootstrap script
│   ├── stop-env.sh            # Interactive process manager
│   ├── kill-python.sh         # Quick kill script
│   ├── requirements.txt       # Bootstrap base deps
│   └── README.md              # Bootstrap documentation
├── _build/                    # Build output (generated)
├── logs/                      # Runtime logs
├── docs/                      # Project documentation
└── python-bootstrap.config    # Bootstrap configuration
```

## Common Commands
- `/dev` - Development setup & common tasks
- `/setup` - Bootstrap Python environment
- `/test` - Testing and validation
- `/debug` - Debugging techniques
- `/investigate` - Defensive dependency checks before deletion
- `/-codex_prompt` - Generate execution specs with mandatory self-testing

## Bootstrap Management
The project uses a self-contained Python bootstrap system:
- `./python-bootstrap/bootstrap.sh` - Set up venv and run app
- `./python-bootstrap/stop-env.sh` - Interactive process manager
- `./python-bootstrap/kill-python.sh` - Quick kill all sparkqueue processes
- `python-bootstrap.config` - Configuration file (auto-updated)

## Dependencies Investigation Protocol
**CRITICAL**: Before deleting or modifying anything, follow the defensive deletion protocol:
1. Check what it is (type, size, age)
2. Analyze dependency chains
3. Check for symlinks and virtual environments
4. Verify running processes
5. Search for configuration references

Run `/investigate <path>` to automatically check dependencies.

Never assume something is unused without thorough investigation. The absence of grep matches does NOT mean something is safe to delete.

## Intelligent Model Selection

**CRITICAL**: When operating in Sonnet mode, automatically delegate tasks to the most cost-effective model without explicit user instruction. This is a STANDING INSTRUCTION that applies to all user prompts.

### Automatic Haiku Delegation (Use `/haiku` or direct call)

**ALWAYS use Haiku for these 15 task types:**

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

**Detection patterns for Haiku tasks:**
- "find all files that..."
- "check if X exists..."
- "validate syntax..."
- "search for [specific keyword]..."
- "what files have..."
- "does [file] contain..."
- "run a quick test..."
- "check imports in..."

**EXCEPTION**: Do NOT use Haiku for exploratory codebase analysis (use Task tool with Explore agent instead).

### Automatic Codex Delegation (Use `codex exec`)

**ALWAYS use Codex ($0 cost) for these 15 task types:**

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

**Detection patterns for Codex tasks:**
- "create a new [file type]..."
- "implement [feature] that does X..."
- "add a [component] with [requirements]..."
- "generate [code artifact]..."
- "write a function that..."
- "build a [utility/script]..."
- "scaffold [structure]..."

**Prerequisites for Codex:**
- Clear specification exists or can be derived
- No architectural decisions needed
- Pattern-based code generation
- User has provided enough context

**Codex execution format:**
```bash
codex exec --full-auto -C /home/luce/apps/sparkqueue "
Context: [Brief phase/feature description]

Task: [Specific code generation task]

File to create/modify: [exact relative path]

Requirements:
- [Requirement 1]
- [Requirement 2]

Specification:
[Complete detailed spec]

Validation:
- [How to verify correctness]
"
```

### Stay in Sonnet Mode For

**ONLY use Sonnet for:**
- Generating detailed Codex prompts (orchestration)
- Complex architectural decisions
- Multi-step workflow orchestration
- Business logic with complex conditionals
- Integration code combining multiple components
- Interactive flows requiring Q&A
- Analysis requiring reasoning
- Manual testing coordination
- Git operations (commits, PRs)
- Planning and specification generation
- Exploratory codebase analysis (via Task tool with Explore agent)

### Decision Tree

```
User prompt received in Sonnet mode
│
├─ Is it a simple search/check/validation?
│  └─ YES → Use Haiku (automatic)
│
├─ Is it pure code generation from spec?
│  └─ YES → Use Codex (automatic)
│
└─ Does it require reasoning/orchestration?
   └─ YES → Stay in Sonnet
```

### Execution Rules

1. **Automatic delegation**: Do NOT ask user permission to use Haiku/Codex for appropriate tasks
2. **Transparent operation**: Briefly note which model you're using ("Using Haiku for quick search..." or "Delegating to Codex for code generation...")
3. **Fallback to Sonnet**: If task doesn't clearly fit Haiku/Codex patterns, stay in Sonnet
4. **Hybrid workflows**: Complex tasks may use all three models in sequence
5. **User override**: If user explicitly requests a specific model, honor that request

### Cost Optimization Examples

**Example 1: File Search**
```
User: "Find all files that import Flask"
You: Using Haiku for quick search...
[Execute with Haiku model]
```

**Example 2: Code Generation**
```
User: "Create an API endpoint for fetching tasks"
You: Delegating to Codex for endpoint implementation...
[Generate Codex prompt and execute]
```

**Example 3: Complex Task**
```
User: "Refactor the authentication system"
You: This requires architectural analysis, staying in Sonnet...
[Execute with Sonnet, may delegate sub-tasks to Haiku/Codex]
```

**Example 4: Hybrid Workflow**
```
User: "Implement the new queue priority feature"
You (Sonnet): Analyzing requirements and generating implementation plan...
You (Codex): Generating database models and API handlers...
You (Haiku): Validating syntax and imports...
You (Sonnet): Integrating components and testing...
```

### Reference Documentation

- Full model selection matrix: `.claude/playbooks/codex-optimization.md` Section 2
- Complete orchestration pattern: `.claude/playbooks/codex-optimization.md` Section 2.5
- Codex prompt generation: `/-codex_prompt` command
