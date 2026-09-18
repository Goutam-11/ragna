export interface LogEntry {
  timestamp: string;
  service: string;
  level: "info" | "warn" | "error";
  message: string;
}

export const logs: LogEntry[] = [
  {
    timestamp: "2026-09-18T14:00:00Z",
    service: "payment-api",
    level: "info",
    message: "Request processing normally",
  },
  {
    timestamp: "2026-09-18T14:02:00Z",
    service: "payment-api",
    level: "error",
    message: "Database connection timeout",
  },
  {
    timestamp: "2026-09-18T14:04:00Z",
    service: "payment-api",
    level: "error",
    message: "Database connection timeout",
  },
  {
    timestamp: "2026-09-18T14:05:00Z",
    service: "payment-api",
    level: "warn",
    message: "Database connection pool exhausted",
  },
  {
    timestamp: "2026-09-18T14:06:00Z",
    service: "checkout-api",
    level: "error",
    message: "Payment request failed",
  },
];