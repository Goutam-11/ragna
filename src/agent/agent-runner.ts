import type { ModelAdapter, ModelContext } from "@/model/model";

import type { FinalDecision } from "@/model/types";

import { ToolRegistry } from "@/tools/registry";

import type { ContextItem, Evidence, RunState } from "./types";
import {
  DEFAULT_EXECUTION_LIMITS,
  validateExecutionLimits,
  type ExecutionLimits,
} from "./limits";

import { TraceCollector } from "../trace/collector";
import type { TraceEvent } from "../trace/events";
import { sanitizeForTrace } from "../trace/redact";

export type AgentRunResult =
  | {
      status: "completed";
      terminationReason: "COMPLETED";
      response: FinalDecision["response"];
      state: RunState;
      trace: readonly TraceEvent[];
    }
  | {
      status: "stopped";
      terminationReason: "MAX_STEPS_REACHED" | "MAX_TOOL_CALLS_REACHED";
      response: null;
      state: RunState;
      trace: readonly TraceEvent[];
    };

export class AgentRunner {
  constructor(
    private readonly model: ModelAdapter,
    private readonly tools: ToolRegistry,
    private readonly limits: ExecutionLimits = DEFAULT_EXECUTION_LIMITS,
  ) {
    validateExecutionLimits(limits);
  }

  async run(objective: string): Promise<AgentRunResult> {
    const trace = new TraceCollector();

    trace.record({
      type: "RUN_STARTED",
      objective,
    });

    const state: RunState = {
      objective,
      context: [],
      evidence: [],
      toolErrors: [],
      stepsUsed: 0,
      approvals: [],
      toolCallsUsed: 0,
    };

    while (true) {
      // IMPORTANT:
      // Check BEFORE making another model call.
      if (state.stepsUsed >= this.limits.maxSteps) {
        trace.record({
          type: "LIMIT_REACHED",
          reason: "MAX_STEPS_REACHED",
        });

        return {
          status: "stopped",
          terminationReason: "MAX_STEPS_REACHED",
          response: null,
          state,
          trace: trace.getEvents(),
        };
      }

      // Build the context the model is allowed to see.
      const context: ModelContext = {
        objective: state.objective,
        context: state.context,
        evidence: state.evidence,
        toolErrors: state.toolErrors,
      };

      // Ask the model what should happen next.
      const decision = await this.model.decide(
        context,
        this.tools.getModelDefinitions(),
      );

      trace.record({
        type: "MODEL_DECISION",
        summary:
          decision.type === "tool_call"
            ? decision.summary
            : "Investigation complete.",
      });

      state.stepsUsed += 1;

      // The model has decided that the investigation is complete.
      if (decision.type === "final") {
        trace.record({
          type: "FINAL_RESPONSE",
          response: sanitizeForTrace(decision.response),
        });

        return {
          status: "completed",
          terminationReason: "COMPLETED",
          response: decision.response,
          state,
          trace: trace.getEvents(),
        };
      }

      // IMPORTANT:
      // The model requested a tool, but we have NOT
      // executed it yet.
      //
      // Check the tool budget before registry.execute().
      if (state.toolCallsUsed >= this.limits.maxToolCalls) {
        trace.record({
          type: "LIMIT_REACHED",
          reason: "MAX_TOOL_CALLS_REACHED",
        });

        return {
          status: "stopped",
          terminationReason: "MAX_TOOL_CALLS_REACHED",
          response: null,
          state,
          trace: trace.getEvents(),
        };
      }

      trace.record({
        type: "TOOL_CALL",
        tool: decision.tool,
        arguments: sanitizeForTrace(decision.arguments),
      });

      const result = await this.tools.execute(
        decision.tool,
        decision.arguments,
      );

      state.toolCallsUsed += 1;

      if (result.success) {
        if (result.kind === "context") {
          const contextItem = {
            id: `C${state.context.length + 1}`,
            source: decision.tool,
            data: result.data,
          };

          state.context.push(contextItem);

          trace.record({
            type: "TOOL_RESULT",
            tool: decision.tool,
            resultKind: "context",
            resultId: contextItem.id,
            result: sanitizeForTrace(result.data),
          });
        } else {
          const evidence: Evidence = {
            id: `E${state.evidence.length + 1}`,
            source: decision.tool,
            data: result.data,
          };

          state.evidence.push(evidence);

          trace.record({
            type: "TOOL_RESULT",
            tool: decision.tool,
            resultKind: "evidence",
            resultId: evidence.id,
            result: sanitizeForTrace(result.data),
          });
        }
        continue;
      }

      state.toolErrors.push({
        tool: decision.tool,
        code: result.error.code,
        message: result.error.message,
      });

      trace.record({
        type: "TOOL_ERROR",
        tool: decision.tool,
        code: result.error.code,
        message: result.error.message,
        details: sanitizeForTrace(getSafeErrorDetails(result.error.details)),
      });
    }
  }
}

function getSafeErrorDetails(details: unknown): unknown {
  if (typeof details !== "object" || details === null) {
    return undefined;
  }

  const record = details as Record<string, unknown>;

  return {
    errorType: record.errorType,
  };
}
