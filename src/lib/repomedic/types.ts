/**
 * RepoMedic domain model.
 *
 * These types are the contract between the UI and any RepoMedic/TrueForge
 * backend. The mock client and the future HTTP client both satisfy them, so
 * swapping implementations requires no component changes.
 */

export type HarnessState = "online" | "degraded" | "offline" | "connecting";

export interface HarnessStatus {
  state: HarnessState;
  /** e.g. "trueforge-harness/2026.8.1" */
  version: string;
  /** Where the harness is reachable (host only, never credentials). */
  endpoint: string;
  model: string;
  latencyMs: number;
  /** Connected MCP servers / tool providers. */
  connectors: Array<{ name: string; status: "connected" | "error" | "idle" }>;
  lastHeartbeat: string;
  mode: "mock" | "live";
}

export type Severity = "sev1" | "sev2" | "sev3";

export type IncidentStatus =
  | "investigating"
  | "awaiting_approval"
  | "patch_open"
  | "resolved";

export interface Incident {
  id: string;
  key: string;
  title: string;
  summary: string;
  severity: Severity;
  status: IncidentStatus;
  service: string;
  environment: string;
  repository: string;
  detectedAt: string;
  openedBy: string;
  errorRate: number;
  affectedUsers: number;
  alertSource: string;
}

export type StepKind =
  | "investigation"
  | "telemetry"
  | "sandbox"
  | "subagent"
  | "verification"
  | "approval"
  | "pull_request";

export type StepState = "pending" | "running" | "complete" | "blocked" | "failed";

/** Coarse category shown as a chip on every timeline step. */
export type StepCategory =
  | "mcp_tool"
  | "sandbox"
  | "subagent"
  | "analysis"
  | "verification"
  | "human_approval";

export interface ToolCall {
  id: string;
  provider: string;
  tool: string;
  args: Record<string, string | number | boolean>;
  durationMs: number;
  status: "ok" | "error";
  result: string;
}

export interface TimelineStep {
  id: string;
  kind: StepKind;
  title: string;
  detail: string;
  state: StepState;
  agent: string;
  startedAt: string;
  durationMs: number;
  toolCalls: ToolCall[];
  /** Chip category (MCP / TOOL, SANDBOX, SUBAGENT, ...). */
  category: StepCategory;
  /** Short human-readable name of the agent or tool, e.g. "GitHub MCP". */
  toolLabel: string;
  /** Imperative action, e.g. "Inspect recent deployment". */
  action: string;
  /** One-line evidence preview revealed when the step completes. */
  resultPreview?: string | undefined;
}

export interface EvidenceItem {
  id: string;
  kind: "log" | "metric" | "diff" | "trace" | "config";
  source: string;
  label: string;
  capturedAt: string;
  excerpt: string;
  confidence: number;
}

export interface SandboxRun {
  id: string;
  name: string;
  command: string;
  status: "passed" | "failed" | "skipped" | "running";
  durationMs: number;
  output: string;
  phase: "reproduction" | "verification";
}

export interface Hypothesis {
  statement: string;
  confidence: number;
  reasoning: string[];
  ruledOut: Array<{ claim: string; because: string }>;
  blastRadius: string;
}

export interface PatchSummary {
  branch: string;
  baseBranch: string;
  title: string;
  rationale: string;
  filesChanged: Array<{
    path: string;
    additions: number;
    deletions: number;
    note: string;
  }>;
  diff: string;
  riskLevel: "low" | "medium" | "high";
  testsAdded: number;
}

export interface ApprovalGate {
  required: true;
  state: "pending" | "approved" | "rejected";
  requestedAt: string;
  requiredChecks: Array<{ label: string; passed: boolean }>;
  decidedBy?: string | undefined;
  decidedAt?: string | undefined;
  note?: string | undefined;
  pullRequestUrl?: string | undefined;
}

export interface IncidentInvestigation {
  incident: Incident;
  steps: TimelineStep[];
  evidence: EvidenceItem[];
  sandboxRuns: SandboxRun[];
  hypothesis: Hypothesis;
  patch: PatchSummary;
  approval: ApprovalGate;
}

export interface ApprovalDecision {
  incidentId: string;
  decision: "approve" | "reject";
  note?: string | undefined;
}

/** The single seam every backend must implement. */
export interface RepoMedicClient {
  getHarnessStatus(): Promise<HarnessStatus>;
  listIncidents(): Promise<Incident[]>;
  getInvestigation(incidentId: string): Promise<IncidentInvestigation>;
  submitApproval(decision: ApprovalDecision): Promise<ApprovalGate>;
}

/* ------------------------------------------------------------------ */
/* Live investigation run (deterministic demo today, TrueForge later)  */
/* ------------------------------------------------------------------ */

export type RunPhase =
  | "idle"
  | "running"
  | "awaiting_approval"
  | "creating_pr"
  | "approved"
  | "rejected"
  | "error";

export interface SubagentTask {
  id: string;
  name: string;
  scope: string;
  state: "pending" | "running" | "complete" | "failed";
  finding?: string | undefined;
  confidence?: number | undefined;
}

export interface VerificationReport {
  suites: Array<{ label: string; result: string; passed: boolean }>;
  latencyBefore: string;
  latencyAfter: string;
}

export interface PullRequestResult {
  number: number;
  title: string;
  url: string;
  checks: "passing" | "pending" | "failing";
  status: string;
}

export interface AuditEntry {
  at: string;
  message: string;
  actor: "agent" | "human";
}

export interface RunState {
  phase: RunPhase;
  steps: TimelineStep[];
  evidence: EvidenceItem[];
  subagents: SubagentTask[];
  sandboxRuns: SandboxRun[];
  hypothesis: Hypothesis | null;
  patch: PatchSummary | null;
  verification: VerificationReport | null;
  pullRequest: PullRequestResult | null;
  auditLog: AuditEntry[];
  error: string | null;
}
