/**
 * Deterministic demo script for the RepoMedic control room.
 *
 * This module holds ONLY data. The runner in `investigation-run.ts` replays it
 * with realistic pacing. When a real TrueForge harness is available, the runner
 * swaps its source from this script to streamed harness events — no component
 * changes required.
 */

import type {
  EvidenceItem,
  Hypothesis,
  Incident,
  PatchSummary,
  PullRequestResult,
  SandboxRun,
  SubagentTask,
  TimelineStep,
  VerificationReport,
} from "./types";

export const DEMO_INCIDENT_ID = "inc_9001";

const now = () => new Date().toISOString();

export const demoIncident: Incident = {
  id: DEMO_INCIDENT_ID,
  key: "INC-9001",
  title: "Checkout API latency spike",
  summary:
    "p95 latency on the checkout path climbed to 3.2s and the error rate is up 43% since the deployment 11 minutes ago. Commit 81ac2 in checkout-service is the prime suspect. Investigation ready.",
  severity: "sev1",
  status: "investigating",
  service: "checkout-service",
  environment: "production / us-east-1",
  repository: "acme/checkout-service",
  /** Fixed so server and client render identically (no hydration mismatch). */
  detectedAt: "2026-03-11T14:29:00.000Z",
  openedBy: "Datadog Monitor · checkout-latency",
  errorRate: 43,
  affectedUsers: 1842,
  alertSource: "datadog",
};

export const demoFacts = [
  { label: "p95 latency", value: "3.2s" },
  { label: "Error rate", value: "+43%" },
  { label: "Deployment", value: "11 min ago" },
  { label: "Suspicious commit", value: "81ac2" },
];

/** Step scaffolding — the runner flips `state` and attaches tool calls. */
export const stepBlueprints: TimelineStep[] = [
  {
    id: "step_github",
    kind: "investigation",
    title: "GitHub / MCP repository investigation",
    detail:
      "Inspecting recent deployments, commits, changed files and related pull requests in acme/checkout-service.",
    state: "pending",
    agent: "orchestrator",
    startedAt: now(),
    durationMs: 0,
    toolCalls: [],
  },
  {
    id: "step_telemetry",
    kind: "telemetry",
    title: "Metrics and log analysis",
    detail:
      "Correlating latency, throughput and database counters against the deployment marker, then clustering error logs.",
    state: "pending",
    agent: "telemetry-subagent",
    startedAt: now(),
    durationMs: 0,
    toolCalls: [],
  },
  {
    id: "step_subagents",
    kind: "subagent",
    title: "Parallel subagent investigation",
    detail:
      "Three specialised subagents investigate the application, the database and the deployment independently.",
    state: "pending",
    agent: "orchestrator",
    startedAt: now(),
    durationMs: 0,
    toolCalls: [],
  },
  {
    id: "step_sandbox",
    kind: "sandbox",
    title: "Sandbox reproduction",
    detail: "Replaying production checkout traffic in an ephemeral sandbox pinned at 81ac2.",
    state: "pending",
    agent: "sandbox-subagent",
    startedAt: now(),
    durationMs: 0,
    toolCalls: [],
  },
  {
    id: "step_rootcause",
    kind: "verification",
    title: "Root cause established",
    detail: "Subagent findings converge; competing hypotheses ruled out with counter-evidence.",
    state: "pending",
    agent: "orchestrator",
    startedAt: now(),
    durationMs: 0,
    toolCalls: [],
  },
  {
    id: "step_patch",
    kind: "verification",
    title: "Patch generation",
    detail:
      "Authoring a minimal, reversible fix that batches the repeated lookup, plus regression coverage.",
    state: "pending",
    agent: "patch-subagent",
    startedAt: now(),
    durationMs: 0,
    toolCalls: [],
  },
  {
    id: "step_verify",
    kind: "verification",
    title: "Patch verification",
    detail: "Re-running unit, integration and performance suites against the patched sandbox.",
    state: "pending",
    agent: "sandbox-subagent",
    startedAt: now(),
    durationMs: 0,
    toolCalls: [],
  },
  {
    id: "step_approval",
    kind: "approval",
    title: "Human approval gate",
    detail:
      "RepoMedic stops here. No pull request is created without an explicit human decision.",
    state: "pending",
    agent: "orchestrator",
    startedAt: now(),
    durationMs: 0,
    toolCalls: [],
  },
  {
    id: "step_pr",
    kind: "pull_request",
    title: "Pull request creation",
    detail: "Pushes the verified branch and opens a pull request with the full evidence bundle.",
    state: "pending",
    agent: "orchestrator",
    startedAt: now(),
    durationMs: 0,
    toolCalls: [],
  },
];

