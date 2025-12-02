-- Migration: add_codex_session_id
-- Purpose: Add Codex session tracking to queues for context continuity
-- Date: 2025-12-01

ALTER TABLE queues ADD COLUMN codex_session_id TEXT NULL;
-- Stores Codex CLI session ID for context continuity across llm-codex tasks in same queue
-- NULL for queues without Codex tasks or before the first Codex task runs
