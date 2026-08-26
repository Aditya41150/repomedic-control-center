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
}

/** Read env inside the request path — Workers inject env per request. */
export function trueForgeConfig(): TrueForgeConfig {
  return {
    baseUrl: (process.env["TRUEFORGE_BASE_URL"] ?? "http://localhost:3000").replace(/\/$/, ""),
    token: process.env["TRUEFORGE_API_TOKEN"],
    model: process.env["TRUEFORGE_MODEL"] ?? "gemini-2.5-pro",
    githubMcpServer: process.env["TRUEFORGE_GITHUB_MCP_SERVER"] ?? "github",
    repository: process.env["TRUEFORGE_REPOSITORY"] ?? "Aditya41150/repomedic",
  };
}

/** First real integration slice: read-only repository forensics, no writes. */
export const FIRST_SLICE_PROMPT = (repository: string) => `You are RepoMedic, an autonomous production-incident investigator.

Incident: Investigate the current RepoMedic repository (${repository}) and identify the
deterministic investigation workflow that should be replaced by a real TrueForge-backed
investigation.

This run is READ-ONLY. Do not create branches, commits, pull requests, or any other
write operation. Use the GitHub MCP tools only to read repository contents.

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
          instructions: FIRST_SLICE_PROMPT(cfg.repository),
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
      out.push({ type: "step.upsert", step: toolStep(stepId, name, `Call ${name}`, `TrueForge invoked ${name}.`) });
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
  const sessionId = await createSession(cfg);

  yield { type: "session", sessionId };
  yield { type: "run.started", steps: [], subagents: [] };
  yield {
    type: "audit",
    entry: {
      actor: "agent",
      action: "TrueForge session created",
      result: `Read-only investigation of ${cfg.repository}`,
      status: "started",
      details: { session_id: sessionId, model: cfg.model, mode: "read-only" },
    },
  };
  yield { type: "phase", phase: "investigating" };

  const input: TurnInput[] = [
    { type: "user.message", content: FIRST_SLICE_PROMPT(cfg.repository) },
  ];
  for await (const raw of streamTurn(cfg, sessionId, input, signal)) {
    for (const event of mapTrueForgeEvent(raw)) yield event;
  }
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
