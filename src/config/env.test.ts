import { describe, expect, it } from "vitest";

import { getServerConfig, parseAppEnvironment } from "./env";

describe("server environment", () => {
  it("defaults to development", () => {
    expect(getServerConfig({}).appEnv).toBe("development");
  });

  it("accepts known environments", () => {
    expect(parseAppEnvironment("test")).toBe("test");
    expect(parseAppEnvironment("production")).toBe("production");
  });

  it("rejects unknown environments", () => {
    expect(() => parseAppEnvironment("preview")).toThrow("Invalid APP_ENV");
  });
});
