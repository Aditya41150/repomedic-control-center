import { Loader2, Play, RotateCcw, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "./StatusPill";
import { demoFacts } from "@/lib/repomedic/demo-script";
import { isBusyPhase, type RunPhase } from "@/lib/repomedic/types";
import type { RunMode } from "@/lib/repomedic/run-driver";

const phaseLabel: Record<RunPhase, string> = {
  idle: "investigation ready",
  investigating: "repository forensics",
  analyzing: "analysing telemetry",
  subagents_running: "subagents investigating",
  sandbox_running: "sandbox reproduction",
  patch_generating: "generating patch",
  verifying: "verifying patch",
  waiting_for_approval: "awaiting human approval",
  creating_pr: "creating pull request",
  completed: "pull request opened",
  rejected: "rejected by human",
  error: "run failed",
};

const phaseTone: Record<RunPhase, "muted" | "primary" | "caution" | "signal" | "critical"> = {
  idle: "muted",
  investigating: "primary",
  analyzing: "primary",
  subagents_running: "primary",
  sandbox_running: "primary",
  patch_generating: "primary",
  verifying: "primary",
  waiting_for_approval: "caution",
  creating_pr: "primary",
  completed: "signal",
  rejected: "critical",
  error: "critical",
};

export function RunControlBar({
  phase,
  hasPullRequest,
  onStart,
  onReset,
  mode,
  onModeChange,
}: {
  phase: RunPhase;
  hasPullRequest: boolean;
  onStart: () => void;
  onReset: () => void;
  mode: RunMode;
  onModeChange: (mode: RunMode) => void;
}) {
  const busy = isBusyPhase(phase);
  const started = phase !== "idle";
  const statusLabel =
    phase === "completed" && !hasPullRequest ? "investigation completed" : phaseLabel[phase];

  return (
    <section className="panel grid-backdrop overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 bg-background/70 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/40 bg-primary/12 text-primary">
          <Stethoscope className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-48">
          <p className="text-sm font-semibold tracking-tight">Autonomous investigation</p>
          <p className="font-mono text-[11px] text-muted-foreground">
            8 stages · stops at the human approval gate
          </p>
        </div>

        <ul className="flex flex-wrap items-center gap-4">
          {demoFacts.map((f) => (
            <li key={f.label}>
              <div className="label-caps">{f.label}</div>
              <div className="font-mono text-sm">{f.value}</div>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label="Execution mode"
            className="flex items-center gap-1 rounded-md border border-border bg-background/60 p-1"
          >
            {(["demo", "trueforge"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onModeChange(m)}
                disabled={busy}
                aria-pressed={mode === m}
                className={`rounded px-2 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors disabled:opacity-50 ${
                  mode === m
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "demo" ? "demo" : "trueforge"}
              </button>
            ))}
          </div>
          <StatusPill tone={phaseTone[phase]} dot pulse={busy}>
            {statusLabel}
          </StatusPill>
          <Button onClick={onStart} disabled={busy || started} size="lg" data-testid="investigate">
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
            Investigate Incident
          </Button>
          {started && (
            <Button variant="outline" onClick={onReset} disabled={phase === "creating_pr"}>
              <RotateCcw aria-hidden />
              Reset demo
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
