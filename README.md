# Observable Agent Loop

A bounded, observable agent execution harness for investigating operational questions using structured tools and synthetic system data.

The project demonstrates an agent architecture in which an LLM can **propose actions**, but the application harness retains control over tool validation, execution, limits, approvals, state, and tracing.

It was built for the **Product Engineering Challenge – Problem 4: Observable Agent Loop**.

---

## Overview

Given an investigation objective such as:

```text
Why did checkout latency increase around 14:05?
```

the agent can:

1. Inspect the available services.
2. Select appropriate tools.
3. Execute structured tool calls.
4. Feed tool results back into subsequent model decisions.
5. Gather evidence from multiple sources.
6. Recover from tool failures where possible.
7. Stop when execution limits are reached.
8. Produce a final response that separates evidence from conclusions and recommendations.
9. Emit an ordered operational trace throughout execution.

The model does **not** directly execute tools. It only proposes the next action.

---

## Architecture

```text
                    ┌──────────────────────┐
                    │         CLI          │
                    │ one-shot / interactive│
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │     AgentRunner      │
                    │                      │
                    │ execution authority  │
                    └──────────┬───────────┘
                               │
             ┌─────────────────┼──────────────────┐
             │                 │                  │
             ▼                 ▼                  ▼
      ┌─────────────┐   ┌──────────────┐   ┌───────────────┐
      │ModelAdapter │   │ ToolRegistry │   │ApprovalProvider│
      └─────────────┘   └──────┬───────┘   └───────────────┘
             │                 │
             │                 ▼
             │          Structured Tools
             │                 │
             └────────┬────────┘
                      ▼
                  RunState
                      │
                      ▼
               TraceCollector
                      │
              ┌───────┴────────┐
              ▼                ▼
        Stored Trace       Live CLI Trace
```

The central design principle is:

> **The model proposes actions; the harness owns execution authority.**

The model cannot directly invoke external behavior. `AgentRunner` controls validation, approval, execution, state updates, execution budgets, and tracing.

See [`docs/architecture.md`](docs/architecture.md) for a more detailed architecture discussion.

---

## Agent Execution Loop

Each investigation follows a bounded loop:

```text
Objective
   │
   ▼
Build ModelContext
   │
   ▼
Model decides next action
   │
   ├──────────── final ────────────► Final Response
   │
   ▼
Structured Tool Call
   │
   ▼
Validate Tool + Arguments
   │
   ▼
Check Execution Budget
   │
   ▼
Approval Gate (when required)
   │
   ▼
Execute Tool
   │
   ├── success ──► Context / Evidence
   │
   └── failure ──► Tool Error
                       │
                       ▼
               returned to model
                       │
                       └────► next iteration
```

Every iteration receives the accumulated investigation state.

This allows later model decisions to use information returned by earlier tools rather than treating each model call independently.

---

## Model Interface

Models implement the `ModelAdapter` abstraction.

The runner provides the model with:

- investigation objective
- discovered context
- collected evidence
- previous tool errors
- approval outcomes
- available tool definitions

The model returns either:

```text
tool_call
```

or:

```text
final
```

This keeps model-specific behavior separate from execution logic.

### ScriptedModel

`ScriptedModel` provides deterministic model decisions for tests.

It allows the complete agent loop to be tested without:

- network access
- paid model APIs
- nondeterministic model behavior

### OpenRouterModel

`OpenRouterModel` provides the live model integration used by the CLI.

The model receives structured tool definitions and may dynamically select the next investigation action.

Tool-specific argument validation remains the responsibility of `ToolRegistry`, rather than trusting model output.

---

## Tools

The project uses synthetic operational data so investigations remain deterministic and self-contained.

### `list_services`

Discovers services and their relationships.

Example topology:

```text
checkout-api
    │
    ▼
payment-api
    │
    ▼
database
```

Discovery results are stored as **context**, because service topology helps guide an investigation but does not by itself establish the cause of an incident.

### `search_logs`

Searches synthetic application logs by service and optional log level.

Example observations include:

- database connection timeouts
- exhausted connection pools
- downstream payment failures

### `get_metrics`

Retrieves synthetic operational metrics such as:

- request latency
- database connection usage

### `get_service_status`

Retrieves the current synthetic operational status of a service.

Read-only investigation tools do not require human approval.

---

## Context vs Evidence

The runner intentionally distinguishes between **context** and **evidence**.

Context uses IDs such as:

```text
C1
C2
```

Evidence uses IDs such as:

```text
E1
E2
E3
```

For example:

```text
C1 -> discovered service topology

E1 -> payment-api error logs
E2 -> request latency metrics
E3 -> service status
```

This prevents discovery information from automatically being treated as evidence supporting a conclusion.

Final responses explicitly reference collected evidence.

---

## Structured Validation

Tools define schemas for their inputs and outputs.

