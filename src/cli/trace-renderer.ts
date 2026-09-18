  import type { FinalDecision } from "@/model/types";
import type { FinalResponseEvent, TraceEvent } from "../trace/events";
  
  export function renderTrace(
    events: readonly TraceEvent[],
  ): string {
    return events
      .map((event, index) =>
        renderEvent(event, index + 1),
      )
      .join("\n\n");
  }
  
  function renderEvent(
    event: TraceEvent,
    sequence: number,
  ): string {
    const prefix = `[${formatSequence(sequence)}]`;
  
    switch (event.type) {
      case "RUN_STARTED":
        return [
          `${prefix} RUN_STARTED`,
          indent(`Objective: ${event.objective}`),
        ].join("\n");
  
      case "MODEL_DECISION":
        return [
          `${prefix} MODEL_DECISION`,
          indent(event.summary),
        ].join("\n");
      case "APPROVAL_REQUIRED":
        return [
          `${prefix} APPROVAL_REQUIRED`,
          indent(`Request ID: ${event.requestId}`),
          indent(`Tool: ${event.tool}`),
          indent("Arguments:"),
          indent(
            formatValue(event.arguments),
            4,
          ),
        ].join("\n");
      case "APPROVAL_DECISION":
        return [
          `${prefix} APPROVAL_DECISION`,
          indent(`Request ID: ${event.requestId}`),
          indent(`Tool: ${event.tool}`),
          indent(`Decision: ${event.decision}`),
          indent("Reason:"),
          indent(
            formatValue(event.reason),
            4,
          ),
        ].join("\n");
      case "TOOL_CALL":
        return [
          `${prefix} TOOL_CALL`,
          indent(`Tool: ${event.tool}`),
          indent("Arguments:"),
          indent(
            formatValue(event.arguments),
            4,
          ),
        ].join("\n");
  
      case "TOOL_RESULT":
        return [
          `${prefix} TOOL_RESULT`,
          indent(`Tool: ${event.tool}`),
          indent(
            `Result: ${event.resultKind} ${event.resultId}`,
          ),
          indent("Result:"),
          indent(
            formatValue(event.result),
            4,
          ),
        ].join("\n");
  
      case "TOOL_ERROR":
        return renderToolError(
          event,
          prefix,
        );
  
      case "LIMIT_REACHED":
        return [
          `${prefix} LIMIT_REACHED`,
          indent(`Reason: ${event.reason}`),
        ].join("\n");
  
      case "FINAL_RESPONSE":
        return renderFinalResponse(
          event.response as FinalDecision["response"],
          prefix,
        );
  
      default:
        return assertNever(event);
    }
  }
  
  function renderToolError(
    event: Extract<
      TraceEvent,
      { type: "TOOL_ERROR" }
    >,
    prefix: string,
  ): string {
    const lines = [
      `${prefix} TOOL_ERROR`,
      indent(`Tool: ${event.tool}`),
      indent(`Code: ${event.code}`),
      indent(`Message: ${event.message}`),
    ];
  
    if (event.details !== undefined) {
      lines.push(
        indent("Details:"),
        indent(
          formatValue(event.details),
          4,
        ),
      );
    }
  
    return lines.join("\n");
  }
  
  function renderFinalResponse(
    response: FinalDecision["response"],
    prefix: string,
  ): string {
    const lines: string[] = [
      `${prefix} FINAL_RESPONSE`,
      "",
      "  Evidence:",
    ];
  
    if (response.evidence.length === 0) {
      lines.push(
        "    No evidence collected.",
      );
    } else {
      for (
        const evidence
        of response.evidence
      ) {
        lines.push(
          `    [${evidence.evidenceId}] ${evidence.statement}`,
        );
      }
    }
  
    lines.push(
      "",
      "  Conclusion:",
      indent(response.conclusion, 4),
      "",
      "  Recommendations:",
    );
  
    if (
      response.recommendations.length === 0
    ) {
      lines.push("    None.");
    } else {
      for (
        const recommendation
        of response.recommendations
      ) {
        lines.push(
          `    - ${recommendation}`,
        );
      }
    }
  
    return lines.join("\n");
  }
  
  function formatValue(
    value: unknown,
  ): string {
    return JSON.stringify(
      value,
      null,
      2,
    );
  }
  
  function indent(
    value: string,
    spaces = 2,
  ): string {
    const padding = " ".repeat(spaces);
  
    return value
      .split("\n")
      .map((line) => `${padding}${line}`)
      .join("\n");
  }
  
  function formatSequence(
    sequence: number,
  ): string {
    return sequence
      .toString()
      .padStart(2, "0");
  }
  
  function assertNever(
    value: never,
  ): never {
    throw new Error(
      `Unhandled trace event: ${JSON.stringify(value)}`,
    );
  }