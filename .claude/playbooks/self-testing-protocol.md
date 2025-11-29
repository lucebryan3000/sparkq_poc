# Self-Testing Protocol

**PURPOSE**: Ensure ALL features are tested programmatically BEFORE requesting user verification.

**PHILOSOPHY**: Your job is to test, find bugs, and fix them. The user's job is to verify UX/visual design and provide domain knowledge.

---

## The Golden Rule

```
NEVER ask the user to test functionality you haven't tested yourself.

Exception: Visual design, UX feedback, domain-specific requirements that need user expertise.
```

---

## When to Self-Test

**ALWAYS** test before reporting completion:
- ✅ After implementing any feature
- ✅ After fixing a bug
- ✅ After refactoring code
- ✅ After making configuration changes
- ✅ Before asking for user feedback

**NEVER** report "not fully implemented yet" after claiming completion. Test it yourself first.

---

## Testing Checklist by Feature Type

### 1. Backend API Endpoints

**Pre-test Setup:**
```bash
# Verify server is running
curl http://localhost:5005/health || echo "Server not running"

# Check server logs
tail -f logs/sparkqueue.log
```

**Test Checklist:**
- [ ] Health check responds (GET /health)
- [ ] Endpoint returns expected status code
- [ ] Response body matches specification
- [ ] Response headers are correct (Content-Type, etc.)
- [ ] Error cases return proper error codes (404, 400, 500)
- [ ] Database changes are persisted (if applicable)
- [ ] Logs show expected behavior

**Testing Commands:**
```bash
# GET endpoint
curl -v http://localhost:5005/api/resource

# POST endpoint
curl -X POST http://localhost:5005/api/resource \
  -H "Content-Type: application/json" \
  -d '{"key": "value"}'

# Error cases
curl -X GET http://localhost:5005/api/resource/invalid-id
curl -X POST http://localhost:5005/api/resource \
  -H "Content-Type: application/json" \
  -d '{"invalid": "data"}'

# Verify database
sqlite3 sparkq/sparkq.db "SELECT * FROM table WHERE id='xyz';"
```

**What to Report:**
```
✅ Confirmed Working:
- GET /api/resource returns 200 with [fields]
- POST /api/resource creates record (verified in DB)
- 404 on invalid ID works (tested with curl)

❌ Found & Fixed:
- Bug: Response missing timestamp field
- Fix: Added timestamp to serialization
- Re-tested: Now returns timestamp correctly
```

---

### 2. CLI Commands

**Pre-test Setup:**
```bash
# Ensure CLI is accessible
./sparkq.sh --help || echo "CLI not working"

# Check database state before
sqlite3 sparkq/sparkq.db "SELECT COUNT(*) FROM sessions;"
```

**Test Checklist:**
- [ ] --help flag shows usage
- [ ] Happy path works with valid inputs
- [ ] Command produces expected output
- [ ] Side effects verified (files created, DB updated)
- [ ] Error messages clear for invalid inputs
- [ ] Exit codes correct (0 for success, non-zero for errors)

**Testing Commands:**
```bash
# Test help
./sparkq.sh command --help

# Test happy path
./sparkq.sh session create test-session
./sparkq.sh session list | grep test-session

# Test error cases
./sparkq.sh session create ""  # Empty name
./sparkq.sh session create existing-name  # Duplicate

# Verify side effects
sqlite3 sparkq/sparkq.db "SELECT * FROM sessions WHERE name='test-session';"

# Test output format
./sparkq.sh tasks --stream test | grep "tsk_"
```

**What to Report:**
```
✅ Confirmed Working:
- ./sparkq.sh session create works (tested with 3 sessions)
- --help shows all options
- Error handling: empty name returns exit code 1

❌ Found & Fixed:
- Bug: Duplicate session names not prevented
- Fix: Added UNIQUE constraint to schema
- Re-tested: Now returns error on duplicate
```

---

### 3. Web UI Features

**Pre-test Setup:**
```bash
# Check server running
curl -I http://localhost:5005/ | head -1

# Verify static files accessible
curl http://localhost:5005/ui/index.html | grep "<title>"
```

**Test Checklist:**
- [ ] HTML page loads (200 status)
- [ ] Required HTML elements present
- [ ] JavaScript files load without errors
- [ ] CSS applies correctly (check for class names)
- [ ] API calls work (check network/console)
- [ ] Dynamic content renders
- [ ] Interactive features respond to input