export const stepToolCalls: Record<string, TimelineStep["toolCalls"]> = {
  step_github: [
    {
      id: "tc_deploys",
      provider: "github-mcp",
      tool: "list_deployments",
      args: { repo: "acme/checkout-service", env: "production", limit: 5 },
      durationMs: 640,
      status: "ok",
      result: "deploy d-7741 shipped 11m ago at commit 81ac2 (previous: 4e90b, 6h ago)",
    },
    {
      id: "tc_commits",
      provider: "github-mcp",
      tool: "list_commits",
      args: { repo: "acme/checkout-service", since: "6h" },
      durationMs: 520,
      status: "ok",
      result: "3 commits in window · 81ac2 'perf(checkout): enrich order lines' is the only in-window deploy",
    },
    {
      id: "tc_files",
      provider: "github-mcp",
      tool: "get_changed_files",
      args: { commit: "81ac2" },
      durationMs: 410,
      status: "ok",
      result: "2 files changed · checkout/order_service.py (+38 / -11), checkout/serializers.py (+4 / -0)",
    },
    {
      id: "tc_prs",
      provider: "github-mcp",
      tool: "list_pull_requests",
      args: { repo: "acme/checkout-service", state: "merged", limit: 3 },
      durationMs: 380,
      status: "ok",
      result: "PR #1836 'Enrich order lines with customer tier' merged 22m ago, contains 81ac2",
    },
  ],
  step_telemetry: [
    {
      id: "tc_latency",
      provider: "observability-mcp",
      tool: "query_metrics",
      args: { metric: "http.server.duration.p95", service: "checkout-service", window: "60m" },
      durationMs: 910,
      status: "ok",
      result: "p95 0.79s -> 3.2s, step change begins 40s after deploy d-7741",
    },
    {
      id: "tc_dbcount",
      provider: "observability-mcp",
      tool: "query_metrics",
      args: { metric: "db.client.queries", service: "checkout-service", window: "60m" },
      durationMs: 730,
      status: "ok",
      result: "queries per checkout: 4 -> 101 (+2425%)",
    },
    {
      id: "tc_logs",
      provider: "observability-mcp",
      tool: "cluster_logs",
      args: { service: "checkout-service", level: "warn", limit: 5000 },
      durationMs: 1_180,
      status: "ok",
      result: "dominant cluster: 'slow query loop' emitted from checkout/order_service.py:118",
    },
  ],
  step_sandbox: [
    {
      id: "tc_sbx_create",
      provider: "sandbox-runner",
      tool: "create_sandbox",
      args: { image: "python:3.12", ref: "81ac2" },
      durationMs: 12_400,
      status: "ok",
      result: "sandbox sbx-9a12 ready · dependencies installed · seeded with anonymised carts",
    },
    {
      id: "tc_sbx_repro",
      provider: "sandbox-runner",
      tool: "run_command",
      args: { cmd: "reproduce checkout latency" },
      durationMs: 26_800,
      status: "ok",
      result: "FAILURE REPRODUCED · 101 DB queries · p95 2.91s",
    },
  ],
  step_patch: [
    {
      id: "tc_patch",
      provider: "sandbox-runner",
      tool: "apply_patch",
      args: { files: 1, additions: 14, deletions: 9 },
      durationMs: 820,
      status: "ok",
      result: "patch applied cleanly on 81ac2 · branch repomedic/inc-9001-batch-order-lookup",
    },
  ],
  step_verify: [
    {
      id: "tc_units",
      provider: "sandbox-runner",
      tool: "run_command",
      args: { cmd: "pytest tests/unit" },
      durationMs: 21_300,
      status: "ok",
      result: "32/32 passed",
    },
    {
      id: "tc_integration",
      provider: "sandbox-runner",
      tool: "run_command",
      args: { cmd: "pytest tests/integration" },
      durationMs: 33_900,
      status: "ok",
      result: "12/12 passed",
    },
    {
      id: "tc_perf",
      provider: "sandbox-runner",
      tool: "run_command",
      args: { cmd: "perf checkout --p95" },
      durationMs: 28_100,
      status: "ok",
      result: "p95 2.91s -> 0.84s · performance gate passed",
    },
  ],
};

