# Run SparkQueue Task Queue Runner

You are helping the user run the SparkQueue task queue runner interactively.

## Your Job

1. **Fetch available queues** via API
2. **Display numbered list** with task counts
3. **Prompt user** to select a queue (number or name)
4. **Run queue_runner** with `--queue` (runs once through the queue by default)
5. **Monitor output** and report results

## Execution

**Step 1: Fetch queues from API**
```bash
curl http://localhost:5005/api/queues
```

Parse JSON and display:
```
[queue-selector] Available Queues:
  1. Back End (1 task queued)
  2. Front End (0 tasks)
  3. APIs (0 tasks)

[queue-selector] Select a queue (enter number or queue name):
```

**Step 2: User selects queue**
User types: `1` or `Back End`

If the API call fails (network/server down), show an error and abort, or prompt the user to input a queue name manually and warn that queue existence is not validated.

**Step 3: Run the queue runner in default mode**
```bash
python3 sparkq/queue_runner.py --queue "<resolved_queue_name>"
```

This runs in **default mode** (no extra flags needed):
- Processes all queued tasks until queue is empty, then exits (--run is implicit)
- Logs each prompt without executing it (dry-run behavior)
- Auto-detects base URL from config or local IP
- Auto-derives worker ID from hostname + queue name

**Step 4: Monitor and report**
- Show task IDs and prompts as they're processed
- Report progress: "Queue 'Back End': 1/3 tasks completed"
- Show final summary when queue is empty

## Notes

- Default mode is dry-run (safe preview)
- `--run` is the default; no flag needed to process queue and exit
- Worker ID is auto-generated for audit trail
- Base URL auto-detected from local IP (works on network)
- Execution happens later; this phase is dry-run only
