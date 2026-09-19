import {
  describe,
  expect,
  test,
} from "bun:test";

import { AgentRunner } from "../src/agent/agent-runner";

import type {
  ModelAdapter,
  ModelContext,
  ModelToolDefinition,
} from "../src/model/model";

import type {
  ModelDecision,
} from "../src/model/types";

import { ToolRegistry } from "../src/tools/registry";
import { SearchLogsTool } from "../src/tools/search-logs";
import { GetMetricsTool } from "../src/tools/get-metrics";

describe("AgentRunner failure recovery", () => {
  test("feeds tool failure back to model and recovers with another tool", async () => {
    // Arrange
    const registry = new ToolRegistry();

    registry.register(
      new SearchLogsTool(),
    );

    registry.register(
      new GetMetricsTool(),
    );

    const model = new RecordingModel([
      // Step 1: this deliberately fails.
      {
        type: "tool_call",
        tool: "search_logs",
        arguments: {
          service: "broken-service",
        },
        summary:
          "Check logs for the affected service.",
      },

      // Step 2: recover using another source.
      {
        type: "tool_call",
        tool: "get_metrics",
        arguments: {
          service: "payment-api",
        },
        summary:
          "Logs are unavailable, so check metrics instead.",
      },

      // Step 3: finish using the evidence we could collect.
      {
        type: "final",
        response: {
          evidence: [
            {
              evidenceId: "E1",
              statement:
                "Payment API metrics show elevated latency and database connection usage.",
            },
          ],

          conclusion:
            "The investigation recovered using metrics after log retrieval failed.",

          recommendations: [
            "Investigate database connection pool usage.",
            "Retry log retrieval when the log source becomes available.",
          ],
        },
      },
    ]);

    const runner = new AgentRunner(model, registry, {
      limits: { maxSteps: 5, maxToolCalls: 5 },
    });


    // Act
    const result = await runner.run(
      "Investigate the payment latency incident",
    );

    // Assert
    expect(result.status).toBe(
      "completed",
    );

    expect(result.terminationReason).toBe(
      "COMPLETED",
    );

    expect(result.state.stepsUsed).toBe(3);

    // Failed attempts also consume tool budget.
    expect(result.state.toolCallsUsed).toBe(2);

    // Only the successful metrics call becomes evidence.
    expect(result.state.evidence).toHaveLength(1);

    expect(
      result.state.evidence[0],
    ).toMatchObject({
      id: "E1",
      source: "get_metrics",
    });

    // The failed log call is retained separately.
    expect(result.state.toolErrors).toHaveLength(1);

    expect(
      result.state.toolErrors[0],
    ).toMatchObject({
      tool: "search_logs",
      code: "EXECUTION_FAILED",
      message: "Tool execution failed",
    });
  });
});

class RecordingModel
  implements ModelAdapter
{
  public readonly contexts: ModelContext[] = [];

  private index = 0;

  constructor(
    private readonly decisions: ModelDecision[],
  ) {}

  async decide(
    context: ModelContext,
    _tools: ModelToolDefinition[],
  ): Promise<ModelDecision> {
    this.contexts.push(
      structuredClone(context),
    );

    const decision =
      this.decisions[this.index];

    if (!decision) {
      throw new Error(
        "RecordingModel has no remaining decisions",
      );
    }

    this.index += 1;

    return decision;
  }
}