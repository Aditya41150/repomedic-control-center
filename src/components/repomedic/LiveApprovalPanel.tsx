import { useState } from "react";
import {
  Check,
  ChevronDown,
  CircleSlash,
  ExternalLink,
  GitPullRequest,
  Loader2,
  Lock,
  PauseCircle,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StatusPill } from "./StatusPill";
import { approvalRequest } from "@/lib/repomedic/evidence-board";
import type { PatchSummary, PullRequestResult, RunPhase, VerificationReport } from "@/lib/repomedic/types";

function Fact({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="label-caps">{label}</div>
      <div className={`mt-0.5 font-mono text-sm ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

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
  const [why, setWhy] = useState(false);
  const [submitting, setSubmitting] = useState<"approve" | "reject" | null>(null);

  const pending = phase === "waiting_for_approval";
  const busy = phase === "creating_pr";
  const locked = busy || submitting !== null;

  const decide = (decision: "approve" | "reject") => {
    if (locked || !pending) return; // no double submissions
    setSubmitting(decision);
    if (decision === "approve") onApprove(note);
    else onReject(note);
  };

  const accent =
    phase === "rejected"
      ? "border-critical/50"
      : phase === "completed"
        ? "border-signal/50"
        : "border-caution/55";

  return (
    <section
      aria-labelledby="approval-heading"
      aria-live="polite"
      className={`panel step-enter overflow-hidden ${accent}`}
      data-testid="approval-gate"
    >
      {/* ---- Banner: the workflow is halted at the safety boundary ---- */}
      {(pending || busy) && (
        <div className="border-b border-caution/35 bg-caution/12 px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <PauseCircle className="h-5 w-5 text-caution" aria-hidden />
            <h2 id="approval-heading" className="text-base font-semibold tracking-tight">
              WORKFLOW PAUSED — WAITING FOR HUMAN APPROVAL
            </h2>
            <StatusPill tone="caution" dot pulse>
              {busy ? "processing decision" : "agent halted"}
            </StatusPill>
            <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              external action boundary
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {approvalRequest.pausedExplanation}
          </p>
        </div>
      )}

      {phase === "completed" && (
        <div className="flex flex-wrap items-center gap-3 border-b border-signal/35 bg-signal/10 px-5 py-3">
          <ShieldCheck className="h-5 w-5 text-signal" aria-hidden />
          <h2 id="approval-heading" className="text-base font-semibold tracking-tight">
            HUMAN APPROVAL RECORDED
          </h2>
          <StatusPill tone="signal" dot>
            authorized
          </StatusPill>
        </div>
      )}

      {phase === "rejected" && (
        <div className="flex flex-wrap items-center gap-3 border-b border-critical/35 bg-critical/10 px-5 py-3">
          <CircleSlash className="h-5 w-5 text-critical" aria-hidden />
          <h2 id="approval-heading" className="text-base font-semibold tracking-tight">
            REJECTED BY HUMAN
          </h2>
          <StatusPill tone="critical" dot>
            workflow stopped
          </StatusPill>
        </div>
      )}

      <div className="px-5 py-5">
        {/* ---- Action request ---- */}
        <div className="rounded-md border border-border bg-background/60 px-4 py-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="label-caps">Action requested</span>
            <span className="font-mono text-sm font-semibold text-foreground">
              {approvalRequest.action}
            </span>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Target" value={approvalRequest.target} />
            <Fact label="Risk" value={approvalRequest.risk} tone="text-caution" />
            <Fact label="Reversibility" value={approvalRequest.reversibility} tone="text-signal" />
            <Fact label="Branch" value={patch.branch} />
          </div>
          <div className="mt-4">
            <div className="label-caps">Proposed change</div>
            <p className="mt-0.5 text-sm">{approvalRequest.proposedChange}</p>
            <p className="mt-1 text-xs text-muted-foreground">{approvalRequest.note}</p>
          </div>
        </div>

        {/* ---- Evidence before approval ---- */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="rounded-md border border-border bg-background/50 px-4 py-4">
            <h3 className="label-caps">Evidence supporting this action</h3>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {approvalRequest.evidence.map((e) => (
                <li key={e} className="flex items-center gap-2 text-sm">
                  <Check className="check-pop h-4 w-4 shrink-0 text-signal" aria-hidden />
                  {e}
                </li>
              ))}
            </ul>
            <ul className="mt-3 grid gap-1.5">
              {checks
                .filter((c) => c.passed)
                .slice(0, 2)
                .map((c) => (
                  <li key={c.label} className="font-mono text-[11px] text-muted-foreground">
                    · {c.label}
                  </li>
                ))}
              {patch.filesChanged.map((f) => (
                <li key={f.path} className="font-mono text-[11px] text-muted-foreground">
                  · {f.path} <span className="text-signal">+{f.additions}</span>{" "}
                  <span className="text-critical">-{f.deletions}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-md border border-border bg-background/50 px-4 py-4">
            <h3 className="label-caps">Latency impact</h3>
            <div className="mt-3 space-y-3">
              <div>
                <div className="label-caps text-critical">Before</div>
                <div className="font-mono text-lg">
                  {verification?.latencyBefore ?? approvalRequest.latencyBefore}
                </div>
              </div>
              <div>
                <div className="label-caps text-signal">After</div>
                <div className="font-mono text-lg text-signal">
                  {verification?.latencyAfter ?? approvalRequest.latencyAfter}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ---- Why approval is required ---- */}
        <div className="mt-4 rounded-md border border-border bg-background/40">
          <button
            type="button"
            onClick={() => setWhy((v) => !v)}
            aria-expanded={why}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium"
          >
            <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
            Why is approval required?
            <ChevronDown
              className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${why ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          {why && (
            <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
              {approvalRequest.whyExplanation}
            </p>
          )}
        </div>

        {/* ---- Explicit human decision ---- */}
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
                disabled={locked}
                placeholder="Context recorded on the pull request and in the incident log…"
                className="mt-1.5 min-h-20 font-mono text-xs"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row-reverse sm:items-center sm:justify-end">
              <Button
                onClick={() => decide("approve")}
                disabled={locked}
                size="lg"
                className="sm:min-w-60"
                data-testid="approve-pr"
              >
                {locked && submitting !== "reject" ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Check aria-hidden />
                )}
                {busy ? "Creating pull request…" : "Approve & Create PR"}
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => decide("reject")}
                disabled={locked}
                className="border-critical/40 text-critical hover:bg-critical/10 hover:text-critical sm:min-w-40"
                data-testid="reject-pr"
              >
                <X aria-hidden />
                Reject
              </Button>
            </div>
            {busy && (
              <p className="font-mono text-xs text-muted-foreground">
                Human approval recorded · creating pull request…
              </p>
            )}
          </div>
        )}

        {/* ---- Approved result ---- */}
        {phase === "completed" && pullRequest && (
          <div className="step-enter mt-5 rounded-md border border-signal/35 bg-signal/8 px-4 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <GitPullRequest className="check-pop h-5 w-5 text-signal" aria-hidden />
              <span className="font-mono text-sm font-semibold">PR #{pullRequest.number}</span>
              <span className="text-sm">{pullRequest.title}</span>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <Fact label="Checks" value={`✓ ${pullRequest.checks}`} tone="text-signal" />
              <Fact label="Status" value={pullRequest.status} />
              <Fact label="Deployed" value="no — review only" />
            </div>
            <a
              href={pullRequest.url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 font-mono text-xs text-primary underline underline-offset-4"
            >
              {pullRequest.url}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">
              Audit: HUMAN approved PR creation → AGENT created pull request.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={onReset}>
              <RotateCcw aria-hidden />
              Reset demo
            </Button>
          </div>
        )}

        {/* ---- Rejected result ---- */}
        {phase === "rejected" && (
          <div className="step-enter mt-5 rounded-md border border-critical/35 bg-critical/8 px-4 py-4">
            <p className="text-sm font-medium">Human rejected PR creation.</p>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              The workflow stopped at the approval gate. No pull request was created, the patch
              branch was discarded, and the agent cannot resume without a new run.
            </p>
            {note.trim() && (
              <p className="mt-2 font-mono text-xs text-muted-foreground">“{note.trim()}”</p>
            )}
            <Button variant="outline" size="sm" className="mt-3" onClick={onReset}>
              <RotateCcw aria-hidden />
              Reset Demo
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
