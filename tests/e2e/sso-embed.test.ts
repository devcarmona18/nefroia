import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import { signSsoToken } from "../../lib/sso/token";
import { E2E_HOJA_DIARIA_PORT, E2E_SSO_SECRET } from "../sso-env";

/**
 * Integración con Hoja Diaria Renal: una página local en otro origen
 * (127.0.0.1) hace de Hoja Diaria y enmarca NefroIA (localhost) con un token
 * de SSO válido. Un segundo origen NO autorizado comprueba que la CSP
 * frame-ancestors bloquea el marco.
 */

const PORT = process.env.PORT || 3000;
const NEFROIA = `http://localhost:${PORT}`;

function mintToken(overrides: Record<string, unknown> = {}) {
  const iat = Math.floor(Date.now() / 1000);
  return signSsoToken(
    {
      aud: "nefroia",
      exp: iat + 90,
      iat,
      iss: "hoja-diaria-renal",
      jti: randomBytes(16).toString("base64url"),
      name: "Enfermería E2E",
      role: "admin",
      sub: `e2e-${randomBytes(4).toString("hex")}`,
      ...overrides,
    },
    E2E_SSO_SECRET
  );
}

function ssoUrl(token: string, embed = true) {
  return `${NEFROIA}/sso?token=${encodeURIComponent(token)}&embed=${embed ? 1 : 0}&lang=es`;
}

/** Página "Hoja Diaria" mínima: un iframe con la URL recibida en ?src=. */
function startHost(port: number): Promise<Server> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const src = url.searchParams.get("src") ?? "about:blank";
    const safeSrc = src.replaceAll('"', "&quot;").replaceAll("<", "&lt;");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!DOCTYPE html><html lang="es"><head><title>Hoja Diaria (prueba)</title></head>
<body style="margin:0"><h1>Hoja Diaria · IA</h1>
<iframe id="nefroia" title="NefroIA" src="${safeSrc}" style="width:100%;height:85vh;border:0"
  referrerpolicy="no-referrer"></iframe></body></html>`);
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

let hoja: Server;
let other: Server;

test.beforeAll(async () => {
  hoja = await startHost(E2E_HOJA_DIARIA_PORT);
  other = await startHost(0);
});

test.afterAll(async () => {
  await Promise.all(
    [hoja, other].map(
      (s) => new Promise<void>((resolve) => s.close(() => resolve()))
    )
  );
});

test.describe("SSO e integración con Hoja Diaria", () => {
  test("Hoja Diaria enmarca NefroIA con SSO y el chat responde", async ({
    page,
  }) => {
    await page.goto(
      `http://127.0.0.1:${E2E_HOJA_DIARIA_PORT}/?src=${encodeURIComponent(ssoUrl(mintToken()))}`
    );
    const frame = page.frameLocator("#nefroia");
    const input = frame.getByTestId("multimodal-input");
    await expect(input).toBeVisible({ timeout: 60_000 });
    // Modo integrado: diseño compacto, pero el aviso clínico se mantiene.
    await expect(frame.getByTestId("clinical-disclaimer")).toBeVisible();
    await expect(frame.locator("html")).toHaveAttribute("data-embed", "1");

    await input.fill("Hola desde Hoja Diaria");
    await frame.getByTestId("send-button").click();
    await expect(
      frame.getByText("This is a mock response for testing.")
    ).toBeVisible({ timeout: 60_000 });
  });

  test("la CSP bloquea que otro origen enmarque NefroIA", async ({
    page,
    request,
  }) => {
    const response = await request.get(`${NEFROIA}/ping`);
    expect(response.headers()["content-security-policy"]).toBe(
      `frame-ancestors http://127.0.0.1:${E2E_HOJA_DIARIA_PORT}`
    );

    const blocked = page.waitForEvent("console", {
      predicate: (msg) => msg.text().includes("frame-ancestors"),
      timeout: 30_000,
    });
    const otherPort = (other.address() as AddressInfo).port;
    await page.goto(
      `http://127.0.0.1:${otherPort}/?src=${encodeURIComponent(`${NEFROIA}/sso/check`)}`
    );
    await blocked;
    await expect(
      page.frameLocator("#nefroia").getByTestId("multimodal-input")
    ).toHaveCount(0);
  });

  test("rechaza tokens reutilizados, vencidos o con firma incorrecta", async ({
    page,
  }) => {
    const token = mintToken();
    await page.goto(ssoUrl(token, false));
    await expect(page.getByTestId("multimodal-input")).toBeVisible({
      timeout: 60_000,
    });

    await page.goto(ssoUrl(token, false));
    await expect(page.locator("[data-sso-error='replayed']")).toBeVisible();

    const iat = Math.floor(Date.now() / 1000) - 300;
    await page.goto(ssoUrl(mintToken({ exp: iat + 60, iat }), false));
    await expect(page.locator("[data-sso-error='expired']")).toBeVisible();

    const forged = signSsoToken(
      {
        ...JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()),
      },
      "otro-secreto-que-no-es-el-compartido-0123"
    );
    await page.goto(ssoUrl(forged, false));
    await expect(page.locator("[data-sso-error='invalid']")).toBeVisible();
  });

  test("el rol demo entra con límites: protocolos de solo lectura", async ({
    page,
  }) => {
    await page.goto(
      ssoUrl(mintToken({ role: "demo", sub: "demo-e2e" }), false)
    );
    await expect(page.getByTestId("multimodal-input")).toBeVisible({
      timeout: 60_000,
    });
    await page.goto("/protocolos");
    await expect(page.getByTestId("protocol-readonly")).toBeVisible();
    await expect(page.getByTestId("protocol-upload-form")).toHaveCount(0);

    const upload = await page.request.post("/api/protocolos", {
      multipart: {
        file: {
          buffer: Buffer.from("# Protocolo\n\nTexto."),
          mimeType: "text/markdown",
          name: "p.md",
        },
      },
    });
    expect(upload.status()).toBe(403);
  });
});
