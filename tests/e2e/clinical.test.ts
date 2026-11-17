import { expect, type Page, test } from "@playwright/test";

/**
 * Funciones clínicas de extremo a extremo con el modelo simulado
 * (lib/ai/models.mock.ts), PostgreSQL real y embeddings deterministas (hash).
 * El usuario demo lo crea tests/global-setup.ts (pnpm db:seed).
 */

const DEMO_EMAIL = process.env.DEMO_USER_EMAIL ?? "demo@nefroia.app";
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD ?? "NefroIA-demo-2026";

async function send(page: Page, text: string) {
  await page.goto("/");
  await page.getByTestId("multimodal-input").fill(text);
  await page.getByTestId("send-button").click();
}

async function loginAsDemo(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(DEMO_EMAIL);
  await page.getByLabel("Contraseña").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL("/");
}

test.describe("Calculadoras clínicas", () => {
  test("la URR se muestra en una tarjeta con banda, fórmula y referencia", async ({
    page,
  }) => {
    await send(page, "Calcula la URR con BUN pre 70 y post 21");
    const card = page.getByTestId("calculation-card");
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-calculator", "urr");
    await expect(card.getByTestId("calculation-value")).toHaveText("70");
    await expect(card.getByTestId("band-badge")).toHaveText(
      "Objetivo alcanzado"
    );
    await card.getByText("Fórmula y referencia").click();
    await expect(card.getByText("URR = (BUN_pre − BUN_post)")).toBeVisible();
    await expect(card.getByText(/KDOQI/)).toBeVisible();
    await expect(page.getByTestId("clinical-disclaimer").first()).toBeVisible();
  });

  test("un error de unidad muestra la validación traducida", async ({
    page,
  }) => {
    await send(page, "Calcula el Kt/V, la sesión duró 240 minutos");
    const issues = page.getByTestId("calculation-issues");
    await expect(issues).toBeVisible();
    await expect(issues).toContainText("Duración (h)");
    await expect(issues).toContainText("no puede superar 10 h");
  });

  test("la tarjeta se traduce al inglés", async ({ context, page }) => {
    await context.addCookies([
      { name: "NEXT_LOCALE", url: "http://localhost:3000", value: "en" },
    ]);
    await send(page, "Calculate the Kt/V");
    const card = page.getByTestId("calculation-card");
    await expect(card).toBeVisible();
    await expect(card.getByTestId("band-badge")).toHaveText("Target met");
    await expect(card).toContainText("spKt/V (Daugirdas 2nd generation)");
  });
});

