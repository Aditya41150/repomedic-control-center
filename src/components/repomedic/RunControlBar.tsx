import { Loader2, Play, RotateCcw, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "./StatusPill";
import { demoFacts } from "@/lib/repomedic/demo-script";
import type { RunPhase } from "@/lib/repomedic/types";

const phaseLabel: Record<RunPhase, string> = {
  idle: "investigation ready",
  running: "agent working",
  awaiting_approval: "awaiting human approval",
  creating_pr: "creating pull request",
  approved: "pull request opened",
  rejected: "rejected by human",
  error: "run failed",
};

const phaseTone: Record<RunPhase, "muted" | "primary" | "caution" | "signal" | "critical"> = {
  idle: "muted",
  running: "primary",
  awaiting_approval: "caution",
  creating_pr: "primary",
  approved: "signal",
  rejected: "critical",
  error: "critical",
};

export function RunControlBar({
  phase,
  onStart,
  onReset,
}: {
  phase: RunPhase;
  onStart: () => void;
  onReset: () => void;
}) {
  const busy = phase === "running" || phase === "creating_pr";
  const started = phase !== "idle";

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
          <StatusPill tone={phaseTone[phase]} dot pulse={busy}>
            {phaseLabel[phase]}
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
