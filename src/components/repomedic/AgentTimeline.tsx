import { useState } from "react";
import {
  BadgeCheck,
  Beaker,
  Check,
  ChevronRight,
  Github,
  LineChart,
  Loader2,
  PauseCircle,
  ShieldQuestion,
  Users2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill } from "./StatusPill";
import { Skeleton } from "@/components/ui/skeleton";
import type { StepCategory, StepState, TimelineStep } from "@/lib/repomedic/types";

const categoryMeta: Record<
  StepCategory,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  mcp_tool: { label: "MCP / TOOL", icon: Github },
  analysis: { label: "ANALYSIS", icon: LineChart },
  sandbox: { label: "SANDBOX", icon: Beaker },
  subagent: { label: "SUBAGENT", icon: Users2 },
  verification: { label: "VERIFICATION", icon: BadgeCheck },
  human_approval: { label: "HUMAN APPROVAL", icon: ShieldQuestion },
};

const stateLabel: Record<StepState, string> = {
  pending: "queued",
  running: "running",
  complete: "completed",
  blocked: "waiting-for-approval",
  failed: "failed",
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

function timeOf(iso: string) {
  return iso && iso.length >= 19 ? `${iso.slice(11, 19)}Z` : "—";
}

function StepCard({ step, index }: { step: TimelineStep; index: number }) {
  const [open, setOpen] = useState(step.state === "blocked");
  const meta = categoryMeta[step.category];
  const Icon = meta.icon;
  const hasCalls = step.toolCalls.length > 0;
  const active = step.state === "running" || step.state === "blocked";

  return (
    <li className="step-enter relative pl-11">
      <span
        aria-hidden
        className={cn(
          "absolute top-1 left-0 flex h-8 w-8 items-center justify-center rounded-full border transition-colors",
          step.state === "complete" && "border-signal/45 bg-signal/12 text-signal",
          step.state === "running" && "border-primary/50 bg-primary/12 text-primary",
          step.state === "blocked" && "border-caution/50 bg-caution/12 text-caution",
          step.state === "failed" && "border-critical/50 bg-critical/12 text-critical",
          step.state === "pending" && "border-border bg-muted text-muted-foreground",
        )}
      >
        {step.state === "complete" ? (
          <Check className="check-pop h-4 w-4" />
        ) : step.state === "running" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : step.state === "blocked" ? (
          <PauseCircle className="h-4 w-4" />
        ) : step.state === "failed" ? (
          <X className="h-4 w-4" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
      </span>

      <div
        className={cn(
          "panel relative overflow-hidden px-4 py-3 transition-shadow",
          step.state === "running" &&
            "border-primary/45 shadow-[0_0_0_1px_var(--color-primary)]/10",
          step.state === "blocked" && "border-caution/50",
          step.state === "pending" && "opacity-70",
        )}
      >
        {active && (
          <span
            aria-hidden
            className={cn(
              "run-sweep absolute inset-x-0 top-0 h-px",
              step.state === "blocked" && "opacity-60",
            )}
          />
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-mono text-[11px] text-muted-foreground">
            {String(index + 1).padStart(2, "0")}
          </span>
          <StatusPill tone={step.state === "blocked" ? "caution" : "muted"}>
            {meta.label}
          </StatusPill>
          <h3 className="text-sm font-semibold">{step.toolLabel}</h3>
          <StatusPill tone={stateTone[step.state]} dot pulse={active}>
            {stateLabel[step.state]}
          </StatusPill>
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {step.state === "pending"
              ? "queued"
              : step.state === "complete"
                ? `${formatDuration(step.durationMs)} · ${timeOf(step.startedAt)}`
                : timeOf(step.startedAt)}
          </span>
        </div>

        <p className="mt-2 text-sm leading-relaxed">{step.action}</p>

        {step.resultPreview && (
          <p
            className={cn(
              "mt-2 rounded-md border px-3 py-1.5 font-mono text-[11px] leading-relaxed",
              step.state === "blocked"
                ? "border-caution/35 bg-caution/8 text-caution"
                : "border-signal/30 bg-signal/8 text-signal",
            )}
          >
            {step.resultPreview}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded font-mono text-[11px] tracking-wide text-primary uppercase focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ChevronRight
              className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")}
              aria-hidden
            />
            {open ? "hide details" : "details"}
            {hasCalls
              ? ` · ${step.toolCalls.length} tool call${step.toolCalls.length > 1 ? "s" : ""}`
              : ""}
          </button>
          <span className="font-mono text-[11px] text-muted-foreground">agent: {step.agent}</span>
        </div>

        {open && (
          <div className="step-enter mt-3 space-y-2">
            <p className="text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
            {hasCalls ? (
              <ul className="space-y-2">
                {step.toolCalls.map((call) => (
                  <li
                    key={call.id}
                    className="step-enter rounded-md border border-border bg-background/50 px-3 py-2"
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
                    <dl className="mt-2 grid gap-1 font-mono text-[11px] sm:grid-cols-[84px_minmax(0,1fr)]">
                      <dt className="text-muted-foreground uppercase">Tool</dt>
                      <dd className="text-foreground">
                        {call.provider}.{call.tool}
                      </dd>
                      <dt className="text-muted-foreground uppercase">Input</dt>
                      <dd className="text-muted-foreground">
                        {Object.entries(call.args)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join("  ·  ")}
                      </dd>
                      <dt className="text-muted-foreground uppercase">Result</dt>
                      <dd className="text-foreground">{call.result}</dd>
                    </dl>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-mono text-[11px] text-muted-foreground">
                No tool calls recorded for this step.
              </p>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function AgentTimeline({ steps, isLoading }: { steps: TimelineStep[]; isLoading: boolean }) {
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

  const paused = steps.some((s) => s.state === "blocked");

  return (
    <div className="space-y-3">
      {paused && (
        <div className="step-enter flex flex-wrap items-center gap-3 rounded-lg border border-caution/50 bg-caution/10 px-4 py-3">
          <PauseCircle className="h-5 w-5 text-caution" aria-hidden />
          <p className="font-mono text-sm tracking-wide text-caution uppercase">
            ⏸ Workflow paused — waiting for human approval
          </p>
          <p className="text-sm text-muted-foreground">
            The agent stays paused until a human explicitly approves.
          </p>
        </div>
      )}
      <ol
        className="relative space-y-3 before:absolute before:top-2 before:bottom-2 before:left-4 before:w-px before:bg-border"
        aria-label="Investigation timeline"
      >
        {steps.map((step, i) => (
          <StepCard key={step.id} step={step} index={i} />
        ))}
      </ol>
    </div>
  );
}
