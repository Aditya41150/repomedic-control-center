import type {
  EvidenceItem,
  HarnessStatus,
  Hypothesis,
  Incident,
  IncidentInvestigation,
  PatchSummary,
  SandboxRun,
  TimelineStep,
} from "./types";

const t = (minutesAgo: number) =>
  new Date(Date.parse("2026-08-26T03:10:00Z") - minutesAgo * 60_000).toISOString();

export const mockHarness: HarnessStatus = {
  state: "online",
  version: "trueforge-harness/2026.8.1",
  endpoint: "harness.trueforge.internal",
  model: "tf-orchestrator-large",
  latencyMs: 412,
  connectors: [
    { name: "github-mcp", status: "connected" },
    { name: "observability-mcp", status: "connected" },
    { name: "sandbox-runner", status: "connected" },
    { name: "pagerduty", status: "idle" },
  ],
  lastHeartbeat: t(0),
  mode: "mock",
};

export const mockIncidents: Incident[] = [
  {
    id: "inc_8842",
    key: "INC-8842",
    title: "Checkout API returning 500 on coupon redemption",
    summary:
      "Error rate on POST /v2/checkout/redeem jumped from 0.2% to 18.4% within four minutes of deploy 9f3ac21. Failures concentrate on carts containing stacked percentage coupons.",
    severity: "sev1",
    status: "awaiting_approval",
    service: "checkout-api",
    environment: "production / us-east-1",
    repository: "acme/checkout-api",
    detectedAt: t(34),
    openedBy: "Datadog Monitor · checkout-5xx",
    errorRate: 18.4,
    affectedUsers: 2317,
    alertSource: "datadog",
  },
  {
    id: "inc_8839",
    key: "INC-8839",
    title: "Search indexer lag above 15 minutes",
    summary: "Kafka consumer group search-indexer is lagging behind produced offsets.",
    severity: "sev2",
    status: "investigating",
    service: "search-indexer",
    environment: "production / eu-west-1",
    repository: "acme/search-indexer",
    detectedAt: t(96),
    openedBy: "Grafana Alert · indexer-lag",
    errorRate: 0.9,
    affectedUsers: 140,
    alertSource: "grafana",
  },
  {
    id: "inc_8830",
    key: "INC-8830",
    title: "Webhook retries exhausting worker pool",
    summary: "Outbound webhook workers saturate during retry storms from a single tenant.",
    severity: "sev3",
    status: "resolved",
    service: "webhook-dispatcher",
    environment: "production / us-east-1",
    repository: "acme/webhook-dispatcher",
    detectedAt: t(720),
    openedBy: "On-call · a.rivera",
    errorRate: 0.1,
    affectedUsers: 12,
    alertSource: "manual",
  },
];

