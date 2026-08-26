import { queryOptions } from "@tanstack/react-query";
import { getRepoMedicClient } from "./client";

export const harnessStatusQuery = () =>
  queryOptions({
    queryKey: ["repomedic", "harness"],
    queryFn: () => getRepoMedicClient().getHarnessStatus(),
    refetchInterval: 30_000,
  });

export const incidentsQuery = () =>
  queryOptions({
    queryKey: ["repomedic", "incidents"],
    queryFn: () => getRepoMedicClient().listIncidents(),
  });

export const investigationQuery = (incidentId: string) =>
  queryOptions({
    queryKey: ["repomedic", "investigation", incidentId],
    queryFn: () => getRepoMedicClient().getInvestigation(incidentId),
  });
