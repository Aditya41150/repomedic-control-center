/**
 * Browser-side RunDriver for TrueForge mode.
 *
 * It knows nothing about TrueForge itself: it POSTs to our own `/api/repomedic/run`
 * server route and folds the SSE `RunEvent` frames back into the UI. All harness
 * credentials stay on the server.
 */

import type { RunDriver, RunDriverContext, RunEvent } from "./run-driver";
import type { ApprovalRequest } from "./types";

async function streamRunEvents(
  body: unknown,
  { emit, signal }: RunDriverContext,
  onEvent?: (event: RunEvent) => void,
) {
  const res = await fetch("/api/repomedic/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    emit({
      type: "error",
      message: `The TrueForge harness boundary responded ${res.status}. Check that the harness is running and TRUEFORGE_BASE_URL is set.`,
    });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          const event = JSON.parse(payload) as RunEvent;
          onEvent?.(event);
          emit(event);
        } catch {
          /* ignore malformed frame */
        }
      }
    }
  }
}

export function createTrueForgeDriver(): RunDriver {
  let sessionId: string | null = null;
  let pending: ApprovalRequest | null = null;

  const decide = async (ctx: RunDriverContext, action: "approve" | "deny", reason?: string) => {
    if (!sessionId || !pending?.threadId || !pending.toolCallId) {
      ctx.emit({
        type: "error",
        message: "No pending TrueForge approval checkpoint to respond to.",
      });
      return;
    }
    await streamRunEvents(
      {
        action,
        sessionId,
        threadId: pending.threadId,
        toolCallId: pending.toolCallId,
        ...(pending.toolName ? { toolName: pending.toolName } : {}),
        ...(reason ? { reason } : {}),
      },
      ctx,
      (event) => {
        if (event.type === "approval.required") pending = event.request;
      },
    );
  };

  return {
    mode: "trueforge",

    async start(ctx) {
      sessionId = null;
      pending = null;
      await streamRunEvents({ action: "start" }, ctx, (event) => {
        if (event.type === "session") sessionId = event.sessionId;
        if (event.type === "approval.required") pending = event.request;
      });
    },

    approve: (ctx, note) => decide(ctx, "approve", note),
    reject: (ctx, note) => decide(ctx, "deny", note),
  };
}
