import {
  describe,
  expect,
  test,
} from "bun:test";

import { z } from "zod";

import { AgentRunner } from "../src/agent/agent-runner";
import { StaticApprovalProvider } from "../src/approval/static-provider";
import { ScriptedModel } from "../src/model/scripted-model";
import { ToolRegistry } from "../src/tools/registry";

import type {
  ApprovalPolicy,
  Tool,
  ToolResultKind,
} from "../src/tools/tool";

class ConsequentialTestTool
  implements Tool<
    { target: string },
    { changed: boolean }
  >
{
  public executionCount = 0;

  name =
    "consequential_test_tool";

  description =
    "A consequential test operation requiring human approval.";

  resultKind:
    ToolResultKind =
      "context";

  approvalPolicy:
    ApprovalPolicy =
      "required";

  inputSchema = z
    .object({
      target: z.string(),
    })
    .strict();

  outputSchema = z.object({
    changed: z.boolean(),
  });

  async execute(
    _input: {
      target: string;
    },
  ): Promise<{
    changed: boolean;
  }> {
    this.executionCount += 1;

    return {
      changed: true,
    };
  }
}

describe("AgentRunner human approval", () => {
  test("executes a required tool exactly once after approval", async () => {
    const registry =
      new ToolRegistry();

    const tool =
      new ConsequentialTestTool();

    registry.register(tool);

    const model =
      new ScriptedModel([
        {
          type: "tool_call",

          tool:
            "consequential_test_tool",

          arguments: {
            target:
              "payment-api",
          },

          summary:
            "Perform the consequential operation.",
        },

        {
          type: "final",

          response: {
            evidence: [],

            conclusion:
              "The approved operation completed.",

            recommendations: [],
          },
        },
      ]);

    const approvalProvider =
      new StaticApprovalProvider({
        status: "approved",
      });

    const runner =
      new AgentRunner(
        model,
        registry,
        {
          limits: {
            maxSteps: 5,
            maxToolCalls: 5,
          },

          approvalProvider,

          approvalTimeoutMs:
            1_000,
        },
      );

    const result =
      await runner.run(
        "Perform an approved consequential operation",
      );

    expect(
      result.terminationReason,
    ).toBe("COMPLETED");

    expect(
      tool.executionCount,
    ).toBe(1);

    expect(
      result.state.toolCallsUsed,
    ).toBe(1);
    expect(
      result.trace.map(
        (event) => event.type,
      ),
    ).toEqual([
      "RUN_STARTED",
    
      "MODEL_DECISION",
    
      "APPROVAL_REQUIRED",
      "APPROVAL_DECISION",
    
      "TOOL_CALL",
      "TOOL_RESULT",
    
      "MODEL_DECISION",
      "FINAL_RESPONSE",
    ]);

    const approvalDecision =
      result.trace.find(
        (event) =>
          event.type ===
          "APPROVAL_DECISION",
      );
    
    expect(
      approvalDecision,
    ).toMatchObject({
      type:
        "APPROVAL_DECISION",
    
      tool:
        "consequential_test_tool",
    
      decision:
        "approved",
    });
    expect(
      result.state.context,
    ).toHaveLength(1);
    
    expect(
      result.state.context[0],
    ).toEqual({
      id: "C1",
    
      source:
        "consequential_test_tool",
    
      data: {
        changed: true,
      },
    });
    
    expect(
      result.state.evidence,
    ).toHaveLength(0);
  });

  test("does not execute a required tool when approval is denied", async () => {
    const registry =
      new ToolRegistry();
  
    const tool =
      new ConsequentialTestTool();
  
    registry.register(tool);
  
    const model =
      new ScriptedModel([
        {
          type: "tool_call",
  
          tool:
            "consequential_test_tool",
  
          arguments: {
            target:
              "payment-api",
          },
  
          summary:
            "Perform the consequential operation.",
        },
  
        // After denial, the model gets another turn.
        {
          type: "final",
  
          response: {
            evidence: [],
  
            conclusion:
              "The operation was not performed because approval was denied.",
  
            recommendations: [],
          },
        },
      ]);
  
    const approvalProvider =
      new StaticApprovalProvider({
        status: "denied",
  
        reason:
          "Operator rejected the operation.",
      });
  
    const runner =
      new AgentRunner(
        model,
        registry,
        {
          limits: {
            maxSteps: 5,
            maxToolCalls: 5,
          },
  
          approvalProvider,
  
          approvalTimeoutMs:
            1_000,
        },
      );
  
    const result =
      await runner.run(
        "Perform a consequential operation",
      );
  
    expect(
      result.terminationReason,
    ).toBe("COMPLETED");
  
    // Most important security assertion:
    // execute() must never have been reached.
    expect(
      tool.executionCount,
    ).toBe(0);
  
    // Denied approvals don't consume the
    // actual tool execution budget.
    expect(
      result.state.toolCallsUsed,
    ).toBe(0);
  
    expect(
      result.trace.map(
        (event) => event.type,
      ),
    ).toEqual([
      "RUN_STARTED",
  
      "MODEL_DECISION",
  
      "APPROVAL_REQUIRED",
      "APPROVAL_DECISION",
  
      // No TOOL_CALL
      // No TOOL_RESULT
  
      "MODEL_DECISION",
      "FINAL_RESPONSE",
    ]);
  
    const approvalRequired =
      result.trace.find(
        (event) =>
          event.type ===
          "APPROVAL_REQUIRED",
      );
  
    expect(
      approvalRequired,
    ).toMatchObject({
      type:
        "APPROVAL_REQUIRED",
  
      tool:
        "consequential_test_tool",
  
      arguments: {
        target:
          "payment-api",
      },
    });
  
    const approvalDecision =
      result.trace.find(
        (event) =>
          event.type ===
          "APPROVAL_DECISION",
      );
  
    expect(
      approvalDecision,
    ).toMatchObject({
      type:
        "APPROVAL_DECISION",
  
      tool:
        "consequential_test_tool",
  
      decision:
        "denied",
  
      reason:
        "Operator rejected the operation.",
    });
  
    // Explicitly prove execution events
    // were never emitted.
    expect(
      result.trace.some(
        (event) =>
          event.type ===
          "TOOL_CALL",
      ),
    ).toBe(false);
  
    expect(
      result.trace.some(
        (event) =>
          event.type ===
          "TOOL_RESULT",
      ),
    ).toBe(false);
  });
});