import { describe, expect, test } from "bun:test";

import { AgentRunner } from "../src/agent/agent-runner";
import type { ModelAdapter, ModelContext } from "../src/model/model";
import type { ModelDecision } from "../src/model/types";
import { ScriptedModel } from "../src/model/scripted-model";
import { ToolRegistry } from "../src/tools/registry";
import { SearchLogsTool } from "../src/tools/search-logs";

describe("AgentRunner execution limits", () => {
  test("stops before another model call when maxSteps is reached", async () => {
    const registry = new ToolRegistry();
    registry.register(new SearchLogsTool());

    const model = new CountingModel([
      {
        type: "tool_call",
        tool: "search_logs",
        arguments: {
          service: "payment-api",
        },
        summary: "Search payment logs.",
      },

      {
        type: "tool_call",
        tool: "search_logs",
        arguments: {
          service: "payment-api",
        },
        summary: "Search payment logs again.",
      },

      // This decision must NEVER be requested.
      {
        type: "final",
        response: {
          evidence: [],
          conclusion: "Should never reach this.",
          recommendations: [],
        },
      },
    ]);

    const runner = new AgentRunner(model, registry, {
      limits: { maxSteps: 2, maxToolCalls: 10 },
    });

    const result = await runner.run("Investigate payment-api");

    expect(result.status).toBe("stopped");

    expect(result.terminationReason).toBe("MAX_STEPS_REACHED");

    expect(result.state.stepsUsed).toBe(2);

    // Most important assertion:
    // prove the third model call never happened.
    expect(model.callCount).toBe(2);
  });

  test("stops before another tool execution when maxToolCalls is reached", async () => {
    const registry = new ToolRegistry();

    const tool = new CountingSearchLogsTool();

    registry.register(tool);

    const model = new ScriptedModel([
      {
        type: "tool_call",
        tool: "search_logs",
        arguments: {
          service: "payment-api",
        },
        summary: "First log search.",
      },

      {
        type: "tool_call",
        tool: "search_logs",
        arguments: {
          service: "payment-api",
        },
        summary: "Second log search.",
      },

      // Model may request this tool,
      // but AgentRunner must NOT execute it.
      {
        type: "tool_call",
        tool: "search_logs",
        arguments: {
          service: "payment-api",
        },
        summary: "Third log search.",
      },
    ]);

    const runner = new AgentRunner(model, registry, {
      limits: {
        maxSteps: 10,
        maxToolCalls: 2,
      },
    });

    const result = await runner.run("Investigate payment-api");

    expect(result.status).toBe("stopped");

    expect(result.terminationReason).toBe("MAX_TOOL_CALLS_REACHED");

    expect(result.state.toolCallsUsed).toBe(2);

    // The third requested tool must not execute.
    expect(tool.executionCount).toBe(2);

    // Three model calls are expected:
    //
    // model #1 -> tool #1
    // model #2 -> tool #2
    // model #3 -> requests tool #3
    //
    // Tool #3 is blocked by the budget.
    expect(result.state.stepsUsed).toBe(3);
  });
  test("allows final response on the last available step", async () => {
    const registry = new ToolRegistry();

    registry.register(new SearchLogsTool());

    const model = new CountingModel([
      {
        type: "tool_call",
        tool: "search_logs",
        arguments: {
          service: "payment-api",
        },
        summary: "Search payment logs.",
      },

      {
        type: "final",
        response: {
          evidence: [
            {
              evidenceId: "E1",
              statement: "Payment logs were collected.",
            },
          ],
          conclusion: "Investigation completed within budget.",
          recommendations: [],
        },
      },
    ]);

    const runner = new AgentRunner(model, registry, {
      limits: { maxSteps: 2, maxToolCalls: 5 },
    });

    const result = await runner.run("Investigate payment-api");

    expect(result.status).toBe("completed");

    expect(result.terminationReason).toBe("COMPLETED");

    expect(result.state.stepsUsed).toBe(2);

    expect(model.callCount).toBe(2);
  });
});

class CountingModel implements ModelAdapter {
  public callCount = 0;

  private index = 0;

  constructor(private readonly decisions: ModelDecision[]) {}

  async decide(_context: ModelContext): Promise<ModelDecision> {
    this.callCount += 1;

    const decision = this.decisions[this.index];

    if (!decision) {
      throw new Error("CountingModel has no remaining decisions");
    }

    this.index += 1;

    return decision;
  }
}

class CountingSearchLogsTool extends SearchLogsTool {
  public executionCount = 0;

  override async execute(input: Parameters<SearchLogsTool["execute"]>[0]) {
    this.executionCount += 1;

    return super.execute(input);
  }
}
