/**
 * RunDriver — the single seam between the RepoMedic UI and whatever executes an
 * investigation.
 *
 * Two implementations exist:
 *  - `createDemoDriver()`      — the deterministic in-browser demo (unchanged behaviour).
 *  - `createTrueForgeDriver()` — talks to our own server route, which in turn drives a
 *                                real TrueForge harness session over its HTTP API.
 *
 * Both emit the same `RunEvent` union. `applyRunEvent()` folds those events into the
 * existing `RunState` the presentation components already consume, so no component had
 * to change to gain real-harness support.
 */

import type {
  ApprovalRequest,
  AuditEntry,
  EvidenceItem,
  Hypothesis,
  PatchSummary,
  PullRequestResult,
  RunPhase,
  RunState,
  SandboxRun,
  SubagentTask,
  TimelineStep,
  ToolCall,
  VerificationReport,
} from "./types";

export type RunMode = "demo" | "trueforge";

export type AuditInput = Omit<AuditEntry, "id" | "at" | "status"> &
  Partial<Pick<AuditEntry, "status">>;

/** Small discriminated union every driver speaks. */
export type RunEvent =
  | { type: "run.started"; steps: TimelineStep[]; subagents: SubagentTask[] }
  | { type: "phase"; phase: RunPhase }
  | { type: "step.upsert"; step: TimelineStep }
  | { type: "step.patch"; id: string; patch: Partial<TimelineStep> }
  | { type: "step.tool_call"; id: string; toolCall: ToolCall }
  | { type: "evidence"; items: EvidenceItem[] }
  | { type: "subagent.upsert"; subagent: SubagentTask }
  | { type: "sandbox.upsert"; run: SandboxRun }
  | { type: "hypothesis"; hypothesis: Hypothesis }
  | { type: "patch"; patch: PatchSummary }
  | { type: "verification"; verification: VerificationReport }
  | { type: "approval.required"; request: ApprovalRequest }
  | { type: "pull_request"; pullRequest: PullRequestResult }
  | { type: "audit"; entry: AuditInput }
  | { type: "session"; sessionId: string }
  | { type: "error"; message: string }
  | { type: "done" };

export type RunEventSink = (event: RunEvent) => void;

export interface RunDriverContext {
  emit: RunEventSink;
  signal: AbortSignal;
}

/** One RepoMedic investigation run, however it is executed. */
export interface RunDriver {
  readonly mode: RunMode;
  /** Runs the investigation until it completes, errors, or pauses for approval. */
  start(ctx: RunDriverContext): Promise<void>;
  /** Authorises the pending external action. Only valid while paused for approval. */
  approve(ctx: RunDriverContext, note?: string): Promise<void>;
  /** Denies the pending external action. */
  reject(ctx: RunDriverContext, note?: string): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Reducer                                                             */
/* ------------------------------------------------------------------ */

let auditSeq = 0;

export const auditEntry = (input: AuditInput): AuditEntry => ({
  id: `audit_${++auditSeq}`,
  at: new Date().toISOString(),
  status: "completed",
  ...input,
});

const upsertById = <T extends { id: string }>(list: T[], item: T): T[] =>
  list.some((x) => x.id === item.id)
    ? list.map((x) => (x.id === item.id ? { ...x, ...item } : x))
    : [...list, item];

/** Pure fold of a RunEvent into RunState. Identical for both drivers. */
export function applyRunEvent(state: RunState, event: RunEvent): RunState {
  switch (event.type) {
    case "run.started":
      return { ...state, steps: event.steps, subagents: event.subagents };
    case "phase":
      return { ...state, phase: event.phase };
    case "step.upsert":
      return { ...state, steps: upsertById(state.steps, event.step) };
    case "step.patch":
      return {
        ...state,
        steps: state.steps.map((s) => (s.id === event.id ? { ...s, ...event.patch } : s)),
      };
    case "step.tool_call":
      return {
        ...state,
        steps: state.steps.map((s) =>
          s.id === event.id ? { ...s, toolCalls: [...s.toolCalls, event.toolCall] } : s,
        ),
      };
    case "evidence":
      return { ...state, evidence: [...state.evidence, ...event.items] };
    case "subagent.upsert":
      return { ...state, subagents: upsertById(state.subagents, event.subagent) };
    case "sandbox.upsert":
      return { ...state, sandboxRuns: upsertById(state.sandboxRuns, event.run) };
    case "hypothesis":
      return { ...state, hypothesis: event.hypothesis };
    case "patch":
      return { ...state, patch: event.patch };
    case "verification":
      return { ...state, verification: event.verification };
    case "approval.required":
      return { ...state, approvalRequest: event.request, phase: "waiting_for_approval" };
    case "pull_request":
      return { ...state, pullRequest: event.pullRequest };
    case "audit":
      return { ...state, auditLog: [...state.auditLog, auditEntry(event.entry)] };
    case "error":
      return { ...state, phase: "error", error: event.message };
    case "session":
    case "done":
      return state;
  }
}

/* ------------------------------------------------------------------ */
/* Mode selection                                                      */
/* ------------------------------------------------------------------ */

/**
 * Default mode. `VITE_REPOMEDIC_MODE=trueforge` points the UI at the real harness
 * (through our server route); anything else keeps the deterministic demo.
 */
export function defaultRunMode(): RunMode {
  const raw = import.meta.env["VITE_REPOMEDIC_MODE"] as string | undefined;
  return raw === "trueforge" ? "trueforge" : "demo";
}
