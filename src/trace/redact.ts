const SENSITIVE_KEYS = new Set([
  "authorization",
  "apikey",
  "api_key",
  "token",
  "access_token",
  "refresh_token",
  "password",
  "secret",
]);

const REDACTED = "[REDACTED]";

export const DEFAULT_MAX_STRING_LENGTH = 500;

export function sanitizeForTrace(
  value: unknown,
  maxStringLength = DEFAULT_MAX_STRING_LENGTH,
): unknown {
  if (typeof value === "string") {
    return truncateString(value, maxStringLength);
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeForTrace(item, maxStringLength),
    );
  }

  if (isPlainObject(value)) {
    const sanitized: Record<string, unknown> = {};

    for (const [key, childValue] of Object.entries(value)) {
      if (isSensitiveKey(key)) {
        sanitized[key] = REDACTED;
        continue;
      }

      sanitized[key] = sanitizeForTrace(
        childValue,
        maxStringLength,
      );
    }

    return sanitized;
  }

  return value;
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}

function truncateString(
  value: string,
  maxLength: number,
): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...[TRUNCATED]`;
}

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function sanitizeErrorMessage(
  message: string,
  maxLength = DEFAULT_MAX_STRING_LENGTH,
): string {
  return truncateString(
    message,
    maxLength,
  );
}