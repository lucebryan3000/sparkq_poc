# Phase 8: Database & API Validation Testing

## Executive Summary

Phase 8 focuses on comprehensive validation of all database and API connections to ensure reliable read/write operations across the entire system. This includes end-to-end testing of data persistence, API integration, and system reliability.

---

## Phase 8 Objectives

### Primary Goals
1. ✅ Validate database schema and integrity
2. ✅ Test all CRUD operations (Create, Read, Update, Delete)
3. ✅ Verify API endpoints with real data
4. ✅ Test concurrent operations and locking
5. ✅ Validate data consistency across layers
6. ✅ Document system health and readiness

### Testing Scope
- **Database Layer**: SQLite connections, schema validation, transaction handling
- **Storage Layer**: All CRUD operations for projects, sessions, streams, tasks
- **API Layer**: All REST endpoints with request/response validation
- **Data Integrity**: Consistency checks, constraint validation, foreign key relationships
- **Concurrency**: Race conditions, atomic operations, lock mechanisms
- **Error Handling**: Exception scenarios, graceful failures, recovery

---

## Phase 8.1: Database Validation Tests

### Location
`sparkq/tests/e2e/test_database_validation.py`

### Test Coverage

#### 1. Schema Validation
```python
def test_database_schema_exists()
    """Verify all required tables exist"""
    - projects table
    - sessions table
    - streams table
    - tasks table

def test_schema_columns_correct()
    """Verify column types and constraints"""
    - All required columns present
    - Correct data types
    - Constraints enforced (NOT NULL, UNIQUE, etc.)

def test_foreign_key_relationships()
    """Verify table relationships"""
    - sessions.project_id → projects.id
    - streams.session_id → sessions.id
    - tasks.stream_id → streams.id
    - tasks.session_id → sessions.id
```

#### 2. Basic CRUD Operations
```python
def test_create_project()
    """Test project creation and persistence"""

def test_read_project()
    """Test project retrieval"""

def test_update_project()
    """Test project modification"""

def test_delete_project()
    """Test project deletion and cascading"""

def test_session_crud_operations()
    """Test session create/read/update/delete"""

def test_stream_crud_operations()
    """Test stream create/read/update/delete"""

def test_task_crud_operations()
    """Test task create/read/update/delete"""
```

#### 3. Data Integrity Tests
```python
def test_project_id_uniqueness()
    """Verify project IDs are unique"""

def test_session_id_uniqueness()
    """Verify session IDs are unique"""

def test_stream_id_uniqueness()
    """Verify stream IDs are unique"""

def test_task_id_uniqueness()
    """Verify task IDs are unique"""

def test_cascade_delete_project()
    """Verify deleting project cascades to sessions/streams/tasks"""

def test_cascade_delete_session()
    """Verify deleting session cascades to streams/tasks"""

def test_cascade_delete_stream()
    """Verify deleting stream cascades to tasks"""
```

#### 4. Concurrent Access Tests
```python
def test_concurrent_task_claiming()
    """Test atomic task claiming under concurrent load"""

def test_concurrent_task_creation()
    """Test creating tasks concurrently"""

def test_lock_prevents_duplicate_claims()
    """Verify locks prevent multiple workers claiming same task"""
```

---

## Phase 8.2: API Endpoint Validation Tests

### Location
`sparkq/tests/e2e/test_api_validation.py`

### Test Coverage

#### 1. Projects API
```python
def test_get_projects()
    """GET /api/projects - List all projects"""
    - Status code: 200
    - Response contains projects array
    - Each project has required fields

def test_create_project()
    """POST /api/projects - Create new project"""
    - Status code: 201
    - Response includes created project
    - Project is persisted in database

def test_get_project_by_id()
    """GET /api/projects/{id} - Get single project"""

def test_update_project()
    """PUT /api/projects/{id} - Update project"""

def test_delete_project()
    """DELETE /api/projects/{id} - Delete project"""
```

#### 2. Sessions API
```python
def test_list_sessions()
    """GET /api/sessions"""

def test_create_session()
    """POST /api/sessions"""

def test_get_session()
    """GET /api/sessions/{id}"""

def test_update_session()
    """PUT /api/sessions/{id}"""

def test_end_session()
    """PUT /api/sessions/{id}/end"""
```

#### 3. Streams API
```python
def test_list_streams()
    """GET /api/streams"""

def test_create_stream()
    """POST /api/streams"""

def test_get_stream()
    """GET /api/streams/{id}"""

def test_update_stream()
    """PUT /api/streams/{id}"""

def test_filter_streams_by_session()
    """GET /api/streams?session_id=xxx"""
```

#### 4. Tasks API
```python
def test_list_tasks()
    """GET /api/tasks"""

def test_create_task()
    """POST /api/tasks"""

def test_get_task()
    """GET /api/tasks/{id}"""

def test_claim_task()
    """POST /api/tasks/{id}/claim"""

def test_complete_task()
    """POST /api/tasks/{id}/complete"""

def test_fail_task()
    """POST /api/tasks/{id}/fail"""

def test_requeue_task()
    """POST /api/tasks/{id}/requeue"""

def test_filter_tasks_by_stream()
    """GET /api/tasks?stream_id=xxx"""

def test_filter_tasks_by_status()
    """GET /api/tasks?status=queued"""
```

#### 5. Health & Status API
```python
def test_health_endpoint()
    """GET /health - System health check"""

def test_status_response_format()
    """Verify status response includes required fields"""
```

---

## Phase 8.3: Integration Tests

### Location
`sparkq/tests/e2e/test_system_integration.py`

### Test Coverage

