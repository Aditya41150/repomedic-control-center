import { Check, X, TrendingDown } from "lucide-react";
import type { VerificationReport } from "@/lib/repomedic/types";

export function VerificationPanel({ report }: { report: VerificationReport }) {
  return (
    <section aria-labelledby="verification-heading" className="panel px-5 py-4">
      <h3 id="verification-heading" className="label-caps">
        Patch verification
      </h3>
      <ul className="mt-3 grid gap-2 md:grid-cols-3">
        {report.suites.map((s) => (
          <li
            key={s.label}
            className="flex items-center gap-2 rounded-md border border-border bg-background/50 px-3 py-2"
          >
            {s.passed ? (
              <Check className="h-4 w-4 shrink-0 text-signal" aria-hidden />
            ) : (
              <X className="h-4 w-4 shrink-0 text-critical" aria-hidden />
            )}
            <span className="text-sm">{s.label}</span>
            <span className="ml-auto font-mono text-xs text-muted-foreground">{s.result}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-4 rounded-md border border-signal/30 bg-signal/8 px-4 py-3">
        <TrendingDown className="h-4 w-4 text-signal" aria-hidden />
        <div>
          <div className="label-caps">Before</div>
          <div className="font-mono text-sm">{report.latencyBefore}</div>
        </div>
        <div>
          <div className="label-caps">After</div>
          <div className="font-mono text-sm text-signal">{report.latencyAfter}</div>
        </div>
      </div>
    </section>
  );
}
