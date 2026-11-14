import { afterEach, describe, expect, it } from "vitest";
import { getEntitlements } from "@/lib/ai/entitlements";

describe("getEntitlements", () => {
  afterEach(() => {
    delete process.env.RATE_LIMIT_GUEST_MESSAGES_PER_HOUR;
    delete process.env.RATE_LIMIT_USER_MESSAGES_PER_HOUR;
  });

  it("usa valores por defecto", () => {
    expect(getEntitlements("guest").maxMessagesPerHour).toBe(10);
    expect(getEntitlements("regular").maxMessagesPerHour).toBe(60);
  });

  it("respeta las variables de entorno", () => {
    process.env.RATE_LIMIT_USER_MESSAGES_PER_HOUR = "5";
    expect(getEntitlements("regular").maxMessagesPerHour).toBe(5);
  });

  it("ignora valores no válidos", () => {
    process.env.RATE_LIMIT_GUEST_MESSAGES_PER_HOUR = "abc";
    expect(getEntitlements("guest").maxMessagesPerHour).toBe(10);
  });
});
