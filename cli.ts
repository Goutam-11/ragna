import { AgentRunner, type AgentRunResult } from "@/agent/agent-runner";

import { ToolRegistry } from "@/tools/registry";
import { SearchLogsTool } from "@/tools/search-logs";
import { GetMetricsTool } from "@/tools/get-metrics";
import { GetServiceStatusTool } from "@/tools/get-service-status";

import { renderEvent } from "@/cli/trace-renderer";
import { OpenRouterModel } from "@/model/openrouter-model";
import { ListServicesTool } from "@/tools/list-services";
import { CliApprovalProvider } from "@/approval/cli-provider";
import type { ModelAdapter } from "@/model/model";

function createRunner(
  model: ModelAdapter,
  registry: ToolRegistry,
  maxSteps: number,
  maxToolCalls: number,
): AgentRunner {
  let traceSequence = 0;

  return new AgentRunner(model, registry, {
    limits: {
      maxSteps,
      maxToolCalls,
    },

    approvalProvider: new CliApprovalProvider(),

    approvalTimeoutMs: 30_000,

    onTraceEvent(event) {
      console.log(renderEvent(event, ++traceSequence));

      console.log();
    },
  });
}

function printRunSummary(result: AgentRunResult): void {
  console.log("─────────────────────");

  console.log(`Termination: ${result.terminationReason}`);

  console.log(`Steps used: ${result.state.stepsUsed}`);

  console.log(`Tool calls used: ${result.state.toolCallsUsed}`);
}

async function runSingle(
  objective: string,
  model: ModelAdapter,
  registry: ToolRegistry,
  maxSteps: number,
  maxToolCalls: number,
): Promise<void> {
  const runner = createRunner(model, registry, maxSteps, maxToolCalls);

  const result = await runner.run(objective);

  printRunSummary(result);
}

async function runInteractive(
  model: ModelAdapter,
  registry: ToolRegistry,
  maxSteps: number,
  maxToolCalls: number,
): Promise<void> {
  console.log("\nObservable Agent Loop");

  console.log('Enter an investigation objective. Type "exit" to quit.\n');

  while (true) {
    const input = prompt("> ");

    if (input === null) {
      break;
    }

    const objective = input.trim();

    if (!objective) {
      continue;
    }

    if (
      objective.toLowerCase() === "exit" ||
      objective.toLowerCase() === "quit"
    ) {
      break;
    }

    console.log();

    const runner = createRunner(model, registry, maxSteps, maxToolCalls);

    try {
      const result = await runner.run(objective);

      printRunSummary(result);
    } catch (error) {
      console.error(
        "\nInvestigation failed:",
        error instanceof Error ? error.message : String(error),
      );
    }

    console.log();
  }
}

function getNumberFlag(
  name: string,
  fallback: number,
): number {
  const index = Bun.argv.indexOf(name);

  if (index === -1) {
    return fallback;
  }

  const rawValue = Bun.argv[index + 1];
  const value = Number(rawValue);

  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    console.error(
      `${name} must be a positive integer.`,
    );

    process.exit(1);
  }

  return value;
}

function getObjective(): string {
  const args = Bun.argv.slice(2);

  const objectiveParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (
      arg === "--max-steps" ||
      arg === "--max-tool-calls"
    ) {
      i += 1;
      continue;
    }

    objectiveParts.push(arg || "");
  }

  return objectiveParts
    .join(" ")
    .trim();
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  const modelName = process.env.OPENROUTER_MODEL;

  if (!apiKey || !modelName) {
    console.error("OPENROUTER_API_KEY and OPENROUTER_MODEL are required.");

    process.exit(1);
  }

  const maxSteps = getNumberFlag("--max-steps", 10);

  const maxToolCalls = getNumberFlag("--max-tool-calls", 6);

  const registry = new ToolRegistry();

  registry.register(new SearchLogsTool());
  registry.register(new GetMetricsTool());
  registry.register(new ListServicesTool());
  registry.register(new GetServiceStatusTool());

  const model = new OpenRouterModel({
    apiKey,
    model: modelName,
  });

  const objective = getObjective();

  if (objective) {
    await runSingle(objective, model, registry, maxSteps, maxToolCalls);

    return;
  }

  await runInteractive(model, registry, maxSteps, maxToolCalls);
}


main().catch((error: unknown) => {
  console.error(
    "Agent run failed:",
    error instanceof Error ? error.message : error,
  );

  process.exit(1);
});
