import { FileDiff, GitBranch } from "lucide-react";
import { StatusPill } from "./StatusPill";
import type { PatchSummary } from "@/lib/repomedic/types";

const riskTone = { low: "signal", medium: "caution", high: "critical" } as const;

export function PatchPanel({ patch }: { patch: PatchSummary }) {
  if (!patch.branch) {
    return (
      <p className="panel px-4 py-10 text-center text-sm text-muted-foreground">
        No candidate patch generated yet.
      </p>
    );
  }

  const additions = patch.filesChanged.reduce((n, f) => n + f.additions, 0);
  const deletions = patch.filesChanged.reduce((n, f) => n + f.deletions, 0);

  return (
    <div className="panel px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold">{patch.title}</h3>
        <StatusPill tone={riskTone[patch.riskLevel]}>{patch.riskLevel} risk</StatusPill>
        <StatusPill tone="info">+{patch.testsAdded} tests</StatusPill>
        <span className="ml-auto font-mono text-[11px] text-signal">
          +{additions} <span className="text-critical">−{deletions}</span>
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
        <GitBranch className="h-3.5 w-3.5" aria-hidden />
        {patch.branch} → {patch.baseBranch}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{patch.rationale}</p>

      <ul className="mt-4 space-y-2">
        {patch.filesChanged.map((f) => (
          <li key={f.path} className="rounded-md border border-border bg-background/50 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <FileDiff className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <code className="font-mono text-xs">{f.path}</code>
              <span className="ml-auto font-mono text-[11px] text-signal">
                +{f.additions} <span className="text-critical">−{f.deletions}</span>
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{f.note}</p>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <h4 className="label-caps">Unified diff</h4>
        <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-background/60 p-4 font-mono text-[11px] leading-relaxed">
          {patch.diff.split("\n").map((line, i) => (
            <div
              key={i}
              className={
                line.startsWith("+") && !line.startsWith("+++")
                  ? "text-signal"
                  : line.startsWith("-") && !line.startsWith("---")
                    ? "text-critical"
                    : line.startsWith("@@")
                      ? "text-info"
                      : "text-muted-foreground"
              }
            >
              {line || " "}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
