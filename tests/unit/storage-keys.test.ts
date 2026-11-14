import { describe, expect, it } from "vitest";
import {
  appFileUrl,
  isKeyOwnedBy,
  keyFromAppFileUrl,
} from "@/lib/storage/keys";

describe("claves de almacenamiento", () => {
  it("ida y vuelta entre clave y URL", () => {
    const key = "uploads/user-1/abc_foto de prueba.png";
    expect(keyFromAppFileUrl(appFileUrl(key))).toBe(key);
  });

  it("rechaza URLs externas o del endpoint de subida", () => {
    expect(keyFromAppFileUrl("https://example.com/a.png")).toBeNull();
    expect(keyFromAppFileUrl("/api/files/upload")).toBeNull();
  });

  it("solo el propietario puede acceder a su prefijo", () => {
    expect(isKeyOwnedBy("uploads/u1/a.png", "u1")).toBe(true);
    expect(isKeyOwnedBy("uploads/u2/a.png", "u1")).toBe(false);
    expect(isKeyOwnedBy("uploads/u1/../u2/a.png", "u1")).toBe(false);
  });
});
