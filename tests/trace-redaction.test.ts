import {
  describe,
  expect,
  test,
} from "bun:test";

import { sanitizeForTrace } from "../src/trace/redact";

describe("sanitizeForTrace", () => {
  test("recursively redacts sensitive fields", () => {
    const input = {
      service: "payment-api",

      authorization: "Bearer super-secret-token",

      config: {
        apiKey: "abc123",

        database: {
          password: "database-password",
        },
      },

      requests: [
        {
          path: "/payments",
          token: "request-token",
        },
        {
          path: "/checkout",
          secret: "another-secret",
        },
      ],
    };

    const result = sanitizeForTrace(input);

    expect(result).toEqual({
      service: "payment-api",

      authorization: "[REDACTED]",

      config: {
        apiKey: "[REDACTED]",

        database: {
          password: "[REDACTED]",
        },
      },

      requests: [
        {
          path: "/payments",
          token: "[REDACTED]",
        },
        {
          path: "/checkout",
          secret: "[REDACTED]",
        },
      ],
    });
  });

  test("redacts sensitive keys case-insensitively", () => {
    const input = {
      Authorization: "Bearer abc",
      APIKEY: "key-123",
      PASSWORD: "password-123",
      ToKeN: "token-123",
    };
  
    const result = sanitizeForTrace(input);
  
    expect(result).toEqual({
      Authorization: "[REDACTED]",
      APIKEY: "[REDACTED]",
      PASSWORD: "[REDACTED]",
      ToKeN: "[REDACTED]",
    });
  });

  test("truncates strings longer than the configured limit", () => {
    const input = {
      message: "abcdefghijklmnopqrstuvwxyz",
    };
  
    const result = sanitizeForTrace(
      input,
      10,
    );
  
    expect(result).toEqual({
      message: "abcdefghij...[TRUNCATED]",
    });
  });

  test("does not truncate strings within the limit", () => {
    const input = {
      message: "database timeout",
    };
  
    const result = sanitizeForTrace(
      input,
      100,
    );
  
    expect(result).toEqual({
      message: "database timeout",
    });
  });

  test("truncates strings nested inside objects and arrays", () => {
    const input = {
      result: {
        logs: [
          {
            message: "123456789012345",
          },
          {
            message: "short",
          },
        ],
      },
    };
  
    const result = sanitizeForTrace(
      input,
      10,
    );
  
    expect(result).toEqual({
      result: {
        logs: [
          {
            message: "1234567890...[TRUNCATED]",
          },
          {
            message: "short",
          },
        ],
      },
    });
  });

  test("does not mutate the original value", () => {
    const input = {
      authorization: "Bearer secret",
  
      nested: {
        password: "my-password",
        message: "123456789012345",
      },
    };
  
    const original = structuredClone(input);
  
    sanitizeForTrace(
      input,
      10,
    );
  
    expect(input).toEqual(original);
  });

  test("fully redacts secrets instead of storing truncated secret values", () => {
    const secret =
      "this-is-a-very-long-super-secret-api-key";
  
    const result = sanitizeForTrace(
      {
        api_key: secret,
      },
      5,
    );
  
    expect(result).toEqual({
      api_key: "[REDACTED]",
    });
  
    expect(
      JSON.stringify(result),
    ).not.toContain("this-");
  });
});