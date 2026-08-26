import { Activity, CircuitBoard, Gauge, RefreshCw } from "lucide-react";
import { StatusPill } from "./StatusPill";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { HarnessStatus } from "@/lib/repomedic/types";

const stateTone = {
  online: "signal",
  degraded: "caution",
  offline: "critical",
  connecting: "info",
} as const;

export function HarnessBar({
  status,
  isLoading,
  isError,
  onRetry,
  isRefreshing,
}: {
  status?: HarnessStatus;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  isRefreshing: boolean;
}) {
  return (
    <section
      aria-label="TrueForge harness status"
      className="panel flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3"
    >
      <div className="flex items-center gap-2.5">
        <CircuitBoard className="h-4 w-4 text-primary" aria-hidden />
        <span className="label-caps">TrueForge Harness</span>
      </div>

      {isLoading && <Skeleton className="h-5 w-64" />}

      {isError && !isLoading && (
        <div className="flex items-center gap-3">
          <StatusPill tone="critical" dot>
            unreachable
          </StatusPill>
          <span className="text-sm text-muted-foreground">
            Harness status could not be read.
          </span>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}

      {status && !isLoading && !isError && (
        <>
          <StatusPill tone={stateTone[status.state]} dot pulse={status.state === "online"}>
            {status.state}
          </StatusPill>
          <dl className="flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-xs text-muted-foreground">
            <div className="flex gap-2">
              <dt className="sr-only">Endpoint</dt>
              <dd>{status.endpoint}</dd>
            </div>
            <div className="flex gap-2">
              <dt>model</dt>
              <dd className="text-foreground">{status.model}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5" aria-hidden />
              <dt className="sr-only">Round-trip latency</dt>
              <dd className="text-foreground">{status.latencyMs}ms</dd>
            </div>
            <div className="flex gap-2">
              <dt>build</dt>
              <dd>{status.version}</dd>
            </div>
          </dl>

          <ul className="flex flex-wrap items-center gap-2" aria-label="Connected tool providers">
            {status.connectors.map((c) => (
              <li key={c.name}>
                <StatusPill
                  tone={c.status === "connected" ? "signal" : c.status === "error" ? "critical" : "muted"}
                  dot
                >
                  {c.name}
                </StatusPill>
              </li>
            ))}
          </ul>

          <div className="ml-auto flex items-center gap-3">
            <StatusPill tone={status.mode === "live" ? "primary" : "caution"}>
              {status.mode === "live" ? "live harness" : "demo data"}
            </StatusPill>
            <Button
              size="sm"
              variant="ghost"
              onClick={onRetry}
              disabled={isRefreshing}
              aria-label="Refresh harness status"
            >
              <RefreshCw className={isRefreshing ? "animate-spin" : ""} aria-hidden />
              <Activity className="hidden" aria-hidden />
              Refresh
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