The registry validates model-provided arguments before execution:

```text
Model Tool Request
       │
       ▼
ToolRegistry.prepare()
       │
       ├── unknown tool ─────► UNKNOWN_TOOL
       │
       ├── invalid input ────► INVALID_INPUT
       │
       ▼
Validated Tool Call
       │
       ▼
executePrepared()
       │
       ├── execution error ──► EXECUTION_FAILED
       │
       ├── invalid output ───► INVALID_OUTPUT
       │
       ▼
Validated Result
```

This treats model output as untrusted input.

---

## Execution Limits

Every run has configurable execution budgets.

The primary limits are:

```text
maxSteps
maxToolCalls
```

`maxSteps` limits model decisions.

`maxToolCalls` limits actual tool execution attempts.

Limits are enforced by the harness rather than relying on the model to stop itself.

When a limit is reached, the trace records a `LIMIT_REACHED` event and the run terminates with a clear reason.

This prevents uncontrolled agent loops and unexpected resource usage.

---

## Failure Handling

Tool failures are first-class observations.

A tool failure:

1. becomes a structured `ToolError`
2. is recorded in the operational trace
3. is added to run state
4. is visible to the next model decision

The model may therefore recover by selecting another source rather than terminating the entire investigation.

The synthetic tools include a deliberate failure path for demonstrating this behavior.

---

## Human Approval

The harness supports approval gates for consequential tools.

A tool can declare whether approval is required before execution.

The execution flow is:

```text
Model requests consequential action
              │
              ▼
       Validate arguments
              │
              ▼
        Check tool budget
              │
              ▼
       APPROVAL_REQUIRED
              │
              ▼
         Human decision
          /         \
     approved       denied
        │              │
        ▼              ▼
   TOOL_CALL      return outcome
        │           to model
        ▼
     execute
```

Denied or timed-out approvals do **not** count as executed tool calls.

Read-only investigation tools do not require approval.

The current CLI approval provider is intentionally lightweight and intended for demonstrating the execution boundary rather than serving as a production authorization system.

---

## Operational Tracing

Every run produces an ordered operational trace.

Example:

```text
[01] RUN_STARTED

[02] MODEL_DECISION

[03] TOOL_CALL

[04] TOOL_RESULT
     Context C1

[05] MODEL_DECISION

[06] TOOL_CALL

[07] TOOL_RESULT
     Evidence E1

[08] MODEL_DECISION

[09] TOOL_RESULT
     Evidence E2

[10] FINAL_RESPONSE
```

Possible events include:

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

The trace records operational decisions and concise model-visible summaries.

It does **not** persist hidden model chain-of-thought.

---

## Live Trace Streaming

Trace events are emitted as the investigation executes.

The same event is:

1. recorded by `TraceCollector`
2. optionally sent to the live trace callback

Conceptually:

```text
                   ┌──► TraceCollector
                   │
AgentRunner ─► emit()
                   │
                   └──► Live CLI Renderer
```

This means live observability and the retained trace use the same underlying events rather than separate execution paths.

---

## Trace Safety

Values are sanitized before being written to operational traces.

Sensitive structured fields such as tokens, passwords, API keys, and secrets are redacted.

Large strings are truncated to prevent unbounded trace payloads.

Raw tool exception messages are not automatically exposed through operational traces.

The implementation is intentionally conservative, but it should not be considered a complete production secret-detection system.

---

## Interactive CLI

The project supports an interactive investigation session.

Run:

```bash
bun run investigate
```

Then enter objectives:

```text
Observable Agent Loop
Enter an investigation objective. Type "exit" to quit.

> Is checkout-api degraded and why?

[01] RUN_STARTED
...

[02] MODEL_DECISION
...

[03] TOOL_CALL
...

[04] TOOL_RESULT
...

[05] MODEL_DECISION
...

[XX] FINAL_RESPONSE
...
```

Each objective starts an independent investigation with fresh:

- run state
- evidence
- context
- execution counters
- trace sequence

The current implementation intentionally does not provide persistent conversational memory between investigations.

---

## Installation

### Requirements

- Bun
- an OpenRouter API key for live model execution

Install dependencies:

```bash
bun install
```

---

## Environment Variables

Configure:

```bash
OPENROUTER_API_KEY=your_api_key
OPENROUTER_MODEL=your_model_id
```

Do not commit real credentials to the repository.

---

## Running an Investigation

### Interactive mode

```bash
bun run investigate
```

### Single investigation

```bash
bun run investigate "Why did checkout latency increase around 14:05?"
```

### Custom execution limits

```bash
bun run investigate \
  --max-steps 5 \
  --max-tool-calls 3 \
  "Why did checkout latency increase around 14:05?"
```

A deliberately small tool budget can also be used to demonstrate bounded execution:

```bash
bun run investigate \
  --max-tool-calls 1 \
  "Why did checkout latency increase around 14:05?"
```

