import { Bot, Loader2 } from "lucide-react";
import { StatusPill } from "./StatusPill";
import type { SubagentTask } from "@/lib/repomedic/types";

const tone = {
  pending: "muted",
  running: "primary",
  complete: "signal",
  failed: "critical",
} as const;

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
      <h3 id="subagents-heading" className="label-caps">
        Parallel subagents
      </h3>
      <ul className="grid gap-3 md:grid-cols-3">
        {subagents.map((sa) => (
          <li key={sa.id} className="panel flex flex-col px-4 py-3">
            <div className="flex items-center gap-2">
              {sa.state === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
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

      {converged && (
        <p className="rounded-md border border-signal/35 bg-signal/8 px-4 py-3 text-sm">
          <span className="label-caps mr-2">Converged finding</span>
          {converged}
        </p>
      )}
    </section>
  );
}
