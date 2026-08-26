/**
 * TrueForge harness adapter (server-only).
 *
 * Verified against the published `@truefoundry/trueforge` v0.1.4 HTTP API:
 *   POST /api/v1/sessions                       → create a session (inline AgentSpec)
 *   POST /api/v1/sessions/{id}/turns            → create + execute a turn (SSE when stream:true)
 *   GET  /api/v1/sessions/{id}/turns/{tid}/subscribe → resume a running turn (SSE)
 *   POST /api/v1/sessions/{id}/cancel           → cancel the running turn
 *
 * Human approval is NOT a bespoke endpoint: TrueForge emits `tool.approval_required`
 * and the decision is sent as a *new turn* whose input is a
 * `user.tool_approval` item (`{ thread_id, tool_call_id, approval: { status } }`).
 *
 * Auth: TrueForge only enforces auth when an OIDC provider is configured; when it is,
 * requests carry `Authorization: Bearer <id token>`. Credentials are read here, on the
 * server, and never reach the browser. GitHub/Daytona credentials belong to the
 * harness's own connector configuration — this app never holds them.
 */

import type { RunEvent } from "./run-driver";
import type { SubagentTask, TimelineStep } from "./types";

export interface TrueForgeConfig {
  baseUrl: string;
  token: string | undefined;
  model: string;
  githubMcpServer: string;
  repository: string;
  maxToolCalls: number;
  maxSearchCodeCalls: number;
}

const DEFAULT_MAX_TOOL_CALLS = 12;
const DEFAULT_MAX_SEARCH_CODE_CALLS = 3;
const MAX_CONFIGURED_BUDGET = 100;

/** Thrown when the server environment is not configured for the real harness. */
export class TrueForgeConfigError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(
      `TrueForge is not configured on the server. Missing environment variable(s): ${missing.join(", ")}. ` +
        `Set them in your local .env (see .env.example) and restart the app.`,
    );
    this.name = "TrueForgeConfigError";
    this.missing = missing;
  }
}

