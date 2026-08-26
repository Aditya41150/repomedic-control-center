import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Stethoscope } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HarnessBar } from "@/components/repomedic/HarnessBar";
import { IncidentList } from "@/components/repomedic/IncidentList";
import { IncidentHeader } from "@/components/repomedic/IncidentHeader";
import { AgentTimeline } from "@/components/repomedic/AgentTimeline";
import { EvidencePanel } from "@/components/repomedic/EvidencePanel";
import { SandboxResults } from "@/components/repomedic/SandboxResults";
import { RootCausePanel } from "@/components/repomedic/RootCausePanel";
import { PatchPanel } from "@/components/repomedic/PatchPanel";
import { ApprovalGatePanel } from "@/components/repomedic/ApprovalGate";
import { getRepoMedicClient } from "@/lib/repomedic/client";
import {
  harnessStatusQuery,
  incidentsQuery,
  investigationQuery,
} from "@/lib/repomedic/queries";

const title = "RepoMedic — Autonomous incident investigation control room";
const description =
  "RepoMedic investigates production incidents with TrueForge agents: repository forensics, telemetry correlation, sandbox reproduction, verified patches and a human approval gate before any pull request.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ControlRoom,
});

function ControlRoom() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const harness = useQuery(harnessStatusQuery());
  const incidents = useQuery(incidentsQuery());

  const activeId = selectedId ?? incidents.data?.[0]?.id ?? null;
  const investigation = useQuery({
    ...investigationQuery(activeId ?? ""),
    enabled: Boolean(activeId),
  });

  const approve = useMutation({
    mutationFn: (input: { decision: "approve" | "reject"; note: string }) =>
      getRepoMedicClient().submitApproval({
        incidentId: activeId!,
        decision: input.decision,
        note: input.note || undefined,
      }),
    onSuccess: (gate) => {
      queryClient.invalidateQueries({ queryKey: ["repomedic", "investigation", activeId] });
      toast[gate.state === "approved" ? "success" : "message"](
        gate.state === "approved"
          ? "Approved — pull request opened"
          : "Patch rejected — no pull request created",
      );
    },
    onError: () => toast.error("The harness rejected the approval request."),
  });

  const data = investigation.data;

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#investigation"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to investigation
      </a>

      <header className="border-b border-border bg-surface/70 px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/40 bg-primary/12 text-primary">
            <Stethoscope className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight">RepoMedic</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              autonomous production-incident investigation
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-4 md:px-6 md:py-6">
        <HarnessBar
          {...(harness.data ? { status: harness.data } : {})}
          isLoading={harness.isLoading}
          isError={harness.isError}
          isRefreshing={harness.isFetching}
          onRetry={() => harness.refetch()}
        />

        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <IncidentList
              incidents={incidents.data ?? []}
              isLoading={incidents.isLoading}
              selectedId={activeId}
              onSelect={setSelectedId}
            />
          </aside>

          <section id="investigation" className="space-y-4">
            {investigation.isLoading && (
              <div className="space-y-4">
                <Skeleton className="h-52 w-full rounded-lg" />
                <Skeleton className="h-10 w-full max-w-xl rounded-lg" />
                <Skeleton className="h-72 w-full rounded-lg" />
              </div>
            )}

            {investigation.isError && (
              <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
                <AlertCircle className="h-6 w-6 text-critical" aria-hidden />
                <p className="text-sm font-medium">Could not load this investigation.</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  The TrueForge harness did not return an investigation record. Retry, or pick
                  another incident from the queue.
                </p>
                <Button variant="outline" onClick={() => investigation.refetch()}>
                  Retry
                </Button>
              </div>
            )}

            {!activeId && !incidents.isLoading && (
              <div className="panel px-6 py-16 text-center text-sm text-muted-foreground">
                Select an incident to open its investigation.
              </div>
            )}

            {data && !investigation.isLoading && !investigation.isError && (
              <>
                <IncidentHeader incident={data.incident} />

                <ApprovalGatePanel
                  gate={data.approval}
                  isSubmitting={approve.isPending}
                  error={approve.isError ? "Approval could not be submitted." : null}
                  onDecide={(decision, note) => approve.mutate({ decision, note })}
                />

                <Tabs defaultValue="timeline">
                  <TabsList className="flex-wrap">
                    <TabsTrigger value="timeline">Agent timeline</TabsTrigger>
                    <TabsTrigger value="evidence">
                      Evidence ({data.evidence.length})
                    </TabsTrigger>
                    <TabsTrigger value="sandbox">
                      Sandbox ({data.sandboxRuns.length})
                    </TabsTrigger>
                    <TabsTrigger value="rootcause">Root cause</TabsTrigger>
                    <TabsTrigger value="patch">Patch</TabsTrigger>
                  </TabsList>

                  <TabsContent value="timeline" className="mt-4">
                    <AgentTimeline steps={data.steps} isLoading={false} />
                  </TabsContent>
                  <TabsContent value="evidence" className="mt-4">
                    <EvidencePanel evidence={data.evidence} />
                  </TabsContent>
                  <TabsContent value="sandbox" className="mt-4">
                    <SandboxResults runs={data.sandboxRuns} />
                  </TabsContent>
                  <TabsContent value="rootcause" className="mt-4">
                    <RootCausePanel hypothesis={data.hypothesis} />
                  </TabsContent>
                  <TabsContent value="patch" className="mt-4">
                    <PatchPanel patch={data.patch} />
                  </TabsContent>
                </Tabs>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
