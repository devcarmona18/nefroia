import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

type Tree = { [key: string]: Tree | string | string[] };

function flatten(tree: Tree, prefix = ""): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string" || Array.isArray(value)) {
      out[path] = value;
    } else {
      Object.assign(out, flatten(value, path));
    }
  }
  return out;
}

const flatEs = flatten(es as Tree);
const flatEn = flatten(en as Tree);

const placeholders = (value: string | string[]) =>
  (Array.isArray(value) ? value.join(" ") : value)
    .match(/\{(\w+)\}/g)
    ?.sort() ?? [];

describe("mensajes i18n es/en", () => {
  it("tienen exactamente las mismas claves", () => {
    expect(Object.keys(flatEn).sort()).toEqual(Object.keys(flatEs).sort());
  });

  it("no tienen valores vacíos", () => {
    for (const flat of [flatEs, flatEn]) {
      for (const [key, value] of Object.entries(flat)) {
        const items = Array.isArray(value) ? value : [value];
        expect(items.length, key).toBeGreaterThan(0);
        for (const item of items) {
          expect(item.trim(), key).not.toBe("");
        }
      }
    }
  });

  it("usan los mismos marcadores {variable} en ambos idiomas", () => {
    for (const key of Object.keys(flatEs)) {
      expect(placeholders(flatEn[key]), key).toEqual(placeholders(flatEs[key]));
    }
  });

  it("las listas tienen la misma longitud en ambos idiomas", () => {
    for (const [key, value] of Object.entries(flatEs)) {
      if (Array.isArray(value)) {
        expect((flatEn[key] as string[]).length, key).toBe(value.length);
      }
    }
  });

  it("el nombre de marca aparece en los metadatos", () => {
    expect(flatEs["metadata.title"]).toContain("NefroIA");
    expect(flatEn["metadata.title"]).toContain("NefroIA");
  });
});
