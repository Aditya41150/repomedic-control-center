import { mockHarness, mockIncidents, mockInvestigation } from "./mock-data";
import type {
  ApprovalDecision,
  ApprovalGate,
  IncidentInvestigation,
  Incident,
  HarnessStatus,
  RepoMedicClient,
} from "./types";

/**
 * Integration boundary.
 *
 * Everything the UI knows about the backend goes through `RepoMedicClient`.
 * Today it is fulfilled by `createMockClient()`. When a real TrueForge harness
 * is available, set VITE_REPOMEDIC_API_URL and `createHttpClient()` takes over
 * with no component changes.
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function derive(incidentId: string): IncidentInvestigation {
  if (incidentId === mockInvestigation.incident.id) return mockInvestigation;
  const incident = mockIncidents.find((i) => i.id === incidentId);
  if (!incident) throw new Error(`Unknown incident: ${incidentId}`);
  return {
    incident,
    steps: mockInvestigation.steps.slice(0, 2).map((s, i) => ({
      ...s,
      state: i === 0 ? "complete" : "running",
      toolCalls: i === 0 ? s.toolCalls.slice(0, 1) : [],
    })),
    evidence: [],
    sandboxRuns: [],
    hypothesis: {
      statement: "",
      confidence: 0,
      reasoning: [],
      ruledOut: [],
      blastRadius: "",
    },
    patch: {
      branch: "",
      baseBranch: "main",
      title: "",
      rationale: "",
      filesChanged: [],
      diff: "",
      riskLevel: "low",
      testsAdded: 0,
    },
    approval: {
      required: true,
      state: "pending",
      requestedAt: incident.detectedAt,
      requiredChecks: [],
    },
  };
}

export function createMockClient(): RepoMedicClient {
  const approvals = new Map<string, ApprovalGate>();

  return {
    async getHarnessStatus() {
      await delay(280);
      return { ...mockHarness, lastHeartbeat: new Date().toISOString(), mode: "mock" };
    },
    async listIncidents() {
      await delay(240);
      return mockIncidents;
    },
    async getInvestigation(incidentId) {
      await delay(420);
      const base = derive(incidentId);
      const override = approvals.get(incidentId);
      return override ? { ...base, approval: override } : base;
    },
    async submitApproval({ incidentId, decision, note }: ApprovalDecision) {
      await delay(900);
      const base = derive(incidentId).approval;
      const next: ApprovalGate = {
        ...base,
        state: decision === "approve" ? "approved" : "rejected",
        decidedBy: "you (on-call)",
        decidedAt: new Date().toISOString(),
        note,
        pullRequestUrl:
          decision === "approve"
            ? "https://github.com/acme/checkout-api/pull/4471"
            : undefined,
      };
      approvals.set(incidentId, next);
      return next;
    },
  };
}

/**
 * Live TrueForge harness client. Intentionally thin: the harness is expected to
 * expose the same resource shapes as `RepoMedicClient`. Secrets are never read
 * in the browser — the base URL points at a server route that proxies the
 * harness and attaches credentials server-side.
 */
export function createHttpClient(baseUrl: string): RepoMedicClient {
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      headers: { "content-type": "application/json" },
      ...init,
    });
    if (!res.ok) {
      throw new Error(`TrueForge harness responded ${res.status} for ${path}`);
    }
    return (await res.json()) as T;
  };

  return {
    getHarnessStatus: () => request<HarnessStatus>("/harness/status"),
    listIncidents: () => request<Incident[]>("/incidents"),
    getInvestigation: (id) => request<IncidentInvestigation>(`/incidents/${id}/investigation`),
    submitApproval: (decision) =>
      request<ApprovalGate>(`/incidents/${decision.incidentId}/approval`, {
        method: "POST",
        body: JSON.stringify(decision),
      }),
  };
}

let client: RepoMedicClient | null = null;

export function getRepoMedicClient(): RepoMedicClient {
  if (client) return client;
  const baseUrl = import.meta.env["VITE_REPOMEDIC_API_URL"] as string | undefined;
  client = baseUrl ? createHttpClient(baseUrl) : createMockClient();
  return client;
}
