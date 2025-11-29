#!/usr/bin/env bash
# bootstrap - generic Python venv bootstrapper with config-driven paths
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_CONFIG_PATH="${SCRIPT_DIR}/python-bootstrap.config"

# ─────────────────────────────────────────────────────────────
# Color & Icon Definitions (iTerm2-optimized)
# ─────────────────────────────────────────────────────────────

COLOR_RESET=""
COLOR_HEADER=""
COLOR_SUCCESS=""
COLOR_WARNING=""
COLOR_INFO=""
COLOR_ACCENT=""
COLOR_DIM=""

ICON_SUCCESS="✓"
ICON_WARNING="⚠"
ICON_INFO="ℹ"
ICON_PENDING="⋯"
ICON_PYTHON="🐍"
ICON_FOLDER="📁"
ICON_CONFIG="⚙"
ICON_FILE="📄"
ICON_PACKAGES="📦"
ICON_ROCKET="🚀"
ICON_LOCK="🔒"

BOX_TL="╭"
BOX_TR="┬"
BOX_BL="╰"
BOX_BR="┘"
BOX_H="─"
BOX_V="│"
BOX_CROSS="┼"

if [[ -t 1 && "${NO_COLOR:-}" != "1" ]]; then
  COLOR_RESET="$(printf '\033[0m')"
  COLOR_HEADER="$(printf '\033[38;5;75m')"     # Cyan
  COLOR_SUCCESS="$(printf '\033[38;5;46m')"    # Green
  COLOR_WARNING="$(printf '\033[38;5;226m')"   # Yellow
  COLOR_INFO="$(printf '\033[38;5;87m')"       # Light cyan
  COLOR_ACCENT="$(printf '\033[38;5;141m')"    # Magenta
  COLOR_DIM="$(printf '\033[38;5;243m')"       # Gray
fi

# ─────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────

readonly DEFAULT_LOG_SIZE_BYTES=524288  # 512 KB
readonly DEFAULT_LOG_MAX_FILES=5
readonly MIN_PYTHON_VERSION_MAJOR=3
readonly MIN_PYTHON_VERSION_MINOR=10
readonly PYENV_VERSION_SORT_STRATEGY=V  # Version-aware sort

# ─────────────────────────────────────────────────────────────
# Phase-based Logging Functions
# ─────────────────────────────────────────────────────────────

phase_start() {
  local num="$1"
  local name="$2"
  printf "${COLOR_HEADER}PHASE %d: %s${COLOR_RESET}\n" "$num" "$name"
}

phase_end() {
  # No-op for compact output
  :
}

phase_detail() {
  local icon="$1"
  local label="$2"
  local value="$3"

  if [[ -z "$value" ]]; then
    printf "  ${icon} ${label}\n"
  else
    printf "  ${icon} %-25s ${COLOR_ACCENT}${value}${COLOR_RESET}\n" "$label"
  fi
}

phase_status() {
  local status="$1"  # ✓ ℹ ⚠ ✗
  printf "  Status: ${status}\n"
}

section_header() {
  local text="$1"
  printf "\n${COLOR_HEADER}%s${COLOR_RESET}\n" "$text"
  printf "${COLOR_DIM}$(printf '%0.s─' {1..60})${COLOR_RESET}\n"
}

detail_kv() {
  local indent="${1:- }"
  local label="$2"
  local value="${3:-}"
  if [[ -z "$value" ]]; then
    printf "${indent}  %s %s\n" "○" "$label"
  else
    printf "${indent}  %s %-20s ${COLOR_ACCENT}%s${COLOR_RESET}\n" \
      "○" "$label" "$value"
  fi
}

detail_list() {
  local indent="${1:- }"
  local item="$2"
  printf "${indent}  • %s\n" "$item"
}

banner() {
  cat << 'EOF'
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║               🐍 Python Bootstrap – Project Setup              ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
EOF
}

