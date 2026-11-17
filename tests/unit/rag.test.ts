import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chunkPages, splitSentences, toBlocks } from "@/lib/rag/chunk";
import { cleanPages, cleanText, removeRepeatedLines } from "@/lib/rag/clean";
import { resolveEmbeddingProvider } from "@/lib/rag/embeddings";
import { createHashEmbedder, hashEmbedding } from "@/lib/rag/embeddings/hash";
import { dot } from "@/lib/rag/embeddings/types";
import { htmlToStructuredText } from "@/lib/rag/extract";
import { reciprocalRankFusion } from "@/lib/rag/rrf";
import {
  estimateTokens,
  normalizeForSearch,
  searchTerms,
  toOrTsQuery,
} from "@/lib/rag/text";

const demo = (name: string) =>
  readFileSync(
    path.join(import.meta.dirname, "../../docs/protocolos-demo", name),
    "utf8"
  );

describe("texto para búsqueda", () => {
  it("normaliza tildes y mayúsculas", () => {
    expect(normalizeForSearch("Hipotensión INTRADIÁLISIS")).toBe(
      "hipotension intradialisis"
    );
  });

  it("construye una tsquery OR segura, sin palabras vacías", () => {
    expect(toOrTsQuery("¿Qué hago ante la hipotensión?")).toBe(
      "hago | hipotension"
    );
    expect(toOrTsQuery("'); DROP TABLE xy; --")).toBe("drop | table | xy");
    expect(toOrTsQuery("de la el")).toBeNull();
    expect(searchTerms("Kt/V kt v")).toEqual(["kt"]);
  });

  it("estima tokens de forma conservadora", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(3200))).toBe(800);
  });
});

describe("limpieza", () => {
  it("une palabras partidas, quita ligaduras y espacios raros", () => {
    expect(cleanText("hipo-\ntensión  con ﬁebre\r\n\n\n\nfin")).toBe(
      "hipotensión con fiebre\n\nfin"
    );
  });

  it("conserva el guion de compuestos en mayúscula", () => {
    expect(cleanText("pre-\nDiálisis")).toBe("pre-\nDiálisis");
  });

  it("elimina cabeceras/pies repetidos y números de página solo en los bordes", () => {
    const bodies = ["Alfa uno.", "Beta dos.", "Gamma tres.", "Delta cuatro."];
    const pages = bodies.map((body, index) => ({
      page: index + 1,
      text: `Unidad Renal Demo - Protocolo HD\nContenido propio: ${body}\nSegunda línea ${body}\nUnidad Renal Demo - Protocolo HD\nOtra línea ${body}\nPágina ${index + 1} de 4`,
    }));
    const cleaned = removeRepeatedLines(pages);
    for (const { text } of cleaned) {
      expect(text.startsWith("Unidad Renal Demo")).toBe(false);
      // La misma frase en mitad de la página es contenido y se conserva.
      expect(text).toContain("Segunda línea");
      expect(text.match(/Unidad Renal Demo/g)).toHaveLength(1);
      expect(text).not.toMatch(/Página \d/);
      expect(text).toContain("Contenido propio");
    }
  });

  it("no toca documentos de menos de tres páginas salvo números de página", () => {
    const [page] = removeRepeatedLines([
      { page: 1, text: "Encabezado\n\nTexto\n3" },
    ]);
    expect(page.text).toBe("Encabezado\n\nTexto");
  });

  it("descarta páginas vacías", () => {
    expect(cleanPages([{ page: 1, text: "  \n " }])).toEqual([]);
  });
});