**Testing Commands:**
```bash
# Fetch HTML and verify structure
curl http://localhost:5005/ui/streams.html > /tmp/streams.html
grep -o '<div id="streams-list"' /tmp/streams.html || echo "Missing streams-list div"
grep -o '<button id="refresh-btn"' /tmp/streams.html || echo "Missing refresh button"

# Check JavaScript loads
curl -I http://localhost:5005/ui/pages/streams.js | grep "200 OK"

# Test API integration
curl http://localhost:5005/api/streams | jq '.streams | length'

# Check for JavaScript errors (if headless browser available)
# Or manually inspect browser console
```

**What to Report:**
```
✅ Confirmed Working (Programmatically Tested):
- /ui/streams.html loads (200 OK)
- HTML contains required elements: #streams-list, #refresh-btn, #quick-add
- JavaScript file loads (streams.js: 200 OK)
- API endpoint /api/streams returns data (tested with curl)

❓ User Verification Needed (Visual/UX):
- Does the QuickAdd component appear below table when clicking stream ID?
- Are timestamps showing "2m ago" format or ISO dates?
- Do toast notifications appear green on success?
- Is auto-refresh counter visible next to ⟳ button?

❌ Found & Fixed:
- Bug: API returned 500 on empty streams list
- Fix: Handle empty list in serialization
- Re-tested: Now returns [] correctly
```

---

### 4. Database Schema Changes

**Pre-test Setup:**
```bash
# Backup database
cp sparkq/sparkq.db sparkq/sparkq.db.backup

# Check current schema
sqlite3 sparkq/sparkq.db ".schema table_name"
```

**Test Checklist:**
- [ ] Schema migration runs without errors
- [ ] New columns/tables created
- [ ] Indexes created if specified
- [ ] Foreign keys enforced
- [ ] Default values work
- [ ] Existing data preserved (if applicable)
- [ ] Queries using new schema work

**Testing Commands:**
```bash
# Run migration
python -m sparkq.src.storage

# Verify schema
sqlite3 sparkq/sparkq.db ".schema tasks"
sqlite3 sparkq/sparkq.db "PRAGMA table_info(tasks);"

# Test new columns
sqlite3 sparkq/sparkq.db "INSERT INTO tasks (field1, new_field) VALUES ('val', 'test');"
sqlite3 sparkq/sparkq.db "SELECT new_field FROM tasks LIMIT 1;"

# Test foreign keys
sqlite3 sparkq/sparkq.db "PRAGMA foreign_key_check;"
```

**What to Report:**
```
✅ Confirmed Working:
- Schema migration successful
- New column 'timeout' added to tasks table (verified with PRAGMA)
- Default value 300 working (tested with INSERT)
- Foreign key constraints enforced (tested with invalid stream_id)

❌ Found & Fixed:
- Bug: Migration failed on existing database
- Fix: Added IF NOT EXISTS check
- Re-tested: Migration idempotent now
```

---

### 5. E2E Workflows

**Pre-test Setup:**
```bash
# Ensure clean state
rm -f sparkq/sparkq.db
./sparkq.sh setup  # Recreate database

# Start server if needed
./sparkq.sh start
```

**Test Checklist:**
- [ ] Run existing e2e tests if available
- [ ] Test complete user workflow manually
- [ ] Verify all state transitions
- [ ] Check final state matches expected
- [ ] Verify cleanup/teardown works
- [ ] Test error recovery paths

**Testing Commands:**
```bash
# Run automated e2e tests
cd sparkq && pytest tests/e2e/test_full_cycle.py -v

# Manual workflow test
./sparkq.sh session create e2e-test
./sparkq.sh stream create test-stream --session e2e-test
./sparkq.sh enqueue --stream test-stream --tool run-bash
./sparkq.sh peek --stream test-stream
./sparkq.sh claim --stream test-stream
# ... complete workflow

# Verify state at each step
sqlite3 sparkq/sparkq.db "SELECT status FROM tasks WHERE id='tsk_xyz';"
```

**What to Report:**
```
✅ Confirmed Working:
- E2E test test_full_cycle.py passes (pytest: 5/5 tests passed)
- Manual workflow: session → stream → enqueue → claim → complete
- All state transitions verified in database
- Task purge works (tested with old tasks)

❌ Found & Fixed:
- Bug: Claim returned 404 for queued task
- Fix: Fixed query in claim_task method
- Re-tested: Claim now works correctly
```

---

## Common Testing Anti-Patterns

### ❌ DON'T DO THIS:

**Bad Example 1:**
```
"I've implemented the QuickAdd feature. Can you click on a stream ID and tell me if you see the input box?"
```
**Why bad:** You should test if the HTML/JS actually renders the component first using curl/grep.

**Bad Example 2:**
```
"Not fully implemented yet. Based on your screenshot, you need to verify if Phase 13 features work."
```
**Why bad:** If you're claiming something is implemented, test it yourself before asking user.

