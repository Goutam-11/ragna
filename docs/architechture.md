# Architecture

## Overview

This project implements a bounded, observable agent loop for investigating operational questions using structured tools and synthetic data.

The core design principle is:

> **The model proposes actions; the harness owns execution authority.**

The model can request tool calls, but it cannot execute them directly. Validation, approval, execution, limits, state management, and tracing are controlled by the application.

```text
CLI
 │
 ▼
AgentRunner
 ├── ModelAdapter
 ├── ToolRegistry
 │    └── Tool
 ├── ApprovalProvider
 ├── RunState
 └── TraceCollector
       │
       ├── retained trace
       └── live renderEvent()
```

This separation keeps model reasoning/provider behavior independent from execution policy.

---

## AgentRunner

`AgentRunner` owns the investigation lifecycle.

For each iteration it:

1. Checks the model-step budget.
2. Builds `ModelContext` from the current run state.
3. Requests the next decision from `ModelAdapter`.
4. Accepts either a final response or structured tool request.
5. Validates requested tools and arguments.
6. Checks the tool execution budget.
7. Requests human approval when required.
8. Executes the validated tool.
9. Stores the result as context, evidence, or a structured error.
10. Repeats with the updated state.

Conceptually:

```text
Objective
   │
   ▼
ModelContext
   │
   ▼
ModelAdapter.decide()
   │
   ├── final ──────────────► return response
   │
   └── tool_call
          │
          ▼
   ToolRegistry.prepare()
          │
          ▼
      budget check
          │
          ▼
     approval gate
          │
          ▼
 ToolRegistry.executePrepared()
          │
      ┌───┴────┐
      ▼        ▼
   result     error
      │        │
      └───┬────┘
          ▼
     update state
          │
          └────────► next model decision
```

The runner therefore remains authoritative even when the model produces malformed, repetitive, or unsafe requests.

---

## ModelAdapter

`ModelAdapter` isolates the agent loop from a specific model provider.

A model receives:

- the investigation objective
- discovered context
- collected evidence
- tool errors
- approval outcomes
- available tool definitions

and returns either:

```text
tool_call
```

or:

```text
final
```

The project provides two model implementations.

`ScriptedModel` returns predefined decisions and is used for deterministic tests without network access or paid model calls.

`OpenRouterModel` provides dynamic model decisions for live CLI investigations.

Model output is not treated as trusted execution input. Tool names and arguments still pass through `ToolRegistry`.

---

## Tool

`Tool` defines the contract between the agent harness and executable capabilities.

A tool provides:

- a unique name
- a description exposed to the model
- an input schema
- an output schema
- a result classification
- an approval policy
- an asynchronous execution function

Results are classified as either:

```text
context
```

or:

```text
evidence
```

Context represents information useful for directing the investigation, such as discovered service topology.

Evidence represents observations that may support the final conclusion, such as logs, metrics, or service status.

The runner assigns context IDs such as `C1` and evidence IDs such as `E1`.

---

## ToolRegistry

`ToolRegistry` owns tool registration, lookup, validation, and validated execution.

It forms an important trust boundary between model-generated requests and application code.

### `ToolRegistry.prepare()`

`prepare()` resolves a requested tool and validates its arguments before execution.

```text
model request
    │
    ▼
tool exists?
    │
    ├── no ──► UNKNOWN_TOOL
    │
    ▼
validate input schema
    │
    ├── invalid ──► INVALID_INPUT
    │
    ▼
PreparedToolCall
```

A `PreparedToolCall` contains validated arguments and trusted metadata obtained from the registered tool.

Separating preparation from execution is important because the harness may need to check limits or request approval after validation but before performing the operation.

### `ToolRegistry.executePrepared()`

`executePrepared()` executes an already validated `PreparedToolCall`.

The tool's returned value is subsequently validated against its output schema.

Possible outcomes include:

```text
successful result
EXECUTION_FAILED
INVALID_OUTPUT
```

This creates validation boundaries on both sides of tool execution:

```text
untrusted model arguments
        │
    input schema
        │
        ▼
     Tool.execute()
        │
    output schema
        │
        ▼
validated observation
```

---

## ApprovalProvider

`ApprovalProvider` abstracts human authorization for tools that require explicit approval.

Read-only investigation tools can execute without approval, while consequential tools may declare approval as required.

The runner emits an `APPROVAL_REQUIRED` event before requesting authorization.

An approval decision can be:

```text
approved
denied
timed_out
```

Only an approved request proceeds to actual tool execution.

Denied or timed-out requests do not consume a tool execution because the underlying tool was never called.

This preserves the same execution-authority principle used elsewhere in the harness: the model may request an action, but it cannot authorize that action itself.

---

## `requestApprovalWithTimeout()`

`requestApprovalWithTimeout()` wraps an `ApprovalProvider` with a bounded wait.

Conceptually:

```text
ApprovalProvider.requestApproval()
              │
              ├──────── approved
              ├──────── denied
              │
timeout ──────┴──────── timed_out
```

This prevents an asynchronous approval provider from leaving an investigation waiting indefinitely.

