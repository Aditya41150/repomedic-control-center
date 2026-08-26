import { Crosshair } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { StatusPill } from "./StatusPill";
import type { Hypothesis } from "@/lib/repomedic/types";

export function RootCauseCard({ hypothesis, commit }: { hypothesis: Hypothesis; commit: string }) {
  const confidence = Math.round(hypothesis.confidence * 100);
  return (
    <section
      aria-labelledby="rootcause-heading"
      className="panel grid-backdrop overflow-hidden border-critical/40"
    >
      <div className="bg-background/70 px-5 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <Crosshair className="h-4 w-4 text-critical" aria-hidden />
          <h2 id="rootcause-heading" className="label-caps">
            Root cause
          </h2>
          <StatusPill tone="critical">confirmed</StatusPill>
        </div>

        <p className="mt-3 text-xl leading-snug font-semibold tracking-tight text-balance">
          N+1 database query introduced in{" "}
          <code className="font-mono text-lg text-critical">checkout/order_service.py</code>
        </p>

        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {hypothesis.statement}
        </p>

        <div className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <div>
            <div className="label-caps">Commit</div>
            <div className="font-mono text-sm">{commit}</div>
          </div>
          <div>
            <div className="label-caps">Confidence</div>
            <div className="font-mono text-sm">{confidence}%</div>
            <Progress value={confidence} className="mt-1.5 h-1" />
          </div>
        </div>
      </div>
    </section>
  );
}
