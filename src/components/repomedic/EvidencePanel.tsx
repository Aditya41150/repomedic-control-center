import { StatusPill } from "./StatusPill";
import { Progress } from "@/components/ui/progress";
import type { EvidenceItem } from "@/lib/repomedic/types";

const kindTone = {
  log: "critical",
  metric: "info",
  diff: "primary",
  trace: "signal",
  config: "caution",
} as const;

export function EvidencePanel({ evidence }: { evidence: EvidenceItem[] }) {
  if (evidence.length === 0) {
    return (
      <p className="panel px-4 py-10 text-center text-sm text-muted-foreground">
        No evidence collected yet. Items appear as subagents finish their reads.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {evidence.map((item) => (
        <li key={item.id} className="panel flex flex-col px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={kindTone[item.kind]}>{item.kind}</StatusPill>
            <span className="font-mono text-[11px] text-muted-foreground">{item.source}</span>
          </div>
          <h3 className="mt-2 text-sm font-medium">{item.label}</h3>
          <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {item.excerpt}
          </pre>
          <div className="mt-auto pt-3">
            <div className="flex items-center justify-between">
              <span className="label-caps">Confidence</span>
              <span className="font-mono text-xs">{Math.round(item.confidence * 100)}%</span>
            </div>
            <Progress value={item.confidence * 100} className="mt-1.5 h-1" />
          </div>
        </li>
      ))}
    </ul>
  );
}
