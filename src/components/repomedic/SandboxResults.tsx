import { StatusPill } from "./StatusPill";
import type { SandboxRun } from "@/lib/repomedic/types";

const tone = {
  passed: "signal",
  failed: "critical",
  running: "primary",
  skipped: "muted",
} as const;

function Group({ title, runs }: { title: string; runs: SandboxRun[] }) {
  if (runs.length === 0) return null;
  return (
    <div>
      <h3 className="label-caps">{title}</h3>
      <ul className="mt-2 space-y-2">
        {runs.map((run) => (
          <li key={run.id} className="panel px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={tone[run.status]} dot pulse={run.status === "running"}>
                {run.status}
              </StatusPill>
              <span className="text-sm font-medium">{run.name}</span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                {(run.durationMs / 1000).toFixed(1)}s
              </span>
            </div>
            <code className="mt-2 block font-mono text-[11px] text-primary">$ {run.command}</code>
            <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {run.output}
            </pre>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SandboxResults({ runs }: { runs: SandboxRun[] }) {
  if (runs.length === 0) {
    return (
      <p className="panel px-4 py-10 text-center text-sm text-muted-foreground">
        No sandbox runs yet. Reproduction starts once a candidate cause is identified.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <Group title="Reproduction" runs={runs.filter((r) => r.phase === "reproduction")} />
      <Group title="Patch verification" runs={runs.filter((r) => r.phase === "verification")} />
    </div>
  );
}
