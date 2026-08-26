import { useMemo, useState } from "react";
import { ChevronRight, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AuditActor, AuditEntry, AuditStatus } from "@/lib/repomedic/types";

/**
 * Demo audit trail. Events are produced by the deterministic investigation run
 * and held in memory only — this is not a tamper-proof production audit log.
 */

type FilterKey = "all" | "agent" | "tools" | "sandbox" | "human";

const FILTERS: Array<{ key: FilterKey; label: string; actors?: AuditActor[] }> = [
  { key: "all", label: "All" },
  { key: "agent", label: "Agent", actors: ["agent", "subagent"] },
  { key: "tools", label: "Tools", actors: ["tool"] },
  { key: "sandbox", label: "Sandbox", actors: ["sandbox"] },
  { key: "human", label: "Human", actors: ["human"] },
];

const ACTOR_STYLE: Record<AuditActor, string> = {
  agent: "border-primary/35 bg-primary/10 text-primary",
  subagent: "border-primary/25 bg-primary/6 text-primary/85",
  tool: "border-border bg-muted/50 text-muted-foreground",
  sandbox: "border-border bg-muted/50 text-muted-foreground",
  human: "border-caution/45 bg-caution/12 text-caution",
};

const STATUS_STYLE: Record<AuditStatus, string> = {
  completed: "text-success",
  started: "text-muted-foreground",
  approved: "text-caution",
  rejected: "text-destructive",
  failed: "text-destructive",
};

const STATUS_LABEL: Record<AuditStatus, string> = {
  completed: "✓ Completed",
  started: "• Started",
  approved: "✓ Approved",
  rejected: "✕ Rejected",
  failed: "✕ Stopped",
};

export function AuditTrail({ entries }: { entries: AuditEntry[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const visible = useMemo(() => {
    const actors = FILTERS.find((f) => f.key === filter)?.actors;
    return actors ? entries.filter((e) => actors.includes(e.actor)) : entries;
  }, [entries, filter]);

  const download = () => {
    const payload = entries.map((e) => ({
      timestamp: e.at,
      actor: e.actor.toUpperCase(),
      action: e.action,
      status: e.status,
      details: { result: e.result, ...(e.details ?? {}) },
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "repomedic-audit-log.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel" aria-labelledby="audit-trail-heading">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2
            id="audit-trail-heading"
            className="font-mono text-xs tracking-[0.14em] uppercase"
          >
            Audit trail
          </h2>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Every autonomous action and human authorization is recorded so the investigation
            can be reviewed after execution. Demo implementation — not an immutable log.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={download}
          disabled={entries.length === 0}
          className="gap-2"
        >
          <Download className="size-3.5" aria-hidden />
          Download audit log
        </Button>
      </header>

      <div
        role="group"
        aria-label="Filter audit events"
        className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2.5"
      >
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={active}
              className={`rounded border px-2.5 py-1 font-mono text-[11px] tracking-wide uppercase transition-colors ${
                active
                  ? "border-primary/45 bg-primary/12 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          );
        })}
        <span className="ml-auto self-center font-mono text-[11px] text-muted-foreground">
          {visible.length} / {entries.length} events
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          No audit events yet. Events appear as the investigation progresses.
        </p>
      ) : visible.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          No events match this filter.
        </p>
      ) : (
        <ol className="divide-y divide-border">
          {visible.map((e) => {
            const expanded = Boolean(open[e.id]);
            const hasDetails = Boolean(e.details && Object.keys(e.details).length > 0);
            return (
              <li
                key={e.id}
                className={`step-enter px-4 py-2.5 ${
                  e.actor === "human" ? "border-l-2 border-l-caution bg-caution/8" : ""
                }`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {e.at.slice(11, 19)}Z
                  </span>
                  <span
                    className={`rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide uppercase ${ACTOR_STYLE[e.actor]}`}
                  >
                    {e.actor}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{e.action}</span>
                    <span className="block text-xs text-muted-foreground">{e.result}</span>
                  </span>
                  <span
                    className={`font-mono text-[11px] whitespace-nowrap ${STATUS_STYLE[e.status]}`}
                  >
                    {STATUS_LABEL[e.status]}
                  </span>
                  {hasDetails && (
                    <button
                      type="button"
                      onClick={() => setOpen((p) => ({ ...p, [e.id]: !p[e.id] }))}
                      aria-expanded={expanded}
                      className="rounded border border-border p-1 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <ChevronRight
                        className={`size-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
                        aria-hidden
                      />
                      <span className="sr-only">Toggle details for {e.action}</span>
                    </button>
                  )}
                </div>

                {hasDetails && expanded && (
                  <dl className="step-enter mt-2 grid gap-x-6 gap-y-1 rounded border border-border bg-muted/30 px-3 py-2 font-mono text-[11px] sm:grid-cols-2">
                    {Object.entries(e.details ?? {}).map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="text-muted-foreground">{k.replace(/_/g, " ")}:</dt>
                        <dd className="min-w-0 break-words">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
