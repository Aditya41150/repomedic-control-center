import assert from "node:assert/strict";
import { describe, test } from "node:test";

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
    assert.equal(
      inspectToolCallBudget(
        toolMessage("search_code", { query: "repo:Aditya41150/RepoMedic  workflow" }),
        state,
        budget,
      ).stopReason,
      undefined,
    );

    const duplicate = inspectToolCallBudget(
      toolMessage("search_code", { query: " REPO:aditya41150/repomedic workflow " }, "call-2"),
      state,
      budget,
    );
    assert.equal(duplicate.stopReason, "duplicate_search");
    assert.equal(state.toolCalls, 1);
    assert.equal(state.searchCodeCalls, 1);
    assert.deepEqual(
      duplicate.audits[0]?.type === "audit" ? duplicate.audits[0].entry.details : undefined,
      {
        tool: "search_code",
        tool_call_count: "1",
        tool_call_budget: "12",
        search_code_count: "1",
        search_code_budget: "3",
        deduplicated: "true",
        stop_reason: "duplicate_search",
      },
    );
  });

  test("enforces total and search-specific budgets", () => {
    const toolState = createInvestigationBudgetState();
    const toolBudget = { maxToolCalls: 1, maxSearchCodeCalls: 3 };
    inspectToolCallBudget(
      toolMessage("get_file_contents", { path: "README.md" }),
      toolState,
      toolBudget,
    );
    assert.equal(
      inspectToolCallBudget(
        toolMessage("get_file_contents", { path: "package.json" }, "call-2"),
        toolState,
        toolBudget,
      ).stopReason,
      "tool_budget",
    );

    const searchState = createInvestigationBudgetState();
    const searchBudget = { maxToolCalls: 10, maxSearchCodeCalls: 1 };
    inspectToolCallBudget(
      toolMessage("search_code", { query: "first" }),
      searchState,
      searchBudget,
    );
    assert.equal(
      inspectToolCallBudget(
        toolMessage("search_code", { query: "second" }, "call-2"),
        searchState,
        searchBudget,
      ).stopReason,
      "search_budget",
    );
  });

  test("recognizes streamed model rate-limit failures without retrying", () => {
    assert.equal(
      isRateLimitEvent({
        type: "turn.done",
        state: { status: "error", error: "429 RESOURCE_EXHAUSTED: quota exceeded" },
      }),
      true,
    );
    assert.equal(isRateLimitEvent({ type: "turn.done", state: { status: "done" } }), false);
  });
});

describe("safety and demo contracts", () => {
  test("approval-required remains a pause and never creates a PR", () => {
    const events = mapTrueForgeEvent({
      type: "tool.approval_required",
      thread_id: "main",
      tool_calls: [{ id: "write-1", name: "create_branch" }],
    });
    assert.equal(
      events.some((event) => event.type === "approval.required"),
      true,
    );
    assert.equal(
      events.some((event) => event.type === "pull_request"),
      false,
    );
  });

  test("demo startup contract remains deterministic and network-free", async () => {
    const events: RunEvent[] = [];
    const controller = new AbortController();
    const started = createDemoDriver().start({
      emit: (event) => events.push(event),
      signal: controller.signal,
    });
    controller.abort();
    await started;

    assert.deepEqual(
      events.slice(0, 3).map((event) => event.type),
      ["run.started", "phase", "audit"],
    );
    assert.deepEqual(events[1], { type: "phase", phase: "investigating" });
    assert.equal(
      events.some((event) => event.type === "pull_request"),
      false,
    );
  });
});