#### 1. Complete Workflow Tests
```python
def test_complete_session_workflow()
    """
    1. Create session
    2. Create stream under session
    3. Create task under stream
    4. Claim task
    5. Complete task
    6. Verify task marked as succeeded
    7. End session
    """

def test_task_failure_workflow()
    """
    1. Create session/stream/task
    2. Claim task
    3. Fail task with error message
    4. Verify task marked as failed
    5. Requeue task
    6. Verify task back in queued state
    """

def test_multi_stream_isolation()
    """
    1. Create session with multiple streams
    2. Create tasks in each stream
    3. Filter tasks by stream
    4. Verify tasks are isolated per stream
    """

def test_concurrent_session_management()
    """
    1. Create multiple sessions concurrently
    2. Create streams/tasks in each
    3. Verify no data mixing
    """
```

#### 2. Data Consistency Tests
```python
def test_database_consistency_after_api_calls()
    """
    After each API call:
    - Verify data is persisted
    - Verify no orphaned records
    - Verify relationships intact
    """

def test_task_status_transitions()
    """
    Verify valid task status transitions:
    - queued → running (claim)
    - running → succeeded (complete)
    - running → failed (fail)
    - failed → queued (requeue)
    - succeeded → queued (requeue)
    """
```

#### 3. Error Recovery Tests
```python
def test_database_recovery_after_interruption()
    """Verify clean recovery from interrupted operations"""

def test_api_error_responses()
    """
    Test various error conditions:
    - 400: Bad request (invalid input)
    - 404: Not found
    - 409: Conflict (duplicate creation)
    - 500: Server error (graceful handling)
    """
```

---

## Phase 8.4: Load & Performance Validation

### Location
`sparkq/tests/e2e/test_performance_validation.py`

### Test Coverage

#### 1. Throughput Tests
```python
def test_create_tasks_bulk()
    """Create 100+ tasks and verify persistence"""

def test_list_tasks_performance()
    """Query tasks with pagination - verify reasonable response time"""

def test_claim_tasks_under_load()
    """Multiple workers claiming tasks concurrently"""
```

#### 2. Database Performance
```python
def test_query_response_time()
    """Verify queries complete in < 500ms"""

def test_index_effectiveness()
    """Verify indexed queries are fast"""
```

---

## Implementation Approach

### Test Execution Flow

1. **Setup Phase**
   - Initialize fresh database
   - Create test projects/sessions
   - Populate with test data

2. **Validation Phase**
   - Execute all tests
   - Capture metrics
   - Log results

3. **Teardown Phase**
   - Clean up test data
   - Verify no orphaned records
   - Report summary

### Test Organization

```
sparkq/tests/e2e/
├── test_database_validation.py      # Database layer tests
├── test_api_validation.py           # API endpoint tests
├── test_system_integration.py       # End-to-end workflows
├── test_performance_validation.py   # Load and performance tests
└── conftest.py                      # Shared fixtures
```

### Fixtures

```python
@pytest.fixture
def clean_database():
    """Fresh database for each test"""

@pytest.fixture
def test_project():
    """Pre-created test project"""

@pytest.fixture
def test_session():
    """Pre-created test session"""

@pytest.fixture
def test_stream():
    """Pre-created test stream"""

@pytest.fixture
def test_task():
    """Pre-created test task"""

@pytest.fixture
def api_client():
    """Configured HTTP client for API testing"""
```

---

## Success Criteria

### Validation Checklist

- ✅ All database CRUD operations working
- ✅ All API endpoints responding correctly
- ✅ Data persists correctly across operations
- ✅ Concurrent operations are safe (no race conditions)
- ✅ Task status transitions are valid
- ✅ Cascading deletes work properly
- ✅ Foreign key relationships maintained
- ✅ Error responses are appropriate
- ✅ System recovers gracefully from errors
- ✅ No orphaned records left after operations

### Test Results

Expected outcome:
- **New tests**: 40-50 comprehensive validation tests
- **All passing**: 100% pass rate
- **Coverage**: All API endpoints, all database operations
- **Performance**: Response times < 500ms for typical queries
- **Concurrent safety**: No race conditions under load

---

## Files to Create/Modify

### New Files
- `sparkq/tests/e2e/test_database_validation.py` (30-40 tests)
- `sparkq/tests/e2e/test_api_validation.py` (25-30 tests)
- `sparkq/tests/e2e/test_system_integration.py` (15-20 tests)
- `sparkq/tests/e2e/test_performance_validation.py` (5-10 tests)

### Modified Files
- None (purely additive testing)

---

## Phase 8 Timeline

1. **Database Validation Tests** - Write and validate database layer tests
2. **API Validation Tests** - Write and validate all API endpoints
3. **Integration Tests** - Write complete workflow tests
4. **Performance Tests** - Write load and performance tests
5. **Execution & Reporting** - Run full suite, document results
6. **Documentation** - Create validation report

---

## Expected Outcomes

After Phase 8 completion:

✅ **System Validation Complete**
- All database operations verified
- All API endpoints validated
- Data persistence confirmed
- Concurrent safety verified
- System ready for production deployment

✅ **Comprehensive Test Coverage**
- 75-100 new tests
- Full CRUD validation
- End-to-end workflows
- Error handling scenarios
- Load testing

✅ **Documentation**
- API validation report
- Database integrity report
- Performance metrics
- Known limitations (if any)

---

## Next Steps (Phase 9+)

Once Phase 8 validation is complete:

### Phase 9: Production Hardening
- Add monitoring and metrics
- Implement graceful degradation
- Add backup/recovery procedures
- Production deployment checklist

### Phase 10: Advanced Features
- Implement watcher task claiming
- Add distributed worker support
- Task result streaming
- Advanced scheduling

---

**Phase 8 Status:** Planning
**Target Completion:** After comprehensive test implementation
**Success Metric:** 100% test pass rate with all validation scenarios covered
