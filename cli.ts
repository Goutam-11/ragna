import { AgentRunner } from "@/agent/agent-runner";

// import { ScriptedModel } from "@/model/scripted-model";

import { ToolRegistry } from "@/tools/registry";
import { SearchLogsTool } from "@/tools/search-logs";
import { GetMetricsTool } from "@/tools/get-metrics";
import { GetServiceStatusTool } from "@/tools/get-service-status";

import { renderTrace } from "@/cli/trace-renderer";
import { OpenRouterModel } from "@/model/openrouter-model";
import { ListServicesTool } from "@/tools/list-services";

async function main(): Promise<void> {
  const objective = readObjective();

  const registry = new ToolRegistry();

  registry.register(
    new SearchLogsTool(),
  );

  registry.register(
    new GetMetricsTool(),
  );

  registry.register(
    new GetServiceStatusTool(),
  );

  registry.register(
    new ListServicesTool(),
  );

  // const model = new ScriptedModel([
  //   {
  //     type: "tool_call",
  //     tool: "search_logs",
  //     arguments: {
  //       service: "payment-api",
  //       level: "error",
  //     },
  //     summary:
  //       "Check payment-api error logs for signs of failure.",
  //   },

  //   {
  //     type: "tool_call",
  //     tool: "get_metrics",
  //     arguments: {
  //       service: "payment-api",
  //     },
  //     summary:
  //       "Check payment-api latency and database connection metrics.",
  //   },

  //   {
  //     type: "tool_call",
  //     tool: "get_service_status",
  //     arguments: {
  //       service: "payment-api",
  //     },
  //     summary:
  //       "Check whether payment-api is currently degraded.",
  //   },

  //   {
  //     type: "final",
  //     response: {
  //       evidence: [
  //         {
  //           evidenceId: "E1",
  //           statement:
  //             "Payment API logs show database connection timeouts around the incident.",
  //         },

  //         {
  //           evidenceId: "E2",
  //           statement:
  //             "Payment API latency increased while database connection usage reached 100%.",
  //         },

  //         {
  //           evidenceId: "E3",
  //           statement:
  //             "Payment API service status is degraded.",
  //         },
  //       ],

  //       conclusion:
  //         "The collected evidence is consistent with payment-api exhausting its database connection pool, causing elevated latency and downstream checkout failures.",

  //       recommendations: [
  //         "Investigate database connection pool sizing and connection release behavior.",
  //         "Review payment-api database timeout and retry configuration.",
  //         "Continue monitoring latency and database connection usage.",
  //       ],
  //     },
  //   },
  // ]);

  const model = new OpenRouterModel(
    {
      model: process.env.OPENROUTER_MODEL || "",
      apiKey: process.env.OPENROUTER_API_KEY || "",
    }
  );

  const runner = new AgentRunner(
    model,
    registry,
    {
      maxSteps: 10,
      maxToolCalls: 5,
    },
  );

  const result =
    await runner.run(objective);

  console.log("");
  console.log(
    `Investigation: ${objective}`,
  );
  console.log("");

  console.log(
    renderTrace(result.trace),
  );

  console.log("");
  console.log(
    `Termination: ${result.terminationReason}`,
  );
}

function readObjective(): string {
  const objective = Bun.argv
    .slice(2)
    .join(" ")
    .trim();

  if (!objective) {
    console.error(
      'Usage: bun run src/cli.ts "investigation objective"',
    );

    process.exit(1);
  }

  return objective;
}

main().catch((error: unknown) => {
  console.error(
    "Agent run failed:",
    error instanceof Error
      ? error.message
      : error,
  );

  process.exit(1);
});