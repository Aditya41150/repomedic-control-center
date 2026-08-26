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

const entry = (message: string, actor: AuditEntry["actor"] = "agent"): AuditEntry => ({
  at: new Date().toISOString(),
  message,
  actor,
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
    const log = (message: string, actor: AuditEntry["actor"] = "agent") =>
      update((prev) => ({ ...prev, auditLog: [...prev.auditLog, entry(message, actor)] }));
    return { alive, wait, update, patchStep, log };
  }, []);

  const start = useCallback(async () => {
    if (running.current) return; // prevents duplicate runs
    running.current = true;
    const token = ++runToken.current;
    const { alive, wait, update, patchStep, log } = makeCtx(token);

    try {
      update(() => ({
        ...clone(initialRunState),
        phase: "running",
        steps: clone(stepBlueprints),
        subagents: clone(subagentBlueprints),
        auditLog: [entry("Investigation started by on-call engineer", "human")],
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
      log("Repository forensics complete · deploy d-7741 at commit 81ac2 flagged");

      /* STEP 2 — Metrics + logs */
      if (!(await runStep("step_telemetry"))) return;
      if (!(await finishStep("step_telemetry", 11_200))) return;
      log("Telemetry correlated · latency step change follows the deployment");

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
        log(`${sa.name} reported a finding`);
      }

      if (!(await finishStep("step_subagents", 14_600))) return;
      log(`Subagents converged: ${CONVERGED_FINDING}`);

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
      log("Failure reproduced deterministically in sandbox sbx-9a12");

      /* STEP 5 — Root cause */
      if (!(await runStep("step_rootcause"))) return;
      update((prev) => ({ ...prev, hypothesis: clone(demoHypothesis) }));
      if (!(await finishStep("step_rootcause", 4_100))) return;
      log(`Root cause established (94% confidence) · commit 81ac2`);

      /* STEP 6 — Patch generation */
      if (!(await runStep("step_patch"))) return;
      update((prev) => ({ ...prev, patch: clone(demoPatch) }));
      if (!(await finishStep("step_patch", 12_800))) return;
      log("Patch generated on branch repomedic/inc-9001-batch-order-lookup");

      /* STEP 7 — Patch verification */
      if (!(await runStep("step_verify"))) return;
      for (const run of verificationRuns) {
        await wait(pace.sandbox / 2);
        if (!alive()) return;
        update((prev) => ({ ...prev, sandboxRuns: [...prev.sandboxRuns, clone(run)] }));
      }
      update((prev) => ({ ...prev, verification: clone(demoVerification) }));
      if (!(await finishStep("step_verify", 83_300))) return;
      log("Patch verified · p95 2.91s → 0.84s");

      /* STEP 8 — Human approval gate (hard stop) */
      await wait(pace.stepStart);
      if (!alive()) return;
      patchStep("step_approval", {
        state: "blocked",
        startedAt: new Date().toISOString(),
        resultPreview: stepResultPreview["step_approval"] ?? "",
      });
      update((prev) => ({ ...prev, phase: "awaiting_approval" }));
      log("Human approval required before creating a pull request");
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
    log("Human approval recorded — external action authorised", "human");
    log(`Human approved PR creation${note ? ` — “${note}”` : ""}`, "human");
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
    log(`Pull request #${demoPullRequest.number} created · checks passing`);
  }, [makeCtx]);

  const reject = useCallback((note?: string) => {
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
        entry(`Human rejected action${note ? ` — “${note}”` : ""}`, "human"),
        entry("Workflow stopped. No pull request was created and the patch branch was discarded."),
      ],
    }));
  }, []);

  const reset = useCallback(() => {
    runToken.current += 1;
    running.current = false;
    setState(clone(initialRunState));
  }, []);

  return { state, start, approve, reject, reset };
}