**Bad Example 3:**
```
"The endpoint is created. Can you test if it returns the right data?"
```
**Why bad:** You can test this with curl yourself in 10 seconds.

### ✅ DO THIS INSTEAD:

**Good Example 1:**
```
✅ Confirmed Working (Tested):
- QuickAdd HTML component present in streams.html (verified with grep)
- JavaScript event listener registered (checked code)
- API endpoint /api/quick-add works (tested with curl, returns 200)

❓ User Verification (Visual UX):
- Does the chat-style input appear smoothly when clicking stream ID?
- Is the placeholder text clear and helpful?
- Do you like the positioning below the table?
```

**Good Example 2:**
```
✅ Confirmed Working:
- GET /api/streams returns 200 with stream list (tested with curl)
- Response format: {"streams": [...], "count": N}
- Error case tested: Invalid stream_id returns 404

❌ Found & Fixed During Testing:
- Bug: Empty streams returned 500 error
- Fix: Handle empty list in serialization
- Re-tested: Now returns {"streams": [], "count": 0}
```

**Good Example 3:**
```
✅ E2E Workflow Tested:
1. Created session (verified in DB: id=ses_xyz)
2. Created stream (verified: id=str_abc, session_id=ses_xyz)
3. Enqueued task (verified: status='queued')
4. Claimed task (verified: status='running')
5. Completed task (verified: status='succeeded', result stored)

All state transitions work correctly.
```

---

## Testing Tools Quick Reference

### API Testing
```bash
# Simple GET
curl http://localhost:5005/api/resource

# POST with JSON
curl -X POST http://localhost:5005/api/resource \
  -H "Content-Type: application/json" \
  -d '{"key": "value"}'

# Show response headers
curl -v http://localhost:5005/api/resource

# Pretty print JSON
curl http://localhost:5005/api/resource | jq .
```

### Database Testing
```bash
# Interactive SQL
sqlite3 sparkq/sparkq.db

# One-liner queries
sqlite3 sparkq/sparkq.db "SELECT * FROM tasks LIMIT 5;"

# Schema inspection
sqlite3 sparkq/sparkq.db ".schema tasks"
sqlite3 sparkq/sparkq.db "PRAGMA table_info(tasks);"

# Export to CSV
sqlite3 sparkq/sparkq.db ".mode csv" ".output tasks.csv" "SELECT * FROM tasks;"
```

### HTML/JavaScript Testing
```bash
# Fetch and search HTML
curl http://localhost:5005/ui/page.html | grep "element-id"

# Check for specific elements
curl -s http://localhost:5005/ui/page.html | grep -o '<div id="component"' | wc -l

# Download for inspection
curl http://localhost:5005/ui/page.html > /tmp/page.html
```

### Process/Server Testing
```bash
# Check server running
curl http://localhost:5005/health

# Check port listening
lsof -i :5005

# View server logs
tail -f logs/sparkqueue.log

# Check background processes
ps aux | grep sparkq
```

---

## When to Ask User for Verification

**Only ask user to verify:**

1. **Visual Design**
   - "Does the layout look good?"
   - "Is the color scheme working?"
   - "Are the spacing/margins appropriate?"

2. **User Experience**
   - "Is the workflow intuitive?"
   - "Does the interaction feel smooth?"
   - "Is the error message clear?"

3. **Domain Knowledge**
   - "Is this the expected behavior for edge case X?"
   - "Should we allow Y in this scenario?"
   - "What should happen when Z occurs?"

4. **Subjective Preferences**
   - "Do you prefer option A or B?"
   - "Is the loading indicator too subtle?"
   - "Should we add a confirmation dialog here?"

**Don't ask user to verify:**
- ❌ Basic functionality (does the button work?)
- ❌ API responses (does the endpoint return data?)
- ❌ Database updates (was the record created?)
- ❌ Error handling (does 404 work?)
- ❌ State transitions (does the workflow complete?)

---

## Summary Checklist

Before reporting to user:

- [ ] I've tested the feature programmatically
- [ ] I've verified all success paths work
- [ ] I've tested error cases
- [ ] I've checked database state if applicable
- [ ] I've found and fixed any bugs
- [ ] I've documented what works vs what needs user verification
- [ ] I'm only asking user to verify UX/visual/domain aspects

**If you can't check all boxes above, keep testing before reporting to user.**

---

## Remember

**Your role:** Test, find bugs, fix bugs, deliver working features.

**User's role:** Verify UX, provide domain knowledge, approve design.

**Don't make the user do your testing work.**