const steps: TimelineStep[] = [
  {
    id: "step_1",
    kind: "investigation",
    title: "GitHub / MCP repository investigation",
    detail:
      "Enumerated deploys in the incident window, diffed 9f3ac21 against the last healthy revision and pulled ownership metadata for the touched modules.",
    state: "complete",
    agent: "orchestrator",
    startedAt: t(33),
    durationMs: 41_200,
    toolCalls: [
      {
        id: "tc_1",
        provider: "github-mcp",
        tool: "list_commits",
        args: { repo: "acme/checkout-api", since: "2026-08-26T02:20:00Z" },
        durationMs: 780,
        status: "ok",
        result: "4 commits · 9f3ac21 'feat(pricing): stackable coupon engine' flagged as in-window",
      },
      {
        id: "tc_2",
        provider: "github-mcp",
        tool: "get_diff",
        args: { base: "6b21d0e", head: "9f3ac21" },
        durationMs: 1_240,
        status: "ok",
        result: "7 files changed · src/pricing/coupon-engine.ts rewritten (+184 / -63)",
      },
      {
        id: "tc_3",
        provider: "github-mcp",
        tool: "search_code",
        args: { query: "applyStackedDiscounts", repo: "acme/checkout-api" },
        durationMs: 640,
        status: "ok",
        result: "3 call sites · 1 lacks null-guard on discount ceiling",
      },
    ],
  },
  {
    id: "step_2",
    kind: "telemetry",
    title: "Metrics and log correlation",
    detail:
      "Correlated 5xx spike with deploy marker, then clustered 4,812 error logs into three signatures. One signature accounts for 94% of failures.",
    state: "complete",
    agent: "telemetry-subagent",
    startedAt: t(31),
    durationMs: 63_800,
    toolCalls: [
      {
        id: "tc_4",
        provider: "observability-mcp",
        tool: "query_metrics",
        args: { metric: "http.server.errors", service: "checkout-api", window: "45m" },
        durationMs: 1_910,
        status: "ok",
        result: "0.2% -> 18.4% at 02:41Z, 3m after deploy marker",
      },
      {
        id: "tc_5",
        provider: "observability-mcp",
        tool: "cluster_logs",
        args: { service: "checkout-api", level: "error", limit: 5000 },
        durationMs: 4_320,
        status: "ok",
        result: "Cluster A (94%): TypeError: Cannot read properties of undefined (reading 'ceiling')",
      },
    ],
  },
  {
    id: "step_3",
    kind: "sandbox",
    title: "Sandbox reproduction",
    detail:
      "Spun an ephemeral sandbox at 9f3ac21, replayed three anonymised failing carts and reproduced the crash deterministically on stacked percentage coupons.",
    state: "complete",
    agent: "sandbox-subagent",
    startedAt: t(27),
    durationMs: 118_400,
    toolCalls: [
      {
        id: "tc_6",
        provider: "sandbox-runner",
        tool: "create_sandbox",
        args: { image: "node:22", ref: "9f3ac21" },
        durationMs: 22_100,
        status: "ok",
        result: "sandbox sbx-4f21 ready · deps installed",
      },
      {
        id: "tc_7",
        provider: "sandbox-runner",
        tool: "run_command",
        args: { cmd: "pnpm vitest run pricing --reporter=verbose" },
        durationMs: 41_050,
        status: "ok",
        result: "1 failing test reproduces production stack trace",
      },
    ],
  },
  {
    id: "step_4",
    kind: "subagent",
    title: "Subagent findings merged",
    detail:
      "Pricing, telemetry and sandbox subagents converged on a single root cause. Two competing hypotheses were ruled out with counter-evidence.",
    state: "complete",
    agent: "orchestrator",
    startedAt: t(22),
    durationMs: 29_700,
    toolCalls: [
      {
        id: "tc_8",
        provider: "trueforge",
        tool: "merge_findings",
        args: { subagents: 3, conflicts: 2 },
        durationMs: 2_400,
        status: "ok",
        result: "consensus confidence 0.91",
      },
    ],
  },
  {
    id: "step_5",
    kind: "verification",
    title: "Patch generation and verification",
    detail:
      "Authored a guarded discount-ceiling fallback plus a regression test, then re-ran the full pricing and checkout suites in the sandbox.",
    state: "complete",
    agent: "patch-subagent",
    startedAt: t(17),
    durationMs: 204_600,
    toolCalls: [
      {
        id: "tc_9",
        provider: "sandbox-runner",
        tool: "apply_patch",
        args: { files: 2, additions: 34, deletions: 6 },
        durationMs: 900,
        status: "ok",
        result: "patch applied cleanly on 9f3ac21",
      },
      {
        id: "tc_10",
        provider: "sandbox-runner",
        tool: "run_command",
        args: { cmd: "pnpm vitest run && pnpm test:contract" },
        durationMs: 96_400,
        status: "ok",
        result: "412 passed · 0 failed · contract suite green",
      },
    ],
  },
  {
    id: "step_6",
    kind: "approval",
    title: "Human approval gate",
    detail:
      "RepoMedic will not open a pull request without an explicit human decision. Review the hypothesis, diff and verification output before approving.",
    state: "blocked",
    agent: "orchestrator",
    startedAt: t(9),
    durationMs: 0,
    toolCalls: [],
  },
  {
    id: "step_7",
    kind: "pull_request",
    title: "Pull request creation",
    detail: "Opens a PR against main with the verified patch, evidence bundle and sandbox logs attached.",
    state: "pending",
    agent: "orchestrator",
    startedAt: t(0),
    durationMs: 0,
    toolCalls: [],
  },
];

