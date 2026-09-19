import { GetMetricsTool } from "@/tools/get-metrics";
import { AgentRunner } from "./src/agent/agent-runner";
import { ScriptedModel } from "./src/model/scripted-model";
import { ToolRegistry } from "./src/tools/registry";
import { SearchLogsTool } from "./src/tools/search-logs";

const registry = new ToolRegistry();

registry.register(
  new SearchLogsTool(),
);

registry.register(
  new GetMetricsTool(),
);

const model = new ScriptedModel([
  {
    type: "tool_call",
    tool: "search_logs",
    arguments: {
      service: "payment-api",
    },
    summary: "Search logs.",
  },
  {
    type: "tool_call",
    tool: "search_logs",
    arguments: {
      service: "payment-api",
    },
    summary: "Search logs again.",
  },
  {
    type: "tool_call",
    tool: "search_logs",
    arguments: {
      service: "payment-api",
    },
    summary: "Search logs again.",
  },
]);

const runner = new AgentRunner(model, registry, {
  limits: { maxSteps: 2, maxToolCalls: 10 },
});


const result = await runner.run(
  "Why were payment requests failing around 14:05?",
);

console.dir(result, {
  depth: null,
});