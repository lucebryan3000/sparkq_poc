.PHONY: dev dev-watch prod test-dev-cache test-index start stop watch-ui sync-ui help

##############################################################################
# UI Development Workflow
##############################################################################

# Sync UI files from source to dist (one-time sync)
sync-ui:
	@bash sparkq/ui/scripts/sync-dist.sh

# Watch and auto-sync UI files during development
watch-ui:
	npm run watch:ui

##############################################################################
# Development Server (choose one based on your workflow)
##############################################################################

# Standard dev mode (no file watcher - use 'make watch-ui' in separate terminal)
dev: sync-ui
	SPARKQ_ENV=dev ./sparkq.sh run --foreground

# Dev mode with auto-syncing watcher in background
# Best for: Active UI development where you want automatic sync on save
dev-watch: sync-ui
	@echo "Starting UI watcher in background..."
	@npm run watch:ui > /tmp/sparkq-watch-ui.log 2>&1 &
	@echo "Watcher PID: $$!"
	@echo "Watch logs: tail -f /tmp/sparkq-watch-ui.log"
	@echo ""
	@echo "Starting SparkQ server..."
	SPARKQ_ENV=dev ./sparkq.sh run --foreground

# Production mode
prod: sync-ui
	SPARKQ_ENV=prod ./sparkq.sh run --foreground

##############################################################################
# Server Management
##############################################################################

test-dev-cache:
	SPARKQ_ENV=dev pytest sparkq/tests/unit/test_dev_caching.py

start: sync-ui
	./sparkq.sh start

stop:
	./sparkq.sh stop

test-index:
	python3 tools/test_index.py --fail-on-missing

##############################################################################
# Help
##############################################################################

help:
	@echo "SparkQueue Development Targets"
	@echo ""
	@echo "UI & Development:"
	@echo "  make sync-ui         Sync UI source files to dist (one-time)"
	@echo "  make watch-ui        Watch source files and auto-sync to dist (separate terminal)"
	@echo "  make dev             Start server (manually run 'make watch-ui' in another terminal)"
	@echo "  make dev-watch       Start server WITH auto-sync watcher in background"
	@echo ""
	@echo "Server Management:"
	@echo "  make start           Start server in background"
	@echo "  make stop            Stop background server"
	@echo "  make prod            Start production server"
	@echo ""
	@echo "Testing:"
	@echo "  make test-index      Test script index"
	@echo "  make test-dev-cache  Test dev caching"
	@echo ""
	@echo "Recommended Development Workflow:"
	@echo "  Terminal 1: make dev-watch"
	@echo "  OR"
	@echo "  Terminal 1: make dev"
	@echo "  Terminal 2: make watch-ui"
