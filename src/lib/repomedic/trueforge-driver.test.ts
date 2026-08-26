import { describe, expect, test } from "bun:test";

import { createDemoDriver } from "./demo-driver";
import {
  createInvestigationBudgetState,
  inspectToolCallBudget,
  isRateLimitEvent,
  mapTrueForgeEvent,
} from "./trueforge-driver.server";
import type { RunEvent } from "./run-driver";

const toolMessage = (name: string, args: Record<string, unknown>, id = "call-1") => ({
  type: "model.message",
  tool_calls: [
    {
      id,
      function: { name, arguments: JSON.stringify(args) },
      tool_info: { type: "mcp", server_name: "github", server_id: "github", name },
    },
  ],
});

describe("TrueForge investigation budgets", () => {
  test("suppresses equivalent GitHub searches", () => {
    const state = createInvestigationBudgetState();
    const budget = { maxToolCalls: 12, maxSearchCodeCalls: 3 };
    expect(
      inspectToolCallBudget(
        toolMessage("search_code", { query: "repo:Aditya41150/RepoMedic  workflow" }),
        state,
        budget,
      ).stopReason,
    ).toBeUndefined();

    const duplicate = inspectToolCallBudget(
      toolMessage("search_code", { query: " REPO:aditya41150/repomedic workflow " }, "call-2"),
      state,
      budget,
    );
    expect(duplicate.stopReason).toBe("duplicate_search");
    expect(state.toolCalls).toBe(1);
    expect(state.searchCodeCalls).toBe(1);
    expect(duplicate.audits[0]).toMatchObject({
      type: "audit",
      entry: { details: { deduplicated: true, stop_reason: "duplicate_search" } },
    });
  });

  test("enforces total and search-specific budgets", () => {
    const toolState = createInvestigationBudgetState();
    const toolBudget = { maxToolCalls: 1, maxSearchCodeCalls: 3 };
    inspectToolCallBudget(toolMessage("get_file_contents", { path: "README.md" }), toolState, toolBudget);
    expect(
      inspectToolCallBudget(
        toolMessage("get_file_contents", { path: "package.json" }, "call-2"),
        toolState,
        toolBudget,
      ).stopReason,
    ).toBe("tool_budget");

    const searchState = createInvestigationBudgetState();
    const searchBudget = { maxToolCalls: 10, maxSearchCodeCalls: 1 };
    inspectToolCallBudget(toolMessage("search_code", { query: "first" }), searchState, searchBudget);
    expect(
      inspectToolCallBudget(
        toolMessage("search_code", { query: "second" }, "call-2"),
        searchState,
        searchBudget,
      ).stopReason,
    ).toBe("search_budget");
  });

  test("recognizes streamed model rate-limit failures without retrying", () => {
    expect(
      isRateLimitEvent({
        type: "turn.done",
        state: { status: "error", error: "429 RESOURCE_EXHAUSTED: quota exceeded" },
      }),
    ).toBe(true);
    expect(isRateLimitEvent({ type: "turn.done", state: { status: "done" } })).toBe(false);
  });
});

describe("safety and demo contracts", () => {
  test("approval-required remains a pause and never creates a PR", () => {
    const events = mapTrueForgeEvent({
      type: "tool.approval_required",
      thread_id: "main",
      tool_calls: [{ id: "write-1", name: "create_branch" }],
    });
    expect(events.some((event) => event.type === "approval.required")).toBe(true);
    expect(events.some((event) => event.type === "pull_request")).toBe(false);
  });

  test("demo startup contract remains deterministic and network-free", async () => {
    const events: RunEvent[] = [];
    const controller = new AbortController();
    const started = createDemoDriver().start({ emit: (event) => events.push(event), signal: controller.signal });
    controller.abort();
    await started;

    expect(events.slice(0, 3).map((event) => event.type)).toEqual([
      "run.started",
      "phase",
      "audit",
    ]);
    expect(events[1]).toEqual({ type: "phase", phase: "investigating" });
    expect(events.some((event) => event.type === "pull_request")).toBe(false);
  });
});