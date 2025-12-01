import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

import pytest

from src.storage import Storage


def _bootstrap_storage(tmp_path, prefix: str):
    """Create an isolated database with a project/session/queue for testing."""
    db_path = tmp_path / f"{prefix}.db"
    storage = Storage(str(db_path))
    storage.init_db()
    storage.create_project(
        name=f"{prefix}-project",
        repo_path=str(tmp_path),
        prd_path=None,
    )
    session = storage.create_session(name=f"{prefix}-session")
    queue = storage.create_queue(session_id=session["id"], name=f"{prefix}-queue")
    return storage, queue


@pytest.mark.e2e
class TestConcurrentAccess:
    def test_concurrent_enqueue(self, tmp_path):
        storage, queue = _bootstrap_storage(tmp_path, "enqueue")

        created_ids = []
        lock = threading.Lock()

        def enqueue_task(idx: int):
            task = storage.create_task(
                queue_id=queue["id"],
                tool_name="worker",
                task_class="concurrent",
                payload='{"data": "%s"}' % idx,
                timeout=60,
            )
            with lock:
                created_ids.append(task["id"])
            return task["id"]

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(enqueue_task, i) for i in range(20)]
            for future in as_completed(futures):
                future.result()

        assert len(created_ids) == 20
        assert len(set(created_ids)) == 20

    def test_atomic_claim(self, tmp_path):
        storage, queue = _bootstrap_storage(tmp_path, "claim")
        task = storage.create_task(
            queue_id=queue["id"],
            tool_name="worker",
            task_class="concurrent",
            payload='{"data": "single"}',
            timeout=60,
        )

        claimed_tasks = []
        lock = threading.Lock()
        start_barrier = threading.Barrier(10)

        def attempt_claim():
            start_barrier.wait()
            try:
                claimed = storage.claim_task(task["id"])
                if claimed:
                    with lock:
                        claimed_tasks.append(claimed["id"])
            except Exception:
                # Ignore failures so we can count successful claims
                pass

        threads = [threading.Thread(target=attempt_claim) for _ in range(10)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        assert len(claimed_tasks) == 1

    def test_concurrent_complete(self, tmp_path):
        storage, queue = _bootstrap_storage(tmp_path, "complete")
        tasks = []
        for i in range(10):
            tasks.append(
                storage.create_task(
                    queue_id=queue["id"],
                    tool_name="worker",
                    task_class="concurrent",
                    payload='{"data": "%s"}' % i,
                    timeout=60,
                )
            )

        claimed_tasks = [storage.claim_task(task["id"]) for task in tasks]

        completed_ids = []
        lock = threading.Lock()

        def complete_task(task):
            completed = storage.complete_task(task["id"], "done")
            with lock:
                completed_ids.append(completed["id"])
            return completed

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(complete_task, task) for task in claimed_tasks]
            for future in as_completed(futures):
                completed_task = future.result()
                assert completed_task["status"] == "succeeded"

        all_tasks = storage.list_tasks(queue_id=queue["id"])
        assert len(completed_ids) == 10
        assert all(task["status"] == "succeeded" for task in all_tasks)
