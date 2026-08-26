/**
 * DemoDriver — the deterministic, offline investigation used for the hackathon demo.
 *
 * It makes no network calls. Every delay, tool call, subagent finding, sandbox run and
 * audit entry comes from `demo-script.ts`, so the run is byte-identical every time.
 */

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
import type { RunDriver, RunDriverContext } from "./run-driver";
import type { ApprovalRequest, TimelineStep } from "./types";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const demoApprovalRequest: ApprovalRequest = {
  title: "Create GitHub Pull Request",
  summary: "Fix N+1 database query in checkout/order_service.py",
  target: "checkout-service",
  risk: "Medium",
  reversibility: "High",
  toolName: "github.create_pull_request",
};

export function createDemoDriver(): RunDriver {
  const wait = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(resolve, ms);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true },
      );
    });

  return {
    mode: "demo",

    async start({ emit, signal }: RunDriverContext) {
      const alive = () => !signal.aborted;
      const step = (id: string, patch: Partial<TimelineStep>) =>
        emit({ type: "step.patch", id, patch });

      emit({
        type: "run.started",
        steps: clone(stepBlueprints),
        subagents: clone(subagentBlueprints),
      });
      emit({ type: "phase", phase: "investigating" });
      emit({
        type: "audit",
        entry: {
          actor: "human",
          action: "Investigation triggered",
          result: "On-call engineer authorised an autonomous investigation",
          status: "started",
          details: { incident: "INC-9001", severity: "SEV-1", service: "checkout-service" },
        },
      });
      emit({
        type: "audit",
        entry: {
          actor: "agent",
          action: "Incident received",
          result: "Checkout API latency spike ingested · error rate +43%, p95 3.2s",
          details: { source: "demo incident feed", deployment_age: "11 minutes" },
        },
      });
      emit({
        type: "audit",
        entry: {
          actor: "tool",
          action: "GitHub/MCP investigation started",
          result: "Inspecting deployments, commits, changed files and pull requests",
          status: "started",
          details: { tool: "github.inspect_deployment", input: "deployment #4812" },
        },
      });

      const runStep = async (id: string) => {
        await wait(pace.stepStart, signal);
        if (!alive()) return false;
        step(id, { state: "running", startedAt: new Date().toISOString() });
        for (const call of stepToolCalls[id] ?? []) {
          await wait(pace.toolCall, signal);
          if (!alive()) return false;
          emit({ type: "step.tool_call", id, toolCall: call });
        }
        return alive();
      };

      const finishStep = async (id: string, durationMs: number) => {
        await wait(pace.stepFinish, signal);
        if (!alive()) return false;
        step(id, {
          state: "complete",
          durationMs,
          ...(stepResultPreview[id] ? { resultPreview: stepResultPreview[id] } : {}),
        });
        const ev = evidenceForStep[id];
        if (ev) emit({ type: "evidence", items: clone(ev) });
        return alive();
      };

      /* STEP 1 — GitHub / MCP investigation */
      if (!(await runStep("step_github"))) return;
      if (!(await finishStep("step_github", 8_400))) return;
      emit({
        type: "audit",
        entry: {
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
        },
      });

      /* STEP 2 — Metrics + logs */
      emit({ type: "phase", phase: "analyzing" });
      if (!(await runStep("step_telemetry"))) return;
      if (!(await finishStep("step_telemetry", 11_200))) return;
      emit({
        type: "audit",
        entry: {
          actor: "tool",
          action: "Metrics analyzed",
          result: "p95 latency 0.8s → 3.2s immediately after deployment #4812",
          details: {
            tool: "metrics.query",
            input: "service=checkout-service window=2h",
            p95_before: "0.8s",
            p95_after: "3.2s",
          },
        },
      });
      emit({
        type: "audit",
        entry: {
          actor: "tool",
          action: "Logs analyzed",
          result: "Database query volume per checkout request increased sharply",
          details: {
            tool: "logs.search",
            input: "service=checkout-service level>=warn",
            queries_per_request: "101",
          },
        },
      });
      emit({
        type: "audit",
        entry: {
          actor: "agent",
          action: "Subagents launched",
          result: "3 investigators dispatched in parallel",
          status: "started",
          details: { subagents: "Application, Database, Deployment" },
        },
      });

      /* STEP 3 — Parallel subagents */
      emit({ type: "phase", phase: "subagents_running" });
      await wait(pace.stepStart, signal);
      if (!alive()) return;
      step("step_subagents", { state: "running", startedAt: new Date().toISOString() });

      for (const sa of subagentBlueprints) {
        await wait(pace.subagentStagger, signal);
        if (!alive()) return;
        emit({ type: "subagent.upsert", subagent: { ...clone(sa), state: "running" } });
      }

      for (const sa of subagentBlueprints) {
        await wait(pace.subagentWork, signal);
        if (!alive()) return;
        const result = subagentFindings[sa.id]!;
        emit({
          type: "subagent.upsert",
          subagent: {
            ...clone(sa),
            state: "complete",
            finding: result.finding,
            confidence: result.confidence,
          },
        });
        emit({
          type: "audit",
          entry: {
            actor: "subagent",
            action: `${sa.name} completed`,
            result: result.finding,
            details: {
              subagent: sa.name,
              confidence: `${Math.round(result.confidence * 100)}%`,
            },
          },
        });
      }

      if (!(await finishStep("step_subagents", 14_600))) return;
      emit({
        type: "audit",
        entry: {
          actor: "agent",
          action: "Subagent consensus reached",
          result: `3/3 investigators agree · ${CONVERGED_FINDING}`,
          details: { agreement: "3/3", finding: CONVERGED_FINDING },
        },
      });
      emit({
        type: "audit",
        entry: {
          actor: "sandbox",
          action: "Sandbox reproduction started",
          result: "Executing deterministic reproduction in sandbox sbx-9a12",
          status: "started",
          details: {
            tool: "sandbox.execute",
            command: "python reproduce_checkout.py",
            sandbox: "sbx-9a12",
          },
        },
      });

      /* STEP 4 — Sandbox reproduction */
      emit({ type: "phase", phase: "sandbox_running" });
      if (!(await runStep("step_sandbox"))) return;
      emit({ type: "sandbox.upsert", run: { ...clone(reproductionRun), status: "running" } });
      await wait(pace.sandbox, signal);
      if (!alive()) return;
      emit({ type: "sandbox.upsert", run: clone(reproductionRun) });
      if (!(await finishStep("step_sandbox", 39_200))) return;
      emit({
        type: "audit",
        entry: {
          actor: "sandbox",
          action: "Failure reproduced",
          result: "101 DB queries/request · p95 2.91s · failure reproduced",
          details: {
            command: "python reproduce_checkout.py",
            db_queries: "101",
            p95: "2.91s",
            outcome: "FAILURE REPRODUCED",
          },
        },
      });

      /* STEP 5 — Root cause */
      emit({ type: "phase", phase: "analyzing" });
      if (!(await runStep("step_rootcause"))) return;
      emit({ type: "hypothesis", hypothesis: clone(demoHypothesis) });
      if (!(await finishStep("step_rootcause", 4_100))) return;
      emit({
        type: "audit",
        entry: {
          actor: "agent",
          action: "Root cause identified",
          result: "N+1 database query introduced in checkout/order_service.py",
          details: { commit: "81ac2", confidence: "94%", service: "checkout-service" },
        },
      });

      /* STEP 6 — Patch generation */
      emit({ type: "phase", phase: "patch_generating" });
      if (!(await runStep("step_patch"))) return;
      emit({ type: "patch", patch: clone(demoPatch) });
      if (!(await finishStep("step_patch", 12_800))) return;
      emit({
        type: "audit",
        entry: {
          actor: "agent",
          action: "Patch generated",
          result: "Batched customer lookup · +17 / -9 lines in checkout/order_service.py",
          details: {
            file: "checkout/order_service.py",
            branch: "repomedic/inc-9001-batch-order-lookup",
            diff: "+17 / -9",
          },
        },
      });

      /* STEP 7 — Patch verification */
      emit({ type: "phase", phase: "verifying" });
      if (!(await runStep("step_verify"))) return;
      for (const run of verificationRuns) {
        await wait(pace.sandbox / 2, signal);
        if (!alive()) return;
        emit({ type: "sandbox.upsert", run: clone(run) });
      }
      emit({ type: "verification", verification: clone(demoVerification) });
      if (!(await finishStep("step_verify", 83_300))) return;
      emit({
        type: "audit",
        entry: {
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
        },
      });

      /* STEP 8 — Human approval gate (hard stop) */
      await wait(pace.stepStart, signal);
      if (!alive()) return;
      step("step_approval", {
        state: "blocked",
        startedAt: new Date().toISOString(),
        resultPreview: stepResultPreview["step_approval"] ?? "",
      });
      emit({ type: "approval.required", request: clone(demoApprovalRequest) });
      emit({
        type: "audit",
        entry: {
          actor: "agent",
          action: "Human approval requested",
          result: "Workflow paused — creating a pull request requires human authorization",
          status: "started",
          details: {
            action: "Create GitHub Pull Request",
            target: "checkout-service",
            risk: "Medium",
          },
        },
      });
    },

    async approve({ emit, signal }: RunDriverContext, note?: string) {
      emit({ type: "phase", phase: "creating_pr" });
      emit({
        type: "step.patch",
        id: "step_approval",
        patch: { state: "complete", durationMs: 0 },
      });
      emit({
        type: "audit",
        entry: {
          actor: "human",
          action: "PR creation approved",
          result: `Explicit user authorization received${note ? ` — “${note}”` : ""}`,
          status: "approved",
          details: {
            action: "Create GitHub Pull Request",
            decision: "Approved by human",
            ...(note ? { note } : {}),
          },
        },
      });
      emit({
        type: "step.patch",
        id: "step_pr",
        patch: { state: "running", startedAt: new Date().toISOString() },
      });

      await wait(pace.prCreation, signal);
      if (signal.aborted) return;

      emit({
        type: "step.patch",
        id: "step_pr",
        patch: {
          state: "complete",
          durationMs: 2_400,
          resultPreview: stepResultPreview["step_pr"] ?? "",
        },
      });
      emit({
        type: "step.tool_call",
        id: "step_pr",
        toolCall: {
          id: "tc_pr",
          provider: "github-mcp",
          tool: "create_pull_request",
          args: {
            repo: "acme/checkout-service",
            head: demoPatch.branch,
            base: demoPatch.baseBranch,
          },
          durationMs: 1_640,
          status: "ok",
          result: `PR #${demoPullRequest.number} opened · checks passing`,
        },
      });
      emit({ type: "pull_request", pullRequest: clone(demoPullRequest) });
      emit({ type: "phase", phase: "completed" });
      emit({
        type: "audit",
        entry: {
          actor: "tool",
          action: "Pull request created",
          result: `PR #${demoPullRequest.number} · ${demoPullRequest.title} · checks passing`,
          details: {
            tool: "github.create_pull_request",
            pull_request: `#${demoPullRequest.number}`,
            checks: "passing",
            status: "Ready for review",
          },
        },
      });
      emit({ type: "done" });
    },

    async reject({ emit }: RunDriverContext, note?: string) {
      emit({ type: "step.patch", id: "step_approval", patch: { state: "failed" } });
      emit({
        type: "step.patch",
        id: "step_pr",
        patch: {
          state: "pending",
          detail: "Not created — the human reviewer rejected the patch.",
        },
      });
      emit({
        type: "audit",
        entry: {
          actor: "human",
          action: "PR creation rejected",
          result: `Human reviewer declined the external action${note ? ` — “${note}”` : ""}`,
          status: "rejected",
          details: {
            action: "Create GitHub Pull Request",
            decision: "Rejected by human",
            ...(note ? { note } : {}),
          },
        },
      });
      emit({
        type: "audit",
        entry: {
          actor: "agent",
          action: "Workflow stopped",
          result: "No pull request was created and the patch branch was discarded",
          status: "failed",
        },
      });
      emit({ type: "phase", phase: "rejected" });
      emit({ type: "done" });
    },
  };
}
