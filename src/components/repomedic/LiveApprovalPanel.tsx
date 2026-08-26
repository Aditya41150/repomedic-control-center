import { useState } from "react";
import {
  Check,
  ExternalLink,
  GitPullRequest,
  Loader2,
  RotateCcw,
  ShieldAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StatusPill } from "./StatusPill";
import type { PatchSummary, PullRequestResult, RunPhase, VerificationReport } from "@/lib/repomedic/types";

export function LiveApprovalPanel({
  phase,
  checks,
  patch,
  verification,
  pullRequest,
  onApprove,
  onReject,
  onReset,
}: {
  phase: RunPhase;
  checks: Array<{ label: string; passed: boolean }>;
  patch: PatchSummary;
  verification: VerificationReport | null;
  pullRequest: PullRequestResult | null;
  onApprove: (note: string) => void;
  onReject: (note: string) => void;
  onReset: () => void;
}) {
  const [note, setNote] = useState("");
  const pending = phase === "awaiting_approval";
  const busy = phase === "creating_pr";

  return (
    <section
      aria-labelledby="approval-heading"
      aria-live="polite"
      className={`panel overflow-hidden ${
        phase === "rejected"
          ? "border-critical/45"
          : phase === "approved"
            ? "border-signal/45"
            : "border-caution/45"
      }`}
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-caution/30 bg-caution/10 px-5 py-3">
        <ShieldAlert className="h-4 w-4 text-caution" aria-hidden />
        <h2 id="approval-heading" className="text-sm font-semibold tracking-tight">
          HUMAN APPROVAL REQUIRED
        </h2>
        <StatusPill
          tone={phase === "approved" ? "signal" : phase === "rejected" ? "critical" : "caution"}
          dot
          pulse={pending || busy}
        >
          {phase === "approved"
            ? "approved"
            : phase === "rejected"
              ? "rejected"
              : busy
                ? "creating pull request"
                : "awaiting decision"}
        </StatusPill>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          no pull request is created without an explicit decision
        </span>
      </div>

      <div className="px-5 py-4">
        <p className="text-sm">
          <span className="label-caps mr-2">Action</span>
          Create a pull request containing the verified production fix.
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-border bg-background/50 px-4 py-3">
            <h3 className="label-caps">Proposed changes</h3>
            <p className="mt-2 font-mono text-xs">{patch.title}</p>
            <ul className="mt-2 space-y-1">
              {patch.filesChanged.map((f) => (
                <li key={f.path} className="font-mono text-[11px] text-muted-foreground">
                  {f.path} <span className="text-signal">+{f.additions}</span>{" "}
                  <span className="text-critical">-{f.deletions}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-muted-foreground">{patch.rationale}</p>
          </div>

          <div className="rounded-md border border-border bg-background/50 px-4 py-3">
            <h3 className="label-caps">Verification results</h3>
            <ul className="mt-2 space-y-1.5">
              {(verification?.suites ?? []).map((s) => (
                <li key={s.label} className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-signal" aria-hidden />
                  {s.label}
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {s.result}
                  </span>
                </li>
              ))}
            </ul>
            {verification && (
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                p95 {verification.latencyBefore} → {verification.latencyAfter}
              </p>
            )}
          </div>
        </div>

        <ul className="mt-4 grid gap-2 md:grid-cols-2">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2 text-sm text-muted-foreground">
              <Check className="h-4 w-4 shrink-0 text-signal" aria-hidden />
              {c.label}
            </li>
          ))}
        </ul>

        {(pending || busy) && (
          <div className="mt-5 space-y-3">
            <div>
              <Label htmlFor="approval-note" className="label-caps">
                Reviewer note (optional)
              </Label>
              <Textarea
                id="approval-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={busy}
                placeholder="Context recorded on the pull request and in the incident log…"
                className="mt-1.5 min-h-20 font-mono text-xs"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => onApprove(note)}
                disabled={busy}
                className="min-w-56"
                data-testid="approve-pr"
              >
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
                {busy ? "Creating pull request…" : "Approve & Create PR"}
              </Button>
              <Button variant="outline" onClick={() => onReject(note)} disabled={busy}>
                <X aria-hidden />
                Reject
              </Button>
            </div>
          </div>
        )}

        {phase === "approved" && pullRequest && (
          <div className="mt-5 rounded-md border border-signal/35 bg-signal/8 px-4 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <GitPullRequest className="h-4 w-4 text-signal" aria-hidden />
              <span className="font-mono text-sm font-semibold">PR #{pullRequest.number}</span>
              <span className="text-sm">{pullRequest.title}</span>
              <StatusPill tone="signal" dot>
                checks {pullRequest.checks}
              </StatusPill>
              <StatusPill tone="primary">{pullRequest.status}</StatusPill>
            </div>
            <a
              href={pullRequest.url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 font-mono text-xs text-primary underline underline-offset-4"
            >
              {pullRequest.url}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">
              Recorded: human approved PR creation.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={onReset}>
              <RotateCcw aria-hidden />
              Reset demo
            </Button>
          </div>
        )}

        {phase === "rejected" && (
          <div className="mt-5 rounded-md border border-critical/35 bg-critical/8 px-4 py-4">
            <p className="text-sm font-medium">Human rejected action.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The workflow stopped at the approval gate. No pull request was created and the patch
              branch was discarded.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={onReset}>
              <RotateCcw aria-hidden />
              Reset demo
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
