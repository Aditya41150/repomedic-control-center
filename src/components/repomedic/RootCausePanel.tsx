import { Check, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { StatusPill } from "./StatusPill";
import type { Hypothesis } from "@/lib/repomedic/types";

export function RootCausePanel({ hypothesis }: { hypothesis: Hypothesis }) {
  if (!hypothesis.statement) {
    return (
      <p className="panel px-4 py-10 text-center text-sm text-muted-foreground">
        No root-cause hypothesis yet. RepoMedic publishes one once subagent findings converge.
      </p>
    );
  }

  return (
    <div className="panel px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="label-caps">Root-cause hypothesis</h3>
        <StatusPill tone={hypothesis.confidence >= 0.85 ? "signal" : "caution"}>
          {Math.round(hypothesis.confidence * 100)}% confidence
        </StatusPill>
      </div>
      <Progress value={hypothesis.confidence * 100} className="mt-3 h-1" />

      <p className="mt-4 text-sm leading-relaxed">{hypothesis.statement}</p>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <h4 className="label-caps">Supporting reasoning</h4>
          <ul className="mt-2 space-y-2">
            {hypothesis.reasoning.map((r) => (
              <li key={r} className="flex gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-signal" aria-hidden />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="label-caps">Ruled out</h4>
          <ul className="mt-2 space-y-2">
            {hypothesis.ruledOut.map((r) => (
              <li key={r.claim} className="flex gap-2 text-sm text-muted-foreground">
                <X className="mt-0.5 h-4 w-4 shrink-0 text-critical" aria-hidden />
                <span>
                  <span className="text-foreground">{r.claim}</span> — {r.because}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5 rounded-md border border-caution/35 bg-caution/8 px-4 py-3">
        <h4 className="label-caps">Blast radius</h4>
        <p className="mt-1 text-sm text-muted-foreground">{hypothesis.blastRadius}</p>
      </div>
    </div>
  );
}
