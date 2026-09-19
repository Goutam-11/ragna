import type { ModelAdapter, ModelContext } from "@/model/model";

import type { FinalDecision } from "@/model/types";

import { ToolRegistry, type PreparedToolCall } from "@/tools/registry";

import type { ContextItem, Evidence, RunState } from "./types";
import {
  DEFAULT_EXECUTION_LIMITS,
  validateExecutionLimits,
  type ExecutionLimits,
} from "./limits";

import { TraceCollector } from "../trace/collector";
import type { TraceEvent } from "../trace/events";
import { sanitizeForTrace } from "../trace/redact";
import { requestApprovalWithTimeout } from "@/approval/request";
import type { ApprovalProvider } from "@/approval/provider";

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

export interface AgentRunnerOptions {
  limits?: ExecutionLimits;
  approvalProvider?: ApprovalProvider;
  approvalTimeoutMs?: number;
  onTraceEvent?: (
      event: TraceEvent,
    ) => void | Promise<void>;
}

export class AgentRunner {
  private readonly approvalProvider?: ApprovalProvider;
  private readonly approvalTimeoutMs: number;
  private readonly limits: ExecutionLimits;
  private readonly onTraceEvent?:
    AgentRunnerOptions["onTraceEvent"];
  constructor(
    private readonly model: ModelAdapter,
    private readonly tools: ToolRegistry,
    options: AgentRunnerOptions = {},
  ) {
    this.limits = options.limits ?? DEFAULT_EXECUTION_LIMITS;

    this.approvalProvider = options.approvalProvider;

    this.approvalTimeoutMs = options.approvalTimeoutMs ?? 30_000;

    this.onTraceEvent = options.onTraceEvent;

    validateExecutionLimits(this.limits);
  }

  private async emit(
    trace: TraceCollector,
    event: TraceEvent,
  ): Promise<void> {
    trace.record(event);
  
    await this.onTraceEvent?.(
      event,
    );
  }

  private async handleApproval(
    call: PreparedToolCall,
    summary: string,
    trace: TraceCollector,
  ): Promise<
    | {
        status: "approved";
        requestId: string;
      }
    | {
        status: "denied" | "timed_out";

        requestId: string;
        message: string;
      }
    > {
    if(!this.approvalProvider) {
      return { status: "denied", requestId: crypto.randomUUID(), message: "No approval provider configured."};
    }
    if(!this.approvalTimeoutMs) {
      return { status: "denied", requestId: crypto.randomUUID(), message: "No approval timeout configured."};
    }
    
    const requestId = crypto.randomUUID();

    const request = {
      requestId,

      tool: call.toolName,

      arguments: call.arguments,

      summary,

      timeoutMs: this.approvalTimeoutMs,
    };

    await this.emit(trace, {
      type: "APPROVAL_REQUIRED",

      requestId,

      tool: call.toolName,

      arguments: sanitizeForTrace(call.arguments),

      summary: sanitizeForTrace(summary) as string,

      timeoutMs: this.approvalTimeoutMs,
    });

    // No provider means we fail closed.
    if (!this.approvalProvider) {
      await this.emit(trace, {
        type: "APPROVAL_DECISION",

        requestId,

        tool: call.toolName,

        decision: "denied",

        reason: "No approval provider configured.",
      });

      return {
        status: "denied",
        requestId,

        message:
          "Tool execution denied because no approval provider is configured.",
      };
    }

    const decision = await requestApprovalWithTimeout(
      this.approvalProvider,
      request,
    );

    if (decision.status === "approved") {
      await this.emit(trace, {
        type: "APPROVAL_DECISION",

        requestId,

        tool: call.toolName,

        decision: "approved",
      });

      return {
        status: "approved",
        requestId,
      };
    }

    if (decision.status === "denied") {
      const message = decision.reason ?? "Human approval was denied.";

      await this.emit(trace, {
        type: "APPROVAL_DECISION",

        requestId,

        tool: call.toolName,

        decision: "denied",

        reason: sanitizeForTrace(message) as string,
      });

      return {
        status: "denied",
        requestId,
        message,
      };
    }

    await this.emit(trace, {
      type: "APPROVAL_DECISION",

      requestId,

      tool: call.toolName,

      decision: "timed_out",
    });

    return {
      status: "timed_out",

      requestId,

      message: "Human approval timed out.",
    };
  }

  async run(objective: string): Promise<AgentRunResult> {
    const trace = new TraceCollector();

    await this.emit(trace, {
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
        await this.emit(trace, {
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

        approvals: state.approvals,
      };
      // Ask the model what should happen next.
      const decision = await this.model.decide(
        context,
        this.tools.getModelDefinitions(),
      );

      await this.emit(trace, {
        type: "MODEL_DECISION",
        summary:
          decision.type === "tool_call"
            ? decision.summary
            : "Investigation complete.",
      });

      state.stepsUsed += 1;

      // The model has decided that the investigation is complete.
      if (decision.type === "final") {
        await this.emit(trace, {
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
        await this.emit(trace, {
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

      const prepared = this.tools.prepare(decision.tool, decision.arguments);

      if (!prepared.success) {
        state.toolErrors.push({
          tool: decision.tool,

          code: prepared.error.code,

          message: prepared.error.message,
        });

        await this.emit(trace, {
          type: "TOOL_ERROR",

          tool: decision.tool,

          code: prepared.error.code,

          message: prepared.error.message,

          details: sanitizeForTrace(
            getSafeErrorDetails(prepared.error.details),
          ),
        });

        continue;
      }

      const call = prepared.call;

      if (call.approval === "required") {
        const outcome = await this.handleApproval(
          call,
          decision.summary,
          trace,
        );

        if (outcome.status !== "approved") {
          state.approvals.push({
            requestId: outcome.requestId,

            tool: call.toolName,

            status: outcome.status,

            message: outcome.message,
          });

          continue;
        }
      }

      await this.emit(trace, {
        type: "TOOL_CALL",

        tool: call.toolName,

        arguments: sanitizeForTrace(call.arguments),
      });

      const result = await this.tools.executePrepared(call);

      state.toolCallsUsed += 1;

      if (result.success) {
        if (result.kind === "context") {
          const contextItem: ContextItem = {
            id: `C${state.context.length + 1}`,
            source: decision.tool,
            data: result.data,
          };

          state.context.push(contextItem);

          await this.emit(trace, {
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

          await this.emit(trace, {
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

      await this.emit(trace, {
        type: "TOOL_ERROR",
        tool: decision.tool,
        code: result.error.code,
        message: result.error.message,
        details: sanitizeForTrace(getSafeErrorDetails(result.error.details)),
      });
    }
  }
  
  async runInteractive(
    createRunner: () => AgentRunner,
  ): Promise<void> {
    console.log(
      "\nObservable Agent Loop",
    );
  
    console.log(
      'Type "exit" to quit.\n',
    );
  
    while (true) {
      const input =
        prompt("> ");
  
      if (input === null) {
        break;
      }
  
      const objective =
        input.trim();
  
      if (!objective) {
        continue;
      }
  
      if (
        objective === "exit" ||
        objective === "quit"
      ) {
        break;
      }
  
      const runner =
        createRunner();
  
      try {
        const result =
          await runner.run(
            objective,
          );
  
        console.log(
          `\nTermination: ${result.terminationReason}`,
        );
  
        console.log(
          `Steps: ${result.state.stepsUsed}`,
        );
  
        console.log(
          `Tool calls: ${result.state.toolCallsUsed}\n`,
        );
      } catch (error) {
        console.error(
          "\nInvestigation failed:",
          error instanceof Error
            ? error.message
            : error,
        );
      }
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