export const evidenceForStep: Record<string, EvidenceItem[]> = {
  step_github: [
    {
      id: "ev_deploy",
      kind: "config",
      source: "github · deploy d-7741",
      label: "Deployment 11 minutes ago at commit 81ac2",
      capturedAt: now(),
      excerpt:
        "deploy d-7741 · ref 81ac2 · PR #1836 'Enrich order lines with customer tier'\nprevious healthy ref: 4e90b",
      confidence: 0.98,
    },
    {
      id: "ev_files",
      kind: "diff",
      source: "github · 81ac2",
      label: "Changed files in the suspicious commit",
      capturedAt: now(),
      excerpt:
        "checkout/order_service.py   +38 / -11\ncheckout/serializers.py      +4 /  -0",
      confidence: 0.9,
    },
  ],
  step_telemetry: [
    {
      id: "ev_latency",
      kind: "metric",
      source: "datadog · http.server.duration.p95",
      label: "Latency increased immediately after the latest deployment",
      capturedAt: now(),
      excerpt: "T-12m 0.79s | T-11m deploy d-7741 | T-10m 2.4s | T-8m 3.2s",
      confidence: 0.96,
    },
    {
      id: "ev_dbq",
      kind: "metric",
      source: "datadog · db.client.queries",
      label: "Database query count increased significantly",
      capturedAt: now(),
      excerpt: "queries per checkout request: 4 (baseline) -> 101 (current)",
      confidence: 0.94,
    },
    {
      id: "ev_log",
      kind: "log",
      source: "checkout-service · pod 3d1a",
      label: "checkout/order_service.py flagged as suspicious",
      capturedAt: now(),
      excerpt:
        "WARN slow query loop  file=checkout/order_service.py line=118 iterations=100\n  SELECT * FROM customers WHERE id = %s  (repeated per order line)",
      confidence: 0.95,
    },
  ],
};

export const subagentBlueprints: SubagentTask[] = [
  {
    id: "sa_app",
    name: "Application Investigator",
    scope: "checkout-service source, request path, hot loops",
    state: "pending",
  },
  {
    id: "sa_db",
    name: "Database Investigator",
    scope: "query plans, per-request query counts, connection pool",
    state: "pending",
  },
  {
    id: "sa_deploy",
    name: "Deployment Investigator",
    scope: "deploy markers, config drift, rollout timeline",
    state: "pending",
  },
];

export const subagentFindings: Record<string, { finding: string; confidence: number }> = {
  sa_app: {
    finding:
      "checkout/order_service.py:118 loads the customer record inside the order-line loop. 100 line items produce 100 extra queries — an N+1 database query introduced in checkout/order_service.py.",
    confidence: 0.95,
  },
  sa_db: {
    finding:
      "Query count per checkout jumped 4 -> 101 with an identical repeated statement, and total DB time accounts for 2.1s of the 2.9s p95: an N+1 database query introduced in checkout/order_service.py.",
    confidence: 0.93,
  },
  sa_deploy: {
    finding:
      "No config or infrastructure drift. The regression starts 40s after deploy d-7741 (commit 81ac2), which is exactly the change that added the N+1 database query in checkout/order_service.py.",
    confidence: 0.92,
  },
};

export const CONVERGED_FINDING =
  "N+1 database query introduced in checkout/order_service.py";

export const reproductionRun: SandboxRun = {
  id: "sbx_repro",
  name: "Reproduce checkout latency at 81ac2",
  command: "reproduce checkout latency",
  status: "failed",
  durationMs: 26_800,
  phase: "reproduction",
  output: `$ reproduce checkout latency
Baseline: 101 DB queries
Reproduced: 101 DB queries
p95 latency: 2.91s
Result: FAILURE REPRODUCED`,
};

