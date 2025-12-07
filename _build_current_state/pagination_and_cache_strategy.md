# Pagination and Cache Strategy (SparkQ v1.0 Extraction)

## Overview
Full contract for pagination and caching/versioning, addressing POC defects (hard cap/truncated flag, cache-buster drift) and defining v1.0 rules for API/DB/UI, asset versioning, and failure handling. All behaviors are explicit and enforceable.

## POC Pagination Defects
- Hard-coded cap: tasks list limited to 1000 rows (`MAX_TASK_LIST_LIMIT`); silent truncation unless truncated flag surfaced.
- No true pagination: limit/offset present but still capped; no total_count; no cursor; no server-driven paging controls.
- Sorting limited: created_at DESC only; UI local sorts on partial data.
- Effects: hidden tasks (stale/failed) beyond cap; misleading dashboards; “No tasks” when offset beyond cap; bulk ops impossible on hidden data.

## v1.0 Pagination Contract
- Request params:
  - `limit` (default 50, max 500)
  - `offset` (>=0) OR `cursor` (opaque token), not both
  - `sort_by` whitelist: created_at, started_at, finished_at, status, queue_name; `sort_dir`: asc|desc
  - Filters: status enum, queue_id, session_id, date ranges (created_at/started_at/finished_at), tool_name, task_class
- Response (offset model):
  - items, limit, offset, total_count (exact or marked approximate), truncated (true if more data beyond returned set when total absent)
- Response (cursor model):
  - items, limit, next_cursor (nullable), prev_cursor optional, total_count optional/approximate; cursor encodes sort/filter fingerprint to detect mismatch
- Ordering:
  - Stable ORDER BY with tie-breaker id when sorting by timestamps/status to prevent duplicates/gaps across pages.
  - Default: created_at DESC, id DESC.
- Validation:
  - Reject limit > max, negative offset, invalid cursor, unsupported sort/filter with 400.

## Sort Order Invariants
- Sorting must be server-side; client must not reorder beyond server-provided order.
- If sort_by=status, secondary sort by created_at DESC then id DESC.
- Date range filters apply before pagination; inclusive start, exclusive end recommended; document exact semantics.

## Storage-Layer Requirements
- Implement LIMIT/OFFSET and cursor generation in SQL; avoid loading >limit rows.
- Provide COUNT (*) or approximate counts; annotate approximate_count when used.
- Indexes:
  - tasks: (queue_id, status, created_at DESC), (status, created_at DESC), (created_at DESC, id DESC), (started_at), (finished_at); partial indexes for queued/running optional.
  - queues/sessions: status, created_at.
- Cursor structure: encode sort key(s), id tie-breaker, and filter/sort fingerprint; sign/encrypt to prevent tampering.

## UI Pagination Interactions
- Show total_count or “showing X–Y of Z”; if truncated=true, display warning and offer paging/filtering.
- Provide controls (next/prev or load more) and page size selector within allowed max.
- Persist filters/sorts/page in URL to allow deep links and refresh persistence.
- Handle empty and end-of-list states gracefully; show message when cursor invalid and allow restart.
- Consistent controls/styles across dashboard/queue/tasks pages; same defaults unless user overrides.

## Truncation Indicators
- When total_count not available but more data exists, set truncated=true; UI must display banner/toast warning and suggest filters or next page.
- Do not silently drop rows; always include pagination metadata.

## Backward Compatibility
- Default limit applied when omitted; log warnings for legacy clients; truncated flag preserved for one cycle with deprecation notice.
- CLI should add pagination flags (`--limit/--offset/--cursor/--page`); default limit 100; enforce max 500.
- Runner should not rely on paginated list; should use dedicated oldest-task fetch; if using list, request limit=1 with ORDER BY ASC.

## Cache-Buster Defects (POC)
- Manual `/ui-cache-buster.js` with env/build_id; often stale; dist sync manual; build ID not enforced; stale JS/CSS served.
- Cache-control inconsistent; dev-only no-cache; prod assets cached without hash; version mismatch undetected.
- Impact: UI/API contract drift; missing handlers; stale visual styles; user forced to hard-refresh.

## v1.0 Cache/Asset Strategy
- Build ID:
  - Derived from commit/manifest; exposed via `/api/version`; UI displays same; health check compares UI/server build IDs (blocking in prod).
- Assets:
  - Hashed filenames for all JS/CSS/media (Next.js `_next/static/...`); immutable cache-control (`public, max-age=31536000, immutable`).
  - HTML/SSR responses: `no-store` or minimal max-age with revalidation.
- No manual cache-buster query params in prod; rely on hashed asset URLs; dev uses HMR.
- CDN: honor origin cache-control; purge only HTML/SSR on deploy; never purge hashed assets unless compromised.
- Service worker: if used, versioned with build; cache only immutable assets; no caching of API unless explicitly designed; easy unregister.

## API Caching Policy
- Dev/Test: `no-store` for HTML and mutable API GETs; no CDN caching; allow rapid iteration.
- Prod:
  - Mutable GETs: `no-cache` or short max-age with ETag/Last-Modified; POST/PUT/DELETE no cache.
  - `/api/version`: `no-store`; must reflect current build.
  - Static/config-like endpoints may have longer max-age if truly immutable; document exceptions.

## Failure Modes and Detection
- Version mismatch (UI vs server build ID):
  - Health check fails in prod; UI shows blocking banner; require redeploy or hard refresh if assets uploaded.
- Missing asset/hash:
  - Network 404 on hashed asset; alert and rollback; ensure deploy uploads assets before server swap.
- Stale cache due to CDN override:
  - Detect via header checks in staging; enforce immutable caching on assets; no-store on HTML/API.
- Browser prefetch anomalies:
  - Ensure prefetch uses hashed URLs; avoid caching HTML; test with dev tools.

## Observability and Tests
- Metrics: asset.version.mismatch, asset.404 counts, `/api/version` latency, pagination request counts/latency/error rates.
- Logs: include build_id at startup; log pagination params and total_count/truncated; warn on default limit applied without client param.
- Alerts: on version mismatch in prod; on asset 404 spikes; on pagination error spikes; on slow pagination queries.
- Tests:
  - Pagination: ordering stability, no duplicates/gaps, total_count correctness, cursor validation, error handling, performance with indexes.
  - Cache/asset: hashed asset references present; cache headers correct; health fails on mismatch; missing asset simulation triggers alert path.

## Implementation Checklist
- [ ] API list endpoints updated with pagination metadata, validation, and limits.
- [ ] Storage queries and indexes aligned to sorts/filters; cursor implemented.
- [ ] UI/CLI consume pagination metadata; render controls/truncation warnings; persist state in URL.
- [ ] Runner uses non-paginated oldest-task fetch or limit=1 ASC; unaffected by list pagination.
- [ ] Asset pipeline produces hashed files and manifest; server injects correct URLs; `/api/version` matches UI chip.
- [ ] Cache headers validated in staging; CDN honors origin directives.
- [ ] Health check compares UI/server build IDs in prod; blocks on mismatch.
- [ ] Alerts/metrics/logs configured for pagination and asset/versioning.
