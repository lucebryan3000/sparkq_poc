# Execute SparkQueue Tasks (Phase 20.2)

**One command = One queue. All work visible here. Full context preserved across dependent tasks.**

## Quick Start

- `/sparkq` — Fetch queues, ask which to process
- `/sparkq Front End` — Process "Front End" queue immediately
- `/sparkq 2` — Process queue #2 from the last displayed list

## Core Principle

Each `/sparkq` invocation:
1. Processes **exactly one queue**
2. Keeps all work **in this chat** (context preserved)
3. Allows later tasks to reference earlier results
4. **Stops completely** when queue is empty (waits for next `/sparkq` command)

## Workflow

### If No Queue Specified: Fetch & Display

```bash
curl http://localhost:5005/api/queues
```

**Filter out archived queues** - Only show `planned` or `active` queues.

Display numbered list:
```
Available Queues:

1. Front End      (1 queued, 2 done, progress: 2/3) [planned]
2. APIs           (3 queued, 0 done, progress: 0/3) [active]

Enter queue number or name:
```

**Do NOT display:**
- Queues with `status: "archived"`
- Empty queues with 0 total tasks

### Queue Selection

User responds with:
- **Number**: `1`, `2`, `3`
- **Name**: `Front End`, `APIs`, etc.

**CRITICAL:** Match response against fetched list. If ambiguous, ask for clarification. Do NOT guess.

### Run Queue_Runner

```bash
python3 sparkq/queue_runner.py --queue "<resolved_queue_name>"
```

No flags. Default mode only:
- Processes all tasks serially
- Auto-detects base URL
- Exits when queue empty

### Monitor & Execute Tasks

**CRITICAL: Execution Model**

Queue_runner is a **prompt streamer**, NOT an executor. It:
- Claims tasks from the API (marks them "running")
- Streams prompts to stdout for Claude to read
- Exits when queue is empty
- Does NOT execute code or run commands itself

**Claude's Role (YOU):**
- Read prompts from queue_runner output
- Execute the work **in this chat session**
- Use `./sparkq/task_complete.py` to mark tasks done
- Maintain context across sequential tasks

Queue_runner streams output like:

```
[runner] Task: QUEUE-xxxx
[runner] Prompt:
Do X with Y

[runner] 🔧 EXECUTE WITH: Current Sonnet session (answer directly)
[runner] ✅ COMPLETE WITH: ./sparkq/task_complete.py tsk_xxx "<summary>" --data "<result>"
```

**For each task:**

1. Read friendly task ID and prompt from queue_runner output
2. **Execute the prompt HERE in this chat** (not in queue_runner)
3. Show results (scroll in thread)
4. Mark complete using `task_complete.py` when done

**Key:** Task 2 can reference Task 1 results because they're in the same thread.

### Stop When Empty

Queue_runner exits:
```
[runner] Queue is empty. Processed N tasks. Exiting.
```

**If queue was empty (0 tasks processed):**
- Simply report: "Queue 'X' was empty (0 tasks processed)"
- **STOP immediately** - Don't ask questions, don't suggest alternatives

**If queue processed tasks (N > 0):**
- Report: "✅ Queue 'X' complete - Processed N tasks"
- **STOP immediately**

**Then STOP.** Do NOT:
- Fetch queues again
- Select next queue
- Auto-advance
- Ask user what to do next
- Suggest checking other queues
- Explain why queue was empty

**Wait for user's next `/sparkq` command.**

## Architecture

```
/sparkq Front End
       ↓
[runner] starts, processes tasks serially
       ↓
Task 1: [runner] Task: QUEUE-0001
        [runner] Prompt: Create config file
            ↓
        I create config.yml
        Results scroll in chat
            ↓
Task 2: [runner] Task: QUEUE-0002
        [runner] Prompt: Update README with config examples
            ↓
        I have config.yml in context (from Task 1)
        I write examples using actual config
        Results scroll in chat
            ↓
Task 3: [runner] Task: QUEUE-0003
        [runner] Prompt: Validate all files created
            ↓
        I have config.yml AND README context
        Full history in thread
            ↓
[runner] Queue is empty. Exiting.
        ↓
Report completion, STOP
User responds with next command
```

## DO ✅

- **Filter out archived queues** when displaying list
- Display queues clearly (numbered, with stats, status)
- **Verify queue selection** against list (no guessing)
- Run queue_runner in default mode (no flags)
- **Execute prompts in this chat** (not in queue_runner)
- Let queue_runner handle task claiming/API state
- Use `task_complete.py` to mark tasks done
- **STOP when queue is empty**
- Wait for explicit `/sparkq` to continue

## DON'T ❌

- ❌ Show archived queues in selection list
- ❌ Auto-advance to next queue
- ❌ Manually call API endpoints (claim/complete/fail)
- ❌ Use --execute, --watch, --once flags with queue_runner
- ❌ Guess queue names (ask for clarification)
- ❌ Re-display queue list after selection
- ❌ Execute prompts inside queue_runner.py (it's a streamer)
- ❌ Assume which queue user meant
- ❌ Ask questions when queue is empty (just report and stop)
- ❌ Suggest alternatives or next steps (user controls workflow)
- ❌ Explain task states or queue details (just execute or stop)

## Why This Works

| Aspect | Benefit |
|--------|---------|
| **One queue per invocation** | Clear, repeatable, predictable |
| **All work in chat** | Context naturally preserved |
| **Task sequencing** | Task N can reference Tasks 1..N-1 |
| **No auto-advance** | User controls pace and direction |
| **queue_runner handles state** | No LLM confusion about task status |

## Examples

### Simple Sequential Tasks

```
Task 1: Create database schema
  → Schema created, visible in chat

Task 2: Populate test data
  → Can reference schema from Task 1 results
```

### Dependent Tasks

```
Task 1: Generate API specification
  → Spec in chat

Task 2: Implement endpoints
  → Implements from spec (in context)

Task 3: Write integration tests
  → Tests verify spec + implementation (both in context)
```

## Error Handling

**If queue_runner fails:**
- Show error message
- Ask user: retry? different queue?
- Do NOT auto-recover

**If selection is ambiguous:**
- Example: User says "back" but queue is "Back End"
- Ask for clarification
- Do NOT assume

## Implementation Note

Phase 20.2 establishes consistency by:
1. Moving decision logic out of LLM (into queue_runner)
2. Keeping work visible (same thread)
3. Eliminating auto-advance (explicit user control)
4. Preserving context naturally (sequential in chat)
