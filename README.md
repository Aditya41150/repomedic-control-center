# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## RepoMedic × TrueForge integration boundary

The UI never talks to the TrueForge harness directly. Every read and write goes
through the `RepoMedicClient` interface in `src/lib/repomedic/types.ts`:

```ts
interface RepoMedicClient {
  getHarnessStatus(): Promise<HarnessStatus>;
  listIncidents(): Promise<Incident[]>;
  getInvestigation(incidentId: string): Promise<IncidentInvestigation>;
  submitApproval(decision: ApprovalDecision): Promise<ApprovalGate>;
}
```

Two implementations live in `src/lib/repomedic/client.ts`:

- `createMockClient()` — deterministic demo incident (INC-8842) used today.
- `createHttpClient(baseUrl)` — thin fetch client for a real backend.

`getRepoMedicClient()` picks the HTTP client automatically when
`VITE_REPOMEDIC_API_URL` is set, otherwise it falls back to mock data. The
harness bar shows `demo data` vs `live harness` so it is always obvious which is
in play.

### Expected backend surface

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/harness/status` | `HarnessStatus` |
| GET | `/incidents` | `Incident[]` |
| GET | `/incidents/:id/investigation` | `IncidentInvestigation` |
| POST | `/incidents/:id/approval` | `ApprovalGate` |

The approval endpoint is the only mutation. The backend must treat it as the
sole authorisation to push a branch and open a pull request — RepoMedic's UI
will never trigger PR creation implicitly.

## Real TrueForge harness (vertical slice)

Investigation execution sits behind `RunDriver` (`src/lib/repomedic/run-driver.ts`):

- `createDemoDriver()` (`demo-driver.ts`) — the deterministic offline demo, unchanged.
- `createTrueForgeDriver()` (`trueforge-client-driver.ts`) — streams real harness events
  from our own server route.

Both emit the same `RunEvent` union, folded into `RunState` by `applyRunEvent()`, so no
presentation component knows which engine is running. Switch engines with the
DEMO / TRUEFORGE toggle in the run control bar, or default it with
`VITE_REPOMEDIC_MODE=trueforge`.

### Server boundary

`POST /api/repomedic/run` (`src/routes/api/repomedic/run.ts`) returns a Server-Sent
Events stream of `RunEvent`s:

- `{ "action": "start" }` — create a TrueForge session and stream the investigation turn.
- `{ "action": "approve" | "deny", sessionId, threadId, toolCallId, reason? }` — answer a
  pending TrueForge tool-approval checkpoint.

`src/lib/repomedic/trueforge-driver.server.ts` is the only module that talks to the
harness, using its documented HTTP API (verified against `@truefoundry/trueforge` 0.1.4):

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/sessions` | Create a session with an inline `AgentSpec`. |
| POST | `/api/v1/sessions/{id}/turns` | Create + execute a turn; SSE when `stream: true`. |
| GET | `/api/v1/sessions/{id}/turns/{turnId}/subscribe` | Resume a running turn. |
| POST | `/api/v1/sessions/{id}/cancel` | Cancel the running turn. |

Human approval is **not** a bespoke endpoint: TrueForge emits `tool.approval_required`,
and the decision is sent as a new turn whose input is a `user.tool_approval` item
(`{ thread_id, tool_call_id, approval: { status: "allow" | "deny", reason? } }`).
RepoMedic never performs GitHub writes itself — every mutation stays a TrueForge tool
call behind that checkpoint. The first slice is read-only repository forensics.

### Environment variables

Secrets must never be exposed to the browser. `VITE_*` values are public by
definition; TrueForge, GitHub and Daytona credentials stay server-side (GitHub/Daytona
credentials belong to the harness's own connector configuration, not to this app).

| Variable | Scope | Purpose |
| --- | --- | --- |
| `VITE_REPOMEDIC_MODE` | client (public) | `demo` (default) or `trueforge` — initial execution mode. |
| `VITE_REPOMEDIC_API_URL` | client (public) | Base URL of the RepoMedic proxy/API. Unset = mock data. |
| `TRUEFORGE_BASE_URL` | server | TrueForge harness base URL (default `http://localhost:3000`). |
| `TRUEFORGE_API_TOKEN` | server (secret) | Bearer ID token, only when the harness runs with OIDC enabled. |
| `TRUEFORGE_MODEL` | server | Model name passed in the inline `AgentSpec` (e.g. a Gemini model). |
| `TRUEFORGE_GITHUB_MCP_SERVER` | server | Name of the GitHub MCP server configured inside TrueForge. |
| `TRUEFORGE_REPOSITORY` | server | Repository the first read-only slice investigates. |

Do not commit values for any of the above; configure them as project secrets.

