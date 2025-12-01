# Queue Runner Workflow

## Overview

SparkQueue's queue runner is a **prompt streaming system** that feeds tasks to Claude-in-chat for execution. This preserves context across sequential tasks within the same chat thread.

## Architecture

```
┌──────────────┐      ┌──────────────┐      ┌─────────────┐
│   SparkQ     │      │    Queue     │      │   Claude    │
│   Database   │─────▶│    Runner    │─────▶│  (in chat)  │
│              │      │              │      │             │
│ Tasks Queue  │      │ Stream       │      │ Execute &   │
│              │      │ Prompts      │      │ Complete    │
└──────────────┘      └──────────────┘      └─────────────┘
                                                    │
                                                    │ API Call
                                                    ▼
                                              ┌─────────────┐
                                              │   SparkQ    │
                                              │     API     │
                                              │             │
                                              │ Mark Task   │
                                              │ Complete    │
                                              └─────────────┘
```

## Task Lifecycle

1. **Queued** → Task created via UI/API
2. **Running** → Queue runner claims task (sets status to 'running')
3. **Prompt Streamed** → Queue runner outputs formatted prompt to stdout
4. **Claude Executes** → Claude reads prompt and executes in chat
5. **Claude Completes** → Claude calls API to mark task as succeeded/failed

## Queue Runner Behavior

The queue runner:
- ✅ Claims tasks (sets status to `running`)
- ✅ Streams formatted prompts with metadata
- ✅ Leaves tasks in `running` status
- ❌ Does NOT execute tasks via LLM APIs
- ❌ Does NOT auto-complete tasks (execute=True mode)

## Output Format

```
[runner] Task: MISC-4d28 (tsk_8a991d504d28)
[runner] Tool: llm-haiku
[runner] Prompt:
What model is this using?

[runner] ⏳ Status: Running (claimed by worker-codeswarm-MISC)
[runner] 💡 Claude will execute and mark complete via API
```

## Claude's Responsibilities

When Claude sees a streamed prompt:

1. **Read the metadata**:
   - `Task ID` - Full ID for API calls (e.g., `tsk_8a991d504d28`)
   - `Tool` - Suggested execution method (llm-haiku, llm-sonnet, llm-codex)
   - `Prompt` - The actual task to execute

2. **Execute based on tool suggestion**:
   - `llm-haiku` → Use `/haiku` command or delegate to Haiku for quick tasks
   - `llm-sonnet` → Execute in current Sonnet session
   - `llm-codex` → Use `codex exec` for $0 code generation
   - Or execute in current session if context preservation is important

3. **Mark task complete**:
   ```bash
   ./sparkq/task_complete.py <task_id> "<summary>" [--data "<result>"]
   ```

   Example:
   ```bash
   ./sparkq/task_complete.py tsk_8a991d504d28 "Answered: Claude Sonnet 4.5"
   ```

## Execution Modes

### Default Mode (--run)
Process all queued tasks until queue empty, then exit:
```bash
./sparkq/queue_runner.py --queue "MISC"
```

### Watch Mode (--watch)
Continuous polling - run forever, checking every N seconds:
```bash
./sparkq/queue_runner.py --queue "MISC" --watch
./sparkq/queue_runner.py --queue "MISC" --watch --poll 10
```

### Once Mode (--once)
Process exactly one task then exit (useful for testing):
```bash
./sparkq/queue_runner.py --queue "MISC" --once
```

### Dry-Run Mode (execute=False)
For testing - auto-completes tasks without waiting for Claude:
```python
process_one(base_url, queue, worker_id, execute=False)
```

## Helper Scripts

### task_complete.py
Mark a task as succeeded:
```bash
./sparkq/task_complete.py <task_id> "<summary>" [--data "<result>"]
```

Arguments:
- `task_id` - Full task ID (e.g., `tsk_abc123`)
- `summary` - Brief result summary (required)
- `--data` - Optional detailed result data (JSON string or text)

Example:
```bash
./sparkq/task_complete.py tsk_abc123 "Generated login component" \
  --data '{"files": ["src/Login.tsx", "src/Login.test.tsx"]}'
```

## Context Preservation

The key benefit of this architecture:

**Single Chat Thread = Shared Context**

When processing a queue sequentially:
```
Task 1: "Create user model"          → Claude executes
Task 2: "Add email validation"       → Can reference Task 1's model
Task 3: "Generate tests for the model" → Can see both Tasks 1 & 2
```

All tasks execute in the same conversation, so later tasks can reference earlier work.

## Model Selection Strategy

The `tool_name` field is **guidance**, not a hard requirement:

- **llm-haiku** - Quick validation, searches, simple checks
- **llm-sonnet** - Complex reasoning, orchestration, planning
- **llm-codex** - Pure code generation from specifications

Claude can:
- Follow the suggestion if appropriate
- Override if context preservation is more important
- Use hybrid approach (delegate sub-tasks while maintaining context)

## Error Handling

If execution fails:
1. Use `task_complete.py` with an error summary, OR
2. Call the fail endpoint directly:
   ```bash
   curl -X POST http://127.0.1.1:5005/api/tasks/<task_id>/fail \
     -H "Content-Type: application/json" \
     -d '{"error_message": "...", "error_type": "execution_error"}'
   ```

## Configuration

Queue runner config in `sparkq.yml`:
```yaml
queue_runner:
  # Optional: Override API URL (auto-detected by default)
  # base_url: http://192.168.1.100:5005

  # Polling interval for --watch mode (seconds)
  poll_interval: 30
```

Auto-detection:
- `base_url`: `http://{local_ip}:{server.port}`
- `worker_id`: `worker-{hostname}-{queue_name}`

## Best Practices

1. **Let queue runner stream prompts** - Don't auto-complete in the runner
2. **Execute in chat** - Preserve context for sequential tasks
3. **Use tool_name as guidance** - But prioritize context when needed
4. **Always mark complete** - Don't leave tasks in running state
5. **Include task ID in completion** - Enables API linkage
6. **Test with --once** - Before processing full queue
7. **Use --watch for production** - Continuous monitoring

## Troubleshooting

### Task stuck in 'running' status
```bash
# Complete it manually
./sparkq/task_complete.py <task_id> "Manual completion"

# Or fail it
curl -X POST http://127.0.1.1:5005/api/tasks/<task_id>/fail \
  -H "Content-Type: application/json" \
  -d '{"error_message": "Abandoned", "error_type": "manual_intervention"}'
```

### Queue runner import errors
Make sure script is executable:
```bash
chmod +x sparkq/queue_runner.py
./sparkq/queue_runner.py --queue "MISC"
```

### Wrong base URL
Check config or override:
```yaml
queue_runner:
  base_url: http://localhost:5005
```
