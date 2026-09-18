export interface MetricEntry {
  timestamp: string;
  service: string;
  metric: string;
  value: number;
  unit: string;
}

export const metrics: MetricEntry[] = [
  {
    timestamp: "2026-09-18T14:00:00Z",
    service: "payment-api",
    metric: "request_latency",
    value: 220,
    unit: "ms",
  },
  {
    timestamp: "2026-09-18T14:05:00Z",
    service: "payment-api",
    metric: "request_latency",
    value: 1850,
    unit: "ms",
  },
  {
    timestamp: "2026-09-18T14:00:00Z",
    service: "payment-api",
    metric: "db_connection_usage",
    value: 42,
    unit: "percent",
  },
  {
    timestamp: "2026-09-18T14:05:00Z",
    service: "payment-api",
    metric: "db_connection_usage",
    value: 100,
    unit: "percent",
  },
];