/**
 * Live ModelAdapter backed by OpenRouter.
 *
 * Converts investigation state and registered tool definitions into
 * model requests, then normalizes the response into ModelDecision.
 *
 * Tool-specific validation remains the responsibility of ToolRegistry.
 */
import { z } from "zod";

import type { ModelAdapter, ModelContext, ModelToolDefinition } from "./model";

import type { ModelDecision } from "./types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const FinalResponseSchema = z
  .object({
    evidence: z.array(
      z.object({
        evidenceId: z.string(),
        statement: z.string(),
      }),
    ),

    conclusion: z.string(),

    recommendations: z.array(z.string()),
  })
  .strict();

const OpenRouterResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional(),

          tool_calls: z
            .array(
              z.object({
                id: z.string(),

                type: z.literal("function"),

                function: z.object({
                  name: z.string(),
                  arguments: z.string(),
                }),
              }),
            )
            .optional(),
        }),
      }),
    )
    .min(1),
});

export interface OpenRouterModelOptions {
  apiKey: string;
  model: string;
}

export class OpenRouterModel implements ModelAdapter {
  constructor(private readonly options: OpenRouterModelOptions) {}

  async decide(
    context: ModelContext,
    tools: ModelToolDefinition[],
  ): Promise<ModelDecision> {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",

      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,

        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        model: this.options.model,

        messages: [
          {
            role: "system",
            content: buildSystemPrompt(),
          },

          {
            role: "user",
            content: buildContextMessage(context),
          },
        ],

        tools: tools.map((tool) => ({
          type: "function",

          function: {
            name: tool.name,

            description: tool.description,

            parameters: tool.inputSchema,
          },
        })),

        tool_choice: "auto",

        // Our harness executes one tool
        // decision per loop iteration.
        parallel_tool_calls: false,
      }),
    });

    if (!response.ok) {
      const body = await response.text();

      throw new Error(
        `OpenRouter request failed (${response.status}): ${body}`,
      );
    }

    const rawResponse: unknown = await response.json();

    const parsed = OpenRouterResponseSchema.safeParse(rawResponse);

    if (!parsed.success) {
      throw new Error("OpenRouter returned an invalid response shape");
    }

    const message = parsed.data.choices[0]?.message;

    const toolCall = message?.tool_calls?.[0];

    if (toolCall) {
      return parseToolCall(toolCall.function.name, toolCall.function.arguments);
    }

    return parseFinalResponse(message?.content, context);
  }
}

function parseToolCall(tool: string, rawArguments: string): ModelDecision {
  let argumentsValue: unknown;

  try {
    argumentsValue = JSON.parse(rawArguments);
  } catch {
    throw new Error(`Model returned invalid JSON arguments for tool: ${tool}`);
  }

  return {
    type: "tool_call",
    tool,
    arguments: argumentsValue,
    summary: `Model requested ${tool}.`,
  };
}

function buildContextMessage(context: ModelContext): string {
  return JSON.stringify(
    {
      objective: context.objective,

      collectedContext: context.context,

      collectedEvidence: context.evidence,

      toolErrors: context.toolErrors,

      approvals: context.approvals,
    },
    null,
    2,
  );
}

function buildSystemPrompt(): string {
  return `
You are an incident investigation model operating
inside a controlled agent harness.

Your job is to investigate the user's objective using
the available tools and collected evidence.

Rules:

- Use tools when more evidence is needed.
- Prefer evidence from multiple relevant sources when
  the objective requires investigation.
- Do not invent tool results.
- Do not claim evidence that is not present in
  collectedEvidence.
- If a tool fails, use another relevant source when
  possible.
- Tool errors are observations, not evidence.
- Keep tool use focused on the investigation objective.
- Do not repeat a tool call unless there is a clear
  reason to do so.

When sufficient evidence has been collected, do not
call another tool.

Instead, respond with ONLY valid JSON using this shape:

{
  "evidence": [
    {
      "evidenceId": "E1",
      "statement": "What this evidence establishes"
    }
  ],
  "conclusion": "Conclusion supported by the evidence",
  "recommendations": [
    "Recommended next action"
  ]
}

Evidence IDs must reference evidence that actually
exists in collectedEvidence.

Clearly distinguish observed evidence from conclusions.

- Do not guess service names.
- If the relevant service is unknown, use the available
  discovery tool before calling service-specific tools.
- Use discovered service relationships to decide which
  sources to investigate.
`.trim();
}

function parseFinalResponse(
  content: string | null | undefined,
  context: ModelContext,
): ModelDecision {
  if (!content) {
    throw new Error("Model returned neither a tool call nor a final response");
  }

  let raw: unknown;

  try {
    raw = JSON.parse(stripCodeFence(content));
  } catch {
    throw new Error("Model final response was not valid JSON");
  }

  const parsed = FinalResponseSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error("Model final response failed validation");
  }

  const validEvidenceIds = new Set(
    context.evidence.map((evidence) => evidence.id),
  );

  for (const evidence of parsed.data.evidence) {
    if (!validEvidenceIds.has(evidence.evidenceId)) {
      throw new Error(
        `Model referenced unknown evidence: ${evidence.evidenceId}`,
      );
    }
  }

  return {
    type: "final",
    response: parsed.data,
  };
}

function stripCodeFence(value: string): string {
  const trimmed = value.trim();

  if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  return trimmed;
}
