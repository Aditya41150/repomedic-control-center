import { Bot, Check, GitMerge, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill } from "./StatusPill";
import type { SubagentTask } from "@/lib/repomedic/types";

const tone = {
  pending: "muted",
  running: "primary",
  complete: "signal",
  failed: "critical",
} as const;

const headline: Record<string, string> = {
  sa_app: "N+1 query suspected",
  sa_db: "101 queries/request confirmed",
  sa_deploy: "Regression introduced by 81ac2",
};

export function SubagentGrid({
  subagents,
  converged,
}: {
  subagents: SubagentTask[];
  converged?: string | undefined;
}) {
  if (subagents.length === 0) return null;

  return (
    <section aria-labelledby="subagents-heading" className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 id="subagents-heading" className="label-caps">
          Parallel subagent branches
        </h3>
        <StatusPill tone="primary">
          {subagents.filter((s) => s.state === "complete").length}/{subagents.length} reported
        </StatusPill>
      </div>

      {/* Branch fan-out */}
      <div className="relative">
        <div
          aria-hidden
          className="absolute inset-x-6 top-0 hidden h-6 border-t border-l border-r border-border md:block"
        />
        <ul className="grid gap-3 pt-0 md:grid-cols-3 md:pt-8">
          {subagents.map((sa) => (
            <li
              key={sa.id}
              className={cn(
                "panel step-enter relative flex flex-col overflow-hidden px-4 py-3",
                sa.state === "running" && "border-primary/45",
                sa.state === "complete" && "border-signal/35",
                sa.state === "pending" && "opacity-70",
              )}
            >
              {sa.state === "running" && (
                <span aria-hidden className="run-sweep absolute inset-x-0 top-0 h-px" />
              )}
              <div className="flex items-center gap-2">
                {sa.state === "running" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
                ) : sa.state === "complete" ? (
                  <Check className="check-pop h-4 w-4 text-signal" aria-hidden />
                ) : (
                  <Bot className="h-4 w-4 text-muted-foreground" aria-hidden />
                )}
                <h4 className="text-sm font-semibold">{sa.name}</h4>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusPill tone={tone[sa.state]} dot pulse={sa.state === "running"}>
                  {sa.state}
                </StatusPill>
                {sa.confidence !== undefined && (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {Math.round(sa.confidence * 100)}% confidence
                  </span>
                )}
              </div>

              {sa.state === "complete" && headline[sa.id] && (
                <p className="mt-2 font-mono text-[11px] text-signal">✓ {headline[sa.id]}</p>
              )}

              <p className="mt-2 font-mono text-[11px] text-muted-foreground">{sa.scope}</p>
              <p className="mt-3 text-sm leading-relaxed">
                {sa.finding ?? (
                  <span className="text-muted-foreground">
                    {sa.state === "running" ? "Investigating…" : "Queued."}
                  </span>
                )}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {converged && (
        <div className="step-enter space-y-0">
          <div
            aria-hidden
            className="mx-auto hidden h-6 w-px bg-gradient-to-b from-border to-signal/60 md:block"
          />
          <div className="rounded-lg border border-signal/40 bg-signal/8 px-4 py-4">
            <div className="flex items-center gap-2">
              <GitMerge className="h-4 w-4 text-signal" aria-hidden />
              <span className="font-mono text-[11px] tracking-[0.14em] text-signal uppercase">
                Subagent consensus
              </span>
            </div>
            <p className="mt-2 text-base leading-relaxed font-semibold">“{converged}”</p>
          </div>
        </div>
      )}
    </section>
  );
}
