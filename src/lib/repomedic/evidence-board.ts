/**
 * Deterministic demo data for the Evidence & Root Cause board.
 * Demonstration data only — nothing here comes from a real repository,
 * metrics backend or log store.
 */

export interface CorrelationNode {
  label: string;
  value: string;
  tone: "muted" | "primary" | "caution" | "critical";
}

export const correlationChain: CorrelationNode[] = [
  { label: "Deployment", value: "#4812", tone: "muted" },
  { label: "Commit", value: "81ac2", tone: "primary" },
  { label: "Service changed", value: "checkout-service", tone: "primary" },
  { label: "Error rate", value: "+43%", tone: "caution" },
  { label: "p95 latency", value: "3.2s", tone: "critical" },
];

export const codeEvidence = {
  file: "checkout/order_service.py",
  commit: "81ac2",
  before: `for order in orders:
    customer = db.get_customer(order.customer_id)`,
  after: `customers = db.get_customers(customer_ids)
for order in orders:
    customer = customers[order.customer_id]`,
  difference: "Repeated per-order database lookups → one batched lookup",
};

export const runtimeEvidence = {
  before: { queries: "101 DB queries/request", latency: "2.91s p95" },
  after: { queries: "12 DB queries/request", latency: "0.84s p95" },
};

export const consensusFindings = [
  {
    agent: "Application Investigator",
    finding: "N+1 query detected in checkout/order_service.py",
  },
  {
    agent: "Database Investigator",
    finding: "Query explosion confirmed: 101 queries/request",
  },
  {
    agent: "Deployment Investigator",
    finding: "Regression correlates with commit 81ac2",
  },
];

export const rootCauseSummary = {
  finding: "N+1 database query introduced in checkout/order_service.py",
  commit: "81ac2",
  confidence: 0.94,
  service: "checkout-service",
};

export const verificationSummary = [
  "Failure reproduced in sandbox",
  "Patch generated",
  "Unit tests 32/32",
  "Integration tests 12/12",
  "Performance test passed",
];

export const patchSummaryLines = {
  file: "checkout/order_service.py",
  bullets: [
    "Remove repeated customer lookup",
    "Fetch customers in a single batch",
    "Preserve existing response behavior",
  ],
  additions: 17,
  deletions: 9,
};

/**
 * Human approval gate — the boundary between autonomous work and an
 * external action. Demonstration data only; no GitHub call is ever made.
 */
export const approvalRequest = {
  action: "Create GitHub Pull Request",
  target: "checkout-service",
  proposedChange: "Fix N+1 database query in checkout/order_service.py",
  risk: "Medium",
  reversibility: "High",
  note: "The change is isolated to a pull request and has not been deployed.",
  pausedExplanation:
    "RepoMedic completed autonomous investigation and verification. The next action would create an external GitHub pull request, so human authorization is required.",
  whyExplanation:
    "RepoMedic can investigate, experiment, generate patches, and verify changes autonomously. External actions that affect shared infrastructure require explicit human authorization.",
  evidence: [
    "Failure reproduced",
    "Root cause identified",
    "Patch generated",
    "Unit tests 32/32 passed",
    "Integration tests 12/12 passed",
    "Performance test passed",
  ],
  latencyBefore: "2.91s p95",
  latencyAfter: "0.84s p95",
};
