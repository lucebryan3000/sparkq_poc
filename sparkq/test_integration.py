#!/usr/bin/env python
"""Integration test for SparkQ Phase 1"""

import sys
import os
from pathlib import Path

# Add sparkq parent directory to path dynamically
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sparkq.src.storage import Storage

def test_integration():
    """Test end-to-end workflow"""

    # Clean up test database
    test_db = Path("sparkq_test.db")
    if test_db.exists():
        test_db.unlink()

    storage = Storage("sparkq_test.db")

    print("=" * 60)
    print("PHASE 1 INTEGRATION TESTS")
    print("=" * 60)

    # Test 1: Initialize database
    print("\n[1/8] Testing database initialization...")
    storage.init_db()
    print("✓ Database initialized with WAL mode")

    # Test 2: Create project
    print("\n[2/8] Testing project creation...")
    project = storage.create_project(
        name="test-project",
        repo_path=str(Path(__file__).resolve().parent.parent),
        prd_path=None
    )
    assert project['name'] == "test-project"
    assert project['id'].startswith("prj_")
    print(f"✓ Project created: {project['id']}")

    # Test 3: Get project
    print("\n[3/8] Testing project retrieval...")
    retrieved_project = storage.get_project()
    assert retrieved_project['id'] == project['id']
    print(f"✓ Project retrieved: {retrieved_project['name']}")

    # Test 4: Create session
    print("\n[4/8] Testing session creation...")
    session = storage.create_session(
        name="test-session",
        description="Integration test session"
    )
    assert session['name'] == "test-session"
    assert session['id'].startswith("ses_")
    assert session['status'] == "active"
    print(f"✓ Session created: {session['id']}")

    # Test 5: List sessions
    print("\n[5/8] Testing session listing...")
    sessions = storage.list_sessions()
    assert len(sessions) == 1
    assert sessions[0]['name'] == "test-session"
    print(f"✓ Found {len(sessions)} session(s)")

    # Test 6: Create queue
    print("\n[6/8] Testing queue creation...")
    queue = storage.create_queue(
        session_id=session['id'],
        name="test-queue",
        instructions="Test queue instructions"
    )
    assert queue['name'] == "test-queue"
    assert queue['id'].startswith("str_")
    assert queue['session_id'] == session['id']
    print(f"✓ Stream created: {queue['id']}")

    # Test 7: List queues
    print("\n[7/8] Testing queue listing...")
    queues = storage.list_queues()
    assert len(queues) == 1
    assert queues[0]['name'] == "test-queue"
    print(f"✓ Found {len(queues)} queue(s)")

    # Test 8: End queue and session
    print("\n[8/8] Testing end operations...")
    queue_ended = storage.end_queue(queue['id'])
    assert queue_ended == True
    session_ended = storage.end_session(session['id'])
    assert session_ended == True

    # Verify ended status
    ended_queue = storage.get_queue(queue['id'])
    ended_session = storage.get_session(session['id'])
    assert ended_queue['status'] == "ended"
    assert ended_session['status'] == "ended"
    print("✓ Stream and session ended successfully")

    print("\n" + "=" * 60)
    print("ALL TESTS PASSED ✓")
    print("=" * 60)

    # Clean up
    test_db.unlink()
    wal_db = Path("sparkq_test.db-wal")
    shm_db = Path("sparkq_test.db-shm")
    if wal_db.exists():
        wal_db.unlink()
    if shm_db.exists():
        shm_db.unlink()

    return True

if __name__ == "__main__":
    try:
        test_integration()
        sys.exit(0)
    except AssertionError as e:
        print(f"\n✗ TEST FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