die() {
  echo ""
  printf "${COLOR_WARNING}${ICON_WARNING} ERROR${COLOR_RESET}: $*\n" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: ./bootstrap.sh [OPTIONS]

DESCRIPTION:
  Self-contained Python venv bootstrapper. Auto-detects project structure,
  creates virtual environment, installs dependencies, and launches your app.
  Portable across projects—drop into any repo and run.

SETUP OPTIONS:
  --background            Start app in background shell (default)
  --foreground, -f        Run app in current shell (foreground)
  --config <file>         Path to config file (default: python-bootstrap.config)
  --install-only          Create venv + install deps, then exit (don't launch)
  --run-cmd "<cmd>"       Custom command to run after setup (overrides config)
  --dry-run               Preview actions without making any changes
                          (if venv exists, will not prompt for reuse/recreation)

CLEANUP & RECOVERY:
  --clean                 Remove old deployment and redeploy cleanly
                          Removes: venv, .env, logs, .bootstrap.hash
  --clean-all             Like --clean, but also removes .gitignore entries
                          (Use when restructuring project layout)

ENVIRONMENT OPTIONS:
  --no-env                Skip writing .env file
  --env-path <file>       Write .env to custom path (default: PROJECT_ROOT/.env)
  --env-append            Append to .env instead of overwriting

DEPENDENCY OPTIONS:
  --no-deps               Skip dependency installation
  --editable              Install pyproject.toml in editable mode (-e flag)

GIT & IGNORE OPTIONS:
  --no-gitignore          Do not manage .gitignore entries
  --gitignore-path <file> Write .gitignore entries to custom path

PYTHON & ENVIRONMENT:
  --py-version <ver>      Desired Python version for pyenv (default: 3.11)
  --allow-external        Allow APP_DIR/VENV_DIR outside project root
                          (skip safety check for external paths)

BEHAVIOR:
  --yes                   Auto-approve all interactive prompts (including reusing
                          existing venvs without showing details)
  --foreground-wrapper    Show summary after foreground runs (no exec)
  --verbose               Show detailed output (e.g., pip install logs)
  --quiet                 Minimal output (phase status only)
  -h, --help              Show this help message

VENV REUSE:
  When an existing venv is found, the script will:
    1. Display venv details (Python version, packages, age, size)
    2. Prompt whether to reuse, clean & recreate, or abort
    3. Default: reuse (press Enter)
  Prompts are skipped with --yes, --dry-run, or in non-interactive mode.

EXAMPLES:
  # Preview what will happen
  ./bootstrap.sh --dry-run

  # Fix a broken deployment
  ./bootstrap.sh --clean --dry-run           # Preview cleanup
  ./bootstrap.sh --clean                     # Execute cleanup + redeploy

  # Specific use cases
  ./bootstrap.sh --foreground --run-cmd "python app.py"
  ./bootstrap.sh --install-only              # Setup without launching
  ./bootstrap.sh --verbose                   # Debug with detailed output
  ./bootstrap.sh --yes --foreground          # Auto-approve, run in foreground
EOF
}

# ─────────────────────────────────────────────────────────────
# Utility Functions (unchanged from original)
# ─────────────────────────────────────────────────────────────

resolve_path() {
  local path="$1"
  local base="$2"
  if [[ "$path" = /* ]]; then
    echo "$path"
  else
    echo "$(cd "$base" && pwd)/$path"
  fi
}

rel_to_root() {
  local target="$1"
  local root="$2"

  # Normalize paths (remove trailing slashes)
  target="${target%/}"
  root="${root%/}"

  # If target is outside root, return absolute path
  if [[ "$target" != "$root"* ]]; then
    echo "$target"
    return
  fi

  # Compute relative path
  local rel="${target#${root}/}"
  if [[ "$rel" == "$target" ]]; then
    # Path not under root, return absolute
    echo "$target"
  else
    # Path is relative; optionally prepend ./ for clarity (removed for simplicity)
    echo "$rel"
  fi
}

pretty_path() {
  local path="$1"
  local root="$2"
  if [[ -n "${root}" && "${path}" == "${root}"* ]]; then
    local rel="${path#${root}/}"
    [[ "${rel}" == "${path}" ]] && echo "${path}" || echo "./${rel}"
  else
    echo "${path}"
  fi
}

require_not_root() {
  if [[ "${EUID:-$(id -u)}" -eq 0 && "${ALLOW_ROOT:-false}" != "true" ]]; then
    die "Refusing to run as root (set ALLOW_ROOT=true to override)."
  fi
}

confirm_external() {
  local what="$1"
  local path="$2"
  if [[ "${ALLOW_EXTERNAL_ALL}" == "true" ]]; then
    return
  fi
  if [[ "${ASSUME_YES}" == "true" ]]; then
    return
  fi
  if [[ "${PROMPT_EXTERNAL}" != "true" ]]; then
    die "${what} outside project root (${path}); allow with --allow-external or ALLOW_EXTERNAL_*"
  fi
  if [[ -t 0 ]]; then
    read -r -p "  ${ICON_WARNING} ${what} is outside project root. Continue? [y/N] " ans
    case "${ans}" in
      [Yy]*) return ;;
      *) die "Aborted: external ${what} not allowed." ;;
    esac
  else
    die "${what} outside project root (${path}) and no interactive prompt available."
  fi
}

confirm_value() {
  local var_name="$1"
  local current="$2"
  if [[ "${ASSUME_YES}" == "true" || ! -t 0 ]]; then
    printf -v "${var_name}" "%s" "${current}"
    return
  fi
  read -r -p "  ${COLOR_INFO}→${COLOR_RESET} [${COLOR_ACCENT}${current}${COLOR_RESET}]: " __ans
  printf -v "${var_name}" "%s" "${__ans:-${current}}"
}

persist_config() {
  local cfg="$1"
  [[ "${DRY_RUN}" == "true" ]] && { return; }
  [[ -z "${cfg}" ]] && return
  mkdir -p "$(dirname "${cfg}")"
  touch "${cfg}"
  CFG_PROJECT_ROOT="${PROJECT_ROOT}" \
  CFG_APP_DIR="${APP_DIR}" \
  CFG_VENV_DIR="${VENV_DIR}" \
  CFG_CONFIG_FILE="${CONFIG_FILE}" \
  CFG_MAIN_SCRIPT="${MAIN_SCRIPT}" \
  CFG_PY_BIN="${PY_BIN}" \
  CFG_PY_VERSION="${PY_VERSION}" \
  CFG_RUN_MODE="${RUN_MODE}" \
  CFG_RUN_CMD="${RUN_CMD:-}" \
  CFG_ENV_PATH="${ENV_PATH}" \
  CFG_ENV_APPEND="${ENV_APPEND}" \
  CFG_WRITE_ENV="${WRITE_ENV}" \
  CFG_MANAGE_GITIGNORE="${MANAGE_GITIGNORE}" \
  CFG_GITIGNORE_PATH="${GITIGNORE_PATH}" \
  CFG_MANAGE_CLAUDEIGNORE="${MANAGE_CLAUDEIGNORE}" \
  CFG_CLAUDEIGNORE_PATH="${CLAUDEIGNORE_PATH}" \
  CFG_CLAUDEIGNORE_ENTRIES="$(printf '%s ' "${CLAUDEIGNORE_ENTRIES[@]}")" \
  CFG_ENV_VARS="$(printf '%s ' "${ENV_VARS[@]}")" \
  CFG_INSTALL_DEPS="${INSTALL_DEPS}" \
  CFG_EDITABLE_INSTALL="${EDITABLE_INSTALL}" \
  CFG_FOREGROUND_WRAPPER="${FOREGROUND_WRAPPER}" \
  python - "${cfg}" <<'PY'
import os, sys, pathlib
cfg = pathlib.Path(sys.argv[1])
updates = {
    "PROJECT_ROOT": os.environ.get("CFG_PROJECT_ROOT", ""),
    "APP_DIR": os.environ.get("CFG_APP_DIR", ""),
    "VENV_DIR": os.environ.get("CFG_VENV_DIR", ""),
    "CONFIG_FILE": os.environ.get("CFG_CONFIG_FILE", ""),
    "MAIN_SCRIPT": os.environ.get("CFG_MAIN_SCRIPT", ""),
    "PY_BIN": os.environ.get("CFG_PY_BIN", ""),
    "PY_VERSION": os.environ.get("CFG_PY_VERSION", ""),
    "RUN_MODE": os.environ.get("CFG_RUN_MODE", ""),
    "RUN_CMD": os.environ.get("CFG_RUN_CMD", ""),
    "ENV_PATH": os.environ.get("CFG_ENV_PATH", ""),
    "ENV_APPEND": os.environ.get("CFG_ENV_APPEND", ""),
    "WRITE_ENV": os.environ.get("CFG_WRITE_ENV", ""),
    "MANAGE_GITIGNORE": os.environ.get("CFG_MANAGE_GITIGNORE", ""),
    "GITIGNORE_PATH": os.environ.get("CFG_GITIGNORE_PATH", ""),
    "MANAGE_CLAUDEIGNORE": os.environ.get("CFG_MANAGE_CLAUDEIGNORE", ""),
    "CLAUDEIGNORE_PATH": os.environ.get("CFG_CLAUDEIGNORE_PATH", ""),
    "CLAUDEIGNORE_ENTRIES": os.environ.get("CFG_CLAUDEIGNORE_ENTRIES", ""),
    "ENV_VARS": os.environ.get("CFG_ENV_VARS", ""),
    "INSTALL_DEPS": os.environ.get("CFG_INSTALL_DEPS", ""),
    "EDITABLE_INSTALL": os.environ.get("CFG_EDITABLE_INSTALL", ""),
    "FOREGROUND_WRAPPER": os.environ.get("CFG_FOREGROUND_WRAPPER", ""),
}
updates = {k: v for k, v in updates.items() if v}
if not updates:
    sys.exit(0)
try:
    lines = cfg.read_text().splitlines()
except FileNotFoundError:
    lines = []
out = []
seen = set()
for line in lines:
    stripped = line.lstrip()
    if not stripped or stripped.startswith("#"):
        out.append(line)
        continue
    key = line.split("=", 1)[0].strip()
    if key in updates:
        out.append(f'{key}="{updates[key]}"')
        seen.add(key)
    else:
        out.append(line)
for k, v in updates.items():
    if k not in seen:
        out.append(f'{k}="{v}"')
cfg.write_text("\n".join(out) + ("\n" if out else ""))
PY
}

ensure_gitignore() {
  local gi_path="$1"; shift
  local entries=("$@")
  [[ "${MANAGE_GITIGNORE}" == "true" ]] || return
  [[ ${#entries[@]} -eq 0 ]] && return
  mkdir -p "$(dirname "${gi_path}")"
  touch "${gi_path}"
  local added=0
  for e in "${entries[@]}"; do
    [[ -z "${e}" ]] && continue
    if ! grep -qxF "${e}" "${gi_path}"; then
      echo "${e}" >> "${gi_path}"
      added=1
    fi
  done
}

ensure_claudeignore() {
  local ci_path="$1"; shift
  local entries=("$@")
  [[ "${MANAGE_CLAUDEIGNORE}" == "true" ]] || return
  [[ ${#entries[@]} -eq 0 ]] && return
  mkdir -p "$(dirname "${ci_path}")"
  touch "${ci_path}"
  local added=0
  for e in "${entries[@]}"; do
    [[ -z "${e}" ]] && continue
    if ! grep -qxF "${e}" "${ci_path}"; then
      echo "${e}" >> "${ci_path}"
      added=1
    fi
  done
}

detect_required_python() {
  local required=""
  if [[ -n "${PYPROJECT_TOML:-}" && -f "${PYPROJECT_TOML}" ]]; then
    required="$("${PY_BIN}" - "${PYPROJECT_TOML}" <<'PY'
import re, sys, pathlib
path = pathlib.Path(sys.argv[1])
text = path.read_text(encoding="utf-8", errors="ignore")
m = re.search(r"requires-python\s*=\s*['\"]([^'\"]+)['\"]", text)
if m:
    print(m.group(1))
PY
2>&1)"
    if [[ $? -ne 0 ]]; then
      if [[ "${VERBOSE:-false}" == "true" ]]; then
        printf "  ${COLOR_WARNING}${ICON_WARNING} Python error extracting requires-python:${COLOR_RESET}\n"
        printf "    %s\n" "${required}"
      fi
      required=""
    fi
  fi
  if [[ -z "${required}" ]]; then
    for rt in "${PROJECT_ROOT}/runtime.txt" "${APP_DIR}/runtime.txt"; do
      if [[ -f "${rt}" ]]; then
        required="$(head -n 1 "${rt}" | tr -d '[:space:]')"
        [[ -n "${required}" ]] && break
      fi
    done
  fi
  echo "${required}"
}

check_python_version() {
  local required_spec="$1"
  [[ -z "${required_spec}" ]] && return
  local py_error
  py_error=$("${PY_BIN}" - "${required_spec}" <<'PY'
import re, sys
spec = sys.argv[1]
ver = sys.version_info

def parse_min(s):
    min_v = None
    for part in s.split(","):
        part = part.strip()
        m = re.match(r">=?\s*([0-9]+(?:\.[0-9]+)*)", part)
        if not m:
            continue
        nums = tuple(int(x) for x in m.group(1).split("."))
        if min_v is None or nums > min_v:
            min_v = nums
    return min_v

required = parse_min(spec)
if required and ver < required:
    min_str = ".".join(str(x) for x in required)
    cur_str = f"{ver.major}.{ver.minor}.{ver.micro}"
    sys.exit(f"Python {min_str}+ is required by spec '{spec}' (found {cur_str})")
PY
2>&1)
  local exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    die "Python version check failed: ${py_error}"
  fi
}

python_meets_requirement() {
  local bin="$1"
  local req="$2"
  "${bin}" - "$req" <<'PY'
import re, sys
req = sys.argv[1]

def parse(v):
    nums = [int(x) for x in re.split(r"[^\d]+", v) if x]
    while len(nums) < 3:
        nums.append(0)
    return tuple(nums[:3])

base = (3, 10, 0)
req_t = parse(req)
required = req_t if req_t > base else base
cur = sys.version_info[:3]
sys.exit(0 if cur >= required else 1)
PY
}

install_python_with_pyenv() {
  local req="${PY_VERSION}"
  [[ -n "${PYENV_ROOT}" ]] || die "pyenv not found. Install pyenv or set PY_BIN to a Python ${PY_VERSION}+ interpreter."
  detail_kv "    " "Installing Python ${req} via pyenv..."
  pyenv install -s "${req}" 2>/dev/null
  local root="${PYENV_ROOT}"
  local candidate="${root}/versions/${req}/bin/python3"
  [[ -x "${candidate}" ]] || candidate="${root}/versions/${req}/bin/python"
  if [[ ! -x "${candidate}" ]]; then
    local match
    match="$(ls -1d "${root}/versions/${req}"* 2>/dev/null | sort -V | tail -n 1 || true)"
    if [[ -n "${match}" ]]; then
      candidate="${match}/bin/python3"
      [[ -x "${candidate}" ]] || candidate="${match}/bin/python"
      PY_VERSION="${match##*/}"
    fi
  fi
  [[ -x "${candidate}" ]] || die "pyenv install completed, but python not found under ${root}/versions/${req}*"
  PY_BIN="${candidate}"
}

ensure_python() {
  local requested="${PY_VERSION}"
  local candidate=""

  if [[ -n "${PY_BIN:-}" ]]; then
    candidate="$(command -v "${PY_BIN}" || true)"
  else
    candidate="$(command -v python3 || command -v python || true)"
  fi

  if [[ -n "${candidate}" ]]; then
    if python_meets_requirement "${candidate}" "${requested}"; then
      PY_BIN="${candidate}"
      return
    fi
  fi

  if [[ "${DRY_RUN}" == "true" ]]; then
    PY_BIN="<pyenv:${requested}>"
    return
  fi

  install_python_with_pyenv
}

find_config_file() {
  local root="$1"
  local found
  found="$(find "${root}" -maxdepth 3 -type f -name 'config.yaml' -print 2>/dev/null | head -n 1 || true)"
  if [[ -z "${found}" ]]; then
    found="$(find "${root}" -maxdepth 3 -type f -name 'pyproject.toml' -print 2>/dev/null | head -n 1 || true)"
  fi
  echo "${found}"
}

resolve_all_paths() {
  # Consolidates path resolution into single function to avoid duplication
  # Resolves: PROJECT_ROOT, CONFIG_FILE, APP_DIR, VENV_DIR, ENV_PATH, GITIGNORE_PATH, CLAUDEIGNORE_PATH, MAIN_SCRIPT, PYPROJECT_TOML
  local config_dir="${1:-${CONFIG_DIR}}"

  # PROJECT_ROOT detection and resolution
  : "${PROJECT_ROOT:=$(detect_project_root)}"
  PROJECT_ROOT="$(resolve_path "${PROJECT_ROOT}" "${config_dir}")"

  # CONFIG_FILE detection and resolution
  if [[ -z "${CONFIG_FILE:-}" ]]; then
    CONFIG_FILE="$(find_config_file "${PROJECT_ROOT}")"
  fi
  if [[ -n "${CONFIG_FILE:-}" ]]; then
    CONFIG_FILE="$(resolve_path "${CONFIG_FILE}" "${config_dir}")"
  fi

  # APP_DIR detection and resolution
  if [[ -z "${APP_DIR:-}" && -n "${CONFIG_FILE:-}" ]]; then
    APP_DIR="$(cd "$(dirname "${CONFIG_FILE}")" && pwd)"
  fi
  : "${APP_DIR:=${PROJECT_ROOT}}"
  APP_DIR="$(resolve_path "${APP_DIR}" "${config_dir}")"

  # VENV_DIR resolution
  : "${VENV_NAME:=}"
  if [[ -n "${VENV_NAME}" ]]; then
    : "${VENV_DIR:=${PROJECT_ROOT}/${VENV_NAME}}"
  else
    : "${VENV_DIR:=${PROJECT_ROOT}/.venv}"
  fi
  VENV_DIR="$(resolve_path "${VENV_DIR}" "${config_dir}")"

  # ENV_PATH resolution
  : "${ENV_PATH:=${PROJECT_ROOT}/.env}"
  ENV_PATH="$(resolve_path "${ENV_PATH}" "${config_dir}")"

  # GITIGNORE_PATH resolution
  : "${GITIGNORE_PATH:=${PROJECT_ROOT}/.gitignore}"
  GITIGNORE_PATH="$(resolve_path "${GITIGNORE_PATH}" "${config_dir}")"

  # PYPROJECT_TOML detection
  PYPROJECT_TOML="${PYPROJECT_TOML:-}"
  if [[ -z "${PYPROJECT_TOML}" && -f "${PROJECT_ROOT}/pyproject.toml" ]]; then
    PYPROJECT_TOML="${PROJECT_ROOT}/pyproject.toml"
  elif [[ -z "${PYPROJECT_TOML}" && -f "${APP_DIR}/pyproject.toml" ]]; then
    PYPROJECT_TOML="${APP_DIR}/pyproject.toml"
  fi

  # MAIN_SCRIPT resolution (relative to config file)
  if [[ -n "${MAIN_SCRIPT:-}" ]]; then
    MAIN_SCRIPT="$(resolve_path "${MAIN_SCRIPT}" "${config_dir}")"
  fi

  # CLAUDEIGNORE_PATH resolution (relative to config file)
  if [[ -n "${CLAUDEIGNORE_PATH:-}" ]]; then
    CLAUDEIGNORE_PATH="$(resolve_path "${CLAUDEIGNORE_PATH}" "${config_dir}")"
  fi
}

detect_project_root() {
  if command -v git >/dev/null 2>&1 && git -C "${CONFIG_DIR}" rev-parse --show-toplevel >/dev/null 2>&1; then
    git -C "${CONFIG_DIR}" rev-parse --show-toplevel
  elif command -v git >/dev/null 2>&1 && git rev-parse --show-toplevel >/dev/null 2>&1; then
    git rev-parse --show-toplevel
  else
    (cd "${SCRIPT_DIR}/../.." && pwd)
  fi
}

get_venv_info() {
  local venv_dir="$1"
  local py_bin="${venv_dir}/bin/python"

  # Python version
  local py_version=""
  if [[ -f "${py_bin}" ]]; then
    py_version=$("${py_bin}" --version 2>&1 | awk '{print $2}')
  fi

  # Package count
  local pkg_count=0
  if [[ -f "${venv_dir}/bin/pip" ]]; then
    pkg_count=$("${venv_dir}/bin/pip" list --quiet 2>/dev/null | wc -l || echo 0)
  fi

  # Modification time (age of venv)
  local age_days=0
  if [[ -d "${venv_dir}" ]]; then
    local mod_time
    mod_time=$(stat -c %Y "${venv_dir}" 2>/dev/null || echo 0)
    local now=$(date +%s)
    age_days=$(( (now - mod_time) / 86400 ))
  fi

  # Size in MB
  local size_mb=0
  if [[ -d "${venv_dir}" ]]; then
    size_mb=$(du -sm "${venv_dir}" 2>/dev/null | awk '{print $1}' || echo 0)
  fi

  echo "${py_version}|${pkg_count}|${age_days}|${size_mb}"
}

prompt_reuse_venv() {
  local venv_dir="$1"
  local venv_info="$2"

  IFS='|' read -r py_version pkg_count age_days size_mb <<< "${venv_info}"

  printf "\n${COLOR_INFO}${ICON_INFO} Existing virtual environment found:${COLOR_RESET}\n"
  detail_kv "    " "Python version" "${py_version:-<unknown>}"
  detail_kv "    " "Installed packages" "${pkg_count}"
  detail_kv "    " "Age" "${age_days} days ago"
  detail_kv "    " "Size" "${size_mb} MB"
  printf "\n"

  if [[ ! -t 0 ]]; then
    # Non-interactive mode, just reuse
    return 0
  fi

  if [[ "${ASSUME_YES}" == "true" ]]; then
    # Auto-approve, reuse
    return 0
  fi

  # Interactive prompt
  read -r -p "  ${COLOR_INFO}→${COLOR_RESET} [R]euse, [C]lean & recreate, [A]bort? [R]: " ans
  case "${ans}" in
    [Cc]*) return 1 ;;  # Clean
    [Aa]*) die "Aborted" ;;
    *) return 0 ;;      # Reuse (default)
  esac
}

