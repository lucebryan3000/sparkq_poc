# SparkQ

Distributed task queue for managing work sessions and feature streams. Fast, simple, dev-focused.

## Quick Start

### Step 1: Initial Setup (One-Time)

Set up the Python virtual environment:

```bash
# Preview what will happen
./python-bootstrap/bootstrap.sh --dry-run

# Actually set up
./python-bootstrap/bootstrap.sh

# Or with auto-approval (useful in CI)
./python-bootstrap/bootstrap.sh --yes
```

This creates `.venv/` with all SparkQ dependencies installed. See [python-bootstrap/README.md](python-bootstrap/README.md) for full details.

### Step 2: Running SparkQ

After initial setup, use any of these approaches:

#### Direct Activation
```bash
# Activate the venv
source .venv/bin/activate

# Initialize database (one-time)
python -m sparkq.src.cli setup

# Start server
python -m sparkq.src.cli run
```

#### Using sparkq.sh Wrapper
For convenience, use the `sparkq.sh` helper script:
```bash
./sparkq.sh setup            # Initialize database (one-time)
./sparkq.sh run              # Start server
./sparkq.sh session create   # Create session
./sparkq.sh stop             # Stop server
./sparkq.sh status           # Check status
```

All three approaches (direct activation, wrapper, or direct CLI commands) use the same standardized virtual environment created by bootstrap.

## Using SparkQ

Once the server is running (via direct activation or sparkq.sh):

```bash
# In another terminal, activate venv
source .venv/bin/activate

# Create a stream
python -m sparkq.src.cli stream create my-stream --session my-session

# Enqueue a task
python -m sparkq.src.cli enqueue --stream my-stream --tool run-bash

# Check next task
python -m sparkq.src.cli peek --stream my-stream

# Claim and complete a task
python -m sparkq.src.cli claim --stream my-stream
python -m sparkq.src.cli complete --task-id [id] --summary "Done"

# List all tasks
python -m sparkq.src.cli tasks --stream my-stream
```

## Project Structure

```
sparkqueue/
├── sparkq/                         # SparkQ application
│   ├── src/
│   │   ├── cli.py                 # CLI command definitions
│   │   ├── server.py              # FastAPI + Uvicorn server
│   │   ├── api.py                 # REST API endpoints
│   │   ├── storage.py             # SQLite persistence layer
│   │   ├── tools.py               # Tool registry
│   │   └── index.py               # Script indexing
│   ├── ui/                        # Web dashboard
│   ├── requirements.txt           # Dependencies (typer, pydantic, uvicorn, fastapi)
│   ├── setup.sh                   # Local venv setup for sparkq/
│   └── README.md                  # SparkQ documentation
│
├── .venv/                         # Project-level Python virtual environment
├── sparkq.sh                      # Convenient wrapper script
├── sparkq.db                      # SQLite database (auto-created)
├── sparkq.yml                     # Configuration file (auto-created by setup)
│
├── python-bootstrap/              # One-time environment bootstrapper (see README)
├── _build/                        # Legacy: Old SparkQueue app
│
├── .claude/                       # Claude Code configuration
├── README.md                      # This file
└── docs/                          # Documentation
```

## Configuration

SparkQ configuration lives in `sparkq.yml` (auto-created during setup):

```yaml
project:
  name: my-project
  repo_path: /path/to/repo
server:
  port: 8420
database:
  path: sparkq.db
  mode: wal
script_dirs:
  - scripts
task_classes:
  FAST_SCRIPT: { timeout: 30 }
  MEDIUM_SCRIPT: { timeout: 300 }
  LLM_LITE: { timeout: 300 }
  LLM_HEAVY: { timeout: 900 }
tools:
  run-bash:    { description: Execute a bash script,  task_class: MEDIUM_SCRIPT }
  run-python:  { description: Execute a python script, task_class: MEDIUM_SCRIPT }
  llm-haiku:   { description: Call Claude Haiku,       task_class: LLM_LITE }
  llm-sonnet:  { description: Call Claude Sonnet,      task_class: LLM_HEAVY }
```

Edit `sparkq.yml` to customize tool metadata or timeouts, then run:
```bash
python -m sparkq.src.cli reload
```

## Managing SparkQ Server

### Start/Stop
```bash
# Start in background (or use sparkq.sh)
source .venv/bin/activate && python -m sparkq.src.cli run &

# Check if running
python -m sparkq.src.cli status

# Stop the server
python -m sparkq.src.cli stop
```

### View Logs
The server logs to stdout. When running in background:
```bash
tail -f sparkq.log  # Manually captured logs
```

### Process Management
```bash
# Find running SparkQ processes
pgrep -f "python.*sparkq"

# Graceful shutdown
kill -TERM <PID>

# Force kill if needed
kill -9 <PID>
```

## Key Features

- **FIFO Queues**: Tasks processed in order per stream
- **Auto-Fail**: Stale tasks auto-fail after 2× timeout
- **Auto-Purge**: Completed tasks auto-deleted after configurable days
- **Web UI**: Dashboard at `http://localhost:8420/ui/`
- **REST API**: Full API with interactive docs at `/docs`
- **CLI**: Typer-based command-line interface
- **SQLite WAL**: Efficient concurrent access with WAL mode

## API Documentation

When the server is running, API docs are available at:
- **Interactive Swagger UI**: `http://localhost:8420/docs`
- **ReDoc**: `http://localhost:8420/redoc`
- **Raw OpenAPI**: `http://localhost:8420/openapi.json`

See [sparkq/API.md](sparkq/API.md) for endpoint details.

## Troubleshooting

### Port already in use
```bash
# Check what's using port 8420
lsof -i :8420

# Kill the process
kill <PID>
```

### Database locked
SparkQ uses SQLite with WAL mode. If locked:
```bash
rm -f sparkq.db-wal sparkq.db-shm
```

### Stream not found when enqueuing
Make sure the stream exists:
```bash
python -m sparkq.src.cli stream list --session my-session

# Create if needed
python -m sparkq.src.cli stream create my-stream --session my-session
```

### Tasks stuck in "running" state
Tasks auto-fail after 2× timeout. You can manually fail them:
```bash
python -m sparkq.src.cli fail --task-id [id] --reason "Manual failure"
```

## Development

See `.claude/` for detailed guides:
- `.claude/CLAUDE.md` - Project guidelines
- `.claude/commands/` - Development commands

## Next Steps

1. **Set up sessions**: `python -m sparkq.src.cli session create [name]`
2. **Create streams**: `python -m sparkq.src.cli stream create [name]`
3. **Configure tools**: Edit `sparkq.yml` to add custom tools/timeouts
4. **Enqueue tasks**: Start queueing work
5. **Build workers**: Use CLI or API to claim and complete tasks

## Support

- Full documentation: See [sparkq/README.md](sparkq/README.md)
- API reference: See [sparkq/API.md](sparkq/API.md)
- Guidelines: See `.claude/CLAUDE.md`