const read = (name: string): string | undefined => {
  const value = process.env[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
};

const readBudget = (name: string, fallback: number): number => {
  const raw = read(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(parsed, MAX_CONFIGURED_BUDGET)
    : fallback;
};

/**
 * Read env inside the request path — Workers inject env per request.
 * Values come exclusively from server-side `process.env`; nothing is read from the
 * client bundle, and the token is never returned to the browser.
 */
export function trueForgeConfig(): TrueForgeConfig {
  const baseUrl = read("TRUEFORGE_BASE_URL");
  const model = read("TRUEFORGE_MODEL");
  const githubMcpServer = read("TRUEFORGE_GITHUB_MCP_SERVER");
  const repository = read("TRUEFORGE_REPOSITORY");

  const missing = [
    ["TRUEFORGE_BASE_URL", baseUrl],
    ["TRUEFORGE_MODEL", model],
    ["TRUEFORGE_GITHUB_MCP_SERVER", githubMcpServer],
    ["TRUEFORGE_REPOSITORY", repository],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k as string);

  if (missing.length > 0) throw new TrueForgeConfigError(missing);

  return {
    baseUrl: baseUrl!.replace(/\/$/, ""),
    // Never logged or returned; only used as an Authorization header value.
    token: read("TRUEFORGE_API_TOKEN"),
    model: model!,
    githubMcpServer: githubMcpServer!,
    repository: repository!,
    maxToolCalls: readBudget("TRUEFORGE_MAX_TOOL_CALLS", DEFAULT_MAX_TOOL_CALLS),
    maxSearchCodeCalls: readBudget(
      "TRUEFORGE_MAX_SEARCH_CODE_CALLS",
      DEFAULT_MAX_SEARCH_CODE_CALLS,
    ),
  };
}

export class TrueForgeRateLimitError extends Error {
  constructor() {
    super("Investigation paused: model rate limit reached.");
    this.name = "TrueForgeRateLimitError";
  }
}

/** Strips anything secret-shaped out of an error before it reaches the browser. */
export function sanitizeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const token = process.env["TRUEFORGE_API_TOKEN"];
  const cleaned = token ? raw.split(token).join("***") : raw;
  return cleaned.replace(/Bearer\s+[\w.-]+/gi, "Bearer ***").slice(0, 400);
}

export interface TrueForgeHealth {
  reachable: boolean;
  status: number | null;
  latencyMs: number;
  error: string | null;
  /** Which required variables are missing (names only, never values). */
  missingConfig: string[];
}

/**
 * Minimal connectivity probe: a single GET against the configured base URL.
 * Reports reachability, HTTP status, latency and a sanitized error only —
 * no environment values are ever included.
 */
export async function checkTrueForgeHealth(timeoutMs = 4000): Promise<TrueForgeHealth> {
  let cfg: TrueForgeConfig;
  try {
    cfg = trueForgeConfig();
  } catch (error) {
    return {
      reachable: false,
      status: null,
      latencyMs: 0,
      error: sanitizeError(error),
      missingConfig: error instanceof TrueForgeConfigError ? error.missing : [],
    };
  }

  const started = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}/`, {
      method: "GET",
      headers: cfg.token ? { authorization: `Bearer ${cfg.token}` } : {},
      signal: ac.signal,
    });
    return {
      reachable: true,
      status: res.status,
      latencyMs: Date.now() - started,
      error: null,
      missingConfig: [],
    };
  } catch (error) {
    return {
      reachable: false,
      status: null,
      latencyMs: Date.now() - started,
      error: sanitizeError(error),
      missingConfig: [],
    };
  } finally {
    clearTimeout(timer);
  }
}

/** First real integration slice: read-only repository forensics, no writes. */
export const FIRST_SLICE_PROMPT = (
  repository: string,
  maxToolCalls = DEFAULT_MAX_TOOL_CALLS,
  maxSearchCodeCalls = DEFAULT_MAX_SEARCH_CODE_CALLS,
) => `You are RepoMedic, an autonomous production-incident investigator.

Incident: Investigate the current RepoMedic repository (${repository}) and identify the
deterministic investigation workflow that should be replaced by a real TrueForge-backed
investigation.

This run is READ-ONLY. Do not create branches, commits, pull requests, or any other
write operation. Use the GitHub MCP tools only to read repository contents.

Execution budget (hard limits enforced by the caller):
- At most ${maxToolCalls} total tool calls.
- At most ${maxSearchCodeCalls} unique search_code calls.
- Never repeat an equivalent search_code query.
- Prefer repository tree, commit, and changed-file inspection. Once a relevant path is
  located, read that file directly instead of searching the whole repository again.
- Stop exploring early and summarize the evidence already collected when sufficient.

Steps:
1. Inspect the repository structure and recent commits.
2. Locate the files that implement the simulated/deterministic investigation workflow.
3. Report, with file paths and short excerpts, exactly which parts are simulated and what
   a real TrueForge-backed investigation would need to replace.

Finish with a concise evidence-backed summary.`;

function headers(cfg: TrueForgeConfig): Record<string, string> {
  return {
    "content-type": "application/json",
    ...(cfg.token ? { authorization: `Bearer ${cfg.token}` } : {}),
  };
}

/** Creates an inline session configured for read-only GitHub MCP forensics. */
export async function createSession(cfg: TrueForgeConfig): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}/api/v1/sessions`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({
      agent: {
        spec: {
          model: { name: cfg.model },
          instructions: FIRST_SLICE_PROMPT(
            cfg.repository,
            cfg.maxToolCalls,
            cfg.maxSearchCodeCalls,
          ),
          mcp_servers: [
            {
              name: cfg.githubMcpServer,
              // Anything mutating stays behind TrueForge's own approval checkpoint.
              require_approval_for_tools: ["@write", "@destructive"],
            },
          ],
        },
      },
    }),
  });
  if (!res.ok) {
    if (res.status === 429) throw new TrueForgeRateLimitError();
    throw new Error(`TrueForge session creation failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { data?: { id?: string }; id?: string };
  const id = body.data?.id ?? body.id;
  if (!id) throw new Error("TrueForge session response contained no session id");
  return id;
}

type TurnInput =
  | { type: "user.message"; content: string }
  | {
      type: "user.tool_approval";
      thread_id: string;
      tool_call_id: string;
      approval: { status: "allow" | "deny"; reason?: string };
    };

/** Creates a streaming turn and yields raw TrueForge SSE events. */
async function* streamTurn(
  cfg: TrueForgeConfig,
  sessionId: string,
  input: TurnInput[],
  signal: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  const res = await fetch(`${cfg.baseUrl}/api/v1/sessions/${sessionId}/turns`, {
    method: "POST",
    headers: { ...headers(cfg), accept: "text/event-stream" },
    body: JSON.stringify({ input, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) {
    if (res.status === 429) throw new TrueForgeRateLimitError();
    throw new Error(`TrueForge turn failed (${res.status}): ${await res.text()}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          yield JSON.parse(payload) as Record<string, unknown>;
        } catch {
          // Ignore malformed frames rather than killing the run.
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Event mapping: TrueForge → RepoMedic RunEvent                       */
/* ------------------------------------------------------------------ */

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};

type BudgetStopReason = "duplicate_search" | "search_budget" | "tool_budget";

export interface InvestigationBudgetState {
  toolCalls: number;
  searchCodeCalls: number;
  seenSearches: Set<string>;
}

export interface InvestigationBudget {
  maxToolCalls: number;
  maxSearchCodeCalls: number;
}

export interface BudgetInspection {
  audits: RunEvent[];
  stopReason?: BudgetStopReason;
}

export const createInvestigationBudgetState = (): InvestigationBudgetState => ({
  toolCalls: 0,
  searchCodeCalls: 0,
  seenSearches: new Set<string>(),
});

const normalizeValue = (value: unknown): unknown => {
  if (typeof value === "string") return value.trim().replace(/\s+/g, " ").toLowerCase();
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key.toLowerCase(), normalizeValue(entry)]),
    );
  }
  return value;
};

