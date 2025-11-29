# SparkQueue

Distributed task/job queue management system with Python bootstrap deployment.

## Quick Start

### Setup (one-time)
```bash
./run.sh setup
```

### Start the Application
```bash
# Background (default)
./run.sh start

# Foreground
./run.sh start --foreground

# View status
./run.sh status

# Stop
./run.sh stop

# View logs
./run.sh logs
```

## Project Structure

```
sparkqueue/
├── run.sh                          # Recommended: Simple app runner
├── python-bootstrap/               # Bootstrap system (alternative)
│   ├── bootstrap.sh               # Bootstrap script
│   ├── stop-env.sh                # Process manager
│   ├── kill-python.sh             # Quick kill script
│   ├── requirements.txt           # Base dependencies (pyyaml)
│   └── python-bootstrap.config    # Bootstrap configuration
│
├── _build/sparkqueue/             # Application
│   ├── sparkqueue.py              # Main entry point
│   ├── config.yaml                # App configuration
│   └── logs/                      # Runtime logs
│
├── .venv/                         # Python virtual environment
├── .env                           # Environment variables (auto-generated)
├── .gitignore                     # Git ignore rules (auto-generated)
├── .claudeignore                  # Claude Code ignore rules (auto-generated)
│
├── .claude/                       # Claude Code configuration
│   ├── CLAUDE.md                 # Project guidelines
│   ├── project.json              # Project metadata
│   └── commands/                 # Slash command guides
│
└── docs/                          # Project documentation
```

## Environment

- **Python**: 3.13.3 (exceeds 3.11+ requirement)
- **venv Location**: `./.venv`
- **Main Dependencies**: PyYAML 6.0.3

## Running the Application

### Using run.sh (Recommended)
```bash
./run.sh setup           # One-time setup
./run.sh start          # Start in background
./run.sh start --foreground  # Start in foreground
./run.sh stop           # Stop all processes
./run.sh status         # Show running processes
./run.sh logs           # Tail application logs
```

### Manual Execution
```bash
source .venv/bin/activate
python _build/sparkqueue/sparkqueue.py
```

### Using python-bootstrap (Alternative)
```bash
./python-bootstrap/bootstrap.sh --install-only
./python-bootstrap/bootstrap.sh --run-cmd "python _build/sparkqueue/sparkqueue.py"
```

## Configuration

### Application Config
Edit `_build/sparkqueue/config.yaml` to configure:
- Queue backend (memory, redis, etc.)
- Worker count and timeout
- Logging level and format
- Server host and port

### Bootstrap Config
Edit `python-bootstrap/python-bootstrap.config` to configure:
- Python binary path
- Virtual environment location
- Dependency files
- Application startup script

## Development

### See detailed guides in `.claude/commands/`:
- `/setup` - Environment setup
- `/dev` - Development workflow
- `/build` - Build and deployment
- `/test` - Testing strategies
- `/debug` - Debugging techniques

### Project Guidelines
See `.claude/CLAUDE.md` for:
- Development principles
- Code standards
- Bootstrap management
- Defensive deletion protocol

## Managing Processes

### Using run.sh
```bash
./run.sh stop      # Stop all SparkQueue processes
./run.sh status    # Show running processes
```

### Using python-bootstrap tools
```bash
./python-bootstrap/stop-env.sh  # Interactive process manager
./python-bootstrap/kill-python.sh  # Quick kill all processes
```

### Manual process management
```bash
pgrep -f sparkqueue          # Find processes
kill -TERM <PID>             # Graceful shutdown
kill -9 <PID>                # Force kill
```

## Logs

Application logs are stored in:
- **Background runs**: `logs/sparkqueue.log`
- **Bootstrap runs**: `logs/bootstrap.log`

View logs:
```bash
./run.sh logs              # Follow logs with run.sh
tail -f logs/sparkqueue.log  # Manual follow
tail -50 logs/sparkqueue.log # Last 50 lines
grep ERROR logs/*.log      # Search for errors
```

## Troubleshooting

### Application won't start
1. Check logs: `./run.sh logs`
2. Verify Python: `.venv/bin/python --version`
3. Check dependencies: `.venv/bin/pip list`
4. Verify config: `_build/sparkqueue/config.yaml` exists

### Dependencies missing
```bash
./run.sh setup  # Reinstall all dependencies
```

### Python version issues
- System Python: `/usr/bin/python3` (3.13.3)
- venv Python: `.venv/bin/python`
- Check version: `.venv/bin/python --version`

### Can't stop processes
```bash
./run.sh stop                          # Try run.sh stop
./python-bootstrap/kill-python.sh      # Try bootstrap kill
pgrep -f sparkqueue | xargs kill -9    # Force kill all
```

## Next Steps

1. **Implement actual queue logic** in `_build/sparkqueue/sparkqueue.py`
2. **Update configuration** in `_build/sparkqueue/config.yaml`
3. **Add unit tests** in a `tests/` directory
4. **Configure logging** as needed in config.yaml
5. **Set up CI/CD** with bootstrap commands

## Key Files

- `run.sh` - Application runner (recommended)
- `python-bootstrap/bootstrap.sh` - Alternative runner
- `_build/sparkqueue/sparkqueue.py` - Application entry point
- `_build/sparkqueue/config.yaml` - Application configuration
- `.claude/CLAUDE.md` - Project guidelines
- `python-bootstrap.config` - Bootstrap configuration

## Support

See `.claude/` for detailed guides on:
- Setting up the environment
- Development workflow
- Building and deploying
- Testing strategies
- Debugging techniques