The current CLI provider is intentionally lightweight. A production implementation would require stronger cancellation and durable approval-state handling.

---

## Execution Limits

Every run has configurable limits:

```text
maxSteps
maxToolCalls
```

`maxSteps` limits model decisions.

`maxToolCalls` limits actual tool execution attempts.

The harness checks limits before performing additional model or tool work rather than relying on the model to stop itself.

When a budget is exhausted, the runner records:

```text
LIMIT_REACHED
```

and terminates with a structured reason such as:

```text
MAX_STEPS_REACHED
MAX_TOOL_CALLS_REACHED
```

This bounds execution even if a model repeatedly requests additional work.

---

## Run State

The runner retains only the state required for subsequent investigation decisions.

This includes:

```text
objective
context
evidence
tool errors
approval outcomes
steps used
tool calls used
```

After each tool result or error, a new `ModelContext` is built from this accumulated state.

Consequently, later model calls can use earlier observations instead of operating as isolated requests.

Run state is currently in memory and scoped to a single investigation.

---

## Operational Tracing

The agent records operational events such as:

```text
RUN_STARTED
MODEL_DECISION
APPROVAL_REQUIRED
APPROVAL_DECISION
TOOL_CALL
TOOL_RESULT
TOOL_ERROR
LIMIT_REACHED
FINAL_RESPONSE
```

These events describe observable execution behavior rather than hidden model reasoning.

The system records concise model-visible summaries where useful but does not persist private chain-of-thought.

---

## Trace Safety

### `sanitizeForTrace()`

`sanitizeForTrace()` processes values before they are placed into operational traces.

It:

- recursively processes structured values
- redacts known sensitive keys
- handles sensitive keys case-insensitively
- truncates oversized strings
- avoids mutating the original value

For example:

```json
{
  "service": "payment-api",
  "apiKey": "secret"
}
```

is represented as:

```json
{
  "service": "payment-api",
  "apiKey": "[REDACTED]"
}
```

Raw tool exception messages are also kept out of normal operational traces; only controlled diagnostic information is exposed.

This is a defensive trace-safety mechanism, not a complete production secret-detection system.

---

## Live Trace Rendering

The runner emits trace events through a common path:

```text
             ┌──► TraceCollector
             │
AgentRunner ─┤
             │
             └──► onTraceEvent
                       │
                       ▼
                  renderEvent()
```

An event is therefore retained and optionally displayed live without creating separate execution behavior.

### `renderEvent()`

`renderEvent()` converts one `TraceEvent` and its presentation sequence number into human-readable CLI output.

For example:

```text
[05] TOOL_CALL
  Tool: get_service_status
  Arguments:
    {
      "service": "checkout-api"
    }
```

The sequence number belongs to presentation rather than the underlying event, allowing the same trace events to be stored or consumed by another interface without CLI-specific metadata.

`renderTrace()` reuses `renderEvent()` to render a complete retained trace.

---

## Failure Handling

Tool failures are represented as structured errors rather than uncontrolled exceptions escaping the agent loop.

A failure is:

1. added to run state
2. emitted as `TOOL_ERROR`
3. supplied to the next model decision

The model can then choose another source or finish with the information available.

This makes failure recovery part of normal agent execution rather than a separate exceptional path.

---

## Trust Boundaries

The architecture intentionally places control outside the model.

```text
Model
  │
  │ proposes
  ▼
Tool name + arguments
  │
  ▼
┌──────────────────────────────┐
│      Application Harness     │
│                              │
│ validation                   │
│ execution budgets            │
│ approval                     │
│ tool execution               │
│ output validation            │
│ state                        │
│ tracing                      │
└──────────────────────────────┘
```

The model can influence which action is requested, but application code determines whether and how that action is executed.

---

## Cloud Evolution

The current implementation is local and in-memory, but the core interfaces do not depend on the CLI.

A cloud version could evolve toward:

```text
HTTP API
   │
   ▼
Queue
   │
   ▼
Worker
   │
   ▼
AgentRunner
   │
   ├── ModelAdapter
   ├── ToolRegistry
   ├── ApprovalProvider
   │
   └── persistent trace/state storage
```

### HTTP API

The API would accept an investigation objective and create a run identifier rather than executing the complete investigation inside the request.

### Queue

A queue would decouple request handling from potentially long-running model/tool execution and allow investigations to be retried or distributed.

### Worker

Workers would consume queued runs and execute the same `AgentRunner` used by the local application.

The execution semantics would therefore remain unchanged.

### Persistent trace and state storage

The current in-memory `RunState` and trace collection could be replaced or supplemented with persistent implementations.

This would enable:

- run history
- resumable investigations
- durable approval requests
- auditability
- live event delivery
- worker recovery

The important point is that this evolution does not require moving execution authority into the model.

The same relationship remains:

```text
model proposes
        │
        ▼
AgentRunner validates and controls
        │
        ▼
tools execute
```

Production deployment would additionally require authentication, authorization, cancellation, durable timeouts, isolation, telemetry, and appropriate retry policies. Those concerns are intentionally outside the scope of this implementation.