const evidence: EvidenceItem[] = [
  {
    id: "ev_1",
    kind: "log",
    source: "checkout-api · pod 7c9f",
    label: "Dominant error signature (94% of failures)",
    capturedAt: t(30),
    excerpt: `TypeError: Cannot read properties of undefined (reading 'ceiling')
    at applyStackedDiscounts (/app/src/pricing/coupon-engine.ts:142:31)
    at redeemCoupons (/app/src/checkout/redeem.ts:88:18)`,
    confidence: 0.97,
  },
  {
    id: "ev_2",
    kind: "metric",
    source: "datadog · http.server.errors",
    label: "5xx rate steps at deploy marker",
    capturedAt: t(31),
    excerpt: "02:38Z 0.21% | 02:41Z 6.90% | 02:44Z 18.40% | deploy 9f3ac21 at 02:38Z",
    confidence: 0.93,
  },
  {
    id: "ev_3",
    kind: "diff",
    source: "github · 9f3ac21",
    label: "Discount ceiling lookup lost its default",
    capturedAt: t(32),
    excerpt: `- const ceiling = tier?.limits?.ceiling ?? DEFAULT_CEILING;
+ const ceiling = tier.limits.ceiling;`,
    confidence: 0.95,
  },
  {
    id: "ev_4",
    kind: "trace",
    source: "tempo · trace 4b1e…",
    label: "Failing span always carries 2+ percentage coupons",
    capturedAt: t(29),
    excerpt: "span checkout.redeem · attributes: coupons=2, types=[percent,percent], tier=null",
    confidence: 0.88,
  },
  {
    id: "ev_5",
    kind: "config",
    source: "config-service",
    label: "Legacy tiers unset for 11% of accounts",
    capturedAt: t(28),
    excerpt: "pricing.tiers.backfill_complete = false (migration paused 2026-08-19)",
    confidence: 0.72,
  },
];

const sandboxRuns: SandboxRun[] = [
  {
    id: "sbx_1",
    name: "Reproduce failing cart #A",
    command: "pnpm vitest run pricing/stacked-coupons",
    status: "failed",
    durationMs: 18_400,
    phase: "reproduction",
    output: "FAIL pricing/stacked-coupons.test.ts > stacks two percent coupons\n  TypeError: Cannot read properties of undefined (reading 'ceiling')",
    },
  {
    id: "sbx_2",
    name: "Reproduce failing cart #B (tier=null)",
    command: "pnpm vitest run pricing/tierless",
    status: "failed",
    durationMs: 12_900,
    phase: "reproduction",
    output: "FAIL pricing/tierless.test.ts > redeems with unset tier\n  same stack as production signature A",
  },
  {
    id: "sbx_3",
    name: "Control: single fixed-amount coupon",
    command: "pnpm vitest run pricing/fixed-amount",
    status: "passed",
    durationMs: 9_100,
    phase: "reproduction",
    output: "PASS 14 tests — confirms failure is specific to stacked percentage coupons",
  },
  {
    id: "sbx_4",
    name: "Patched pricing suite",
    command: "pnpm vitest run pricing",
    status: "passed",
    durationMs: 31_500,
    phase: "verification",
    output: "PASS 96 tests, including new regression test 'falls back to DEFAULT_CEILING when tier is unset'",
  },
  {
    id: "sbx_5",
    name: "Full unit + contract suite",
    command: "pnpm vitest run && pnpm test:contract",
    status: "passed",
    durationMs: 96_400,
    phase: "verification",
    output: "412 passed · 0 failed · 3 skipped · contract suite green",
  },
  {
    id: "sbx_6",
    name: "Load replay (10k redemptions)",
    command: "pnpm tsx scripts/replay.ts --n 10000",
    status: "passed",
    durationMs: 74_200,
    phase: "verification",
    output: "0 errors · p95 latency 84ms (baseline 81ms)",
  },
];

