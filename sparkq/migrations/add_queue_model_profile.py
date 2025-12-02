import sqlite3
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))


def migrate(db_path: str):
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()

        # Check if column exists
        info = cursor.execute("PRAGMA table_info(queues)").fetchall()
        if not any(row[1] == "model_profile" for row in info):
            cursor.execute("ALTER TABLE queues ADD COLUMN model_profile TEXT DEFAULT 'auto'")
            conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    try:
        from sparkq.src.paths import get_db_path  # type: ignore[attr-defined]
    except ImportError:
        from sparkq.src.paths import get_default_db_path as get_db_path

    migrate(str(Path(get_db_path())))
