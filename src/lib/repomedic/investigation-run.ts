import { useCallback, useEffect, useRef, useState } from "react";

import {
  CONVERGED_FINDING,
  demoHypothesis,
  demoPatch,
  demoPullRequest,
  demoVerification,
  evidenceForStep,
  pace,
  reproductionRun,
  stepBlueprints,
  stepResultPreview,
  stepToolCalls,
  subagentBlueprints,
  subagentFindings,
  verificationRuns,
} from "./demo-script";
import type { AuditEntry, RunState, TimelineStep } from "./types";

/**
 * Central workflow state for one investigation run.
 *
 * All demo sequencing lives here so components stay presentational. Replacing
 * the simulated agent with a real TrueForge backend means replacing the body of
 * `start()` with a subscription to harness events that dispatches the same
 * state transitions.
 */

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const initialRunState: RunState = {
  phase: "idle",
  steps: [],
  evidence: [],
  subagents: [],
  sandboxRuns: [],
  hypothesis: null,
  patch: null,
  verification: null,
  pullRequest: null,
  auditLog: [],
  error: null,
};

let auditSeq = 0;

type AuditInput = Omit<AuditEntry, "id" | "at" | "status"> & Partial<Pick<AuditEntry, "status">>;

/** Builds one structured audit event. Demo-only: kept in memory, never persisted. */
const entry = (input: AuditInput): AuditEntry => ({
  id: `audit_${++auditSeq}`,
  at: new Date().toISOString(),
  status: "completed",
  ...input,
});

