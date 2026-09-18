import {
  describe,
  expect,
  test,
} from "bun:test";

import { AgentRunner } from "../src/agent/agent-runner";
import { ScriptedModel } from "../src/model/scripted-model";
import { ToolRegistry } from "../src/tools/registry";
import { SearchLogsTool } from "../src/tools/search-logs";
import { z } from "zod";
import type { ApprovalPolicy, Tool, ToolResultKind } from "../src/tools/tool";

class SecretFailingTool
  implements Tool<{}, { ok: boolean }>
{
  name = "secret_failing_tool";

  description =
    "A test tool that deliberately fails.";

  resultKind: ToolResultKind = "evidence";

  inputSchema = z.object({}).strict();
  approvalPolicy: ApprovalPolicy = "never";

  outputSchema = z.object({
    ok: z.boolean(),
  });

  async execute(
    _input: {},
  ): Promise<{ ok: boolean }> {
    throw new Error(
      "Request failed using token super-secret-token-123",
    );
  }
}

describe("AgentRunner trace", () => {
  test("records successful execution events in order", async () => {
    const registry = new ToolRegistry();

    registry.register(
      new SearchLogsTool(),
    );

    const model = new ScriptedModel([
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
        type: "final",
        response: {
          evidence: [
            {
              evidenceId: "E1",
              statement:
                "Payment API reported database errors.",
            },
          ],
          conclusion:
            "Database errors correlate with the incident.",
          recommendations: [
            "Investigate database connectivity.",
          ],
        },
      },
    ]);

    const runner = new AgentRunner(
      model,
      registry,
    );

    const result = await runner.run(
      "Why were payments failing?",
    );

    expect(
      result.trace.map((event) => event.type),
    ).toEqual([
      "RUN_STARTED",
      "MODEL_DECISION",
      "TOOL_CALL",
      "TOOL_RESULT",
      "MODEL_DECISION",
      "FINAL_RESPONSE",
    ]);

    const runStarted = result.trace[0];
    
    expect(runStarted).toEqual({
      type: "RUN_STARTED",
      objective: "Why were payments failing?",
    });

    const toolCall = result.trace[2];
    
    expect(toolCall).toEqual({
      type: "TOOL_CALL",
      tool: "search_logs",
      arguments: {
        service: "payment-api",
        level: "error",
      },
    });

    const toolResult = result.trace[3];
    
    expect(toolResult).toMatchObject({
      type: "TOOL_RESULT",
      tool: "search_logs",
      evidenceId: "E1",
    });
  });
  
  test("records tool failures as TOOL_ERROR", async () => {
    const registry = new ToolRegistry();
  
    registry.register(
      new SearchLogsTool(),
    );
  
    const model = new ScriptedModel([
      {
        type: "tool_call",
        tool: "search_logs",
        arguments: {
          service: "broken-service",
        },
        summary:
          "Search logs for the failing service.",
      },
  
      {
        type: "final",
        response: {
          evidence: [],
          conclusion:
            "Log retrieval failed, so evidence is limited.",
          recommendations: [
            "Retry log retrieval later.",
          ],
        },
      },
    ]);
  
    const runner = new AgentRunner(
      model,
      registry,
    );
  
    const result = await runner.run(
      "Investigate broken-service",
    );
  
    expect(
      result.trace.map((event) => event.type),
    ).toEqual([
      "RUN_STARTED",
      "MODEL_DECISION",
      "TOOL_CALL",
      "TOOL_ERROR",
      "MODEL_DECISION",
      "FINAL_RESPONSE",
    ]);
  
    const toolError = result.trace[3];
  
    expect(toolError).toEqual({
      type: "TOOL_ERROR",
      tool: "search_logs",
      code: "EXECUTION_FAILED",
      message: "Tool execution failed",
      details: {
        errorType: "Error",
      },
    });
  });

  test("records LIMIT_REACHED when model step budget is exhausted", async () => {
    const registry = new ToolRegistry();
  
    registry.register(
      new SearchLogsTool(),
    );
  
    const model = new ScriptedModel([
      {
        type: "tool_call",
        tool: "search_logs",
        arguments: {
          service: "payment-api",
        },
        summary: "First search.",
      },
  
      {
        type: "tool_call",
        tool: "search_logs",
        arguments: {
          service: "payment-api",
        },
        summary: "Second search.",
      },
  
      {
        type: "final",
        response: {
          evidence: [],
          conclusion: "Should never happen.",
          recommendations: [],
        },
      },
    ]);
  
    const runner = new AgentRunner(
      model,
      registry,
      {
        maxSteps: 2,
        maxToolCalls: 10,
      },
    );
  
    const result = await runner.run(
      "Investigate payment-api",
    );
  
    expect(result.terminationReason).toBe(
      "MAX_STEPS_REACHED",
    );
  
    expect(
      result.trace.map((event) => event.type),
    ).toEqual([
      "RUN_STARTED",
  
      "MODEL_DECISION",
      "TOOL_CALL",
      "TOOL_RESULT",
  
      "MODEL_DECISION",
      "TOOL_CALL",
      "TOOL_RESULT",
  
      "LIMIT_REACHED",
    ]);
  
    expect(result.trace.at(-1)).toEqual({
      type: "LIMIT_REACHED",
      reason: "MAX_STEPS_REACHED",
    });
  });

  test("records limit before executing a tool beyond the tool budget", async () => {
    const registry = new ToolRegistry();
  
    registry.register(
      new SearchLogsTool(),
    );
  
    const model = new ScriptedModel([
      {
        type: "tool_call",
        tool: "search_logs",
        arguments: {
          service: "payment-api",
        },
        summary: "First search.",
      },
  
      {
        type: "tool_call",
        tool: "search_logs",
        arguments: {
          service: "payment-api",
        },
        summary: "Second search.",
      },
    ]);
  
    const runner = new AgentRunner(
      model,
      registry,
      {
        maxSteps: 10,
        maxToolCalls: 1,
      },
    );
  
    const result = await runner.run(
      "Investigate payment-api",
    );
  
    expect(result.terminationReason).toBe(
      "MAX_TOOL_CALLS_REACHED",
    );
  
    expect(
      result.trace.map((event) => event.type),
    ).toEqual([
      "RUN_STARTED",
  
      "MODEL_DECISION",
      "TOOL_CALL",
      "TOOL_RESULT",
  
      // Model is allowed to decide again.
      "MODEL_DECISION",
  
      // But there must NOT be another TOOL_CALL.
      "LIMIT_REACHED",
    ]);
  
    expect(result.trace.at(-1)).toEqual({
      type: "LIMIT_REACHED",
      reason: "MAX_TOOL_CALLS_REACHED",
    });
  });

  test("does not expose raw exception messages in TOOL_ERROR trace", async () => {
    const registry = new ToolRegistry();
  
    registry.register(
      new SecretFailingTool(),
    );
  
    const model = new ScriptedModel([
      {
        type: "tool_call",
        tool: "secret_failing_tool",
        arguments: {},
        summary: "Call failing tool.",
      },
  
      {
        type: "final",
        response: {
          evidence: [],
          conclusion:
            "The tool failed.",
          recommendations: [],
        },
      },
    ]);
  
    const runner = new AgentRunner(
      model,
      registry,
    );
  
    const result = await runner.run(
      "Test secret-safe error tracing",
    );
  
    const serializedTrace =
      JSON.stringify(result.trace);
  
    expect(serializedTrace).not.toContain(
      "super-secret-token-123",
    );
  
    const toolError = result.trace.find(
      (event) =>
        event.type === "TOOL_ERROR",
    );
  
    expect(toolError).toMatchObject({
      type: "TOOL_ERROR",
      tool: "secret_failing_tool",
      code: "EXECUTION_FAILED",
      message: "Tool execution failed",
    });
  });
});