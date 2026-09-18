export interface ServiceStatusEntry {
  service: string;
  status: "operational" | "degraded" | "outage";
  message: string;
}

export const serviceStatuses: ServiceStatusEntry[] = [
  {
    service: "payment-api",
    status: "degraded",
    message:
      "Elevated latency observed during payment processing.",
  },
  {
    service: "checkout-api",
    status: "degraded",
    message:
      "Checkout requests affected by payment-api latency.",
  },
  {
    service: "database",
    status: "operational",
    message:
      "Database service is operational.",
  },
];