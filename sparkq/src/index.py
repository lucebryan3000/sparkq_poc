"""Script discovery and indexing for SparkQ."""

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from .config import load_config
from .constants import TASK_CLASS_TIMEOUTS
from .paths import get_config_path

logger = logging.getLogger(__name__)


class ScriptIndex:
    """Builds an in-memory index of scripts and their metadata."""

    SCRIPT_EXTENSIONS = {".sh", ".bash", ".py", ".rb", ".pl", ".js"}
    METADATA_KEYS = {"name", "description", "inputs", "outputs", "tags", "timeout", "task_class"}
    COMMENT_PREFIXES = ("#", "//")

    def __init__(self, config_path: str | None = None):
        # Resolve config path at runtime to honor current working directory
        resolved = Path(config_path) if config_path is not None else get_config_path()
        self.config_path = Path(resolved)
        self.index: List[Dict[str, Any]] = []

    def _load_config(self) -> Dict[str, Any]:
        """Load YAML config, returning an empty dict on any error."""
        return load_config(self.config_path)

    def _resolve_script_dirs(self) -> List[Path]:
        """Return configured script directories as absolute paths."""
        config = self._load_config()
        raw_dirs = config.get("script_dirs") or ["scripts"]
        if isinstance(raw_dirs, (str, Path)):
            raw_dirs = [raw_dirs]

        base_dir = self.config_path.parent if self.config_path.parent else Path.cwd()
        resolved_dirs: List[Path] = []
        for entry in raw_dirs:
            path = Path(entry)
            if not path.is_absolute():
                path = base_dir / path
            resolved_dirs.append(path)

        return resolved_dirs

    def _coerce_metadata_value(self, key: str, raw_value: str) -> Any:
        """Convert metadata string values into richer types when needed."""
        if key == "tags":
            return [tag.strip() for tag in raw_value.split(",") if tag.strip()]

        if key == "timeout":
            try:
                return int(raw_value)
            except ValueError:
                return None

        # Parse inputs/outputs as comma-separated lists with optional modifiers
        if key in ("inputs", "outputs"):
            items = []
            for item in raw_value.split(","):
                item = item.strip()
                if not item:
                    continue

                # Check for (optional) or (required) suffix
                optional = False
                required = False
                if item.endswith("(optional)"):
                    optional = True
                    item = item.replace("(optional)", "").strip()
                elif item.endswith("(required)"):
                    required = True
                    item = item.replace("(required)", "").strip()

                items.append({
                    "name": item,
                    "required": required,
                    "optional": optional,
                })
            return items if items else None

        return raw_value

    def _validate_metadata(self, file_path: Path, metadata: Dict[str, Any]) -> None:
        """Log warnings for potentially malformed metadata."""
        # Warn if timeout is 0 or negative
        timeout = metadata.get("timeout")
        if timeout is not None and timeout <= 0:
            logger.warning(f"Script {file_path} has invalid timeout: {timeout}")

        # Warn if no description
        if not metadata.get("description"):
            logger.debug(f"Script {file_path} has no description")

        # Warn if task_class is not recognized
        task_class = metadata.get("task_class")
        if task_class and task_class not in TASK_CLASS_TIMEOUTS:
            logger.warning(f"Script {file_path} has unknown task_class: {task_class}")

    def parse_script_header(self, file_path: Path) -> Dict[str, Any]:
        """Parse key/value metadata from comment headers at the top of a script."""
        metadata: Dict[str, Any] = {}
        current_key = None
        current_value_parts = []

        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as handle:
                for line in handle:
                    stripped = line.strip()

                    # Empty lines are allowed in metadata block
                    if not stripped:
                        continue

                    # Stop at first non-comment line
                    if not stripped.startswith(self.COMMENT_PREFIXES):
                        # Finalize any pending metadata
                        if current_key:
                            metadata[current_key] = self._coerce_metadata_value(
                                current_key, " ".join(current_value_parts)
                            )
                        break

                    # Strip comment prefix
                    comment_body = stripped
                    for prefix in self.COMMENT_PREFIXES:
                        if comment_body.startswith(prefix):
                            comment_body = comment_body[len(prefix) :]
                            break

                    comment_body = comment_body.lstrip("! ").strip()

                    # Skip empty comments
                    if not comment_body:
                        continue

                    # Check if this is a new key:value pair
                    if ":" in comment_body:
                        # Finalize previous key if exists
                        if current_key:
                            metadata[current_key] = self._coerce_metadata_value(
                                current_key, " ".join(current_value_parts)
                            )
                            current_value_parts = []

                        key, _, value = comment_body.partition(":")
                        key = key.strip().lower()

                        if key in self.METADATA_KEYS:
                            current_key = key
                            current_value_parts = [value.strip()] if value.strip() else []
                        else:
                            current_key = None
                    else:
                        # Continuation of previous value
                        if current_key:
                            current_value_parts.append(comment_body)

                # Finalize last key if file ended
                if current_key:
                    metadata[current_key] = self._coerce_metadata_value(
                        current_key, " ".join(current_value_parts)
                    )

        except (OSError, UnicodeDecodeError):
            return metadata

        self._validate_metadata(file_path, metadata)
        return metadata

    def is_script_file(self, file_path: Path) -> bool:
        """Determine if a file should be treated as a script for indexing."""
        if not file_path.is_file():
            return False

        suffix = file_path.suffix.lower()
        if suffix in self.SCRIPT_EXTENSIONS:
            return True

        if not suffix:
            try:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as handle:
                    first_line = handle.readline()
                    return first_line.startswith("#!")
            except OSError:
                return False

        return False

    def build(self) -> None:
        """Populate the in-memory index from configured script directories."""
        self.index = []
        script_dirs = self._resolve_script_dirs()

        for directory in script_dirs:
            if not directory.exists():
                continue

            for file_path in directory.rglob("*"):
                if not self.is_script_file(file_path):
                    continue

                metadata = self.parse_script_header(file_path)
                tags = metadata.get("tags") or []
                entry = {
                    "path": str(file_path),
                    "name": metadata.get("name") or file_path.stem,
                    "description": metadata.get("description"),
                    "inputs": metadata.get("inputs"),
                    "outputs": metadata.get("outputs"),
                    "tags": tags,
                    "timeout": metadata.get("timeout"),
                    "task_class": metadata.get("task_class"),
                }
                self.index.append(entry)

    def search(self, query: str) -> List[Dict[str, Any]]:
        """Search scripts by name, description, or tags."""
        query_lower = query.lower()
        results: List[Dict[str, Any]] = []

        for entry in self.index:
            name = str(entry.get("name", "")).lower()
            description = str(entry.get("description", "")).lower()
            tags = [str(tag).lower() for tag in entry.get("tags") or []]

            if (
                query_lower in name
                or query_lower in description
                or any(query_lower in tag for tag in tags)
            ):
                results.append(entry)

        return results

    def list_all(self) -> List[Dict[str, Any]]:
        """Return all indexed scripts."""
        return list(self.index)

    def rebuild(self) -> None:
        """Clear and rebuild the index."""
        self.index = []
        self.build()

    def get_script(self, name: str) -> Optional[Dict[str, Any]]:
        """Get a script entry by its name."""
        name_lower = name.lower()
        for entry in self.index:
            if str(entry.get("name", "")).lower() == name_lower:
                return entry
        return None
