import { Check, CircuitBoard } from "lucide-react";
import { StatusPill } from "./StatusPill";

const capabilities = [
  { name: "MCP Tools", note: "GitHub + observability tool calls" },
  { name: "Sandboxed Execution", note: "Ephemeral repro & verification runs" },
  { name: "Subagents", note: "Parallel specialised investigators" },
  { name: "Human Approval", note: "Hard stop before any write action" },
  { name: "Session State", note: "Replayable run + audit log" },
];

/**
 * Capabilities the real TrueForge harness will provide. Everything below is
 * simulated deterministically today — the DEMO MODE label makes that explicit.
 */
export function HarnessCapabilities() {
  return (
    <section aria-labelledby="harness-caps" className="panel px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <CircuitBoard className="h-4 w-4 text-primary" aria-hidden />
        <h2 id="harness-caps" className="label-caps">
          TrueForge Harness
        </h2>
        <StatusPill tone="caution" className="ml-auto">
          demo mode
        </StatusPill>
      </div>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {capabilities.map((c) => (
          <li key={c.name} className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-signal/45 bg-signal/12 text-signal">
              <Check className="h-3 w-3" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-medium">{c.name}</span>
              <span className="block font-mono text-[11px] text-muted-foreground">{c.note}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t border-border pt-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
        Capabilities the TrueForge integration will provide. This build replays a deterministic
        script — no external calls are made.
      </p>
    </section>
  );
}
