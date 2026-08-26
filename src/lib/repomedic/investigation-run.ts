import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createDemoDriver } from "./demo-driver";
import { createTrueForgeDriver } from "./trueforge-client-driver";
import {
  applyRunEvent,
  auditEntry,
  defaultRunMode,
  type RunDriver,
  type RunEvent,
  type RunMode,
} from "./run-driver";
import type { RunState } from "./types";

/**
 * Central workflow state for one investigation run.
 *
 * The hook owns state, safety guards and phase transitions. *How* the run executes lives
 * behind `RunDriver`: `createDemoDriver()` replays the deterministic script offline,
 * `createTrueForgeDriver()` streams real harness events through our server route. The
 * presentation components consume the same `RunState` either way.
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
  approvalRequest: null,
  error: null,
};

export function useInvestigationRun(initialMode: RunMode = defaultRunMode()) {
  const [mode, setMode] = useState<RunMode>(initialMode);
  const [state, setState] = useState<RunState>(initialRunState);
  /** Mirrors state.phase so guards can read it synchronously. */
  const phaseRef = useRef<RunState["phase"]>("idle");
  const running = useRef(false);
  /** True once the human has approved or rejected — blocks any second decision. */
  const decided = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  const driver = useMemo<RunDriver>(
    () => (mode === "trueforge" ? createTrueForgeDriver() : createDemoDriver()),
    [mode],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  const makeCtx = useCallback(() => {
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    const emit = (event: RunEvent) => {
      if (!mounted.current || ac.signal.aborted) return;
      setState((prev) => {
        const next = applyRunEvent(prev, event);
        phaseRef.current = next.phase;
        return next;
      });
    };
    return { emit, signal: ac.signal };
  }, []);

  const fail = useCallback((message: string) => {
    if (!mounted.current) return;
    phaseRef.current = "error";
    setState((prev) => ({ ...prev, phase: "error", error: message }));
  }, []);

  const start = useCallback(async () => {
    // Guards: no duplicate runs, and no restart over a run in any other phase.
    if (running.current || phaseRef.current !== "idle") return;
    running.current = true;
    decided.current = false;

    const ctx = makeCtx();
    setState(clone(initialRunState));
    phaseRef.current = "idle";

    try {
      await driver.start(ctx);
    } catch {
      fail("The investigation run failed unexpectedly. Reset the demo and try again.");
    } finally {
      running.current = false;
    }
  }, [driver, fail, makeCtx]);

  const approve = useCallback(
    async (note?: string) => {
      // The external action can be authorised exactly once, only from the paused gate.
      if (decided.current || phaseRef.current !== "waiting_for_approval") return;
      decided.current = true;
      const ctx = makeCtx();
      try {
        await driver.approve(ctx, note);
      } catch {
        fail("The approval could not be delivered. Reset the demo and try again.");
      }
    },
    [driver, fail, makeCtx],
  );

  const reject = useCallback(
    async (note?: string) => {
      if (decided.current || phaseRef.current !== "waiting_for_approval") return;
      decided.current = true;
      const ctx = makeCtx();
      try {
        await driver.reject(ctx, note);
      } catch {
        fail("The rejection could not be delivered. Reset the demo and try again.");
      }
    },
    [driver, fail, makeCtx],
  );

  const reset = useCallback(() => {
    // Works from every phase: cancels any in-flight run and restores the
    // pristine state (incident, timeline, evidence, patch, PR, audit).
    controller.current?.abort();
    controller.current = null;
    running.current = false;
    decided.current = false;
    phaseRef.current = "idle";
    setState(clone(initialRunState));
  }, []);

  /** Clears a failed/finished run and immediately starts a fresh one. */
  const retry = useCallback(() => {
    reset();
    setTimeout(() => void start(), 0);
  }, [reset, start]);

  /** Switching harness mode always returns to a clean, un-started state. */
  const changeMode = useCallback(
    (next: RunMode) => {
      if (next === mode) return;
      reset();
      setMode(next);
    },
    [mode, reset],
  );

  return { state, mode, setMode: changeMode, start, approve, reject, reset, retry };
}

export { auditEntry };
