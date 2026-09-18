import {
  describe,
  expect,
  test,
} from "bun:test";

import { AgentRunner } from "../src/agent/agent-runner";
import { ScriptedModel } from "../src/model/scripted-model";

import { ToolRegistry } from "../src/tools/registry";
import { SearchLogsTool } from "../src/tools/search-logs";
import { GetMetricsTool } from "../src/tools/get-metrics";
import type { ModelAdapter, ModelContext, ModelToolDefinition } from "@/model/model";
import type { ModelDecision } from "@/model/types";

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

describe("AgentRunner multi-step investigation", () => {
  test("collects evidence from logs and metrics before producing a final response", async () => {
    // Arrange
    const registry = new ToolRegistry();

    registry.register(
      new SearchLogsTool(),
    );

    registry.register(
      new GetMetricsTool(),
    );

    const model = new ScriptedModel([
      // Step 1: investigate logs
      {
        type: "tool_call",
        tool: "search_logs",
        arguments: {
          service: "payment-api",
          level: "error",
        },
        summary:
          "Check payment-api error logs around the incident.",
      },

      // Step 2: investigate metrics
      {
        type: "tool_call",
        tool: "get_metrics",
        arguments: {
          service: "payment-api",
        },
        summary:
          "Check payment-api latency and database connection metrics.",
      },

      // Step 3: produce the grounded response
      {
        type: "final",
        response: {
          evidence: [
            {
              evidenceId: "E1",
              statement:
                "Payment API logs show database connection timeouts.",
            },
            {
              evidenceId: "E2",
              statement:
                "Payment API latency increased while database connection usage reached 100%.",
            },
          ],

          conclusion:
            "The latency increase is consistent with payment-api exhausting its database connection pool.",

          recommendations: [
            "Investigate database connection pool sizing and connection release behavior.",
          ],
        },
      },
    ]);

    const runner = new AgentRunner(
      model,
      registry,
      {
        maxSteps: 5,
        maxToolCalls: 5,
      },
    );

    // Act
    const result = await runner.run(
      "Why did checkout latency increase around 14:05?",
    );

    // Assert
    expect(result.status).toBe(
      "completed",
    );

    expect(result.terminationReason).toBe(
      "COMPLETED",
    );

    expect(result.state.stepsUsed).toBe(3);

    expect(result.state.toolCallsUsed).toBe(2);

    expect(result.state.toolErrors).toEqual([]);

    expect(result.state.evidence).toHaveLength(2);

    expect(
      result.state.evidence[0]?.id,
    ).toBe("E1");

    expect(
      result.state.evidence[0]?.source,
    ).toBe("search_logs");

    expect(
      result.state.evidence[1]?.id,
    ).toBe("E2");

    expect(
      result.state.evidence[1]?.source,
    ).toBe("get_metrics");

    expect(result.response).toEqual({
      evidence: [
        {
          evidenceId: "E1",
          statement:
            "Payment API logs show database connection timeouts.",
        },
        {
          evidenceId: "E2",
          statement:
            "Payment API latency increased while database connection usage reached 100%.",
        },
      ],

      conclusion:
        "The latency increase is consistent with payment-api exhausting its database connection pool.",

      recommendations: [
        "Investigate database connection pool sizing and connection release behavior.",
      ],
    });

    const toolCalls = result.trace.filter(
      (event) =>
        event.type === "TOOL_CALL",
    );
    
    expect(toolCalls).toHaveLength(2);
    
    expect(toolCalls[0]).toMatchObject({
      type: "TOOL_CALL",
      tool: "search_logs",
      arguments: {
        service: "payment-api",
        level: "error",
      },
    });
    
    expect(toolCalls[1]).toMatchObject({
      type: "TOOL_CALL",
      tool: "get_metrics",
      arguments: {
        service: "payment-api",
      },
    });

    expect(
      result.trace.map(
        (event) => event.type,
      ),
    ).toEqual([
      "RUN_STARTED",
    
      "MODEL_DECISION",
      "TOOL_CALL",
      "TOOL_RESULT",
    
      "MODEL_DECISION",
      "TOOL_CALL",
      "TOOL_RESULT",
    
      "MODEL_DECISION",
      "FINAL_RESPONSE",
    ]);
  });
  
  test("feeds accumulated evidence back into each model call", async () => {
    // Arrange
    const registry = new ToolRegistry();
  
    registry.register(
      new SearchLogsTool(),
    );
  
    registry.register(
      new GetMetricsTool(),
    );
  
    const model = new RecordingModel([
      {
        type: "tool_call",
        tool: "search_logs",
        arguments: {
          service: "payment-api",
          level: "error",
        },
        summary:
          "Check payment-api error logs.",
      },
  
      {
        type: "tool_call",
        tool: "get_metrics",
        arguments: {
          service: "payment-api",
        },
        summary:
          "Check payment-api metrics.",
      },
  
      {
        type: "final",
        response: {
          evidence: [
            {
              evidenceId: "E1",
              statement:
                "Payment API logs show database connection timeouts.",
            },
            {
              evidenceId: "E2",
              statement:
                "Database connection usage reached 100%.",
            },
          ],
  
          conclusion:
            "The latency increase is consistent with database connection pool exhaustion.",
  
          recommendations: [
            "Investigate connection pool sizing.",
          ],
        },
      },
    ]);
  
    const runner = new AgentRunner(
      model,
      registry,
      {
        maxSteps: 5,
        maxToolCalls: 5,
      },
    );
  
    // Act
    const result = await runner.run(
      "Why did checkout latency increase around 14:05?",
    );
  
    // Assert
    expect(result.status).toBe(
      "completed",
    );
  
    expect(model.contexts).toHaveLength(3);
  
    // First model call:
    // no evidence has been collected yet.
    expect(
      model.contexts[0]?.evidence,
    ).toEqual([]);
  
    // Second model call:
    // search_logs has completed,
    // so E1 must be available.
    expect(
      model.contexts[1]?.evidence,
    ).toHaveLength(1);
  
    expect(
      model.contexts[1]?.evidence[0],
    ).toMatchObject({
      id: "E1",
      source: "search_logs",
    });
  
    // Final model call:
    // both tools have completed,
    // so E1 and E2 must be available.
    expect(
      model.contexts[2]?.evidence,
    ).toHaveLength(2);
  
    expect(
      model.contexts[2]?.evidence.map(
        (evidence) => ({
          id: evidence.id,
          source: evidence.source,
        }),
      ),
    ).toEqual([
      {
        id: "E1",
        source: "search_logs",
      },
      {
        id: "E2",
        source: "get_metrics",
      },
    ]);
  });
});