export function useInvestigationRun() {
  const [state, setState] = useState<RunState>(initialRunState);
  const runToken = useRef(0);
  const running = useRef(false);
  /** True once the human has approved or rejected — blocks any second decision. */
  const decided = useRef(false);

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      runToken.current += 1;
    };
  }, []);

  const makeCtx = useCallback((token: number) => {
    const alive = () => mounted.current && runToken.current === token;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });
    const update = (fn: (prev: RunState) => RunState) => {
      if (!alive()) return;
      setState(fn);
    };
    const patchStep = (id: string, patch: Partial<TimelineStep>) =>
      update((prev) => ({
        ...prev,
        steps: prev.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      }));
    const log = (input: AuditInput) =>
      update((prev) => ({ ...prev, auditLog: [...prev.auditLog, entry(input)] }));
    return { alive, wait, update, patchStep, log };
  }, []);

  const start = useCallback(async () => {
    if (running.current) return; // prevents duplicate runs
    running.current = true;
    decided.current = false;

    const token = ++runToken.current;
    const { alive, wait, update, patchStep, log } = makeCtx(token);

    try {
      update(() => ({
        ...clone(initialRunState),
        phase: "running",
        steps: clone(stepBlueprints),
        subagents: clone(subagentBlueprints),
        auditLog: [
          entry({
            actor: "human",
            action: "Investigation triggered",
            result: "On-call engineer authorised an autonomous investigation",
            status: "started",
            details: { incident: "INC-9001", severity: "SEV-1", service: "checkout-service" },
          }),
          entry({
            actor: "agent",
            action: "Incident received",
            result: "Checkout API latency spike ingested · error rate +43%, p95 3.2s",
            details: { source: "demo incident feed", deployment_age: "11 minutes" },
          }),
          entry({
            actor: "tool",
            action: "GitHub/MCP investigation started",
            result: "Inspecting deployments, commits, changed files and pull requests",
            status: "started",
            details: { tool: "github.inspect_deployment", input: "deployment #4812" },
          }),
        ],
      }));

      const runStep = async (id: string) => {
        await wait(pace.stepStart);
        if (!alive()) return false;
        patchStep(id, { state: "running", startedAt: new Date().toISOString() });
        const calls = stepToolCalls[id] ?? [];
        for (const call of calls) {
          await wait(pace.toolCall);
          if (!alive()) return false;
          update((prev) => ({
            ...prev,
            steps: prev.steps.map((s) =>
              s.id === id ? { ...s, toolCalls: [...s.toolCalls, call] } : s,
            ),
          }));
        }
        return alive();
      };

      const finishStep = async (id: string, durationMs: number) => {
        await wait(pace.stepFinish);
        if (!alive()) return false;
        patchStep(id, {
          state: "complete",
          durationMs,
          ...(stepResultPreview[id] ? { resultPreview: stepResultPreview[id] } : {}),
        });
        const ev = evidenceForStep[id];
        if (ev) update((prev) => ({ ...prev, evidence: [...prev.evidence, ...clone(ev)] }));
        return alive();
      };

      /* STEP 1 — GitHub / MCP investigation */
      if (!(await runStep("step_github"))) return;
      if (!(await finishStep("step_github", 8_400))) return;
      log({
        actor: "tool",
        action: "Deployment identified",
        result: "Deployment #4812 → commit 81ac2 · 4 files changed",
        details: {
          tool: "github.inspect_deployment",
          input: "deployment #4812",
          commit: "81ac2",
          files_changed: "4",
          service: "checkout-service",
        },
      });

      /* STEP 2 — Metrics + logs */
      if (!(await runStep("step_telemetry"))) return;
      if (!(await finishStep("step_telemetry", 11_200))) return;
      log({
        actor: "tool",
        action: "Metrics analyzed",
        result: "p95 latency 0.8s → 3.2s immediately after deployment #4812",
        details: { tool: "metrics.query", input: "service=checkout-service window=2h", p95_before: "0.8s", p95_after: "3.2s" },
      });
      log({
        actor: "tool",
        action: "Logs analyzed",
        result: "Database query volume per checkout request increased sharply",
        details: { tool: "logs.search", input: "service=checkout-service level>=warn", queries_per_request: "101" },
      });
      log({
        actor: "agent",
        action: "Subagents launched",
        result: "3 investigators dispatched in parallel",
        status: "started",
        details: { subagents: "Application, Database, Deployment" },
      });

      /* STEP 3 — Parallel subagents */
      await wait(pace.stepStart);
      if (!alive()) return;
      patchStep("step_subagents", { state: "running", startedAt: new Date().toISOString() });

      for (const sa of subagentBlueprints) {
        await wait(pace.subagentStagger);
        if (!alive()) return;
        update((prev) => ({
          ...prev,
          subagents: prev.subagents.map((s) =>
            s.id === sa.id ? { ...s, state: "running" } : s,
          ),
        }));
      }

      for (const sa of subagentBlueprints) {
        await wait(pace.subagentWork);
        if (!alive()) return;
        const result = subagentFindings[sa.id]!;
        update((prev) => ({
          ...prev,
          subagents: prev.subagents.map((s) =>
            s.id === sa.id
              ? { ...s, state: "complete", finding: result.finding, confidence: result.confidence }
              : s,
          ),
        }));
        log({
          actor: "subagent",
          action: `${sa.name} completed`,
          result: result.finding,
          details: { subagent: sa.name, confidence: `${Math.round(result.confidence * 100)}%` },
        });
      }

      if (!(await finishStep("step_subagents", 14_600))) return;
      log({
        actor: "agent",
        action: "Subagent consensus reached",
        result: `3/3 investigators agree · ${CONVERGED_FINDING}`,
        details: { agreement: "3/3", finding: CONVERGED_FINDING },
      });
      log({
        actor: "sandbox",
        action: "Sandbox reproduction started",
        result: "Executing deterministic reproduction in sandbox sbx-9a12",
        status: "started",
        details: { tool: "sandbox.execute", command: "python reproduce_checkout.py", sandbox: "sbx-9a12" },
      });

      /* STEP 4 — Sandbox reproduction */
      if (!(await runStep("step_sandbox"))) return;
      update((prev) => ({
        ...prev,
        sandboxRuns: [...prev.sandboxRuns, { ...clone(reproductionRun), status: "running" }],
      }));
      await wait(pace.sandbox);
      if (!alive()) return;
      update((prev) => ({
        ...prev,
        sandboxRuns: prev.sandboxRuns.map((r) =>
          r.id === reproductionRun.id ? clone(reproductionRun) : r,
        ),
      }));
      if (!(await finishStep("step_sandbox", 39_200))) return;
      log({
        actor: "sandbox",
        action: "Failure reproduced",
        result: "101 DB queries/request · p95 2.91s · failure reproduced",
        details: {
          command: "python reproduce_checkout.py",
          db_queries: "101",
          p95: "2.91s",
          outcome: "FAILURE REPRODUCED",
        },
      });

      /* STEP 5 — Root cause */
      if (!(await runStep("step_rootcause"))) return;
      update((prev) => ({ ...prev, hypothesis: clone(demoHypothesis) }));
      if (!(await finishStep("step_rootcause", 4_100))) return;
      log({
        actor: "agent",
        action: "Root cause identified",
        result: "N+1 database query introduced in checkout/order_service.py",
        details: { commit: "81ac2", confidence: "94%", service: "checkout-service" },
      });

      /* STEP 6 — Patch generation */
      if (!(await runStep("step_patch"))) return;
      update((prev) => ({ ...prev, patch: clone(demoPatch) }));
      if (!(await finishStep("step_patch", 12_800))) return;
      log({
        actor: "agent",
        action: "Patch generated",
        result: "Batched customer lookup · +17 / -9 lines in checkout/order_service.py",
        details: {
          file: "checkout/order_service.py",
          branch: "repomedic/inc-9001-batch-order-lookup",
          diff: "+17 / -9",
        },
      });

      /* STEP 7 — Patch verification */
      if (!(await runStep("step_verify"))) return;
      for (const run of verificationRuns) {
        await wait(pace.sandbox / 2);
        if (!alive()) return;
        update((prev) => ({ ...prev, sandboxRuns: [...prev.sandboxRuns, clone(run)] }));
      }
      update((prev) => ({ ...prev, verification: clone(demoVerification) }));
      if (!(await finishStep("step_verify", 83_300))) return;
      log({
        actor: "sandbox",
        action: "Tests completed",
        result: "Unit 32/32 · Integration 12/12 · Performance passed · p95 2.91s → 0.84s",
        details: {
          unit_tests: "32/32 passed",
          integration_tests: "12/12 passed",
          performance: "passed",
          p95_before: "2.91s",
          p95_after: "0.84s",
        },
      });

      /* STEP 8 — Human approval gate (hard stop) */
      await wait(pace.stepStart);
      if (!alive()) return;
      patchStep("step_approval", {
        state: "blocked",
        startedAt: new Date().toISOString(),
        resultPreview: stepResultPreview["step_approval"] ?? "",
      });
      update((prev) => ({ ...prev, phase: "awaiting_approval" }));
      log({
        actor: "agent",
        action: "Human approval requested",
        result: "Workflow paused — creating a pull request requires human authorization",
        status: "started",
        details: { action: "Create GitHub Pull Request", target: "checkout-service", risk: "Medium" },
      });
    } catch {
      if (mounted.current && runToken.current === token) {
        setState((prev) => ({
          ...prev,
          phase: "error",
          error: "The investigation run failed unexpectedly. Reset the demo and try again.",
        }));
      }
    } finally {
      running.current = false;
    }
  }, [makeCtx]);

  const approve = useCallback(async (note?: string) => {
    // Safety: the external action can be authorised exactly once, and only
    // from the paused approval gate.
    if (decided.current) return;
    decided.current = true;

    const token = ++runToken.current;
    const { alive, wait, update, patchStep, log } = makeCtx(token);

    update((prev) => ({ ...prev, phase: "creating_pr" }));
    patchStep("step_approval", { state: "complete", durationMs: 0 });
    log({
      actor: "human",
      action: "PR creation approved",
      result: `Explicit user authorization received${note ? ` — “${note}”` : ""}`,
      status: "approved",
      details: {
        action: "Create GitHub Pull Request",
        decision: "Approved by human",
        ...(note ? { note } : {}),
      },
    });
    patchStep("step_pr", { state: "running", startedAt: new Date().toISOString() });


    await wait(pace.prCreation);
    if (!alive()) return;

    update((prev) => ({
      ...prev,
      phase: "approved",
      pullRequest: clone(demoPullRequest),
      steps: prev.steps.map((s) =>
        s.id === "step_pr"
          ? {
              ...s,
              state: "complete",
              durationMs: 2_400,
              resultPreview: stepResultPreview["step_pr"] ?? "",
              toolCalls: [
                {
                  id: "tc_pr",
                  provider: "github-mcp",
                  tool: "create_pull_request",
                  args: {
                    repo: "acme/checkout-service",
                    head: demoPatch.branch,
                    base: demoPatch.baseBranch,
                  },
                  durationMs: 1_640,
                  status: "ok" as const,
                  result: `PR #${demoPullRequest.number} opened · checks passing`,
                },
              ],
            }
          : s,
      ),
    }));
    log({
      actor: "tool",
      action: "Pull request created",
      result: `PR #${demoPullRequest.number} · ${demoPullRequest.title} · checks passing`,
      details: {
        tool: "github.create_pull_request",
        pull_request: `#${demoPullRequest.number}`,
        checks: "passing",
        status: "Ready for review",
      },
    });
  }, [makeCtx]);

  const reject = useCallback((note?: string) => {
    if (decided.current) return;
    decided.current = true;
    runToken.current += 1;
    running.current = false;
    setState((prev) => ({
      ...prev,
      phase: "rejected",
      steps: prev.steps.map((s) =>
        s.id === "step_approval"
          ? { ...s, state: "failed" }
          : s.id === "step_pr"
            ? { ...s, state: "pending", detail: "Not created — the human reviewer rejected the patch." }
            : s,
      ),
      auditLog: [
        ...prev.auditLog,
        entry({
          actor: "human",
          action: "PR creation rejected",
          result: `Human reviewer declined the external action${note ? ` — “${note}”` : ""}`,
          status: "rejected",
          details: {
            action: "Create GitHub Pull Request",
            decision: "Rejected by human",
            ...(note ? { note } : {}),
          },
        }),
        entry({
          actor: "agent",
          action: "Workflow stopped",
          result: "No pull request was created and the patch branch was discarded",
          status: "failed",
        }),
      ],
    }));
  }, []);

  const reset = useCallback(() => {
    runToken.current += 1;
    running.current = false;
    decided.current = false;
    setState(clone(initialRunState));
  }, []);


  return { state, start, approve, reject, reset };
}