export const verificationRuns: SandboxRun[] = [
  {
    id: "sbx_unit",
    name: "Unit tests (patched)",
    command: "pytest tests/unit",
    status: "passed",
    durationMs: 21_300,
    phase: "verification",
    output: "32/32 passed",
  },
  {
    id: "sbx_integration",
    name: "Integration tests (patched)",
    command: "pytest tests/integration",
    status: "passed",
    durationMs: 33_900,
    phase: "verification",
    output: "12/12 passed",
  },
  {
    id: "sbx_perf",
    name: "Performance test (patched)",
    command: "perf checkout --p95",
    status: "passed",
    durationMs: 28_100,
    phase: "verification",
    output: "p95 before: 2.91s\np95 after:  0.84s\nResult: PASSED",
  },
];

export const demoHypothesis: Hypothesis = {
  statement: `${CONVERGED_FINDING}. Commit 81ac2 moved the customer lookup inside the order-line loop, so every checkout issues one query per line item instead of a single batched read.`,
  confidence: 0.94,
  reasoning: [
    "Latency steps up 40 seconds after deploy d-7741 (commit 81ac2) and not before.",
    "Queries per checkout rise from 4 to 101 with one repeated statement.",
    "checkout/order_service.py:118 performs the lookup inside the per-line loop.",
    "All three subagents converged independently on the same finding.",
    "The sandbox reproduces 101 queries and a 2.91s p95 at 81ac2.",
  ],
  ruledOut: [
    {
      claim: "Database or infrastructure degradation",
      because: "Query latency per statement is unchanged; only the number of statements grew.",
    },
    {
      claim: "Traffic surge",
      because: "Request volume is flat across the window; latency per request is what moved.",
    },
  ],
  blastRadius:
    "All checkout requests with more than a handful of order lines — roughly 1,842 users so far. Read-path only; no data corruption and no migration required.",
};

export const demoPatch: PatchSummary = {
  branch: "repomedic/inc-9001-batch-order-lookup",
  baseBranch: "main",
  title: "fix(checkout): batch customer lookup to remove N+1 query",
  rationale:
    "Removes the repeated database lookup introduced in 81ac2 and replaces it with a single batched query executed before the loop. Minimal, reversible and scoped to the failing path.",
  riskLevel: "low",
  testsAdded: 2,
  filesChanged: [
    {
      path: "checkout/order_service.py",
      additions: 14,
      deletions: 9,
      note: "Removed repeated database lookup; replaced it with a batched query keyed by customer id.",
    },
  ],
  diff: `--- a/checkout/order_service.py
+++ b/checkout/order_service.py
@@ -112,12 +112,17 @@ class OrderService:
     def build_order_lines(self, order):
-        lines = []
-        for item in order.items:
-            # N+1: one query per order line
-            customer = Customer.objects.get(id=item.customer_id)
-            lines.append(serialize_line(item, customer))
-        return lines
+        customer_ids = {item.customer_id for item in order.items}
+        customers = {
+            c.id: c
+            for c in Customer.objects.filter(id__in=customer_ids)
+        }
+        return [
+            serialize_line(item, customers[item.customer_id])
+            for item in order.items
+        ]`,
};

export const demoVerification: VerificationReport = {
  suites: [
    { label: "Unit tests", result: "32/32 passed", passed: true },
    { label: "Integration tests", result: "12/12 passed", passed: true },
    { label: "Performance test", result: "passed", passed: true },
  ],
  latencyBefore: "2.91s",
  latencyAfter: "0.84s",
};

export const requiredChecks = [
  { label: "Failure reproduced in sandbox", passed: true },
  { label: "Root cause confirmed by three subagents", passed: true },
  { label: "Unit and integration suites green on the patch", passed: true },
  { label: "Performance regression resolved (2.91s → 0.84s)", passed: true },
  { label: "No schema or data migration involved", passed: true },
];

export const demoPullRequest: PullRequestResult = {
  number: 1842,
  title: "Fix checkout N+1 query",
  url: "https://github.com/acme/checkout-service/pull/1842",
  checks: "passing",
  status: "Ready for review",
};

/** Pacing (ms) for the deterministic replay. Tuned to be watchable, not slow. */
export const pace = {
  stepStart: 550,
  toolCall: 480,
  stepFinish: 650,
  subagentStagger: 320,
  subagentWork: 1_500,
  sandbox: 1_400,
  prCreation: 1_800,
};
