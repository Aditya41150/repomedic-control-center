import { useState } from "react";
import {
  Check,
  ChevronDown,
  Crosshair,
  FileCode2,
  GitCommitHorizontal,
  Gauge,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { StatusPill } from "./StatusPill";
import {
  codeEvidence,
  consensusFindings,
  correlationChain,
  patchSummaryLines,
  rootCauseSummary,
  runtimeEvidence,
  verificationSummary,
} from "@/lib/repomedic/evidence-board";

function Section({
  id,
  title,
  icon,
  children,
  defaultOpen = true,
  aside,
}: {
  id: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  aside?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="panel overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-content`}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className="label-caps">{title}</span>
        {aside}
        <ChevronDown
          aria-hidden
          className={cn(
            "ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div id={`${id}-content`} className="border-t border-border px-4 py-4">
          {children}
        </div>
      )}
    </div>
  );
}

const nodeTone = {
  muted: "border-border bg-muted/40 text-foreground",
  primary: "border-primary/40 bg-primary/10 text-primary",
  caution: "border-caution/40 bg-caution/10 text-caution",
  critical: "border-critical/45 bg-critical/10 text-critical",
} as const;

export function EvidenceBoard() {
  const confidence = Math.round(rootCauseSummary.confidence * 100);

  return (
    <section aria-labelledby="evidence-board-heading" className="space-y-4">
      <h2 id="evidence-board-heading" className="sr-only">
        Evidence and root cause
      </h2>

      {/* ROOT CAUSE — always visible, strongest element */}
      <div className="panel grid-backdrop step-enter overflow-hidden border-critical/45">
        <div className="bg-background/70 px-5 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <Crosshair className="h-4 w-4 text-critical" aria-hidden />
            <h3 className="label-caps">Root cause identified</h3>
            <StatusPill tone="critical">confirmed</StatusPill>
          </div>

          <p className="mt-3 text-xl leading-snug font-semibold tracking-tight text-balance">
            N+1 database query introduced in{" "}
            <code className="font-mono text-lg text-critical">checkout/order_service.py</code>
          </p>

          <dl className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-3">
            <div>
              <dt className="label-caps">Commit</dt>
              <dd className="font-mono text-sm">{rootCauseSummary.commit}</dd>
            </div>
            <div>
              <dt className="label-caps">Confidence</dt>
              <dd className="font-mono text-sm">{confidence}%</dd>
              <Progress value={confidence} className="mt-1.5 h-1" />
            </div>
            <div>
              <dt className="label-caps">Service</dt>
              <dd className="font-mono text-sm">{rootCauseSummary.service}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* VERIFICATION SUMMARY — always visible */}
      <div className="panel px-5 py-4">
        <h3 className="label-caps">Verification summary</h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {verificationSummary.map((v) => (
            <li key={v} className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 shrink-0 text-signal" aria-hidden />
              <span>{v}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-4 rounded-md border border-signal/30 bg-signal/8 px-4 py-3">
          <Gauge className="h-4 w-4 text-signal" aria-hidden />
          <div>
            <div className="label-caps">Before</div>
            <div className="font-mono text-sm">2.91s</div>
          </div>
          <span aria-hidden className="font-mono text-muted-foreground">
            →
          </span>
          <div>
            <div className="label-caps">After</div>
            <div className="font-mono text-sm text-signal">0.84s</div>
          </div>
        </div>
      </div>

      {/* SUBAGENT CONSENSUS */}
      <Section
        id="consensus"
        title="Subagent consensus"
        icon={<Users className="h-4 w-4" aria-hidden />}
        aside={<StatusPill tone="signal">3/3 agree</StatusPill>}
      >
        <ul className="grid gap-3 lg:grid-cols-3">
          {consensusFindings.map((c) => (
            <li
              key={c.agent}
              className="rounded-md border border-border bg-background/50 px-3 py-3"
            >
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-signal" aria-hidden />
                <span className="text-sm font-semibold">{c.agent}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">“{c.finding}”</p>
            </li>
          ))}
        </ul>
        <div className="mt-3 rounded-md border border-signal/40 bg-signal/8 px-4 py-3 text-center">
          <div className="label-caps text-signal">Consensus reached</div>
          <p className="mt-1 text-sm">3/3 investigators agree</p>
        </div>
      </Section>

      {/* DEPLOYMENT CORRELATION */}
      <Section
        id="correlation"
        title="Deployment correlation"
        icon={<GitCommitHorizontal className="h-4 w-4" aria-hidden />}
      >
        <ol className="flex flex-col items-stretch gap-0 md:flex-row md:items-center">
          {correlationChain.map((node, i) => (
            <li key={node.label} className="flex flex-1 flex-col items-center md:flex-row">
              <div
                className={cn(
                  "w-full rounded-md border px-3 py-2 text-center md:w-auto md:flex-1",
                  nodeTone[node.tone],
                )}
              >
                <div className="label-caps opacity-80">{node.label}</div>
                <div className="font-mono text-sm">{node.value}</div>
              </div>
              {i < correlationChain.length - 1 && (
                <span aria-hidden className="px-2 py-1 font-mono text-muted-foreground md:py-0">
                  <span className="md:hidden">↓</span>
                  <span className="hidden md:inline">→</span>
                </span>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          Demonstration data — correlation reconstructed from the deterministic demo run.
        </p>
      </Section>

      {/* CODE EVIDENCE */}
      <Section
        id="code-evidence"
        title="Code evidence"
        icon={<FileCode2 className="h-4 w-4" aria-hidden />}
        aside={
          <span className="font-mono text-[11px] text-muted-foreground">
            {codeEvidence.file} @ {codeEvidence.commit}
          </span>
        }
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-md border border-critical/35 bg-critical/5 p-3">
            <div className="label-caps text-critical">Before</div>
            <pre className="mt-2 overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
              {codeEvidence.before}
            </pre>
          </div>
          <div className="rounded-md border border-signal/35 bg-signal/5 p-3">
            <div className="label-caps text-signal">After</div>
            <pre className="mt-2 overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
              {codeEvidence.after}
            </pre>
          </div>
        </div>
        <p className="mt-3 text-sm">
          <span className="label-caps mr-2">Key difference</span>
          {codeEvidence.difference}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Demonstration diff — not fetched from a connected repository.
        </p>
      </Section>

      {/* RUNTIME EVIDENCE */}
      <Section
        id="runtime-evidence"
        title="Runtime evidence"
        icon={<Gauge className="h-4 w-4" aria-hidden />}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-critical/35 bg-critical/5 px-4 py-3">
            <div className="label-caps text-critical">Before</div>
            <p className="mt-2 font-mono text-sm">{runtimeEvidence.before.queries}</p>
            <p className="font-mono text-sm">{runtimeEvidence.before.latency}</p>
          </div>
          <div className="rounded-md border border-signal/35 bg-signal/5 px-4 py-3">
            <div className="label-caps text-signal">After</div>
            <p className="mt-2 font-mono text-sm">{runtimeEvidence.after.queries}</p>
            <p className="font-mono text-sm">{runtimeEvidence.after.latency}</p>
          </div>
        </div>
      </Section>

      {/* PATCH SUMMARY */}
      <Section
        id="patch-summary"
        title="Proposed patch"
        icon={<FileCode2 className="h-4 w-4" aria-hidden />}
        aside={
          <span className="font-mono text-[11px]">
            <span className="text-signal">+{patchSummaryLines.additions}</span>{" "}
            <span className="text-critical">-{patchSummaryLines.deletions}</span> lines
          </span>
        }
      >
        <p className="font-mono text-sm">{patchSummaryLines.file}</p>
        <ul className="mt-2 space-y-1.5">
          {patchSummaryLines.bullets.map((b) => (
            <li key={b} className="flex gap-2 text-sm text-muted-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-signal" aria-hidden />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </Section>
    </section>
  );
}
