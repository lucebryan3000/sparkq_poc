# Run SparkQueue Task Queue Runner

Run the queue runner to process all queued tasks from a selected queue sequentially.

## Usage

```bash
/sparkq
```

This will:
1. Connect to the SQLite database at `sparkq/data/sparkq.db`
2. Query available queues (Back End, Front End, APIs)
3. Prompt you to select a queue by number or name
4. Start the queue runner in dry-run mode (logs prompts without executing them)
5. Process all tasks in oldest-first order (by created_at)
6. Exit when the queue is drained

## Example Session

```
[queue-selector] Fetching queues from database...

[queue-selector] Available Queues:
  1. Back End
  2. Front End
  3. APIs

[queue-selector] Select a queue (enter number or queue name): 1

[queue-selector] Selected queue: Back End
[queue-selector] Starting queue runner in dry-run mode...

[runner] Starting worker for queue 'Back End' as worker-1701355200
[runner] Mode: Dry-run (log prompts only)
[runner] Queue 'Back End': 0/2 tasks completed
[runner] Processing: tsk_f7b483e6501b
[runner] Prompt:
Change dashboard header from SparkQ to SparkQueue

[runner] Task tsk_f7b483e6501b completed (dry-run)
[runner] Queue 'Back End': 1/2 tasks completed
[runner] Processing: tsk_yyyyyyyyyyyyy
[runner] Prompt:
Some other prompt text...

[runner] Task tsk_yyyyyyyyyyyyy completed (dry-run)
[runner] Queue drained. Processed 2 tasks (2 succeeded, 0 failed). Exit code: 0
```

## Modes

The queue runner supports two execution modes:

### Dry-Run Mode (default)
```bash
python scripts/queue_runner.py --queue "Back End" --drain
```
- Logs prompts without executing them
- Safe preview to see what tasks will be processed
- Still updates task database status

### Execute Mode (with Claude Haiku)
```bash
python scripts/queue_runner.py --queue "Back End" --execute --drain
```
- Executes prompts via Claude Haiku API
- Stores results in database
- Requires ANTHROPIC_API_KEY environment variable

## Advanced Usage

```bash
# Process just one task then exit
python scripts/queue_runner.py --queue "Back End" --once

# Execute against a remote server
python scripts/queue_runner.py --queue "Back End" --execute --base-url http://remote-server:5005

# Specify custom worker ID
python scripts/queue_runner.py --queue "Back End" --execute --worker-id my-custom-worker
```

## What Happens

1. **Initialization**: Resolves queue name, counts total queued tasks
2. **Main Loop**: Processes tasks sequentially (oldest-first)
   - Fetches next queued task
   - Claims it (sets status to `running`)
   - Executes or logs the prompt
   - Marks as `succeeded` or `failed`
3. **Exit**: When all tasks processed, exits with status code 0

## Database Fields Updated

For each executed task, the following fields are updated:
- `status`: queued → running → succeeded/failed
- `attempts`: incremented
- `started_at`: ISO timestamp when execution began
- `finished_at`: ISO timestamp when execution ended
- `updated_at`: current ISO timestamp
- `result`: execution result (JSON)
- `stdout`: execution logs
- `error`: error message if failed

## Queue Status

Queue status is auto-computed:
- **PLANNED**: Tasks are queued (queued > 0, running = 0)
- **ACTIVE**: Tasks are running (running > 0)
- **IDLE**: All tasks completed (queued = 0, running = 0)
