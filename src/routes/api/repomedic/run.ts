/**
 * Smallest server boundary the RepoMedic UI needs to drive a real TrueForge harness:
 *  POST /api/repomedic/run  { action: "start" }                       → SSE RunEvent stream
 *  POST /api/repomedic/run  { action: "approve" | "deny", ... }       → SSE RunEvent stream
 *
 * TrueForge credentials/connection details are read server-side only. GitHub mutations are
 * never performed by this app — they stay TrueForge tool calls behind its approval gate.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import type { RunEvent } from "@/lib/repomedic/run-driver";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({
    action: z.enum(["approve", "deny"]),
    sessionId: z.string().min(1).max(200),
    threadId: z.string().min(1).max(200),
    toolCallId: z.string().min(1).max(200),
    reason: z.string().max(500).optional(),
  }),
]);

function sseStream(source: (signal: AbortSignal) => AsyncGenerator<RunEvent>, signal: AbortSignal) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: RunEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        for await (const event of source(signal)) send(event);
      } catch (error) {
        const { sanitizeError, TrueForgeConfigError } =
          await import("@/lib/repomedic/trueforge-driver.server");
        const detail = sanitizeError(error);
        send({
          type: "error",
          message:
            error instanceof TrueForgeConfigError
              ? detail
              : `Could not reach the TrueForge harness (${detail}). Check that the harness is running and that TRUEFORGE_BASE_URL points at it.`,
        });
      } finally {
        controller.close();
      }
    },
  });
}

export const Route = createFileRoute("/api/repomedic/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = bodySchema.safeParse(await request.json());
        if (!parsed.success) {
          return Response.json({ error: "Invalid request body" }, { status: 400 });
        }
        const body = parsed.data;
        const { runInvestigation, submitDecision } =
          await import("@/lib/repomedic/trueforge-driver.server");

        const stream =
          body.action === "start"
            ? sseStream((signal) => runInvestigation(signal), request.signal)
            : sseStream(
                (signal) =>
                  submitDecision(
                    body.sessionId,
                    body.threadId,
                    body.toolCallId,
                    body.action === "approve" ? "allow" : "deny",
                    body.reason,
                    signal,
                  ),
                request.signal,
              );

        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-store",
            connection: "keep-alive",
          },
        });
      },
    },
  },
});
