import { cn } from "@/lib/utils";
import { StatusPill } from "./StatusPill";
import { Skeleton } from "@/components/ui/skeleton";
import type { Incident } from "@/lib/repomedic/types";

const severityTone = { sev1: "critical", sev2: "caution", sev3: "info" } as const;

const statusLabel: Record<Incident["status"], string> = {
  investigating: "investigating",
  awaiting_approval: "awaiting approval",
  patch_open: "patch open",
  resolved: "resolved",
};

export function IncidentList({
  incidents,
  isLoading,
  selectedId,
  onSelect,
}: {
  incidents: Incident[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label="Active incidents" className="flex flex-col gap-2">
      <h2 className="label-caps px-1">Incident queue</h2>

      {isLoading &&
        [0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}

      {!isLoading && incidents.length === 0 && (
        <p className="panel px-3 py-6 text-center text-sm text-muted-foreground">
          No open incidents. RepoMedic is idle.
        </p>
      )}

      {incidents.map((incident) => {
        const active = incident.id === selectedId;
        return (
          <button
            key={incident.id}
            type="button"
            onClick={() => onSelect(incident.id)}
            aria-current={active ? "true" : undefined}
            className={cn(
              "panel w-full cursor-pointer px-3 py-3 text-left transition-colors",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
              active
                ? "border-primary/50 bg-surface-raised"
                : "hover:border-primary/30 hover:bg-surface-raised",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-muted-foreground">{incident.key}</span>
              <StatusPill tone={severityTone[incident.severity]}>{incident.severity}</StatusPill>
            </div>
            <p className="mt-1.5 line-clamp-2 text-sm font-medium">{incident.title}</p>
            <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
              <span>{incident.service}</span>
              <span>{statusLabel[incident.status]}</span>
            </div>
          </button>
        );
      })}
    </nav>
  );
}
