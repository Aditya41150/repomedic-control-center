import { useState } from "react";
import {
  BadgeCheck,
  Beaker,
  ChevronRight,
  GitPullRequest,
  Github,
  LineChart,
  ShieldQuestion,
  Users2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill } from "./StatusPill";
import { Skeleton } from "@/components/ui/skeleton";
import type { StepKind, StepState, TimelineStep } from "@/lib/repomedic/types";

const kindIcon: Record<StepKind, React.ComponentType<{ className?: string }>> = {
  investigation: Github,
  telemetry: LineChart,
  sandbox: Beaker,
  subagent: Users2,
  verification: BadgeCheck,
  approval: ShieldQuestion,
  pull_request: GitPullRequest,
};

const stateTone: Record<StepState, "signal" | "primary" | "caution" | "muted" | "critical"> = {
  complete: "signal",
  running: "primary",
  blocked: "caution",
  pending: "muted",
  failed: "critical",
};

function formatDuration(ms: number) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

function StepCard({ step, index }: { step: TimelineStep; index: number }) {
  const [open, setOpen] = useState(step.state === "blocked");
  const Icon = kindIcon[step.kind];
  const hasCalls = step.toolCalls.length > 0;

  return (
    <li className="relative pl-11">
      <span
        aria-hidden
        className={cn(
          "absolute top-1 left-0 flex h-8 w-8 items-center justify-center rounded-full border",
          step.state === "complete" && "border-signal/45 bg-signal/12 text-signal",
          step.state === "running" && "border-primary/50 bg-primary/12 text-primary",
          step.state === "blocked" && "border-caution/50 bg-caution/12 text-caution",
          step.state === "failed" && "border-critical/50 bg-critical/12 text-critical",
          step.state === "pending" && "border-border bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="panel px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-mono text-[11px] text-muted-foreground">
            {String(index + 1).padStart(2, "0")}
          </span>
          <h3 className="text-sm font-semibold">{step.title}</h3>
          <StatusPill tone={stateTone[step.state]} dot pulse={step.state === "running"}>
            {step.state}
          </StatusPill>
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {step.agent} · {formatDuration(step.durationMs)}
          </span>
        </div>

        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>

        {hasCalls && (
          <>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded font-mono text-[11px] tracking-wide text-primary uppercase focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ChevronRight
                className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")}
                aria-hidden
              />
              {step.toolCalls.length} tool call{step.toolCalls.length > 1 ? "s" : ""}
            </button>

            {open && (
              <ul className="mt-3 space-y-2">
                {step.toolCalls.map((call) => (
                  <li
                    key={call.id}
                    className="rounded-md border border-border bg-background/50 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={call.status === "ok" ? "signal" : "critical"}>
                        {call.status}
                      </StatusPill>
                      <code className="font-mono text-xs text-foreground">
                        {call.provider}.{call.tool}
                      </code>
                      <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                        {formatDuration(call.durationMs)}
                      </span>
                    </div>
                    <pre className="mt-2 overflow-x-auto font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {JSON.stringify(call.args)}
                    </pre>
                    <p className="mt-1.5 font-mono text-xs">{call.result}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </li>
  );
}

export function AgentTimeline({
  steps,
  isLoading,
}: {
  steps: TimelineStep[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (steps.length === 0) {
    return (
      <p className="panel px-4 py-10 text-center text-sm text-muted-foreground">
        No agent activity recorded yet for this incident.
      </p>
    );
  }

  return (
    <ol className="relative space-y-3 before:absolute before:top-2 before:bottom-2 before:left-4 before:w-px before:bg-border">
      {steps.map((step, i) => (
        <StepCard key={step.id} step={step} index={i} />
      ))}
    </ol>
  );
}
