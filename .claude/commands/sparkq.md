# Run SparkQueue Task Queue Runner

You are helping the user run the SparkQueue task queue runner to process queued tasks interactively.

## Your Job

1. **Fetch available queues** by running: `python sparkq/queue_runner.py --list-queues`
2. **Parse the output** and present a numbered list of queues with task counts
3. **Prompt user** to select a queue by number or name
4. **Run the queue runner** with their selection: `python sparkq/queue_runner.py --queue "<queue_name>" --drain`
5. **Monitor execution** and provide feedback as tasks are processed
6. **Report results** when the queue is drained

## Execution

**Step 1: List available queues**
Run this command to fetch all queues from the database:
```bash
python3 sparkq/queue_runner.py --help
```

Or fetch via API:
```bash
curl http://localhost:5005/api/queues
```

Parse the JSON output and display queues like:
```
[queue-selector] Available Queues:
  1. Back End (5 tasks)
  2. Front End (2 tasks)
  3. APIs (0 tasks)

[queue-selector] Select a queue (enter number or queue name):
```

**Step 2: Process user selection**
- Accept input as a number (1, 2, 3) or queue name ("Back End", "Front End", etc.)
- Resolve to the actual queue name

**Step 3: Run the queue runner**
Once user selects a queue, execute:
```bash
python3 sparkq/queue_runner.py --queue "<resolved_queue_name>" --run
```

**Step 4: Monitor and provide feedback**
- Display runner output as it processes each task
- Show task IDs, prompts, and status
- Report progress: "Queue '<name>': X/Y tasks completed"
- Show final results: "Processed X tasks (X succeeded, 0 failed)"

## Notes

- Always run in dry-run mode by default (no --execute flag)
- Queue names come dynamically from the database via the runner
- The runner handles task claiming, execution, and status updates
- Exit when the queue is drained (runner exits with code 0)
