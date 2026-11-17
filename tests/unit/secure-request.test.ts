import { describe, expect, it } from "vitest";
import { isSecureRequest } from "@/lib/secure-request";

const req = (url: string, headers: Record<string, string> = {}) =>
  new Request(url, { headers });

describe("isSecureRequest", () => {
  it("es falso para http://localhost", () => {
    expect(isSecureRequest(req("http://localhost:3000/"))).toBe(false);
  });

  it("es verdadero para https directo", () => {
    expect(isSecureRequest(req("https://nefroia.example.org/"))).toBe(true);
  });

  it("respeta x-forwarded-proto detrás de un proxy", () => {
    expect(
      isSecureRequest(
        req("http://internal/", { "x-forwarded-proto": "https, http" })
      )
    ).toBe(true);
  });
});
