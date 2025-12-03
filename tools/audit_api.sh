#!/bin/bash

##############################################################################
# SparkQ API Audit Tool
#
# Validates that all UI API calls have corresponding backend implementations.
# Helps prevent the "missing endpoint" issue from happening again.
#
# Usage:
#   ./tools/audit_api.sh              # Full audit with details
#   ./tools/audit_api.sh --quick      # Quick check (missing only)
#   ./tools/audit_api.sh --report     # Generate markdown report
#
##############################################################################

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

MODE="${1:-full}"
REPORT_FILE="_build/api_audit_$(date +%Y%m%d_%H%M%S).txt"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_ENDPOINTS=0
MISSING_ENDPOINTS=0
ORPHANED_ENDPOINTS=0

##############################################################################
# Helper Functions
##############################################################################

log() {
  echo -e "${BLUE}[AUDIT]${NC} $@"
}

success() {
  echo -e "${GREEN}✅${NC} $@"
}

warning() {
  echo -e "${YELLOW}⚠️${NC} $@"
}

error() {
  echo -e "${RED}❌${NC} $@"
}

##############################################################################
# Main Audit Functions
##############################################################################

extract_backend_endpoints() {
  # Extract all @app decorator routes from api.py
  grep -n "@app\." sparkq/src/api.py | \
    grep -oP '"/[^"]*' | \
    tr -d '"' | \
    sort | uniq
}

extract_ui_api_calls() {
  # Extract all api() calls from UI pages
  # Remove query parameters for comparison (they're part of the same endpoint)
  grep -rh "api(" sparkq/ui/pages/*.js 2>/dev/null | \
    grep -oP "'\K/api/[^']*" | \
    sed 's/?.*$//' | \
    sort | uniq
}

normalize_endpoint() {
  # Replace path parameters with wildcards for comparison
  echo "$1" | sed 's/{[^}]*}/.*/g'
}

##############################################################################
# Audit Mode: Missing Implementations
##############################################################################

audit_missing() {
  log "Checking for missing API implementations..."
  echo ""

  MISSING_COUNT=0

  while IFS= read -r endpoint; do
    [ -z "$endpoint" ] && continue

    # Normalize endpoint for pattern matching
    PATTERN=$(normalize_endpoint "$endpoint")

    # Check if this endpoint exists in backend
    if ! grep -qE "(\"$PATTERN\"|'$PATTERN')" sparkq/src/api.py; then
      error "Missing implementation: $endpoint"
      MISSING_COUNT=$((MISSING_COUNT + 1))
    fi
  done < <(extract_ui_api_calls)

  if [ $MISSING_COUNT -eq 0 ]; then
    success "No missing implementations found!"
    return 0
  else
    error "Found $MISSING_COUNT missing implementations"
    return 1
  fi
}

##############################################################################
# Audit Mode: Orphaned Endpoints
##############################################################################