---

## Running Tests

Run the complete deterministic test suite:

```bash
bun test
```

The tests use `ScriptedModel` rather than a paid model API.

The suite covers:

- tool registration and execution
- unknown tools
- structured argument validation
- tool execution failures
- multi-step investigations
- evidence accumulation
- feeding accumulated evidence back into the model
- model-step limits
- tool-call limits
- ordered tracing
- safe tool-error tracing
- secret redaction
- trace rendering
- service status evidence
- failure recovery
- human approval behavior

No external model API is required to run the test suite.

---

## Example Investigation

Objective:

```text
Why did checkout latency increase around 14:05?
```

The synthetic incident contains signals such as:

```text
payment-api
14:02 -> database connection timeout
14:04 -> database connection timeout
14:05 -> database connection pool exhausted
```

and metrics such as:

```text
request latency
220 ms -> 1850 ms

database connection usage
42% -> 100%
```

An investigation can therefore combine independent tool observations before producing a grounded conclusion.

The final response separates:

```text
Evidence
Conclusion
Recommendations
```

rather than presenting model conclusions as if they were raw observations.

---

## Project Structure

```text
src/
├── agent/
│   ├── agent-runner.ts
│   ├── limits.ts
│   └── types.ts
│
├── approval/
│   ├── cli-provider.ts
│   ├── provider.ts
│   ├── request.ts
│   ├── static-provider.ts
│   └── types.ts
│
├── cli/
│   └── trace-renderer.ts
│
├── fixtures/
│   ├── logs.ts
│   ├── metrics.ts
│   └── service-status.ts
│
├── model/
│   ├── model.ts
│   ├── openrouter-model.ts
│   ├── scripted-model.ts
│   └── types.ts
│
├── tools/
│   ├── get-metrics.ts
│   ├── get-service-status.ts
│   ├── list-services.ts
│   ├── registry.ts
│   ├── search-logs.ts
│   ├── tool-error.ts
│   └── tool.ts
│
├── trace/
│   ├── collector.ts
│   ├── events.ts
│   └── redact.ts
│
└── cli.ts

tests/
├── agent-runner-limits.test.ts
├── agent-runner-trace.test.ts
├── approval.test.ts
├── failure.test.ts
├── multi-step.test.ts
├── service-status.test.ts
├── tool-registry.test.ts
├── trace-redaction.test.ts
└── trace-rendered.test.ts
```

---

## Key Design Decisions

### Harness-controlled execution

The model is intentionally not trusted with direct execution authority.

This creates a clear boundary between:

```text
decision making
```

and:

```text
execution
```

The harness can therefore enforce validation, approval, limits, and observability regardless of model behavior.

### Deterministic tests

The core runner depends on `ModelAdapter`, not a particular LLM provider.

`ScriptedModel` makes complex agent behavior deterministic and inexpensive to test.

### Synthetic data

The challenge focuses on agent-loop architecture rather than integration complexity.

Synthetic logs, metrics, topology, and service status make failure scenarios and expected evidence reproducible.

### Context and evidence are separate

Discovery information is useful for deciding what to investigate but should not automatically support a conclusion.

Separating `C*` and `E*` identifiers makes that distinction explicit.

### Operational traces instead of chain-of-thought

The trace records actions necessary to understand and debug execution:

- model-selected action summaries
- tool inputs
- validated tool results
- errors
- approvals
- limits
- final responses

Private model reasoning is neither required nor persisted.

---

## Cloud Evolution

The current implementation runs locally, but the core interfaces are intentionally independent of the CLI.

A cloud deployment could evolve toward:

```text
HTTP API
   │
   ▼
Run Queue
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
   └── Persistent Trace/State Sink
```

The CLI could be replaced by an HTTP entry point while preserving the core runner and tool contracts.

Further production work could include:

- persistent run state
- durable approval workflows
- distributed execution budgets
- authentication and authorization
- structured telemetry
- cancellation
- retry policies
- provider timeouts
- durable event streaming
- per-run isolation

These are intentionally outside the scope of this take-home implementation.

---

## Known Limitations

This project is intentionally scoped as a product engineering exercise rather than a production agent platform.

Current limitations include:

- synthetic rather than real operational data
- no persistent investigation memory
- no distributed execution
- no durable state storage
- lightweight CLI approval
- model behavior may vary during live OpenRouter runs
- trace redaction is defensive but is not a complete secret-detection system
- no production authentication or authorization layer

---

## AI Assistance Disclosure

AI-assisted development tools (mainly ChatGPT) were used during this project for design discussion, implementation assistance and review, test-case ideation, debugging, and documentation refinement.

The final architecture, integration decisions, implementation behavior, testing, and submitted code were reviewed and understood by the author.

---

## Author

**Goutam Kumar Sharma**

Product Engineering Challenge Submission