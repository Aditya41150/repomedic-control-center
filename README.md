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

### Environment variables

Secrets must never be exposed to the browser. `VITE_*` values are public by
definition; the TrueForge API key and GitHub token belong on the server only,
behind a proxy route that forwards to the harness.

| Variable | Scope | Purpose |
| --- | --- | --- |
| `VITE_REPOMEDIC_API_URL` | client (public) | Base URL of the RepoMedic proxy/API. Unset = mock mode. |
| `TRUEFORGE_API_URL` | server | TrueForge harness base URL. |
| `TRUEFORGE_API_KEY` | server (secret) | Harness authentication. |
| `TRUEFORGE_WORKSPACE_ID` | server | Workspace/tenant the harness runs under. |
| `GITHUB_APP_TOKEN` | server (secret) | Repo reads and pull-request creation via the GitHub MCP connector. |
| `OBSERVABILITY_API_KEY` | server (secret) | Metrics/log provider used for telemetry correlation. |
| `SANDBOX_RUNNER_URL` | server | Ephemeral sandbox service for reproduction and verification runs. |

Do not commit values for any of the above; configure them as project secrets.