test.describe("Guardarraíles", () => {
  test("los signos de alarma muestran el aviso de escalamiento", async ({
    page,
  }) => {
    await send(page, "El paciente refiere dolor torácico opresivo");
    const alert = page.getByTestId("red-flag-alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("dolor torácico");
  });

  test("los datos personales se ocultan y se avisa al usuario", async ({
    page,
  }) => {
    await send(page, "Paciente Juan Pérez, cédula 1023456789, sin novedades");
    await expect(page.getByTestId("redaction-notice")).toBeVisible();
    // Tras recargar, el mensaje guardado ya no contiene los datos.
    await expect(page).toHaveURL(/\/chat\//);
    await page.reload();
    const userMessage = page.getByTestId("message-user").first();
    await expect(userMessage).toContainText("[NOMBRE]");
    await expect(userMessage).toContainText("[DOCUMENTO]");
    await expect(userMessage).not.toContainText("1023456789");
  });
});

test.describe("Protocolos (RAG)", () => {
  test("el usuario demo ve los protocolos sembrados y puede buscar", async ({
    page,
  }) => {
    await loginAsDemo(page);
    await page.getByTestId("nav-protocols").first().click();
    await expect(page).toHaveURL("/protocolos");
    const rows = page.getByTestId("protocol-row");
    await expect(rows).toHaveCount(3);
    await expect(page.getByText("Demostración").first()).toBeVisible();
    await expect(rows.first().getByTestId("protocol-status")).toHaveText(
      "Listo"
    );

    await page
      .getByTestId("protocol-search-input")
      .fill("muestra posdialisis flujo lento");
    await page.getByRole("button", { name: "Buscar" }).click();
    const hit = page.getByTestId("protocol-search-hit").first();
    await expect(hit).toContainText("Toma de muestras");
    await hit.click();
    await expect(page.getByTestId("chunk-content")).toContainText("100 mL/min");
  });

  test("el chat cita el protocolo y la cita abre el fragmento", async ({
    page,
  }) => {
    await loginAsDemo(page);
    await send(
      page,
      "Según el protocolo, ¿cómo actúo ante una hipotensión intradiálisis?"
    );
    const chip = page.getByTestId("citation-chip").first();
    await expect(chip).toBeVisible();
    await expect(chip).toContainText("hipotensión");
    await chip.click();
    await expect(page.getByTestId("chunk-content")).toBeVisible();
    await expect(page.getByTestId("chunk-content")).not.toBeEmpty();
  });

  test("un invitado sube un protocolo Markdown y queda indexado", async ({
    page,
  }) => {
    await page.goto("/protocolos");
    await expect(
      page.getByText("Todavía no has subido protocolos.")
    ).toBeVisible();
    await page.locator("#protocol-file").setInputFiles({
      buffer: Buffer.from(
        "# Protocolo de lavado de manos (prueba)\n\nLavado de manos durante 40 segundos antes de cada conexión.\n"
      ),
      mimeType: "text/markdown",
      name: "lavado-manos.md",
    });
    await page.getByRole("button", { name: "Subir e indexar" }).click();
    const row = page.getByTestId("protocol-row");
    await expect(row).toContainText("lavado manos");
    await expect(row.getByTestId("protocol-status")).toHaveText("Listo", {
      timeout: 30_000,
    });
  });

  test("rechaza archivos que no son protocolos", async ({ page }) => {
    await page.goto("/protocolos");
    await page.locator("#protocol-file").setInputFiles({
      buffer: Buffer.from("MZ\u0000\u0000binario"),
      mimeType: "text/markdown",
      name: "malicioso.md",
    });
    await page.getByRole("button", { name: "Subir e indexar" }).click();
    await expect(page.getByText(/Formato no admitido/)).toBeVisible();
  });
});

test.describe("Hojas de sesión", () => {
  const NOTES =
    "Crea la hoja de sesión: J.P., máquina 7, FAV izquierda. Peso pre 72,5 kg, post anterior 69,8, seco 70, post 70,4. 4 h. UF objetivo 2500 mL, conseguida 2100 mL. PA pre 140/80 FC 76; 2h mareo, PA 85/50 FC 92.";

  test("las notas del chat se convierten en una hoja con alertas", async ({
    page,
  }) => {
    await send(page, NOTES);
    const card = page.getByTestId("session-record-card");
    await expect(card).toBeVisible();
    await expect(card).toContainText("J.P.");
    await expect(card.getByTestId("session-alerts")).toContainText("85 mmHg");
    await expect(card.getByTestId("missing-fields")).toContainText(
      "Dializador"
    );

    await card.getByRole("link", { name: "Abrir hoja" }).click();
    const detail = page.getByTestId("session-record-detail");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("Hoja de sesión de hemodiálisis");
    await expect(detail).toContainText("FAV izquierda");
    await expect(page.getByTestId("print-record")).toBeVisible();

    await page.goto("/hojas");
    await expect(page.getByTestId("session-record-row").first()).toContainText(
      "J.P."
    );

    const csv = await page.request.get("/api/hojas/export");
    expect(csv.ok()).toBe(true);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    const body = await csv.text();
    expect(body).toContain("Paciente (iniciales)");
    expect(body).toContain("J.P.");
  });

  test("el usuario demo ve las hojas sembradas", async ({ page }) => {
    await loginAsDemo(page);
    await page.getByTestId("nav-session-records").first().click();
    await expect(page).toHaveURL("/hojas");
    await expect(page.getByTestId("session-record-row")).toHaveCount(2);
    await expect(page.getByTestId("export-csv")).toBeVisible();
  });
});