audit_orphaned() {
  log "Checking for potentially orphaned endpoints..."
  echo ""

  ORPHANED_COUNT=0

  while IFS= read -r endpoint; do
    [ -z "$endpoint" ] && continue

    # Normalize endpoint for pattern matching
    PATTERN=$(normalize_endpoint "$endpoint")

    # Skip known CLI-only endpoints
    case "$endpoint" in
      /health|/ui-cache-buster.js|/api/version|/api/build-prompts|/api/audit)
        continue
        ;;
      *session*end|*queue*end|*llm-sessions|quick-add|/reset)
        # CLI-only operations
        continue
        ;;
    esac

    # Check if UI code calls this endpoint
    if ! grep -rqE "$PATTERN" sparkq/ui/pages/*.js 2>/dev/null; then
      warning "Potentially orphaned: $endpoint"
      ORPHANED_COUNT=$((ORPHANED_COUNT + 1))
    fi
  done < <(extract_backend_endpoints)

  if [ $ORPHANED_COUNT -eq 0 ]; then
    success "No orphaned endpoints found"
  else
    warning "Found $ORPHANED_COUNT potentially orphaned endpoints (may be intentional)"
  fi
}

##############################################################################
# Audit Mode: Full Report
##############################################################################

audit_full() {
  log "Running full API audit..."
  echo ""

  # Count endpoints
  BACKEND_COUNT=$(extract_backend_endpoints | wc -l)
  UI_CALLS=$(extract_ui_api_calls | wc -l)

  echo "=== ENDPOINT SUMMARY ==="
  echo "Backend endpoints: $BACKEND_COUNT"
  echo "UI API calls:      $UI_CALLS"
  echo ""

  # Check for missing implementations
  echo "=== MISSING IMPLEMENTATIONS ==="
  MISSING_COUNT=0
  while IFS= read -r endpoint; do
    [ -z "$endpoint" ] && continue
    PATTERN=$(normalize_endpoint "$endpoint")
    if ! grep -qE "(\"$PATTERN\"|'$PATTERN')" sparkq/src/api.py; then
      error "Missing: $endpoint"
      MISSING_COUNT=$((MISSING_COUNT + 1))
    fi
  done < <(extract_ui_api_calls)

  if [ $MISSING_COUNT -eq 0 ]; then
    success "All UI calls have backend implementations"
  fi
  echo ""

  # Check endpoints by method
  echo "=== ENDPOINTS BY METHOD ==="
  echo "GET:    $(grep -c '@app.get' sparkq/src/api.py)"
  echo "POST:   $(grep -c '@app.post' sparkq/src/api.py)"
  echo "PUT:    $(grep -c '@app.put' sparkq/src/api.py)"
  echo "DELETE: $(grep -c '@app.delete' sparkq/src/api.py)"
  echo ""

  # Overall status
  if [ $MISSING_COUNT -eq 0 ]; then
    success "AUDIT PASSED: All endpoints properly implemented"
    return 0
  else
    error "AUDIT FAILED: $MISSING_COUNT missing implementations"
    return 1
  fi
}

##############################################################################
# Report Mode: Generate Markdown
##############################################################################

audit_report() {
  log "Generating API audit report..."

  cat > "$REPORT_FILE" << 'EOF'
# API Audit Report

Generated: $(date)

## Summary

EOF

  # Summary stats
  BACKEND_COUNT=$(extract_backend_endpoints | wc -l)
  UI_CALLS=$(extract_ui_api_calls | wc -l)

  echo "- Backend endpoints: $BACKEND_COUNT" >> "$REPORT_FILE"
  echo "- UI API calls: $UI_CALLS" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"

  # Check for missing
  echo "## Missing Implementations" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"

  MISSING_COUNT=0
  while IFS= read -r endpoint; do
    [ -z "$endpoint" ] && continue
    PATTERN=$(normalize_endpoint "$endpoint")
    if ! grep -qE "(\"$PATTERN\"|'$PATTERN')" sparkq/src/api.py; then
      echo "- \`$endpoint\` ❌" >> "$REPORT_FILE"
      MISSING_COUNT=$((MISSING_COUNT + 1))
    fi
  done < <(extract_ui_api_calls)

  if [ $MISSING_COUNT -eq 0 ]; then
    echo "✅ No missing implementations" >> "$REPORT_FILE"
  fi
  echo "" >> "$REPORT_FILE"

  # Endpoint list
  echo "## All Backend Endpoints" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
  extract_backend_endpoints | while read -r endpoint; do
    echo "- \`$endpoint\`" >> "$REPORT_FILE"
  done

  success "Report saved to: $REPORT_FILE"
  cat "$REPORT_FILE"
}

##############################################################################
# Main Entry Point
##############################################################################

main() {
  case "$MODE" in
    --quick)
      audit_missing
      ;;
    --report)
      audit_report
      ;;
    *)
      audit_full
      audit_orphaned
      ;;
  esac
}

main "$@"