const parseToolArguments = (value: unknown): unknown => {
  if (typeof value !== "string") return value ?? {};
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const toolName = (call: Record<string, unknown>): string =>
  str(obj(call["function"])["name"]) ?? str(obj(call["tool_info"])["name"]) ?? "unknown";

const isSearchCode = (name: string): boolean =>
  name.toLowerCase().replace(/[.-]/g, "_").endsWith("search_code");

const searchFingerprint = (call: Record<string, unknown>): string =>
  JSON.stringify(normalizeValue(parseToolArguments(obj(call["function"])["arguments"])));

/**
 * Accounts for proposed calls at the earliest event TrueForge exposes: model.message.
 * A guard violation causes the caller to cancel the turn before accepting more events.
 */
export function inspectToolCallBudget(
  raw: Record<string, unknown>,
  state: InvestigationBudgetState,
  budget: InvestigationBudget,
): BudgetInspection {
  if (str(raw["type"]) !== "model.message") return { audits: [] };
  const data = obj(raw["data"] ?? raw);
  const calls = Array.isArray(data["tool_calls"]) ? (data["tool_calls"] as unknown[]) : [];
  const audits: RunEvent[] = [];

  for (const candidate of calls) {
    const call = obj(candidate);
    const name = toolName(call);
    const search = isSearchCode(name);
    const fingerprint = search ? searchFingerprint(call) : "";
    const deduplicated = search && state.seenSearches.has(fingerprint);

    if (deduplicated) {
      audits.push(budgetAudit(name, state, budget, true, "duplicate_search"));
      return { audits, stopReason: "duplicate_search" };
    }
    if (state.toolCalls >= budget.maxToolCalls) {
      audits.push(budgetAudit(name, state, budget, false, "tool_budget"));
      return { audits, stopReason: "tool_budget" };
    }
    if (search && state.searchCodeCalls >= budget.maxSearchCodeCalls) {
      audits.push(budgetAudit(name, state, budget, false, "search_budget"));
      return { audits, stopReason: "search_budget" };
    }

    state.toolCalls += 1;
    if (search) {
      state.searchCodeCalls += 1;
      state.seenSearches.add(fingerprint);
    }
    audits.push(budgetAudit(name, state, budget, false));
  }

  return { audits };
}

function budgetAudit(
  name: string,
  state: InvestigationBudgetState,
  budget: InvestigationBudget,
  deduplicated: boolean,
  stopReason?: BudgetStopReason,
): RunEvent {
  return {
    type: "audit",
    entry: {
      actor: "tool",
      action: stopReason ? "TrueForge exploration stopped" : `Tool call proposed · ${name}`,
      result: stopReason
        ? stopReason === "duplicate_search"
          ? "Equivalent GitHub search_code request suppressed"
          : stopReason === "search_budget"
            ? "GitHub search_code budget reached"
            : "Investigation tool-call budget reached"
        : `Tool call ${state.toolCalls} of ${budget.maxToolCalls}`,
      status: stopReason ? "failed" : "started",
      details: {
        tool: name,
        tool_call_count: state.toolCalls,
        tool_call_budget: budget.maxToolCalls,
        search_code_count: state.searchCodeCalls,
        search_code_budget: budget.maxSearchCodeCalls,
        deduplicated,
        ...(stopReason ? { stop_reason: stopReason } : {}),
      },
    },
  };
}

export function isRateLimitEvent(raw: Record<string, unknown>): boolean {
  const type = str(raw["type"]) ?? "";
  const data = obj(raw["data"] ?? raw);
  const state = obj(data["state"]);
  const terminalError = str(state["status"]) === "error" ? str(state["error"]) : undefined;
  const directError = str(data["error"]) ?? str(data["message"]);
  if (!type.includes("error") && !terminalError && !directError) return false;
  return /(?:\b429\b|rate[ _-]?limit|resource[_ -]?exhausted|quota)/i.test(
    [terminalError, directError].filter(Boolean).join(" "),
  );
}

async function cancelSession(cfg: TrueForgeConfig, sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(`${cfg.baseUrl}/api/v1/sessions/${sessionId}/cancel`, {
      method: "POST",
      headers: headers(cfg),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const stopMessage = (reason: BudgetStopReason): string =>
  reason === "duplicate_search"
    ? "Investigation stopped: duplicate GitHub search suppressed. Partial evidence is preserved."
    : reason === "search_budget"
      ? "Investigation stopped: GitHub search budget reached. Partial evidence is preserved."
      : "Investigation stopped: tool-call budget reached. Partial evidence is preserved.";

function toolStep(id: string, label: string, action: string, detail: string): TimelineStep {
  return {
    id,
    kind: "investigation",
    title: label,
    detail,
    state: "running",
    agent: "trueforge",
    startedAt: new Date().toISOString(),
    durationMs: 0,
    toolCalls: [],
    category: "mcp_tool",
    toolLabel: label,
    action,
  };
}

/**
 * Folds one raw TrueForge event into zero or more RepoMedic RunEvents.
 * Unknown event types are surfaced as audit rows rather than dropped.
 */
export function mapTrueForgeEvent(raw: Record<string, unknown>): RunEvent[] {
  const type = str(raw["type"]) ?? "unknown";
  const data = obj(raw["data"] ?? raw);
  const out: RunEvent[] = [];

  switch (type) {
    case "turn.created":
      out.push({ type: "phase", phase: "investigating" });
      out.push({
        type: "audit",
        entry: {
          actor: "agent",
          action: "TrueForge turn started",
          result: "Harness session accepted the incident brief",
          status: "started",
          details: { turn_id: str(data["id"]) ?? "unknown" },
        },
      });
      break;

    case "mcp.initialize":
      out.push({
        type: "audit",
        entry: {
          actor: "tool",
          action: "MCP server initialised",
          result: str(data["server_name"]) ?? "MCP server ready",
          details: { server: str(data["server_name"]) ?? "unknown" },
        },
      });
      break;

    case "mcp.auth_required":
      out.push({
        type: "audit",
        entry: {
          actor: "tool",
          action: "MCP authorization required",
          result: "The harness needs the MCP connector to be authorised",
          status: "failed",
          details: { server: str(data["server_name"]) ?? "unknown" },
        },
      });
      break;

    case "sandbox.created":
      out.push({
        type: "phase",
        phase: "sandbox_running",
      });
      out.push({
        type: "sandbox.upsert",
        run: {
          id: str(data["sandbox_id"]) ?? `sbx_${Date.now()}`,
          name: "TrueForge sandbox",
          command: str(data["command"]) ?? "sandbox session",
          status: "running",
          durationMs: 0,
          output: "Sandbox provisioned by the TrueForge harness.",
          phase: "reproduction",
        },
      });
      break;

    case "thread.created": {
      const id = str(data["thread_id"]) ?? `thread_${Date.now()}`;
      const subagent: SubagentTask = {
        id,
        name: str(data["name"]) ?? "Dynamic subagent",
        scope: str(data["description"]) ?? "Delegated investigation",
        state: "running",
      };
      out.push({ type: "phase", phase: "subagents_running" });
      out.push({ type: "subagent.upsert", subagent });
      break;
    }

    case "thread.done": {
      const id = str(data["thread_id"]) ?? "";
      if (id) {
        out.push({
          type: "subagent.upsert",
          subagent: {
            id,
            name: str(data["name"]) ?? "Dynamic subagent",
            scope: str(data["description"]) ?? "Delegated investigation",
            state: "complete",
            finding: str(data["summary"]) ?? "Subagent finished its investigation",
          },
        });
      }
      break;
    }

    case "model.message": {
      const content = str(obj(data["message"])["content"]) ?? str(data["content"]);
      if (content) {
        out.push({
          type: "audit",
          entry: {
            actor: "agent",
            action: "Agent reasoning",
            result: content.slice(0, 240),
            details: { content },
          },
        });
      }
      break;
    }

    case "tool.response": {
      const name = str(data["tool_name"]) ?? str(data["name"]) ?? "tool";
      const callId = str(data["tool_call_id"]) ?? `tc_${Date.now()}`;
      const stepId = `tf_${name}`;
      out.push({
        type: "step.upsert",
        step: toolStep(stepId, name, `Call ${name}`, `TrueForge invoked ${name}.`),
      });
      out.push({
        type: "step.tool_call",
        id: stepId,
        toolCall: {
          id: callId,
          provider: "trueforge",
          tool: name,
          args: {},
          durationMs: 0,
          status: data["is_error"] === true ? "error" : "ok",
          result: JSON.stringify(data["result"] ?? data["content"] ?? {}).slice(0, 600),
        },
      });
      out.push({ type: "step.patch", id: stepId, patch: { state: "complete" } });
      out.push({
        type: "audit",
        entry: {
          actor: "tool",
          action: `${name} completed`,
          result: JSON.stringify(data["result"] ?? data["content"] ?? {}).slice(0, 200),
          status: data["is_error"] === true ? "failed" : "completed",
          details: { tool: name, tool_call_id: callId },
        },
      });
      break;
    }

    case "tool.approval_required": {
      const threadId = str(data["thread_id"]) ?? "";
      const calls = Array.isArray(data["tool_calls"]) ? (data["tool_calls"] as unknown[]) : [];
      const first = obj(calls[0]);
      out.push({
        type: "approval.required",
        request: {
          title: "TrueForge tool approval required",
          summary: str(first["name"]) ?? "The agent requested a gated tool action",
          target: "TrueForge harness",
          risk: "Medium",
          reversibility: "High",
          toolName: str(first["name"]),
          threadId,
          toolCallId: str(first["id"]),
        },
      });
      out.push({
        type: "audit",
        entry: {
          actor: "agent",
          action: "Human approval requested",
          result: "TrueForge paused a gated tool call and is waiting for allow/deny",
          status: "started",
          details: {
            thread_id: threadId,
            tool_call_id: str(first["id"]) ?? "unknown",
          },
        },
      });
      break;
    }

    case "turn.done":
      out.push({ type: "phase", phase: "completed" });
      out.push({
        type: "audit",
        entry: {
          actor: "agent",
          action: "TrueForge turn finished",
          result: str(data["status"]) ?? "Turn completed",
        },
      });
      out.push({ type: "done" });
      break;

    default:
      out.push({
        type: "audit",
        entry: {
          actor: "agent",
          action: `Harness event · ${type}`,
          result: "Received an unmapped TrueForge event",
          details: { type },
        },
      });
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Public server API                                                   */
/* ------------------------------------------------------------------ */

export async function* runInvestigation(signal: AbortSignal): AsyncGenerator<RunEvent> {
  const cfg = trueForgeConfig();
  let sessionId: string;
  try {
    sessionId = await createSession(cfg);
  } catch (error) {
    if (error instanceof TrueForgeRateLimitError) {
      yield rateLimitAudit();
      yield { type: "error", message: error.message };
      return;
    }
    throw error;
  }

  yield { type: "session", sessionId };
  yield { type: "run.started", steps: [], subagents: [] };
  yield {
    type: "audit",
    entry: {
      actor: "agent",
      action: "TrueForge session created",
      result: `Read-only investigation of ${cfg.repository}`,
      status: "started",
      details: {
        session_id: sessionId,
        model: cfg.model,
        mode: "read-only",
        tool_call_budget: cfg.maxToolCalls,
        search_code_budget: cfg.maxSearchCodeCalls,
      },
    },
  };
  yield { type: "phase", phase: "investigating" };

  const input: TurnInput[] = [
    { type: "user.message", content: FIRST_SLICE_PROMPT(cfg.repository) },
  ];
  const state = createInvestigationBudgetState();
  try {
    for await (const raw of streamTurn(cfg, sessionId, input, signal)) {
      if (isRateLimitEvent(raw)) {
        await cancelSession(cfg, sessionId);
        yield rateLimitAudit(state, cfg);
        yield { type: "error", message: "Investigation paused: model rate limit reached." };
        return;
      }

      const inspection = inspectToolCallBudget(raw, state, cfg);
      for (const audit of inspection.audits) yield audit;
      if (inspection.stopReason) {
        const cancelled = await cancelSession(cfg, sessionId);
        yield {
          type: "audit",
          entry: {
            actor: "agent",
            action: "TrueForge turn cancelled",
            result: stopMessage(inspection.stopReason),
            status: "failed",
            details: { stop_reason: inspection.stopReason, harness_cancelled: cancelled },
          },
        };
        yield { type: "error", message: stopMessage(inspection.stopReason) };
        return;
      }

      for (const event of mapTrueForgeEvent(raw)) yield event;
    }
  } catch (error) {
    if (error instanceof TrueForgeRateLimitError) {
      yield rateLimitAudit(state, cfg);
      yield { type: "error", message: error.message };
      return;
    }
    throw error;
  }
}

function rateLimitAudit(
  state = createInvestigationBudgetState(),
  budget: InvestigationBudget = {
    maxToolCalls: DEFAULT_MAX_TOOL_CALLS,
    maxSearchCodeCalls: DEFAULT_MAX_SEARCH_CODE_CALLS,
  },
): RunEvent {
  return {
    type: "audit",
    entry: {
      actor: "agent",
      action: "Investigation paused by upstream limit",
      result: "Model rate limit reached; no automatic retry was attempted",
      status: "failed",
      details: {
        stop_reason: "rate_limit",
        tool_call_count: state.toolCalls,
        tool_call_budget: budget.maxToolCalls,
        search_code_count: state.searchCodeCalls,
        search_code_budget: budget.maxSearchCodeCalls,
      },
    },
  };
}

export async function* submitDecision(
  sessionId: string,
  threadId: string,
  toolCallId: string,
  status: "allow" | "deny",
  reason: string | undefined,
  signal: AbortSignal,
): AsyncGenerator<RunEvent> {
  const cfg = trueForgeConfig();
  yield {
    type: "audit",
    entry: {
      actor: "human",
      action: status === "allow" ? "Tool action approved" : "Tool action denied",
      result:
        status === "allow"
          ? "Explicit authorization sent to the TrueForge approval checkpoint"
          : "The gated tool action was denied at the TrueForge checkpoint",
      status: status === "allow" ? "approved" : "rejected",
      details: { thread_id: threadId, tool_call_id: toolCallId, ...(reason ? { reason } : {}) },
    },
  };
  if (status === "deny") {
    yield { type: "phase", phase: "rejected" };
  } else {
    yield { type: "phase", phase: "creating_pr" };
  }

  const input: TurnInput[] = [
    {
      type: "user.tool_approval",
      thread_id: threadId,
      tool_call_id: toolCallId,
      approval: { status, ...(reason ? { reason } : {}) },
    },
  ];
  for await (const raw of streamTurn(cfg, sessionId, input, signal)) {
    for (const event of mapTrueForgeEvent(raw)) yield event;
  }
}
