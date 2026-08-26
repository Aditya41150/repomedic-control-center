import { AlertTriangle, Clock, GitBranch, Users } from "lucide-react";
import { StatusPill } from "./StatusPill";
import type { Incident } from "@/lib/repomedic/types";

const severityTone = { sev1: "critical", sev2: "caution", sev3: "info" } as const;

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden />
      <div>
        <div className="label-caps">{label}</div>
        <div className="font-mono text-sm">{value}</div>
      </div>
    </div>
  );
}

export function IncidentHeader({ incident }: { incident: Incident }) {
  const detected = new Date(incident.detectedAt);
  return (
    <header className="panel grid-backdrop overflow-hidden">
      <div className="bg-background/60 px-5 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill tone={severityTone[incident.severity]} dot pulse>
            {incident.severity}
          </StatusPill>
          <span className="font-mono text-xs text-muted-foreground">{incident.key}</span>
          <StatusPill tone="muted">{incident.environment}</StatusPill>
          <StatusPill tone="primary">{incident.repository}</StatusPill>
        </div>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-balance">
          {incident.title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {incident.summary}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 md:grid-cols-4">
          <Stat
            icon={Clock}
            label="Detected"
            value={detected.toISOString().slice(11, 16) + "Z"}
          />
          <Stat icon={AlertTriangle} label="Error rate" value={`${incident.errorRate}%`} />
          <Stat
            icon={Users}
            label="Users affected"
            value={incident.affectedUsers.toLocaleString()}
          />
          <Stat icon={GitBranch} label="Service" value={incident.service} />
        </div>
      </div>
    </header>
  );
}
