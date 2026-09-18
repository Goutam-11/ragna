import {
  describe,
  expect,
  test,
} from "bun:test";

import {
  renderTrace,
} from "../src/cli/trace-renderer";

import type {
  TraceEvent,
} from "../src/trace/events";

describe("CLI trace renderer", () => {
  test("renders trace events in execution order", () => {
    const events: TraceEvent[] = [
      {
        type: "RUN_STARTED",
        objective:
          "Why did checkout latency increase?",
      },

      {
        type: "MODEL_DECISION",
        summary:
          "Check payment-api logs.",
      },

      {
        type: "TOOL_CALL",
        tool: "search_logs",
        arguments: {
          service: "payment-api",
          level: "error",
        },
      },

      {
        type: "TOOL_RESULT",
        tool: "search_logs",
        resultKind: "evidence",
        resultId: "E1",
        result: {
          entries: [],
        },
      },

      {
        type: "MODEL_DECISION",
        summary:
          "Investigation complete.",
      },

      {
        type: "FINAL_RESPONSE",
        response: {
          evidence: [
            {
              evidenceId: "E1",
              statement:
                "Payment logs were checked.",
            },
          ],

          conclusion:
            "The investigation completed.",

          recommendations: [
            "Continue monitoring.",
          ],
        },
      },
    ];

    const output =
      renderTrace(events);

    expect(output).toContain(
      "[01] RUN_STARTED",
    );

    expect(output).toContain(
      "[02] MODEL_DECISION",
    );

    expect(output).toContain(
      "[03] TOOL_CALL",
    );

    expect(output).toContain(
      "[04] TOOL_RESULT",
    );

    expect(output).toContain(
      "[06] FINAL_RESPONSE",
    );

    expect(output).toContain(
      "[E1] Payment logs were checked.",
    );

    expect(output).toContain(
      "The investigation completed.",
    );

    expect(output).toContain(
      "- Continue monitoring.",
    );

    const runStarted =
      output.indexOf("RUN_STARTED");
    
    const modelDecision =
      output.indexOf("MODEL_DECISION");
    
    const toolCall =
      output.indexOf("TOOL_CALL");
    
    const toolResult =
      output.indexOf("TOOL_RESULT");
    
    const finalResponse =
      output.indexOf("FINAL_RESPONSE");
    
    expect(runStarted).toBeLessThan(
      modelDecision,
    );
    
    expect(modelDecision).toBeLessThan(
      toolCall,
    );
    
    expect(toolCall).toBeLessThan(
      toolResult,
    );
    
    expect(toolResult).toBeLessThan(
      finalResponse,
    );
  });

  test("renders tool errors with safe diagnostic details", () => {
    const events: TraceEvent[] = [
      {
        type: "RUN_STARTED",
        objective:
          "Investigate payment-api",
      },
  
      {
        type: "MODEL_DECISION",
        summary:
          "Check payment-api logs.",
      },
  
      {
        type: "TOOL_CALL",
        tool: "search_logs",
        arguments: {
          service: "broken-service",
        },
      },
  
      {
        type: "TOOL_ERROR",
        tool: "search_logs",
        code: "EXECUTION_FAILED",
        message: "Tool execution failed",
        details: {
          errorType: "Error",
        },
      },
    ];
  
    const output =
      renderTrace(events);
  
    expect(output).toContain(
      "[04] TOOL_ERROR",
    );
  
    expect(output).toContain(
      "Tool: search_logs",
    );
  
    expect(output).toContain(
      "Code: EXECUTION_FAILED",
    );
  
    expect(output).toContain(
      "Message: Tool execution failed",
    );
  
    expect(output).toContain(
      '"errorType": "Error"',
    );
  });

  test("renders execution limit termination", () => {
    const events: TraceEvent[] = [
      {
        type: "RUN_STARTED",
        objective:
          "Investigate payment-api",
      },
  
      {
        type: "LIMIT_REACHED",
        reason: "MAX_STEPS_REACHED",
      },
    ];
  
    const output =
      renderTrace(events);
  
    expect(output).toContain(
      "[02] LIMIT_REACHED",
    );
  
    expect(output).toContain(
      "Reason: MAX_STEPS_REACHED",
    );
  });
});