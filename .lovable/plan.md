# Bounded TrueForge investigation execution

## Scope
Optimize only TRUEFORGE mode. Keep the deterministic demo driver and all presentation behavior unchanged.

## Changes
- Add server-only configurable budgets with conservative defaults:
  - maximum total tool calls per investigation
  - maximum unique GitHub `search_code` calls per investigation
- Supervise the TrueForge SSE stream using proposed tool calls from `model.message` events:
  - count calls before accepting further exploration
  - normalize and fingerprint `search_code` arguments so equivalent requests are recognized
  - cancel the active TrueForge session when a duplicate search or budget violation is proposed
  - emit structured audit events containing count, budget, deduplication, and stop reason
- Tighten the read-only agent brief to prefer repository tree/commit inspection followed by targeted file reads, with no repeated global searches.
- Detect HTTP 429 and rate-limit-shaped streamed failures, emit `Investigation paused: model rate limit reached.`, preserve prior events/evidence, and never retry or fall back to DEMO.
- Keep TrueForge write tools behind the existing `tool.approval_required` flow; approval decisions remain explicit and server mediated.
- Document the optional budget environment variables in `.env.example` without adding secrets.

## Tests and validation
- Add focused server-driver tests for equivalent-search suppression, total/search budget enforcement, graceful HTTP 429 handling, and approval-event mapping.
- Add a deterministic-demo contract test to confirm its event sequence and approval pause remain unchanged.
- Run tests, lint, TypeScript checks, production build, and the existing demo browser flow.

## Technical details
The adapter cannot proxy GitHub credentials or execute MCP tools itself. It therefore supervises TrueForge at its documented event/API boundary: inspect `model.message.tool_calls`, cancel via `POST /api/v1/sessions/{id}/cancel` when a hard guard trips, and terminate the RepoMedic stream with audit plus error events. This preserves the architecture `UI → RepoMedic API → TrueForge driver → harness` and keeps credentials server-side.
