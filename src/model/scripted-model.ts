import type {
  ModelAdapter,
  ModelContext,
  ModelToolDefinition,
} from "./model";

import type { ModelDecision } from "./types";

export class ScriptedModel implements ModelAdapter {
  private index = 0;

  constructor(
    private readonly decisions: ModelDecision[],
  ) {}

  async decide(
    _context: ModelContext,
    _tools: ModelToolDefinition[],
  ): Promise<ModelDecision> {
    const decision = this.decisions[this.index];

    if (!decision) {
      throw new Error(
        "ScriptedModel has no remaining decisions",
      );
    }

    this.index += 1;

    return decision;
  }
}