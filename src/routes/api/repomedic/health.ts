/**
 * GET /api/repomedic/health — TrueForge connectivity probe.
 *
 * Returns only reachability, HTTP status, latency, a sanitized error message and the
 * NAMES of missing configuration variables. No environment values or tokens are exposed.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/repomedic/health")({
  server: {
    handlers: {
      GET: async () => {
        const { checkTrueForgeHealth } = await import("@/lib/repomedic/trueforge-driver.server");
        const health = await checkTrueForgeHealth();
        return Response.json(health, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
