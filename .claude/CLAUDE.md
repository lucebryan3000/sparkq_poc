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
