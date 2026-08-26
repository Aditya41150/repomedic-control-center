import { useState } from "react";
import { Check, ExternalLink, Loader2, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StatusPill } from "./StatusPill";
import type { ApprovalGate as Gate } from "@/lib/repomedic/types";

export function ApprovalGatePanel({
  gate,
  onDecide,
  isSubmitting,
  error,
}: {
  gate: Gate;
  onDecide: (decision: "approve" | "reject", note: string) => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  const [note, setNote] = useState("");
  const blocking = gate.state === "pending";
  const allChecksPassed = gate.requiredChecks.every((c) => c.passed);

  return (
    <section
      aria-labelledby="approval-heading"
      className="panel overflow-hidden border-caution/45"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-caution/30 bg-caution/10 px-5 py-3">
        <ShieldAlert className="h-4 w-4 text-caution" aria-hidden />
        <h2 id="approval-heading" className="text-sm font-semibold">
          Human approval gate
        </h2>
        <StatusPill
          tone={gate.state === "approved" ? "signal" : gate.state === "rejected" ? "critical" : "caution"}
          dot
          pulse={blocking}
        >
          {gate.state}
        </StatusPill>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          no pull request is created without an explicit decision
        </span>
      </div>

      <div className="px-5 py-4">
        {gate.requiredChecks.length > 0 ? (
          <ul className="grid gap-2 md:grid-cols-2">
            {gate.requiredChecks.map((c) => (
              <li key={c.label} className="flex items-center gap-2 text-sm">
                {c.passed ? (
                  <Check className="h-4 w-4 shrink-0 text-signal" aria-hidden />
                ) : (
                  <X className="h-4 w-4 shrink-0 text-critical" aria-hidden />
                )}
                <span className={c.passed ? "text-muted-foreground" : "text-foreground"}>
                  {c.label}
                </span>
                <span className="sr-only">{c.passed ? "passed" : "failed"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Pre-flight checks are still being collected. Approval unlocks when the patch has been
            verified in the sandbox.
          </p>
        )}

        {blocking && (
          <div className="mt-5 space-y-3">
            <div>
              <Label htmlFor="approval-note" className="label-caps">
                Reviewer note (optional)
              </Label>
              <Textarea
                id="approval-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Context recorded on the pull request and in the incident log…"
                className="mt-1.5 min-h-20 font-mono text-xs"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-critical">
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => onDecide("approve", note)}
                disabled={isSubmitting || !allChecksPassed || gate.requiredChecks.length === 0}
                className="min-w-52"
              >
                {isSubmitting ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Check aria-hidden />
                )}
                Approve &amp; create pull request
              </Button>
              <Button
                variant="outline"
                onClick={() => onDecide("reject", note)}
                disabled={isSubmitting}
              >
                <X aria-hidden />
                Reject patch
              </Button>
              {!allChecksPassed && gate.requiredChecks.length > 0 && (
                <span className="text-xs text-caution">
                  Approval is locked until every pre-flight check passes.
                </span>
              )}
            </div>
          </div>
        )}

        {gate.state === "approved" && (
          <div className="mt-5 rounded-md border border-signal/35 bg-signal/8 px-4 py-3">
            <p className="text-sm">
              Approved by {gate.decidedBy}. RepoMedic pushed the branch and opened a pull request.
            </p>
            {gate.pullRequestUrl && (
              <a
                href={gate.pullRequestUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 font-mono text-xs text-primary underline underline-offset-4"
              >
                {gate.pullRequestUrl}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
            {gate.note && (
              <p className="mt-2 font-mono text-xs text-muted-foreground">“{gate.note}”</p>
            )}
          </div>
        )}

        {gate.state === "rejected" && (
          <div className="mt-5 rounded-md border border-critical/35 bg-critical/8 px-4 py-3">
            <p className="text-sm">
              Rejected by {gate.decidedBy}. No pull request was created and the patch branch was
              discarded.
            </p>
            {gate.note && (
              <p className="mt-2 font-mono text-xs text-muted-foreground">“{gate.note}”</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