calculate_dep_hash() {
  local payload=""
  payload+="CONFIG_PATH=${CONFIG_PATH}"$'\n'
  if [[ -f "${CONFIG_PATH}" ]]; then
    payload+=$(<"${CONFIG_PATH}")$'\n'
  fi
  payload+="CONFIG_FILE=${CONFIG_FILE:-}"$'\n'
  if [[ -n "${CONFIG_FILE:-}" && -f "${CONFIG_FILE}" ]]; then
    payload+=$(<"${CONFIG_FILE}")$'\n'
  fi
  payload+="REQ_FILES=${REQ_FILES[*]}"$'\n'
  for req in "${REQ_FILES[@]}"; do
    payload+="${req}"$'\n'
    if [[ -f "${req}" ]]; then
      payload+=$(<"${req}")$'\n'
    else
      if [[ "${VERBOSE:-false}" == "true" ]]; then
        printf "  ${COLOR_WARNING}${ICON_WARNING} Requirements file not found: %s${COLOR_RESET}\n" "${req}"
      fi
    fi
  done
  payload+="DEPS=${DEPS_LIST[*]}"$'\n'
  if [[ -n "${PYPROJECT_TOML:-}" && -f "${PYPROJECT_TOML}" ]]; then
    payload+=$(<"${PYPROJECT_TOML}")$'\n'
  fi
  payload+="PY_BIN=${PY_BIN}"$'\n'
  payload+="PIP_VERSION=$("${PY_BIN}" -m pip --version 2>/dev/null || true)"$'\n'
  local hash_result
  hash_result=$(printf "%s" "${payload}" | "${PY_BIN}" - <<'PY'
import hashlib, sys
data = sys.stdin.buffer.read()
print(hashlib.sha256(data).hexdigest())
PY
2>&1)
  if [[ $? -ne 0 ]]; then
    if [[ "${VERBOSE:-false}" == "true" ]]; then
      printf "  ${COLOR_WARNING}${ICON_WARNING} Hash calculation failed: %s${COLOR_RESET}\n" "${hash_result}"
    fi
    echo "unknown-hash-$(date +%s)"
    return 1
  fi
  echo "${hash_result}"
}

