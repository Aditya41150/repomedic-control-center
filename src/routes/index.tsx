import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Stethoscope } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HarnessBar } from "@/components/repomedic/HarnessBar";
import { HarnessCapabilities } from "@/components/repomedic/HarnessCapabilities";
import { IncidentList } from "@/components/repomedic/IncidentList";
import { IncidentHeader } from "@/components/repomedic/IncidentHeader";
import { AgentTimeline } from "@/components/repomedic/AgentTimeline";
import { AuditTrail } from "@/components/repomedic/AuditTrail";

import { EvidencePanel } from "@/components/repomedic/EvidencePanel";
import { SandboxResults } from "@/components/repomedic/SandboxResults";
import { RootCausePanel } from "@/components/repomedic/RootCausePanel";
import { PatchPanel } from "@/components/repomedic/PatchPanel";
import { ApprovalGatePanel } from "@/components/repomedic/ApprovalGate";
import { RunControlBar } from "@/components/repomedic/RunControlBar";
import { SubagentGrid } from "@/components/repomedic/SubagentGrid";
import { EvidenceBoard } from "@/components/repomedic/EvidenceBoard";
import { LiveApprovalPanel } from "@/components/repomedic/LiveApprovalPanel";
import { getRepoMedicClient } from "@/lib/repomedic/client";
import { useInvestigationRun } from "@/lib/repomedic/investigation-run";
import { isBusyPhase } from "@/lib/repomedic/types";
import {
  CONVERGED_FINDING,
  DEMO_INCIDENT_ID,
  demoIncident,
  requiredChecks,
} from "@/lib/repomedic/demo-script";
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
  const [selectedId, setSelectedId] = useState<string>(DEMO_INCIDENT_ID);

  const harness = useQuery(harnessStatusQuery());
  const incidents = useQuery(incidentsQuery());
  const run = useInvestigationRun();

  const isDemo = selectedId === DEMO_INCIDENT_ID;

  const liveIncident = useMemo(
    () => ({
      ...demoIncident,
      status:
        run.state.phase === "completed"
          ? ("patch_open" as const)
          : run.state.phase === "waiting_for_approval"
            ? ("awaiting_approval" as const)
            : ("investigating" as const),
    }),
    [run.state.phase],
  );

  const queue = useMemo(
    () => [liveIncident, ...(incidents.data ?? [])],
    [liveIncident, incidents.data],
  );

  const investigation = useQuery({
    ...investigationQuery(selectedId),
    enabled: !isDemo,
  });

  const approve = useMutation({
    mutationFn: (input: { decision: "approve" | "reject"; note: string }) =>
      getRepoMedicClient().submitApproval({
        incidentId: selectedId,
        decision: input.decision,
        note: input.note || undefined,
      }),
    onSuccess: (gate) => {
      queryClient.invalidateQueries({ queryKey: ["repomedic", "investigation", selectedId] });
      toast[gate.state === "approved" ? "success" : "message"](
        gate.state === "approved"
          ? "Approved — pull request opened"
          : "Patch rejected — no pull request created",
      );
    },
    onError: () => toast.error("The harness rejected the approval request."),
  });

  const { state } = run;
  const data = investigation.data;
  const showConverged = state.subagents.length > 0 && state.subagents.every((s) => s.state === "complete");

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
          <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <HarnessCapabilities />
            <IncidentList
              incidents={queue}
              isLoading={incidents.isLoading}
              selectedId={selectedId}
              onSelect={(id) => {
                if (isBusyPhase(state.phase)) {
                  toast.message("An investigation is running — wait for the approval gate.");
                  return;
                }
                setSelectedId(id);
              }}
            />
          </aside>

          <section id="investigation" className="space-y-4">
            {isDemo ? (
              <>
                <IncidentHeader incident={liveIncident} />

                <RunControlBar
                  phase={state.phase}
                  onStart={() => void run.start()}
                  onReset={run.reset}
                />

                {state.phase === "error" && (
                  <section
                    role="alert"
                    aria-live="assertive"
                    className="panel border-critical/45 bg-critical/6 px-5 py-4"
                  >
                    <div className="flex items-start gap-3">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-critical" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <h2 className="font-mono text-xs tracking-[0.14em] text-critical uppercase">
                          Investigation error
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {state.error ??
                            "The investigation run stopped unexpectedly. No patch was applied and no pull request was created."}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button size="sm" onClick={run.retry}>
                            Retry investigation
                          </Button>
                          <Button size="sm" variant="outline" onClick={run.reset}>
                            Reset demo
                          </Button>
                        </div>
                      </div>
                    </div>
                  </section>
                )}


                {state.phase === "idle" && (
                  <div className="panel px-6 py-14 text-center">
                    <p className="text-sm font-medium">Investigation ready.</p>
                    <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                      Start the run to watch RepoMedic inspect the repository, correlate telemetry,
                      dispatch parallel subagents, reproduce the failure in a sandbox, generate and
                      verify a patch — then stop for your approval.
                    </p>
                  </div>
                )}

                {(state.phase === "waiting_for_approval" ||
                  state.phase === "creating_pr" ||
                  state.phase === "completed" ||
                  state.phase === "rejected") &&
                  state.patch && (
                    <LiveApprovalPanel
                      phase={state.phase}
                      checks={requiredChecks}
                      patch={state.patch}
                      verification={state.verification}
                      pullRequest={state.pullRequest}
                      onApprove={(note) => void run.approve(note)}
                      onReject={run.reject}
                      onReset={run.reset}
                    />
                  )}

                {state.hypothesis && <EvidenceBoard />}


                {state.phase !== "idle" && (
                  <Tabs defaultValue="timeline">
                    <TabsList className="flex-wrap">
                      <TabsTrigger value="timeline">Agent timeline</TabsTrigger>
                      <TabsTrigger value="subagents">
                        Subagents ({state.subagents.filter((s) => s.state === "complete").length}/
                        {state.subagents.length})
                      </TabsTrigger>
                      <TabsTrigger value="evidence">Evidence ({state.evidence.length})</TabsTrigger>
                      <TabsTrigger value="sandbox">Sandbox ({state.sandboxRuns.length})</TabsTrigger>
                      <TabsTrigger value="rootcause">Root cause</TabsTrigger>
                      <TabsTrigger value="patch">Patch</TabsTrigger>
                      <TabsTrigger value="audit">Audit log ({state.auditLog.length})</TabsTrigger>
                    </TabsList>

                    <TabsContent value="timeline" className="mt-4">
                      <AgentTimeline steps={state.steps} isLoading={false} />
                    </TabsContent>
                    <TabsContent value="subagents" className="mt-4">
                      <SubagentGrid
                        subagents={state.subagents}
                        converged={showConverged ? CONVERGED_FINDING : undefined}
                      />
                    </TabsContent>
                    <TabsContent value="evidence" className="mt-4">
                      <EvidencePanel evidence={state.evidence} />
                    </TabsContent>
                    <TabsContent value="sandbox" className="mt-4">
                      <SandboxResults runs={state.sandboxRuns} />
                    </TabsContent>
                    <TabsContent value="rootcause" className="mt-4">
                      <RootCausePanel
                        hypothesis={
                          state.hypothesis ?? {
                            statement: "",
                            confidence: 0,
                            reasoning: [],
                            ruledOut: [],
                            blastRadius: "",
                          }
                        }
                      />
                    </TabsContent>
                    <TabsContent value="patch" className="mt-4">
                      {state.patch ? (
                        <PatchPanel patch={state.patch} />
                      ) : (
                        <p className="panel px-4 py-10 text-center text-sm text-muted-foreground">
                          No patch generated yet.
                        </p>
                      )}
                    </TabsContent>
                    <TabsContent value="audit" className="mt-4">
                      <AuditTrail entries={state.auditLog} />
                    </TabsContent>

                  </Tabs>
                )}
              </>
            ) : (
              <>
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
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