describe("troceado", () => {
  it("detecta encabezados Markdown, numerados y en mayúsculas", () => {
    const blocks = toBlocks([
      {
        page: 1,
        text: "# Título\n\n2.1 Actuación de enfermería\nTexto uno.\n\nOBJETIVO GENERAL\nTexto dos.",
      },
    ]);
    expect(
      blocks.filter((b) => b.kind === "heading").map((b) => b.text)
    ).toEqual(["Título", "2.1 Actuación de enfermería", "OBJETIVO GENERAL"]);
  });

  it("parte frases sin cortar decimales", () => {
    expect(
      splitSentences("Kt/V de 1.2 es el mínimo. Objetivo 1,4. Fin")
    ).toEqual(["Kt/V de 1.2 es el mínimo.", "Objetivo 1,4.", "Fin"]);
  });

  it("conserva la ruta de sección y la página de inicio", () => {
    const chunks = chunkPages(
      [
        {
          page: 1,
          text: `# Protocolo\n\n## Objetivo\n\n${"Texto. ".repeat(120)}`,
        },
        { page: 2, text: `## Actuación\n\n${"Paso. ".repeat(120)}` },
      ],
      { maxTokens: 800, minTokens: 50, overlapTokens: 100 }
    );
    expect(chunks.map((c) => [c.heading, c.page])).toEqual([
      ["Protocolo › Objetivo", 1],
      ["Protocolo › Actuación", 2],
    ]);
    expect(chunks.map((c) => c.ordinal)).toEqual([0, 1]);
  });

  it("respeta el tamaño máximo y solapa dentro de la sección", () => {
    const sentences = Array.from(
      { length: 300 },
      (_, i) => `Frase número ${i} del protocolo de prueba.`
    ).join(" ");
    const chunks = chunkPages([{ page: null, text: sentences }], {
      maxTokens: 200,
      minTokens: 50,
      overlapTokens: 40,
    });
    expect(chunks.length).toBeGreaterThan(5);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(200);
    }
    // Las últimas frases de un fragmento (≤ 40 tokens) abren el siguiente.
    for (let i = 1; i < chunks.length; i += 1) {
      const lastSentence = splitSentences(chunks[i - 1].content).at(-1) ?? "";
      const position = chunks[i].content.indexOf(lastSentence);
      expect(position).toBeGreaterThanOrEqual(0);
      expect(position).toBeLessThan(40 * 4);
    }
    // Ninguna frase se pierde.
    const all = chunks.map((c) => c.content).join(" ");
    expect(all).toContain("Frase número 0 ");
    expect(all).toContain("Frase número 299 ");
  });

  it("parte palabras de un bloque sin puntuación más largo que el máximo", () => {
    const chunks = chunkPages([{ page: 1, text: "palabra ".repeat(1000) }], {
      maxTokens: 100,
      minTokens: 10,
      overlapTokens: 10,
    });
    expect(chunks.length).toBeGreaterThan(5);
    expect(Math.max(...chunks.map((c) => c.tokenCount))).toBeLessThanOrEqual(
      100
    );
  });

  it("fusiona secciones muy cortas sin perder su título", () => {
    const chunks = chunkPages(
      [{ page: null, text: "# A\n\nCorto.\n\n# B\n\nTambién corto." }],
      { maxTokens: 800, minTokens: 120, overlapTokens: 100 }
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].heading).toBe("A");
    expect(chunks[0].content).toContain("B");
  });

  it("rechaza un solapamiento mayor o igual que el tamaño", () => {
    expect(() =>
      chunkPages([{ page: 1, text: "x" }], { maxTokens: 10, overlapTokens: 10 })
    ).toThrow();
  });

  it("trocea los protocolos de demostración en secciones citables", () => {
    const chunks = chunkPages(
      cleanPages([{ page: null, text: demo("hipotension-intradialisis.md") }])
    );
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.every((c) => c.tokenCount <= 800)).toBe(true);
    expect(
      chunks.some((c) => c.heading?.includes("Criterios de aviso inmediato"))
    ).toBe(true);
  });
});

describe("DOCX → texto estructurado", () => {
  it("convierte encabezados, listas y entidades", () => {
    expect(
      htmlToStructuredText(
        "<h1>Acceso &amp; cuidado</h1><p>Texto</p><ul><li>Uno</li><li>Dos</li></ul>"
      ).trim()
    ).toBe("# Acceso & cuidado\n\nTexto\n\n\n- Uno\n- Dos");
  });
});

describe("Reciprocal Rank Fusion", () => {
  it("premia los elementos presentes en ambas listas", () => {
    const fused = reciprocalRankFusion([
      ["a", "b", "c"],
      ["c", "a", "d"],
    ]);
    expect(fused.map((item) => item.id)).toEqual(["a", "c", "b", "d"]);
    expect(fused[0].score).toBeCloseTo(1 / 61 + 1 / 62, 10);
    expect(fused[0].ranks).toEqual([1, 2]);
    expect(fused.find((item) => item.id === "d")?.ranks).toEqual([null, 3]);
  });

  it("es estable ante empates y duplicados", () => {
    const fused = reciprocalRankFusion([["x", "x", "y"], ["y"]]);
    expect(fused.map((i) => i.id)).toEqual(["y", "x"]);
    expect(reciprocalRankFusion([["b"], ["a"]]).map((i) => i.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("admite pesos y listas vacías", () => {
    expect(reciprocalRankFusion([[], []])).toEqual([]);
    const weighted = reciprocalRankFusion([["a"], ["b"]], { weights: [1, 2] });
    expect(weighted[0].id).toBe("b");
    expect(() => reciprocalRankFusion([["a"]], { k: 0 })).toThrow();
  });
});

describe("embeddings", () => {
  it("el embedder hash es determinista, normalizado y de 384 dimensiones", async () => {
    const embedder = createHashEmbedder();
    const [a] = await embedder.embedPassages(["hipotensión intradiálisis"]);
    const b = await embedder.embedQuery("hipotensión intradiálisis");
    expect(a).toHaveLength(384);
    expect(a).toEqual(b);
    expect(dot(a, a)).toBeCloseTo(1, 6);
  });

  it("textos con vocabulario común son más similares", () => {
    const query = hashEmbedding("qué hacer si baja la presión: hipotensión");
    const related = hashEmbedding(
      "Actuación ante un episodio de hipotensión intradiálisis"
    );
    const unrelated = hashEmbedding("Curación del catéter venoso central");
    expect(dot(query, related)).toBeGreaterThan(dot(query, unrelated));
  });

  it("elige proveedor por variable de entorno con valor por defecto seguro", () => {
    expect(resolveEmbeddingProvider({})).toBe("local");
    expect(resolveEmbeddingProvider({ PLAYWRIGHT: "True" })).toBe("hash");
    expect(resolveEmbeddingProvider({ EMBEDDING_PROVIDER: "OpenAI" })).toBe(
      "openai"
    );
    expect(resolveEmbeddingProvider({ EMBEDDING_PROVIDER: "otro" })).toBe(
      "local"
    );
  });
});