install_dependencies() {
  local install_errors=()
  local pip_output_redirect=">/dev/null 2>&1"

  # If verbose, show pip output
  if [[ "${VERBOSE:-false}" == "true" ]]; then
    pip_output_redirect=""
  fi

  detail_kv "    " "Upgrading pip..."
  if ! eval "pip install --upgrade pip ${pip_output_redirect}"; then
    install_errors+=("pip upgrade failed")
  fi

  if declare -p PRE_INSTALL_CMD >/dev/null 2>&1 && ((${#PRE_INSTALL_CMD[@]} > 0)); then
    detail_kv "    " "Running pre-install hook..."
    if ! (cd "${PROJECT_ROOT}" && "${PRE_INSTALL_CMD[@]}"); then
      install_errors+=("Pre-install hook failed")
    fi
  fi

  for req in "${REQ_FILES[@]}"; do
    if [[ ! -f "${req}" ]]; then
      install_errors+=("Requirements file not found: ${req}")
      continue
    fi
    detail_kv "    " "Installing from: $(basename "${req}")"
    if ! eval "pip install -r '${req}' ${pip_output_redirect}"; then
      install_errors+=("Failed to install requirements from ${req}")
    fi
  done

  if [[ ${#DEPS_LIST[@]} -gt 0 ]]; then
    detail_kv "    " "Installing explicit packages..."
    if ! eval "pip install ${pip_output_redirect} ${DEPS_LIST[*]@Q}"; then
      install_errors+=("Failed to install explicit dependencies")
    fi
  fi

  if [[ -n "${PYPROJECT_TOML:-}" ]]; then
    if [[ ! -f "${PYPROJECT_TOML}" ]]; then
      install_errors+=("pyproject.toml not found: ${PYPROJECT_TOML}")
    else
      local project_dir
      project_dir="$(cd "$(dirname "${PYPROJECT_TOML}")" && pwd)"
      if [[ "${EDITABLE_INSTALL:-false}" == "true" ]]; then
        detail_kv "    " "Installing project (editable)..."
        if ! eval "pip install -e '${project_dir}' ${pip_output_redirect}"; then
          install_errors+=("Failed to install project in editable mode")
        fi
      else
        detail_kv "    " "Installing project..."
        if ! eval "pip install '${project_dir}' ${pip_output_redirect}"; then
          install_errors+=("Failed to install project")
        fi
      fi
    fi
  fi

  if declare -p POST_INSTALL_CMD >/dev/null 2>&1 && ((${#POST_INSTALL_CMD[@]} > 0)); then
    detail_kv "    " "Running post-install hook..."
    if ! (cd "${PROJECT_ROOT}" && "${POST_INSTALL_CMD[@]}"); then
      install_errors+=("Post-install hook failed")
    fi
  fi

  # Report all errors at end
  if ((${#install_errors[@]} > 0)); then
    printf "\n${COLOR_WARNING}${ICON_WARNING} Installation errors:${COLOR_RESET}\n"
    for err in "${install_errors[@]}"; do
      printf "  • %s\n" "${err}"
    done
    die "Dependency installation failed (see errors above)"
  fi
}

write_env_file() {
  [[ "${WRITE_ENV}" == "true" ]] || return
  local env_path="${ENV_PATH}"
  mkdir -p "$(dirname "${env_path}")"

  local redirect=">"
  [[ "${ENV_APPEND}" == "true" ]] && redirect=">>"

  # Build the env content
  local env_content="# Auto-generated by python-bootstrap/bootstrap.sh"$'\n'
  env_content+="PYTHON_VENV=\"${VENV_DIR}\""$'\n'
  env_content+="PYTHON_BIN=\"${VENV_DIR}/bin/python\""$'\n'
  env_content+="APP_CONFIG=\"${CONFIG_FILE}\""$'\n'
  env_content+="APP_DIR=\"${APP_DIR}\""$'\n'
  env_content+="APP_MAIN_SCRIPT=\"${MAIN_SCRIPT}\""$'\n'
  env_content+="RUN_MODE=\"${RUN_MODE}\""$'\n'

  # Add custom ENV_VARS from config (split properly if space-separated string)
  if [[ ${#ENV_VARS[@]} -gt 0 ]]; then
    local env_var_list=()
    if [[ -v "ENV_VARS[0]" && "${ENV_VARS[0]}" == *" "* ]]; then
      # It's a space-separated string (from config persistence)
      read -ra env_var_list <<< "${ENV_VARS[*]}"
    else
      # It's an array
      env_var_list=("${ENV_VARS[@]}")
    fi

    if [[ ${#env_var_list[@]} -gt 0 ]]; then
      env_content+=$'\n'"# Custom environment variables"$'\n'
      for var in "${env_var_list[@]}"; do
        [[ -z "${var}" ]] && continue
        env_content+="${var}"$'\n'
      done
    fi
  fi

  if [[ "${redirect}" == ">>" ]]; then
    printf "%b" "${env_content}" >> "${env_path}"
  else
    printf "%b" "${env_content}" > "${env_path}"
  fi
}

# ─────────────────────────────────────────────────────────────
# Manifest Functions (track what was added for surgical cleanup)
# ─────────────────────────────────────────────────────────────

save_deployment_manifest() {
  # Saves a manifest of what was written so cleanup can be surgical
  local manifest_path="${VENV_DIR}/.bootstrap.manifest"
  mkdir -p "$(dirname "${manifest_path}")"

  {
    echo "# Bootstrap manifest - tracks what was added for surgical cleanup"
    echo "# Generated on $(date)"
    echo ""
    echo "[env]"
    echo "PYTHON_VENV"
    echo "PYTHON_BIN"
    echo "APP_CONFIG"
    echo "APP_DIR"
    echo "APP_MAIN_SCRIPT"
    echo "RUN_MODE"
    if [[ ${#ENV_VARS[@]} -gt 0 ]]; then
      local env_var_list=()
      if [[ -v "ENV_VARS[0]" && "${ENV_VARS[0]}" == *" "* ]]; then
        read -ra env_var_list <<< "${ENV_VARS[*]}"
      else
        env_var_list=("${ENV_VARS[@]}")
      fi
      for var in "${env_var_list[@]}"; do
        [[ -z "${var}" ]] && continue
        # Extract key from key=value
        local key="${var%%=*}"
        echo "${key}"
      done
    fi
    echo ""
    echo "[gitignore]"
    if [[ -n "${ENV_PATH}" ]]; then
      echo "$(rel_to_root "${ENV_PATH}" "${PROJECT_ROOT}")"
    fi
    # Record the actual paths that will be in .gitignore
    local gi_venv="$(rel_to_root "${VENV_DIR}" "${PROJECT_ROOT}")"
    [[ -n "${gi_venv}" && "${gi_venv}" != */ ]] && gi_venv="${gi_venv}/"
    echo "${gi_venv}"
    local gi_logs="$(rel_to_root "${APP_DIR}/logs" "${PROJECT_ROOT}")"
    [[ -n "${gi_logs}" && "${gi_logs}" != */ ]] && gi_logs="${gi_logs}/"
    echo "${gi_logs}"
    echo ""
    echo "[claudeignore]"
    if [[ ${#CLAUDEIGNORE_ENTRIES[@]} -gt 0 ]]; then
      local ci_entries=()
      if [[ -v "CLAUDEIGNORE_ENTRIES[0]" && "${CLAUDEIGNORE_ENTRIES[0]}" == *" "* ]]; then
        read -ra ci_entries <<< "${CLAUDEIGNORE_ENTRIES[*]}"
      else
        ci_entries=("${CLAUDEIGNORE_ENTRIES[@]}")
      fi
      for entry in "${ci_entries[@]}"; do
        [[ -n "${entry}" ]] && echo "${entry}"
      done
    fi
  } > "${manifest_path}"
}

remove_deployment_manifest() {
  # Surgically removes only what was added to .env, .gitignore, .claudeignore
  local manifest_path="${VENV_DIR}/.bootstrap.manifest"
  [[ ! -f "${manifest_path}" ]] && return

  # Parse manifest and remove entries from each file
  local current_section=""
  local env_keys=()
  local gi_entries=()
  local ci_entries=()

  while IFS= read -r line; do
    # Skip comments and empty lines
    [[ "$line" =~ ^# ]] && continue
    [[ -z "$line" ]] && continue

    # Track section
    case "$line" in
      "[env]") current_section="env" ;;
      "[gitignore]") current_section="gitignore" ;;
      "[claudeignore]") current_section="claudeignore" ;;
      *)
        case "$current_section" in
          env) env_keys+=("$line") ;;
          gitignore) gi_entries+=("$line") ;;
          claudeignore) ci_entries+=("$line") ;;
        esac
        ;;
    esac
  done < "${manifest_path}"

  # Remove from .env (surgical removal of specific keys)
  if [[ -f "${ENV_PATH}" && ${#env_keys[@]} -gt 0 ]]; then
    printf "  ○ Cleaning .env keys\n"
    local temp_env
    temp_env="$(mktemp)" || die "Failed to create temp file for .env cleanup"
    local temp_removed="false"

    while IFS= read -r env_line; do
      local skip="false"
      for key in "${env_keys[@]}"; do
        if [[ "$env_line" =~ ^${key}= ]] || [[ "$env_line" =~ ^#\ Custom\ environment\ variables ]]; then
          skip="true"
          break
        fi
      done
      [[ "$skip" == "false" ]] && echo "$env_line" >> "${temp_env}"
    done < "${ENV_PATH}"

    mv "${temp_env}" "${ENV_PATH}"
  fi

  # Remove from .gitignore (surgical removal)
  if [[ -f "${GITIGNORE_PATH}" && ${#gi_entries[@]} -gt 0 ]]; then
    printf "  ○ Cleaning .gitignore entries\n"
    local temp_gi
    temp_gi="$(mktemp)" || die "Failed to create temp file for .gitignore cleanup"

    local exclude_pattern=""
    for entry in "${gi_entries[@]}"; do
      [[ -z "${entry}" ]] && continue
      local escaped=$(printf '%s\n' "${entry}" | sed 's/[[\.*^$/]/\\&/g')
      if [[ -z "${exclude_pattern}" ]]; then
        exclude_pattern="^${escaped}$"
      else
        exclude_pattern="${exclude_pattern}|^${escaped}$"
      fi
    done

    if [[ -n "${exclude_pattern}" ]]; then
      grep -v -E "${exclude_pattern}" "${GITIGNORE_PATH}" > "${temp_gi}" || true
      mv "${temp_gi}" "${GITIGNORE_PATH}"
    fi
  fi

  # Remove from .claudeignore (surgical removal)
  if [[ -f "${CLAUDEIGNORE_PATH}" && ${#ci_entries[@]} -gt 0 ]]; then
    printf "  ○ Cleaning .claudeignore entries\n"
    local temp_ci
    temp_ci="$(mktemp)" || die "Failed to create temp file for .claudeignore cleanup"

    local exclude_pattern=""
    for entry in "${ci_entries[@]}"; do
      [[ -z "${entry}" ]] && continue
      local escaped=$(printf '%s\n' "${entry}" | sed 's/[[\.*^$/]/\\&/g')
      if [[ -z "${exclude_pattern}" ]]; then
        exclude_pattern="^${escaped}$"
      else
        exclude_pattern="${exclude_pattern}|^${escaped}$"
      fi
    done

    if [[ -n "${exclude_pattern}" ]]; then
      grep -v -E "${exclude_pattern}" "${CLAUDEIGNORE_PATH}" > "${temp_ci}" || true
      mv "${temp_ci}" "${CLAUDEIGNORE_PATH}"
    fi
  fi

  # Remove the manifest itself
  rm -f "${manifest_path}"
}

# ─────────────────────────────────────────────────────────────
# Cleanup Function (for --clean flag)
# ─────────────────────────────────────────────────────────────

cleanup_deployment() {
  local venv_dir="$1"
  local env_path="$2"
  local logs_dir="$3"
  local clean_all="$4"  # true if --clean-all
  local dry_run="$5"

  banner

  section_header "Cleanup – Remove Old Deployment"

  # Calculate what will be deleted
  local to_delete=()
  local to_delete_size=0

  if [[ -d "${venv_dir}" ]]; then
    to_delete+=("${venv_dir} (virtualenv)")
    local size_kb=$(du -sk "${venv_dir}" 2>/dev/null | awk '{print $1}')
    to_delete_size=$((to_delete_size + size_kb))
  fi

  if [[ -d "${logs_dir}" ]]; then
    to_delete+=("${logs_dir} (logs)")
  fi

  local hash_file="${venv_dir}/.bootstrap.hash"
  if [[ -f "${hash_file}" ]]; then
    to_delete+=("${hash_file} (deployment hash)")
  fi

  if [[ "${clean_all}" == "true" ]]; then
    to_delete+=("${GITIGNORE_PATH} (.gitignore entries removed)")
    [[ -n "${CLAUDEIGNORE_PATH}" ]] && to_delete+=("${CLAUDEIGNORE_PATH} (.claudeignore entries removed)")
  fi

  if [[ ${#to_delete[@]} -eq 0 ]]; then
    printf "\n  ${COLOR_INFO}${ICON_INFO}${COLOR_RESET} Nothing to clean.\n\n"
    return 0
  fi

  # Display what will be deleted
  printf "\n  ${COLOR_WARNING}${ICON_WARNING}${COLOR_RESET} The following will be removed:\n\n"
  for item in "${to_delete[@]}"; do
    detail_list "      " "${item}"
  done

  if [[ "$to_delete_size" -gt 0 ]]; then
    printf "\n  Freeing ~${to_delete_size}KB of disk space\n"
  fi

  printf "\n"

  if [[ "${dry_run}" == "true" ]]; then
    printf "  ${COLOR_INFO}${ICON_INFO}${COLOR_RESET} DRY RUN: No changes will be made\n\n"
    return 0
  fi

  # Confirm deletion
  if [[ "${ASSUME_YES}" != "true" && -t 0 ]]; then
    read -r -p "  ${COLOR_WARNING}Continue with deletion?${COLOR_RESET} [y/N] " confirm_ans
    case "${confirm_ans}" in
      [Yy]*) ;;
      *) printf "\n  Aborted by user.\n\n"; exit 0 ;;
    esac
  fi

  printf "\n  Deleting old deployment...\n\n"

  # Surgically remove only bootstrap-managed entries from .env, .gitignore, .claudeignore
  # (must do this BEFORE deleting venv, since manifest is inside venv)
  printf "  Surgical cleanup of managed files:\n"
  remove_deployment_manifest

  # Perform deletion
  if [[ -d "${venv_dir}" ]]; then
    printf "  ○ Removing venv: ${COLOR_ACCENT}$(pretty_path "${venv_dir}" "${PROJECT_ROOT}")${COLOR_RESET}\n"
    rm -rf "${venv_dir}"
  fi

  if [[ -d "${logs_dir}" ]]; then
    printf "  ○ Removing logs: ${COLOR_ACCENT}$(pretty_path "${logs_dir}" "${PROJECT_ROOT}")${COLOR_RESET}\n"
    rm -rf "${logs_dir}"
  fi

  if [[ "${clean_all}" == "true" && -f "${GITIGNORE_PATH}" ]]; then
    printf "  ○ Cleaning .gitignore entries\n"
    # Remove venv, env, and logs entries (safely with temp file)
    local temp_file
    temp_file="$(mktemp)" || die "Failed to create temp file for .gitignore cleanup"
    trap "rm -f '${temp_file}'" RETURN

    if ! grep -v "^\\.venv/$\|^\\.env$\|^logs/$" "${GITIGNORE_PATH}" > "${temp_file}"; then
      die "Failed to filter .gitignore entries"
    fi

    if ! mv "${temp_file}" "${GITIGNORE_PATH}"; then
      die "Failed to write updated .gitignore"
    fi
  fi

  if [[ "${clean_all}" == "true" && -n "${CLAUDEIGNORE_PATH}" && -f "${CLAUDEIGNORE_PATH}" ]]; then
    printf "  ○ Cleaning .claudeignore entries\n"
    # Remove all bootstrap-managed entries from .claudeignore
    local temp_file_ci
    temp_file_ci="$(mktemp)" || die "Failed to create temp file for .claudeignore cleanup"

    # Build a grep pattern to exclude all CLAUDEIGNORE_ENTRIES
    local exclude_pattern=""
    for entry in "${CLAUDEIGNORE_ENTRIES[@]}"; do
      [[ -z "${entry}" ]] && continue
      # Escape special regex characters
      local escaped_entry=$(printf '%s\n' "${entry}" | sed 's/[[\.*^$/]/\\&/g')
      if [[ -z "${exclude_pattern}" ]]; then
        exclude_pattern="^${escaped_entry}$"
      else
        exclude_pattern="${exclude_pattern}|^${escaped_entry}$"
      fi
    done

    if [[ -n "${exclude_pattern}" ]]; then
      if ! grep -v "${exclude_pattern}" "${CLAUDEIGNORE_PATH}" > "${temp_file_ci}"; then
        die "Failed to filter .claudeignore entries"
      fi
      if ! mv "${temp_file_ci}" "${CLAUDEIGNORE_PATH}"; then
        die "Failed to write updated .claudeignore"
      fi
    fi
  fi

  printf "\n  ${COLOR_SUCCESS}${ICON_SUCCESS}${COLOR_RESET} Cleanup complete.\n"
  printf "  ${COLOR_INFO}${ICON_INFO}${COLOR_RESET} Ready to redeploy with: ./bootstrap.sh\n\n"

  exit 0
}

# ─────────────────────────────────────────────────────────────
# Main Script Entry Point
# ─────────────────────────────────────────────────────────────

trap 'die "bootstrap failed at: ${BASH_COMMAND}"' ERR

VERBOSE="false"
QUIET="false"
CLEAN="false"
CLEAN_ALL="false"

# Parse CLI arguments
CONFIG_PATH="${DEFAULT_CONFIG_PATH}"
RUN_MODE="background"
INSTALL_ONLY="false"
RUN_CMD=""
DRY_RUN="false"
WRITE_ENV="true"
ENV_PATH=""
ENV_APPEND="false"
ENV_VARS=( )
INSTALL_DEPS="true"
MANAGE_GITIGNORE="true"
GITIGNORE_PATH=""
MANAGE_CLAUDEIGNORE="true"
CLAUDEIGNORE_PATH=""
CLAUDEIGNORE_ENTRIES=( )
FOREGROUND_WRAPPER="false"
ASSUME_YES="false"
ALLOW_EXTERNAL_ALL="false"
LOG_MAX_SIZE_BYTES=""
LOG_MAX_FILES=""
PY_VERSION=""
PYENV_ROOT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --foreground|-f) RUN_MODE="foreground" ;;
    --background|-b) RUN_MODE="background" ;;
    --config) CONFIG_PATH="$2"; shift ;;
    --install-only) INSTALL_ONLY="true" ;;
    --run-cmd) RUN_CMD="$2"; shift ;;
    --dry-run) DRY_RUN="true" ;;
    --clean) CLEAN="true" ;;
    --clean-all) CLEAN="true"; CLEAN_ALL="true" ;;
    --no-env) WRITE_ENV="false" ;;
    --env-path) ENV_PATH="$2"; shift ;;
    --env-append) ENV_APPEND="true" ;;
    --no-deps) INSTALL_DEPS="false" ;;
    --no-gitignore) MANAGE_GITIGNORE="false" ;;
    --gitignore-path) GITIGNORE_PATH="$2"; shift ;;
    --no-claudeignore) MANAGE_CLAUDEIGNORE="false" ;;
    --claudeignore-path) CLAUDEIGNORE_PATH="$2"; shift ;;
    --editable) EDITABLE_INSTALL="true" ;;
    --allow-external) ALLOW_EXTERNAL_ALL="true" ;;
    --yes) ASSUME_YES="true" ;;
    --foreground-wrapper) FOREGROUND_WRAPPER="true" ;;
    --py-version) PY_VERSION="$2"; shift ;;
    --verbose) VERBOSE="true" ;;
    --quiet) QUIET="true" ;;
    --help|-h) usage; exit 0 ;;
    *) usage; die "Unknown option: $1" ;;
  esac
  shift
done

[[ -f "${CONFIG_PATH}" ]] || die "Config file not found: ${CONFIG_PATH}"
CONFIG_DIR="$(cd "$(dirname "${CONFIG_PATH}")" && pwd)"

set -a
# shellcheck source=/dev/null
source "${CONFIG_PATH}"
set +a

: "${RUN_MODE:=background}"
: "${INSTALL_ONLY:=false}"
: "${RUN_CMD:=}"
: "${DRY_RUN:=false}"
: "${WRITE_ENV:=true}"
: "${ENV_PATH:=}"
: "${ENV_APPEND:=false}"
: "${INSTALL_DEPS:=true}"
: "${EDITABLE_INSTALL:=false}"
: "${FOREGROUND_WRAPPER:=false}"
: "${ASSUME_YES:=false}"
: "${ALLOW_EXTERNAL_APP:=false}"
: "${ALLOW_EXTERNAL_VENV:=false}"
: "${ALLOW_ROOT:=false}"
: "${PROMPT_EXTERNAL:=true}"
: "${LOG_MAX_SIZE_BYTES:=${DEFAULT_LOG_SIZE_BYTES}}"
: "${LOG_MAX_FILES:=${DEFAULT_LOG_MAX_FILES}}"
: "${PY_VERSION:=3.11}"
: "${PYENV_ROOT:=$(command -v pyenv >/dev/null 2>&1 && pyenv root || echo "")}"
: "${MANAGE_GITIGNORE:=true}"
: "${GITIGNORE_PATH:=}"
: "${MANAGE_CLAUDEIGNORE:=true}"
: "${CLAUDEIGNORE_PATH:=}"

# ─────────────────────────────────────────────────────────────
# Handle --clean flag early (before other setup)
# ─────────────────────────────────────────────────────────────

if [[ "${CLEAN}" == "true" ]]; then
  resolve_all_paths "${CONFIG_DIR}"
  logs_dir="${APP_DIR}/logs"
  cleanup_deployment "${VENV_DIR}" "${ENV_PATH}" "${logs_dir}" "${CLEAN_ALL}" "${DRY_RUN}"
fi

# ─────────────────────────────────────────────────────────────
# PHASE 0: Initialization
# ─────────────────────────────────────────────────────────────

if [[ -t 1 ]]; then
  clear
fi

banner

if [[ "${DRY_RUN}" == "true" ]]; then
  printf "\n${COLOR_INFO}${ICON_INFO} DRY RUN MODE${COLOR_RESET} – No changes will be made to your system\n"
fi

printf "\n"

# ─────────────────────────────────────────────────────────────
# PHASE 1: Project Layout Detection
# ─────────────────────────────────────────────────────────────

phase_start 1 "Project Layout"

resolve_all_paths "${CONFIG_DIR}"
: "${MAIN_SCRIPT:=}"

phase_detail "${ICON_FOLDER}" "Project root" "$(pretty_path "${PROJECT_ROOT}" "${PROJECT_ROOT}")"
phase_detail "${ICON_FILE}" "Config file" "$(pretty_path "${CONFIG_FILE:-<none>}" "${PROJECT_ROOT}")"
phase_detail "${ICON_FOLDER}" "App directory" "$(pretty_path "${APP_DIR}" "${PROJECT_ROOT}")"

phase_status "${COLOR_SUCCESS}${ICON_SUCCESS}${COLOR_RESET}"
phase_end

# ─────────────────────────────────────────────────────────────
# PHASE 2: Python Environment
# ─────────────────────────────────────────────────────────────

phase_start 2 "Python Environment"

require_not_root
ensure_python

detail_kv "    " "Checking Python version..."

# Skip actual Python execution in dry-run mode
if [[ "${DRY_RUN}" != "true" ]]; then
  "${PY_BIN}" - <<'PY' >/dev/null || die "Python 3.10+ is required."
import sys
if sys.version_info < (3, 10):
    raise SystemExit("Python 3.10 or newer is required.")
PY
fi

if [[ "${DRY_RUN}" == "true" ]]; then
  PY_VERSION_FULL="<placeholder>"
else
  PY_VERSION_FULL="$("${PY_BIN}" --version 2>&1 | awk '{print $2}')"
fi
phase_detail "${ICON_PYTHON}" "Found" "${PY_BIN}"
phase_detail "${ICON_PYTHON}" "Version" "${PY_VERSION_FULL}"

REQUIRED_PY_SPEC="$(detect_required_python)"
if [[ -n "${REQUIRED_PY_SPEC}" ]]; then
  phase_detail "${ICON_LOCK}" "Required spec" "${REQUIRED_PY_SPEC}"
  check_python_version "${REQUIRED_PY_SPEC}"
else
  phase_detail "${ICON_LOCK}" "Required spec" "<auto>"
fi

phase_status "${COLOR_SUCCESS}${ICON_SUCCESS}${COLOR_RESET}"
phase_end

# ─────────────────────────────────────────────────────────────
# PHASE 3: Dependencies
# ─────────────────────────────────────────────────────────────

phase_start 3 "Dependencies"

REQ_FILES=()
if declare -p REQUIREMENTS_FILES >/dev/null 2>&1; then
  for req in "${REQUIREMENTS_FILES[@]}"; do
    [[ -f "${req}" ]] && REQ_FILES+=("$(resolve_path "${req}" "${CONFIG_DIR}")")
  done
fi

append_req() {
  local path="$1"
  [[ -f "${path}" ]] || return 0
  for existing in "${REQ_FILES[@]}"; do
    [[ "${existing}" == "${path}" ]] && return
  done
  REQ_FILES+=("${path}")
  return 0
}

append_req "${PROJECT_ROOT}/requirements.txt"
append_req "${PROJECT_ROOT}/requirements-dev.txt"
append_req "${APP_DIR}/requirements.txt"
append_req "${APP_DIR}/requirements-dev.txt"

DEPS_LIST=()
if declare -p DEPS >/dev/null 2>&1; then
  DEPS_LIST=("${DEPS[@]}")
fi

normalize_deps_list() {
  local normalized=()
  for dep in "${DEPS_LIST[@]}"; do
    local trimmed_dep
    trimmed_dep="$(echo "${dep}" | awk '{$1=$1;print}')"
    [[ -z "${trimmed_dep}" ]] && continue
    normalized+=("${trimmed_dep}")
  done
  DEPS_LIST=("${normalized[@]}")
}
normalize_deps_list

if [[ ${#REQ_FILES[@]} -gt 0 ]]; then
  phase_detail "${ICON_PACKAGES}" "Requirements files" ""
  for req in "${REQ_FILES[@]}"; do
    detail_list "    " "$(basename "${req}")"
  done
else
  phase_detail "${ICON_PACKAGES}" "Requirements files" "<none found>"
fi

if [[ ${#DEPS_LIST[@]} -gt 0 ]]; then
  phase_detail "${ICON_PACKAGES}" "Inline packages" ""
  for dep in "${DEPS_LIST[@]}"; do
    detail_list "    " "${dep}"
  done
fi

if [[ -n "${PYPROJECT_TOML:-}" ]]; then
  phase_detail "${ICON_CONFIG}" "pyproject.toml" "$(pretty_path "${PYPROJECT_TOML}" "${PROJECT_ROOT}")"
fi

if [[ "${INSTALL_DEPS}" == "false" ]]; then
  phase_detail "${ICON_INFO}" "Installation" "disabled (--no-deps)"
  phase_status "${COLOR_INFO}${ICON_INFO}${COLOR_RESET}"
else
  phase_status "${COLOR_SUCCESS}${ICON_SUCCESS}${COLOR_RESET}"
fi
phase_end

# ─────────────────────────────────────────────────────────────
# PHASE 4: Venv & Files
# ─────────────────────────────────────────────────────────────

phase_start 4 "Virtual Environment & Files"

phase_detail "${ICON_FOLDER}" "venv location" "$(pretty_path "${VENV_DIR}" "${PROJECT_ROOT}")"
phase_detail "${ICON_FILE}" "Env file" "$(pretty_path "${ENV_PATH}" "${PROJECT_ROOT}")"
if [[ "${WRITE_ENV}" == "true" ]]; then
  detail_list "    " "APP_CONFIG, APP_DIR, APP_MAIN_SCRIPT, PYTHON_*"
fi

phase_detail "${ICON_FILE}" ".gitignore" "$(pretty_path "${GITIGNORE_PATH}" "${PROJECT_ROOT}")"
if [[ "${MANAGE_GITIGNORE}" == "true" ]]; then
  detail_list "    " ".venv/"
  detail_list "    " ".env"
  detail_list "    " "logs/"
fi

phase_status "${COLOR_SUCCESS}${ICON_SUCCESS}${COLOR_RESET}"
phase_end

# ─────────────────────────────────────────────────────────────
# PHASE 5: Startup Configuration
# ─────────────────────────────────────────────────────────────

phase_start 5 "Startup Configuration"

phase_detail "${ICON_ROCKET}" "Run mode" "${RUN_MODE}"
if [[ -n "${MAIN_SCRIPT}" && -f "${MAIN_SCRIPT}" ]]; then
  phase_detail "${ICON_FILE}" "Startup script" "$(pretty_path "${MAIN_SCRIPT}" "${PROJECT_ROOT}")"
  phase_status "${COLOR_SUCCESS}${ICON_SUCCESS}${COLOR_RESET}"
else
  if [[ -n "${RUN_CMD}" ]]; then
    phase_detail "${ICON_INFO}" "Custom command" "${RUN_CMD}"
    phase_status "${COLOR_SUCCESS}${ICON_SUCCESS}${COLOR_RESET}"
  else
    phase_detail "${ICON_WARNING}" "Startup script" "<not configured>"
    phase_status "${COLOR_WARNING}${ICON_WARNING}${COLOR_RESET} Requires --run-cmd or MAIN_SCRIPT"
  fi
fi
phase_end

# ─────────────────────────────────────────────────────────────
# Summary & Status
# ─────────────────────────────────────────────────────────────

section_header "Summary"

READY_COUNT=4
NEEDS_INPUT=0
if [[ -z "${MAIN_SCRIPT}" && -z "${RUN_CMD}" ]]; then
  NEEDS_INPUT=1
  READY_COUNT=4
fi

printf "  ${COLOR_SUCCESS}${ICON_SUCCESS}${COLOR_RESET} %d phases ready  " "$READY_COUNT"
if [[ "$NEEDS_INPUT" -gt 0 ]]; then
  printf " ${COLOR_WARNING}${ICON_WARNING}${COLOR_RESET} %d phase needs input  " "$NEEDS_INPUT"
fi
if [[ "${DRY_RUN}" == "true" ]]; then
  printf " ${COLOR_INFO}${ICON_INFO}${COLOR_RESET} DRY RUN active"
fi
printf "\n\n"

# ─────────────────────────────────────────────────────────────
# Interactive Prompts (20% customization)
# ─────────────────────────────────────────────────────────────

if [[ "${NEEDS_INPUT}" -gt 0 || "${VERBOSE}" == "true" ]]; then
  section_header "Customize Values (20% – press Enter to accept)"

  if [[ -z "${MAIN_SCRIPT}" && -z "${RUN_CMD}" ]]; then
    printf "  (1) Startup script (file to execute when running bootstrap)\n"
    printf "      Default: (not set - just activate venv)\n"
    printf "      Example: ./spark.py\n"

    # Validate MAIN_SCRIPT with retry loop
    main_script_valid=false
    while [[ "${main_script_valid}" == "false" ]]; do
      confirm_value "MAIN_SCRIPT" ""

      # If user provided a script, validate it
      if [[ -n "${MAIN_SCRIPT}" ]]; then
        # Resolve the path relative to config directory
        local resolved_script
        resolved_script="$(resolve_path "${MAIN_SCRIPT}" "${CONFIG_DIR}")"

        if [[ -f "${resolved_script}" ]]; then
          # File exists, save resolved path
          MAIN_SCRIPT="${resolved_script}"
          main_script_valid=true
          printf "  ${COLOR_SUCCESS}${ICON_SUCCESS}${COLOR_RESET} Found: $(pretty_path "${MAIN_SCRIPT}" "${PROJECT_ROOT}")\n"
        else
          # File not found, show error and re-prompt
          printf "  ${COLOR_WARNING}${ICON_WARNING}${COLOR_RESET} File not found: ${resolved_script}\n"
          printf "  ${COLOR_INFO}${ICON_INFO}${COLOR_RESET} Please check the path and try again (or leave empty to skip)\n"
          MAIN_SCRIPT=""  # Clear for next attempt
          printf "\n"
        fi
      else
        # User left it empty, that's valid (venv-only mode)
        main_script_valid=true
      fi
    done
    printf "\n"
  fi

  if [[ "${VERBOSE}" == "true" || "${ASSUME_YES}" != "true" ]]; then
    printf "  (2) Run mode\n"
    printf "      Current: ${COLOR_ACCENT}${RUN_MODE}${COLOR_RESET}\n"
    printf "      Options: [b]ackground | [f]oreground\n"
    confirm_value "RUN_MODE" "${RUN_MODE}"
    printf "\n"
  fi
fi

# ─────────────────────────────────────────────────────────────
# Dry-run completion or proceed
# ─────────────────────────────────────────────────────────────

if [[ "${DRY_RUN}" == "true" ]]; then
  section_header "Dry Run Complete"

  # Show what would be tracked in manifest
  printf "\n  ${COLOR_INFO}${ICON_INFO}${COLOR_RESET} Deployment manifest would track:\n"
  printf "    • Environment variables: PYTHON_VENV, PYTHON_BIN, APP_CONFIG, APP_DIR, APP_MAIN_SCRIPT, RUN_MODE"
  if [[ ${#ENV_VARS[@]} -gt 0 ]]; then
    sample_vars=""
    if [[ -v "ENV_VARS[0]" && "${ENV_VARS[0]}" == *" "* ]]; then
      sample_vars=$(printf '%s ' "${ENV_VARS[@]}" | cut -d= -f1 | head -3 | xargs)
    else
      sample_vars=$(printf '%s ' "${ENV_VARS[@]}" | cut -d= -f1 | head -3 | xargs)
    fi
    printf ", ${sample_vars}"
  fi
  printf "\n"
  printf "    • .gitignore entries: .env, .venv/, "
  [[ -n "${APP_DIR}" ]] && printf "_build/sparkqueue/logs/"
  printf "\n"
  printf "    • .claudeignore entries: .venv/, __pycache__/, *.pyc, .pytest_cache/, .egg-info/, dist/, build/, .DS_Store\n"

  printf "\n  To apply these settings, run:\n"
  printf "    ${COLOR_ACCENT}./bootstrap.sh${COLOR_RESET}\n\n"
  exit 0
fi

# Final confirmation
section_header "Ready to Proceed"

if [[ "${ASSUME_YES}" != "true" && -t 0 ]]; then
  read -r -p "  Continue with setup? [Y/n] " proceed_ans
  case "${proceed_ans}" in
    [Nn]*) die "Aborted by user." ;;
    *) ;; # continue
  esac
fi

# ─────────────────────────────────────────────────────────────
# EXECUTION PHASE: Create venv, install deps, write files
# ─────────────────────────────────────────────────────────────

section_header "Execution"

if [[ ! -d "${VENV_DIR}" ]]; then
  printf "  Creating virtual environment in ${COLOR_ACCENT}${VENV_DIR}${COLOR_RESET}\n"
  if ! "${PY_BIN}" -m venv "${VENV_DIR}"; then
    die "Failed to create virtual environment at ${VENV_DIR}"
  fi
  if ! [[ -f "${VENV_DIR}/bin/activate" ]]; then
    die "Virtual environment invalid: missing activate script at ${VENV_DIR}/bin/activate"
  fi
else
  # Existing venv found - show info and prompt
  if ! [[ -f "${VENV_DIR}/bin/activate" ]]; then
    die "Existing virtual environment invalid: missing activate script at ${VENV_DIR}/bin/activate"
  fi

  # Gather and display venv info
  venv_info=$(get_venv_info "${VENV_DIR}")

  # Prompt user if interactive
  if ! prompt_reuse_venv "${VENV_DIR}" "${venv_info}"; then
    # User chose to clean and recreate
    printf "  Cleaning and recreating virtual environment...\n"
    rm -rf "${VENV_DIR}"
    if ! "${PY_BIN}" -m venv "${VENV_DIR}"; then
      die "Failed to create virtual environment at ${VENV_DIR}"
    fi
    if ! [[ -f "${VENV_DIR}/bin/activate" ]]; then
      die "Virtual environment invalid: missing activate script at ${VENV_DIR}/bin/activate"
    fi
  else
    printf "  Reusing existing virtual environment in ${COLOR_ACCENT}${VENV_DIR}${COLOR_RESET}\n"
  fi
fi

# shellcheck source=/dev/null
if ! source "${VENV_DIR}/bin/activate"; then
  die "Failed to activate virtual environment"
fi

HASH_FILE="${VENV_DIR}/.bootstrap.hash"
CURRENT_HASH="$(calculate_dep_hash)"
NEED_INSTALL="true"
DID_INSTALL="false"
if [[ -f "${HASH_FILE}" ]]; then
  LAST_HASH="$(<"${HASH_FILE}")"
  if [[ "${LAST_HASH}" == "${CURRENT_HASH}" ]]; then
    NEED_INSTALL="false"
    printf "  Dependencies unchanged; skipping install\n"
  fi
fi

if [[ "${INSTALL_DEPS}" == "false" ]]; then
  NEED_INSTALL="false"
  printf "  Dependency installation skipped (--no-deps)\n"
fi

if [[ "${NEED_INSTALL}" == "true" ]]; then
  printf "  Installing dependencies…\n"
  install_dependencies
  echo "${CURRENT_HASH}" > "${HASH_FILE}"
  DID_INSTALL="true"
fi

mkdir -p "${APP_DIR}/logs"
BOOTSTRAP_LOG="${APP_DIR}/logs/bootstrap.log"

write_env_file
if [[ "${WRITE_ENV}" == "true" ]]; then
  printf "  Wrote environment file: ${COLOR_ACCENT}$(pretty_path "${ENV_PATH}" "${PROJECT_ROOT}")${COLOR_RESET}\n"
fi

venv_ignore="$(rel_to_root "${VENV_DIR}" "${PROJECT_ROOT}")"
logs_ignore="$(rel_to_root "${APP_DIR}/logs" "${PROJECT_ROOT}")"
[[ -n "${venv_ignore}" && "${venv_ignore}" != */ ]] && venv_ignore="${venv_ignore}/"
[[ -n "${logs_ignore}" && "${logs_ignore}" != */ ]] && logs_ignore="${logs_ignore}/"
ensure_gitignore "${GITIGNORE_PATH}" "$(rel_to_root "${ENV_PATH}" "${PROJECT_ROOT}")" "${venv_ignore}" "${logs_ignore}"
if [[ "${MANAGE_GITIGNORE}" == "true" ]]; then
  printf "  Updated .gitignore: ${COLOR_ACCENT}$(pretty_path "${GITIGNORE_PATH}" "${PROJECT_ROOT}")${COLOR_RESET}\n"
fi

if [[ "${MANAGE_CLAUDEIGNORE}" == "true" && -n "${CLAUDEIGNORE_PATH}" ]]; then
  # Split CLAUDEIGNORE_ENTRIES properly (handles both array and space-separated string formats)
  ci_entries=()
  if [[ ${#CLAUDEIGNORE_ENTRIES[@]} -gt 0 ]]; then
    if [[ -v "CLAUDEIGNORE_ENTRIES[0]" && "${CLAUDEIGNORE_ENTRIES[0]}" == *" "* ]]; then
      # It's a space-separated string (from config persistence)
      read -ra ci_entries <<< "${CLAUDEIGNORE_ENTRIES[*]}"
    else
      # It's an array
      ci_entries=("${CLAUDEIGNORE_ENTRIES[@]}")
    fi
  fi
  ensure_claudeignore "${CLAUDEIGNORE_PATH}" "${ci_entries[@]}"
  printf "  Updated .claudeignore: ${COLOR_ACCENT}$(pretty_path "${CLAUDEIGNORE_PATH}" "${PROJECT_ROOT}")${COLOR_RESET}\n"
fi

persist_config "${CONFIG_PATH}"
printf "  Persisted config: ${COLOR_ACCENT}$(pretty_path "${CONFIG_PATH}" "${PROJECT_ROOT}")${COLOR_RESET}\n"

save_deployment_manifest

# Count manifest entries for display
manifest_path="${VENV_DIR}/.bootstrap.manifest"
env_count=0
gi_count=0
ci_count=0
if [[ -f "${manifest_path}" ]]; then
  env_count=$(sed -n '/^\[env\]/,/^\[/p' "${manifest_path}" | grep -c "^[A-Z_]*$" 2>/dev/null || echo 0)
  gi_count=$(sed -n '/^\[gitignore\]/,/^\[/p' "${manifest_path}" | grep -v "^\[" | grep -c . 2>/dev/null || echo 0)
  ci_count=$(sed -n '/^\[claudeignore\]/,/^\[/p' "${manifest_path}" | tail -n +2 | grep -c . 2>/dev/null || echo 0)
fi
printf "  Saved deployment manifest: ${COLOR_ACCENT}$(pretty_path "${manifest_path}" "${PROJECT_ROOT}")${COLOR_RESET}\n"
printf "      Tracking: ${env_count} env keys, ${gi_count} gitignore entries, ${ci_count} claudeignore entries\n"

printf "\n"

# ─────────────────────────────────────────────────────────────
# Final Summary
# ─────────────────────────────────────────────────────────────

section_header "Setup Complete"

printf "  ${COLOR_SUCCESS}${ICON_SUCCESS}${COLOR_RESET} Virtual environment ready at: ${COLOR_ACCENT}$(pretty_path "${VENV_DIR}" "${PROJECT_ROOT}")${COLOR_RESET}\n"
printf "  ${COLOR_SUCCESS}${ICON_SUCCESS}${COLOR_RESET} Dependencies installed: ${DID_INSTALL}\n"
printf "  ${COLOR_SUCCESS}${ICON_SUCCESS}${COLOR_RESET} Environment file: ${COLOR_ACCENT}$(pretty_path "${ENV_PATH}" "${PROJECT_ROOT}")${COLOR_RESET}\n"
printf "  ${COLOR_SUCCESS}${ICON_SUCCESS}${COLOR_RESET} .gitignore updated: $(pretty_path "${GITIGNORE_PATH}" "${PROJECT_ROOT}")\n"

printf "\n"

if [[ "${INSTALL_ONLY}" == "true" ]]; then
  printf "  Install-only mode; skipping launch.\n\n"
  exit 0
fi

# Check if we have something to run
has_startup_script=false
if [[ -n "${MAIN_SCRIPT}" && -f "${MAIN_SCRIPT}" ]] || [[ -n "${RUN_CMD}" ]]; then
  has_startup_script=true
fi

# ─────────────────────────────────────────────────────────────
# Launch Application or Activate Venv
# ─────────────────────────────────────────────────────────────

if [[ "${has_startup_script}" == "true" ]]; then
  printf "  Launching application in ${RUN_MODE} mode…\n\n"

  if [[ "${RUN_MODE}" == "foreground" ]]; then
    if [[ -n "${RUN_CMD}" ]]; then
      if [[ "${FOREGROUND_WRAPPER}" == "true" ]]; then
        ( cd "${APP_DIR}" && source "${VENV_DIR}/bin/activate" && APP_CONFIG="${CONFIG_FILE}" bash -lc "${RUN_CMD}" )
      else
        APP_CONFIG="${CONFIG_FILE}" exec bash -lc "cd \"${APP_DIR}\" && source \"${VENV_DIR}/bin/activate\" && ${RUN_CMD}"
      fi
    else
      if [[ "${FOREGROUND_WRAPPER}" == "true" ]]; then
        ( cd "${APP_DIR}" && source "${VENV_DIR}/bin/activate" && APP_CONFIG="${CONFIG_FILE}" "${VENV_DIR}/bin/python" "${MAIN_SCRIPT}" )
      else
        APP_CONFIG="${CONFIG_FILE}" exec "${VENV_DIR}/bin/python" "${MAIN_SCRIPT}"
      fi
    fi
  else
    if [[ -n "${RUN_CMD}" ]]; then
      nohup bash -c "cd \"${APP_DIR}\" && source \"${VENV_DIR}/bin/activate\" && APP_CONFIG=\"${CONFIG_FILE}\" ${RUN_CMD}" \
        >"${BOOTSTRAP_LOG}" 2>&1 &
    else
      nohup bash -c "cd \"${APP_DIR}\" && source \"${VENV_DIR}/bin/activate\" && APP_CONFIG=\"${CONFIG_FILE}\" exec \"${VENV_DIR}/bin/python\" \"${MAIN_SCRIPT}\"" \
        >"${BOOTSTRAP_LOG}" 2>&1 &
    fi
    pid=$!
    printf "  ${COLOR_SUCCESS}${ICON_SUCCESS}${COLOR_RESET} Background PID: ${pid}\n"
    printf "  ${COLOR_INFO}${ICON_INFO}${COLOR_RESET} Logs: ${BOOTSTRAP_LOG}\n"
    printf "  ${COLOR_INFO}${ICON_INFO}${COLOR_RESET} Stop with: kill ${pid}\n"
  fi
else
  printf "\nVirtual environment ready to use!\n"
  printf "  ${COLOR_SUCCESS}${ICON_SUCCESS}${COLOR_RESET} To activate: ${COLOR_ACCENT}source ${VENV_DIR}/bin/activate${COLOR_RESET}\n"
  printf "  ${COLOR_INFO}${ICON_INFO}${COLOR_RESET} Or run directly: ${COLOR_ACCENT}${VENV_DIR}/bin/python <script>${COLOR_RESET}\n\n"
fi
