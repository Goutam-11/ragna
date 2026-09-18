import type { TraceEvent } from "./events";

export class TraceCollector {
  private readonly events: TraceEvent[] = [];

  record(event: TraceEvent): void {
    this.events.push(event);
  }

  getEvents(): readonly TraceEvent[] {
    return this.events;
  }
}