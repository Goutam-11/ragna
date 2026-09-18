import {
  describe,
  expect,
  test,
} from "bun:test";

import { AgentRunner } from "../src/agent/agent-runner";
import { ScriptedModel } from "../src/model/scripted-model";

import { ToolRegistry } from "../src/tools/registry";
import { GetServiceStatusTool } from "../src/tools/get-service-status";

describe("get_service_status", () => {
  test("executes with structured arguments and returns the expected result", async () => {
    const registry = new ToolRegistry();

    registry.register(
      new GetServiceStatusTool(),
    );

    const result = await registry.execute(
      "get_service_status",
      {
        service: "payment-api",
      },
    );

    expect(result.success).toBe(true);

    if (!result.success) {
      throw new Error(
        "Expected get_service_status to succeed",
      );
    }

    expect(result.data).toEqual({
      service: "payment-api",
      status: "degraded",
      message:
        "Elevated latency observed during payment processing.",
    });
  });

  test("rejects malformed structured arguments", async () => {
    const registry = new ToolRegistry();
  
    registry.register(
      new GetServiceStatusTool(),
    );
  
    const result = await registry.execute(
      "get_service_status",
      {
        serviceName: "payment-api",
      },
    );
  
    expect(result.success).toBe(false);
  
    if (result.success) {
      throw new Error(
        "Expected argument validation to fail",
      );
    }
  
    expect(result.error).toMatchObject({
      code: "INVALID_INPUT",
      toolName: "get_service_status",
    });
  });

  test("stores successful service status result as evidence", async () => {
    const registry = new ToolRegistry();
  
    registry.register(
      new GetServiceStatusTool(),
    );
  
    const model = new ScriptedModel([
      {
        type: "tool_call",
        tool: "get_service_status",
        arguments: {
          service: "payment-api",
        },
        summary:
          "Check the operational status of payment-api.",
      },
  
      {
        type: "final",
        response: {
          evidence: [
            {
              evidenceId: "E1",
              statement:
                "Payment API is currently degraded.",
            },
          ],
  
          conclusion:
            "The service status confirms payment-api degradation.",
  
          recommendations: [
            "Continue investigating the source of the degradation.",
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
  
    const result = await runner.run(
      "Check whether payment-api is degraded",
    );
  
    expect(result.status).toBe(
      "completed",
    );
  
    expect(result.state.evidence).toHaveLength(
      1,
    );
  
    expect(
      result.state.evidence[0],
    ).toEqual({
      id: "E1",
      source: "get_service_status",
  
      data: {
        service: "payment-api",
        status: "degraded",
        message:
          "Elevated latency observed during payment processing.",
      },
    });
  });
});