const hypothesis: Hypothesis = {
  statement:
    "Deploy 9f3ac21 removed the null-coalescing default on the discount ceiling lookup. Accounts whose pricing tier was never backfilled resolve `tier.limits` to undefined, so stacking two percentage coupons throws before the response is written.",
  confidence: 0.91,
  reasoning: [
    "The dominant error signature points at coupon-engine.ts:142, a line introduced by 9f3ac21.",
    "The diff replaced `tier?.limits?.ceiling ?? DEFAULT_CEILING` with an unguarded member access.",
    "Every failing trace carries two or more percentage coupons and a null tier attribute.",
    "The sandbox reproduces the exact production stack trace at 9f3ac21 and stops reproducing once the default is restored.",
    "11% of accounts have an unset tier, which matches the observed share of affected carts.",
  ],
  ruledOut: [
    {
      claim: "Upstream pricing-service outage",
      because: "pricing-service error rate and latency stayed flat across the entire window.",
    },
    {
      claim: "Database connection pool exhaustion",
      because: "Pool saturation peaked at 34% and 5xxs occur even on cached reads.",
    },
  ],
  blastRadius:
    "POST /v2/checkout/redeem for accounts with an unset pricing tier — roughly 11% of traffic, 2,317 users so far. No data corruption: the failure occurs before any write.",
};

const patch: PatchSummary = {
  branch: "repomedic/inc-8842-restore-ceiling-default",
  baseBranch: "main",
  title: "fix(pricing): restore discount ceiling default for tierless accounts",
  rationale:
    "Restores the defensive default removed in 9f3ac21 and adds a regression test covering accounts whose pricing tier has not been backfilled. Minimal, reversible, and scoped to the failing path.",
  riskLevel: "low",
  testsAdded: 2,
  filesChanged: [
    {
      path: "src/pricing/coupon-engine.ts",
      additions: 6,
      deletions: 3,
      note: "Guard tier lookup, fall back to DEFAULT_CEILING, log a warning once per account.",
    },
    {
      path: "src/pricing/__tests__/stacked-coupons.test.ts",
      additions: 28,
      deletions: 3,
      note: "Regression coverage for stacked percentage coupons with an unset tier.",
    },
  ],
  diff: `--- a/src/pricing/coupon-engine.ts
+++ b/src/pricing/coupon-engine.ts
@@ -139,9 +139,12 @@ export function applyStackedDiscounts(
   cart: Cart,
   tier: PricingTier | null,
 ) {
-  const ceiling = tier.limits.ceiling;
+  const ceiling = tier?.limits?.ceiling ?? DEFAULT_CEILING;
+  if (!tier?.limits) {
+    warnOnce(\`pricing tier unset for account \${cart.accountId}\`);
+  }
   return cart.coupons.reduce((total, coupon) => {
     const next = total + discountFor(coupon, cart);
     return Math.min(next, ceiling);
   }, 0);
 }`,
};

export const mockInvestigation: IncidentInvestigation = {
  incident: mockIncidents[0]!,
  steps,
  evidence,
  sandboxRuns,
  hypothesis,
  patch,
  approval: {
    required: true,
    state: "pending",
    requestedAt: t(9),
    requiredChecks: [
      { label: "Reproduction confirmed in sandbox", passed: true },
      { label: "Patch verified against full test suite", passed: true },
      { label: "No schema or data migration involved", passed: true },
      { label: "Blast radius documented", passed: true },
      { label: "Rollback path identified (revert 9f3ac21)", passed: true },
    ],
  },
};
